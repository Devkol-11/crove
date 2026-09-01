// Better Auth handles all authentication routes at the app level.
// See src/app.ts — the /api/auth/* catch-all forwards every request to Better Auth.
//
// Email + password (always active):
//   POST /api/auth/sign-up/email   — register with email + password
//   POST /api/auth/sign-in/email   — login with email + password
//   POST /api/auth/sign-out        — logout (clears session cookie)
//   GET  /api/auth/session         — get current session/user
//   POST /api/auth/verify-email    — email verification
//   POST /api/auth/forget-password — request password reset
//   POST /api/auth/reset-password  — confirm password reset
//
// Google OAuth (active only when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set in .env):
//   GET  /api/auth/sign-in/google  — redirects to Google consent screen
//   GET  /api/auth/callback/google — Better Auth handles the OAuth callback
//
// No code needed here. Add custom auth-adjacent routes in users.routes.ts.

export {}
