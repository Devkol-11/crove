// Better Auth handles all authentication routes at the app level.
// See src/app.ts — the /api/auth/* catch-all forwards every request to Better Auth.
//
// Email + password (always active):
//   POST /api/auth/sign-up/email   — register with email + password
//   POST /api/auth/sign-in/email   — login with email + password
//   POST /api/auth/sign-out        — logout (clears session cookie)
//   GET  /api/auth/get-session     — get current session/user
//   POST /api/auth/verify-email    — email verification
//   POST /api/auth/forget-password — request password reset
//   POST /api/auth/reset-password  — confirm password reset
//
// Google OAuth (active only when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set in .env):
//   POST /api/auth/sign-in/social  — body: { provider, callbackURL, disableRedirect? }
//                                    returns 302 redirect to provider (or URL if disableRedirect: true)
//   GET  /api/auth/callback/google — Better Auth handles the OAuth callback automatically
//
// No code needed here. Add custom auth-adjacent routes in users.routes.ts.

export {}
