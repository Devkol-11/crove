import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from './prisma'
import { env } from '../config'
import { eventDispatcher } from './event-dispatcher'
import { UserRegisteredEvent } from '../modules/auth/domain/events/user-registered.event'
import { EmailVerifiedEvent } from '../modules/auth/domain/events/email-verified.event'

export const auth = betterAuth({
  // The public URL of this API server.
  // Better Auth uses this to build absolute URLs for OAuth callbacks,
  // email verification links, and password reset links.
  baseURL: env.APP_URL,

  // Signs and verifies session tokens. Required — without this Better Auth
  // generates a random secret on each restart, invalidating all active sessions.
  secret: env.BETTER_AUTH_SECRET,

  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
    // Better Auth handles password hashing (bcrypt) and comparison internally.
    // We never store or touch a raw password anywhere in application code.
  },

  // Google OAuth — only activated when credentials are present in env.
  // Adds: GET /api/auth/sign-in/google (redirect) + GET /api/auth/callback/google (handler)
  // Get credentials: https://console.cloud.google.com → APIs & Services → Credentials
  // Authorised redirect URI to register there: <CORS_ORIGIN>/api/auth/callback/google
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        },
      }
    : {}),

  session: {
    expiresIn:  60 * 60 * 24 * 7, // 7 days — how long a session lives
    updateAge:  60 * 60 * 24,     // 1 day  — refresh silently when this close to expiry
    cookieCache: {
      enabled: true,
      maxAge:  5 * 60,            // 5 min  — client-side cache to reduce DB reads
    },
  },

  trustedOrigins: [env.CORS_ORIGIN],

  // Custom user fields beyond Better Auth's defaults (id, name, email, emailVerified, image).
  // These are persisted to the users table and included on session.user automatically.
  user: {
    additionalFields: {
      firstName: { type: 'string', required: false },
      lastName:  { type: 'string', required: false },
      phone:     { type: 'string', required: false },
    },
  },

  // databaseHooks let us react to Better Auth's lifecycle events.
  // This is where the domain event system connects to the auth system.
  // Better Auth persists first, THEN calls the after hook — so these events
  // only fire when the database write actually succeeded.
  databaseHooks: {
    user: {
      create: {
        // Fired once, right after a new user row is inserted.
        // We raise UserRegisteredEvent so any subscriber (email welcome,
        // analytics, onboarding flow) can react without coupling to this file.
        after: async (user) => {
          await eventDispatcher.dispatch(
            new UserRegisteredEvent(user.id, user.email, user.name),
          )
        },
      },

      update: {
        // Fired after any user row update — check if emailVerified flipped to true.
        // Better Auth passes the updated user object.
        after: async (user) => {
          if (user.emailVerified) {
            await eventDispatcher.dispatch(
              new EmailVerifiedEvent(user.id, user.email),
            )
          }
        },
      },
    },
  },
})

// Inferred types re-exported so consumers never import from better-auth directly.
// If we swap Better Auth for something else, only this file changes.
export type BetterAuthSession = typeof auth.$Infer.Session
export type BetterAuthUser   = BetterAuthSession['user']
