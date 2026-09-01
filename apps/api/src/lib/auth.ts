import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { db } from './prisma'
import { env } from '../config'
import { eventDispatcher } from './event-dispatcher'
import { UserRegisteredEvent } from '../modules/auth/domain/events/user-registered.event'
import { EmailVerifiedEvent } from '../modules/auth/domain/events/email-verified.event'

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
    // Better Auth handles password hashing (bcrypt) and comparison internally.
    // We never store or touch a raw password anywhere in application code.
  },

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
