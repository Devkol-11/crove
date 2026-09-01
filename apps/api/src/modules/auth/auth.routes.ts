// Better Auth handles all authentication routes at the app level.
// See src/app.ts — the /api/auth/* catch-all forwards every request to Better Auth.
//
// Available endpoints (provided by Better Auth automatically):
//   POST /api/auth/sign-up/email   — register with email + password
//   POST /api/auth/sign-in/email   — login with email + password
//   POST /api/auth/sign-out        — logout (clears session cookie)
//   GET  /api/auth/session         — get current session/user
//   POST /api/auth/verify-email    — email verification
//   POST /api/auth/forget-password — request password reset
//   POST /api/auth/reset-password  — confirm password reset
//
// No code needed here. Add custom auth-adjacent routes in users.routes.ts.

export {}
