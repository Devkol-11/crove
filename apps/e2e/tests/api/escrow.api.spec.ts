/**
 * Escrow API — Integration Test Suite
 *
 * Coverage:
 *   • All four escrow types (Standard, Milestone, Conditional, Deposit)
 *   • Quick-link creation + join flows (contract + error cases)
 *   • Auth guards (every protected endpoint returns 401 unauthenticated)
 *   • Financial auth guards (endpoints requiring verified email → 403 for unverified users)
 *   • Schema validation (400 for every mandatory-field violation)
 *   • Cancel + list + retrieve flows
 *   • Milestone creation, ordering, and status checks
 *   • Dispute validation guards
 *   • Pagination boundary validation
 *   • Platform admin route key guard
 */

import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Register a new unique user and return their credentials. */
async function register(request: APIRequestContext, name = 'Test User') {
  const email    = `crove-e2e-${uid()}@test.dev`
  const password = 'TestPass99!Secure'
  const res = await request.post('/api/auth/sign-up/email', {
    data: { email, password, name },
  })
  return { email, password, status: res.status() }
}

/** Sign in and automatically persist the session cookie in the request context. */
async function login(request: APIRequestContext, email: string, password: string) {
  return request.post('/api/auth/sign-in/email', { data: { email, password } })
}

/**
 * Create a fresh authenticated session within the current test's request context.
 * Subsequent calls in the same test will automatically carry the session cookie.
 */
async function session(request: APIRequestContext) {
  const user = await register(request)
  await login(request, user.email, user.password)
  return user
}

// ── Payload factories ─────────────────────────────────────────────────────────

const futureISO = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
const pastISO   = () => new Date(Date.now() - 1_000).toISOString()

function standardPayload(overrides: Record<string, unknown> = {}) {
  return {
    type:        'Standard',
    title:       'Standard Escrow — E2E',
    description: 'Integration test escrow',
    amount:      50_000,
    currency:    'NGN',
    creatorRole: 'Payer',
    ...overrides,
  }
}

function milestonePayload(overrides: Record<string, unknown> = {}) {
  return {
    type:        'Milestone',
    title:       'Milestone Escrow — E2E',
    currency:    'NGN',
    creatorRole: 'Payer',
    milestones: [
      { title: 'Phase 1 — Research',  amount: 20_000, deadline: futureISO() },
      { title: 'Phase 2 — Design',    amount: 30_000 },
      { title: 'Phase 3 — Delivery',  amount: 50_000 },
    ],
    ...overrides,
  }
}

function conditionalPayload(overrides: Record<string, unknown> = {}) {
  return {
    type:             'Conditional',
    title:            'Conditional Escrow — E2E',
    amount:           75_000,
    currency:         'NGN',
    creatorRole:      'Payer',
    releaseCondition: 'Funds release upon signed acceptance of the delivered deliverables',
    ...overrides,
  }
}

function depositPayload(overrides: Record<string, unknown> = {}) {
  return {
    type:        'Deposit',
    title:       'Deposit Escrow — E2E',
    amount:      10_000,
    currency:    'NGN',
    creatorRole: 'Payer',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────

test('health check responds with 200 and status ok', async ({ request }) => {
  const res = await request.get('/health')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('sign up with valid credentials creates a user', async ({ request }) => {
    const { status } = await register(request)
    expect(status).toBe(200)
  })

  test('sign up returns user object with email', async ({ request }) => {
    const email    = `crove-e2e-${uid()}@test.dev`
    const password = 'TestPass99!Secure'
    const res = await request.post('/api/auth/sign-up/email', {
      data: { email, password, name: 'Alice' },
    })
    const body = await res.json()
    expect(body).toHaveProperty('user')
    expect(body.user.email).toBe(email)
  })

  test('sign up with invalid email returns 4xx', async ({ request }) => {
    const res = await request.post('/api/auth/sign-up/email', {
      data: { email: 'not-an-email', password: 'TestPass99!', name: 'Bob' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('sign up without password returns 4xx', async ({ request }) => {
    const res = await request.post('/api/auth/sign-up/email', {
      data: { email: `e-${uid()}@test.dev`, name: 'No Password' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('sign in with correct credentials returns 200', async ({ request }) => {
    const user = await register(request)
    const res  = await login(request, user.email, user.password)
    expect(res.status()).toBe(200)
  })

  test('sign in with wrong password returns 4xx', async ({ request }) => {
    const user = await register(request)
    const res  = await login(request, user.email, 'WrongPass999!')
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('sign in with nonexistent email returns 4xx', async ({ request }) => {
    const res = await login(request, 'nobody@nowhere.test', 'TestPass99!')
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('unauthenticated GET /api/escrows returns 401', async ({ request }) => {
    expect((await request.get('/api/escrows')).status()).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// QUICK-LINK ESCROW — Contract + Validation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quick Link — initiateQuick', () => {
  test('returns intentId with valid Payer payload', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: {
        title:        'Quick Link Test',
        amount:       50_000,
        currency:     'NGN',
        creatorName:  'Alice',
        creatorEmail: `quick-${uid()}@test.dev`,
        creatorRole:  'Payer',
        expiresInDays: 7,
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.intentId).toBe('string')
    expect(body.intentId.length).toBeGreaterThan(0)
  })

  test('returns intentId for minimum valid amount (1)', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'Min amount', amount: 1, currency: 'NGN', creatorName: 'A', creatorEmail: `q-${uid()}@t.dev`, creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(200)
  })

  test('rejects missing title → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { amount: 5_000, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects empty title → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: '', amount: 5_000, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects missing creatorEmail → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: 5_000, currency: 'NGN', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects invalid creatorEmail format → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: 5_000, currency: 'NGN', creatorEmail: 'not-email', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects amount = 0 → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: 0, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects negative amount → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: -100, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects amount above 100M → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: 100_000_001, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Payer' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects invalid creatorRole ("Admin") → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: 5_000, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Admin' },
    })
    expect(res.status()).toBe(400)
  })

  test('rejects expiresInDays > 90 for quick links → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'T', amount: 5_000, currency: 'NGN', creatorEmail: 'x@x.com', creatorName: 'X', creatorRole: 'Payer', expiresInDays: 91 },
    })
    expect(res.status()).toBe(400)
  })

  test('Payee creator without payeeAccount returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: {
        title:        'Payee without account',
        amount:       5_000,
        currency:     'NGN',
        creatorEmail: 'payee@test.dev',
        creatorName:  'Payee',
        creatorRole:  'Payee',
        // payeeAccount intentionally omitted
      },
    })
    expect(res.status()).toBe(400)
  })

  test('Payee creator with bank_account for NGN escrow succeeds', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: {
        title:        'Payee NGN quick link',
        amount:       5_000,
        currency:     'NGN',
        creatorEmail: `payee-ngn-${uid()}@test.dev`,
        creatorName:  'Payee NGN',
        creatorRole:  'Payee',
        payeeAccount: {
          type:          'bank_account',
          accountNumber: '0123456789',
          bankCode:      '058',
          bankName:      'Guaranty Trust Bank',
          accountName:   'Test Payee',
        },
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('intentId')
  })

  test('Payee with crypto_wallet for NGN escrow returns 400 (wrong account type)', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: {
        title:        'Wrong account type',
        amount:       5_000,
        currency:     'NGN',
        creatorEmail: `payee-wrong-${uid()}@test.dev`,
        creatorName:  'Payee',
        creatorRole:  'Payee',
        payeeAccount: { type: 'crypto_wallet', walletAddress: 'T9abc...', network: 'USDT_TRC20' },
      },
    })
    expect(res.status()).toBe(400)
  })
})

test.describe('Quick Link — confirmQuick', () => {
  test('wrong OTP returns 400', async ({ request }) => {
    const initRes = await request.post('/api/escrows/quick/initiate', {
      data: { title: 'OTP Test', amount: 5_000, currency: 'NGN', creatorName: 'Bob', creatorEmail: `otp-${uid()}@test.dev`, creatorRole: 'Payer' },
    })
    const { intentId } = await initRes.json()

    const res = await request.post('/api/escrows/quick/confirm', {
      data: { intentId, otp: '000000' },
    })
    expect(res.status()).toBe(400)
  })

  test('missing intentId returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/confirm', {
      data: { otp: '123456' },
    })
    expect(res.status()).toBe(400)
  })

  test('OTP shorter than 6 digits returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/confirm', {
      data: { intentId: 'any-id', otp: '12345' },
    })
    expect(res.status()).toBe(400)
  })

  test('OTP longer than 6 digits returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/confirm', {
      data: { intentId: 'any-id', otp: '1234567' },
    })
    expect(res.status()).toBe(400)
  })

  test('nonexistent intentId with valid OTP returns 4xx', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/confirm', {
      data: { intentId: 'totally-fake-intent-id', otp: '123456' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('Quick Link — Join OTP', () => {
  test('join request for nonexistent code returns 404', async ({ request }) => {
    const res = await request.post('/api/escrows/NOEXIST/join', {
      data: { name: 'Alice', email: 'alice@test.dev' },
    })
    expect(res.status()).toBe(404)
  })

  test('join request with missing name returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/ANYCODE/join', {
      data: { email: 'alice@test.dev' },
    })
    expect(res.status()).toBe(400)
  })

  test('join request with invalid email returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/ANYCODE/join', {
      data: { name: 'Alice', email: 'not-valid-email' },
    })
    expect(res.status()).toBe(400)
  })

  test('join verify with wrong OTP returns 400', async ({ request }) => {
    const res = await request.post('/api/escrows/ANYCODE/join/verify', {
      data: { email: 'alice@test.dev', otp: '000000' },
    })
    // Either 404 (code not found) or 400 (wrong OTP), both are correct rejections
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('Public View', () => {
  test('returns 404 for nonexistent escrow code', async ({ request }) => {
    const res = await request.get('/api/escrows/DOESNOTEXIST/public')
    expect(res.status()).toBe(404)
  })

  test('returns 404 for empty-like code', async ({ request }) => {
    const res = await request.get('/api/escrows/XXXXXX/public')
    expect(res.status()).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTH GUARDS — Every protected endpoint returns 401 without a session
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Auth Guards', () => {
  // GET endpoints
  for (const path of ['/api/escrows', '/api/escrows/SOMECODE', '/api/escrows/some-id/balance']) {
    test(`GET ${path} → 401 without session`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(401)
    })
  }

  // POST endpoints (auth only)
  for (const path of [
    '/api/escrows',
    '/api/escrows/some-id/cancel',
    '/api/escrows/some-id/milestones/mid/submit',
  ]) {
    test(`POST ${path} → 401 without session`, async ({ request }) => {
      expect((await request.post(path, { data: {} })).status()).toBe(401)
    })
  }

  // POST endpoints (financialAuth — require verified email)
  for (const path of [
    '/api/escrows/some-id/fund',
    '/api/escrows/some-id/release',
    '/api/escrows/some-id/refund',
    '/api/escrows/some-id/dispute',
    '/api/escrows/disputes/did/resolve',
    '/api/escrows/some-id/milestones/mid/approve',
  ]) {
    test(`POST ${path} → 401 without session`, async ({ request }) => {
      const status = (await request.post(path, { data: {} })).status()
      expect([401, 403]).toContain(status)
    })
  }
})

test.describe('Financial Auth Guards — Unverified Email', () => {
  // These endpoints need a valid session but ALSO require emailVerified = true.
  // An unverified user should get 403.

  const financialPaths = [
    '/api/escrows/some-id/fund',
    '/api/escrows/some-id/release',
    '/api/escrows/some-id/refund',
    '/api/escrows/some-id/dispute',
    '/api/escrows/some-id/milestones/mid/approve',
  ]

  for (const path of financialPaths) {
    test(`POST ${path} with unverified user → 403`, async ({ request }) => {
      await session(request)  // signs up + logs in (email NOT verified)
      const res = await request.post(path, { data: { reason: 'test reason that is long enough' } })
      // 403 = email not verified; 404 = wrong id but auth passed (also acceptable)
      expect([403, 404]).toContain(res.status())
    })
  }
})

test.describe('Platform Admin Guard', () => {
  test('POST /platform/:id/review without X-Platform-Key returns 401', async ({ request }) => {
    const res = await request.post('/api/escrows/platform/some-id/review')
    expect(res.status()).toBe(401)
  })

  test('POST /platform/disputes/:id/resolve with wrong key returns 401', async ({ request }) => {
    const res = await request.post('/api/escrows/platform/disputes/some-id/resolve', {
      headers: { 'X-Platform-Key': 'wrong-key' },
      data:    { resolution: 'resolved', decision: 'release' },
    })
    expect(res.status()).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATED ESCROW CREATION — All Four Types
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create — Standard Escrow', () => {
  test('returns 201 with code, id, type, status, amount, currency', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: standardPayload() })
    const body = await res.json()
    expect(res.status()).toBe(201)
    expect(typeof body.id).toBe('string')
    expect(typeof body.code).toBe('string')
    expect(body.code.length).toBeGreaterThan(0)
    expect(body.type).toBe('Standard')
    expect(body.status).toBe('Created')
    expect(Number(body.amount)).toBe(50_000)
    expect(body.currency).toBe('NGN')
  })

  test('code is unique across two creations', async ({ request }) => {
    await session(request)
    const [r1, r2] = await Promise.all([
      request.post('/api/escrows', { data: standardPayload({ title: 'E1' }) }),
      request.post('/api/escrows', { data: standardPayload({ title: 'E2' }) }),
    ])
    const [b1, b2] = await Promise.all([r1.json(), r2.json()])
    expect(b1.code).not.toBe(b2.code)
  })

  test('USD currency is accepted', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', { data: standardPayload({ currency: 'USD' }) })
    expect(res.status()).toBe(201)
    expect((await res.json()).currency).toBe('USD')
  })

  test('GBP currency is accepted', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', { data: standardPayload({ currency: 'GBP' }) })
    expect(res.status()).toBe(201)
  })

  test('EUR currency is accepted', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', { data: standardPayload({ currency: 'EUR' }) })
    expect(res.status()).toBe(201)
  })

  test('creator as Payee is accepted', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', { data: standardPayload({ creatorRole: 'Payee' }) })
    expect(res.status()).toBe(201)
  })

  test('recipientEmail is accepted and stored', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', {
      data: standardPayload({ recipientEmail: 'recipient@test.dev' }),
    })
    expect(res.status()).toBe(201)
  })

  test('expiresInDays 365 (max) is accepted', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', { data: standardPayload({ expiresInDays: 365 }) })
    expect(res.status()).toBe(201)
  })

  // ── Validation rejections ─────────────────────────────────────────────────

  test('without auth → 401', async ({ request }) => {
    expect((await request.post('/api/escrows', { data: standardPayload() })).status()).toBe(401)
  })

  test('missing amount → 400', async ({ request }) => {
    await session(request)
    const { amount: _omit, ...payload } = standardPayload() as any
    const res = await request.post('/api/escrows', { data: payload })
    expect(res.status()).toBe(400)
  })

  test('amount = 0 → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ amount: 0 }) })).status()).toBe(400)
  })

  test('amount < 0 → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ amount: -1 }) })).status()).toBe(400)
  })

  test('amount > 100M → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ amount: 100_000_001 }) })).status()).toBe(400)
  })

  test('missing title → 400', async ({ request }) => {
    await session(request)
    const { title: _omit, ...payload } = standardPayload() as any
    expect((await request.post('/api/escrows', { data: payload })).status()).toBe(400)
  })

  test('empty title → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ title: '' }) })).status()).toBe(400)
  })

  test('invalid creatorRole "Admin" → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ creatorRole: 'Admin' }) })).status()).toBe(400)
  })

  test('invalid type "Barter" → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ type: 'Barter' }) })).status()).toBe(400)
  })

  test('expiresInDays = 0 → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ expiresInDays: 0 }) })).status()).toBe(400)
  })

  test('expiresInDays > 365 → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ expiresInDays: 366 }) })).status()).toBe(400)
  })

  test('unsupported currency JPY → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ currency: 'JPY' }) })).status()).toBe(400)
  })

  test('invalid recipientEmail → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: standardPayload({ recipientEmail: 'not-email' }) })).status()).toBe(400)
  })
})

test.describe('Create — Milestone Escrow', () => {
  test('returns 201 with milestones array (3 milestones)', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: milestonePayload() })
    const body = await res.json()
    expect(res.status()).toBe(201)
    expect(body.type).toBe('Milestone')
    expect(Array.isArray(body.milestones)).toBe(true)
    expect(body.milestones).toHaveLength(3)
  })

  test('milestones are all in Pending status initially', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: milestonePayload() })
    const body = await res.json()
    expect(body.milestones.every((m: any) => m.status === 'Pending')).toBe(true)
  })

  test('milestones have correct order (1, 2, 3)', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: milestonePayload() })
    const body = await res.json()
    const orders = body.milestones.map((m: any) => m.order)
    expect(orders).toEqual([1, 2, 3])
  })

  test('milestone titles are preserved', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: milestonePayload() })
    const body = await res.json()
    expect(body.milestones[0].title).toBe('Phase 1 — Research')
    expect(body.milestones[1].title).toBe('Phase 2 — Design')
    expect(body.milestones[2].title).toBe('Phase 3 — Delivery')
  })

  test('milestone amounts are preserved', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: milestonePayload() })
    const body = await res.json()
    expect(Number(body.milestones[0].amount)).toBe(20_000)
    expect(Number(body.milestones[1].amount)).toBe(30_000)
    expect(Number(body.milestones[2].amount)).toBe(50_000)
  })

  test('single milestone is accepted', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows', {
      data: milestonePayload({ milestones: [{ title: 'Solo', amount: 5_000 }] }),
    })
    expect(res.status()).toBe(201)
  })

  test('20 milestones (max) is accepted', async ({ request }) => {
    await session(request)
    const milestones = Array.from({ length: 20 }, (_, i) => ({ title: `M${i + 1}`, amount: 1_000 }))
    const res = await request.post('/api/escrows', { data: milestonePayload({ milestones }) })
    expect(res.status()).toBe(201)
  })

  // ── Validation rejections ─────────────────────────────────────────────────

  test('missing milestones array → 400', async ({ request }) => {
    await session(request)
    const { milestones: _omit, ...payload } = milestonePayload() as any
    expect((await request.post('/api/escrows', { data: payload })).status()).toBe(400)
  })

  test('empty milestones array → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: milestonePayload({ milestones: [] }) })).status()).toBe(400)
  })

  test('21 milestones (above max) → 400', async ({ request }) => {
    await session(request)
    const milestones = Array.from({ length: 21 }, (_, i) => ({ title: `M${i + 1}`, amount: 1_000 }))
    expect((await request.post('/api/escrows', { data: milestonePayload({ milestones }) })).status()).toBe(400)
  })

  test('milestone total above 100M → 400', async ({ request }) => {
    await session(request)
    const milestones = [{ title: 'A', amount: 60_000_000 }, { title: 'B', amount: 60_000_000 }]
    expect((await request.post('/api/escrows', { data: milestonePayload({ milestones }) })).status()).toBe(400)
  })

  test('milestone with past deadline → 400', async ({ request }) => {
    await session(request)
    const milestones = [{ title: 'M1', amount: 5_000, deadline: pastISO() }]
    expect((await request.post('/api/escrows', { data: milestonePayload({ milestones }) })).status()).toBe(400)
  })

  test('milestone with amount = 0 → 400', async ({ request }) => {
    await session(request)
    const milestones = [{ title: 'M1', amount: 0 }]
    expect((await request.post('/api/escrows', { data: milestonePayload({ milestones }) })).status()).toBe(400)
  })

  test('milestone missing title → 400', async ({ request }) => {
    await session(request)
    const milestones = [{ amount: 5_000 }]
    expect((await request.post('/api/escrows', { data: milestonePayload({ milestones }) })).status()).toBe(400)
  })
})

test.describe('Create — Conditional Escrow', () => {
  test('returns 201 with releaseCondition stored', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: conditionalPayload() })
    const body = await res.json()
    expect(res.status()).toBe(201)
    expect(body.type).toBe('Conditional')
    expect(body.releaseCondition).toBe('Funds release upon signed acceptance of the delivered deliverables')
  })

  test('missing releaseCondition → 400', async ({ request }) => {
    await session(request)
    const { releaseCondition: _omit, ...payload } = conditionalPayload() as any
    expect((await request.post('/api/escrows', { data: payload })).status()).toBe(400)
  })

  test('empty releaseCondition → 400', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows', { data: conditionalPayload({ releaseCondition: '' }) })).status()).toBe(400)
  })

  test('missing amount → 400', async ({ request }) => {
    await session(request)
    const { amount: _omit, ...payload } = conditionalPayload() as any
    expect((await request.post('/api/escrows', { data: payload })).status()).toBe(400)
  })
})

test.describe('Create — Deposit Escrow', () => {
  test('returns 201 with Deposit type', async ({ request }) => {
    await session(request)
    const res  = await request.post('/api/escrows', { data: depositPayload() })
    const body = await res.json()
    expect(res.status()).toBe(201)
    expect(body.type).toBe('Deposit')
    expect(body.status).toBe('Created')
  })

  test('missing amount → 400', async ({ request }) => {
    await session(request)
    const { amount: _omit, ...payload } = depositPayload() as any
    expect((await request.post('/api/escrows', { data: payload })).status()).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RETRIEVAL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Retrieve Escrow', () => {
  test('authenticated user can fetch their escrow by code', async ({ request }) => {
    await session(request)
    const { code } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    const res  = await request.get(`/api/escrows/${code}`)
    const body = await res.json()
    expect(res.status()).toBe(200)
    expect(body.code).toBe(code)
  })

  test('response includes participants array', async ({ request }) => {
    await session(request)
    const { code } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    const body = await (await request.get(`/api/escrows/${code}`)).json()
    expect(Array.isArray(body.participants)).toBe(true)
  })

  test('Milestone escrow response includes milestones', async ({ request }) => {
    await session(request)
    const { code } = await (await request.post('/api/escrows', { data: milestonePayload() })).json()
    const body = await (await request.get(`/api/escrows/${code}`)).json()
    expect(Array.isArray(body.milestones)).toBe(true)
    expect(body.milestones).toHaveLength(3)
  })

  test('get nonexistent code → 404', async ({ request }) => {
    await session(request)
    expect((await request.get('/api/escrows/NOEXIST')).status()).toBe(404)
  })

  test('get without auth → 401', async ({ request }) => {
    expect((await request.get('/api/escrows/ANYCODE')).status()).toBe(401)
  })
})

test.describe('List Escrows', () => {
  test('returns array with created escrows', async ({ request }) => {
    await session(request)
    await request.post('/api/escrows', { data: standardPayload({ title: 'List Test 1' }) })
    await request.post('/api/escrows', { data: standardPayload({ title: 'List Test 2' }) })

    const res  = await request.get('/api/escrows')
    const body = await res.json()
    expect(res.status()).toBe(200)
    const items = body.data ?? body
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThanOrEqual(2)
  })

  test('list without auth → 401', async ({ request }) => {
    expect((await request.get('/api/escrows')).status()).toBe(401)
  })

  test('page=0 (invalid) → 400', async ({ request }) => {
    await session(request)
    expect((await request.get('/api/escrows?page=0')).status()).toBe(400)
  })

  test('limit=0 (invalid) → 400', async ({ request }) => {
    await session(request)
    expect((await request.get('/api/escrows?limit=0')).status()).toBe(400)
  })

  test('limit=51 (above max of 50) → 400', async ({ request }) => {
    await session(request)
    expect((await request.get('/api/escrows?limit=51')).status()).toBe(400)
  })

  test('page=1&limit=1 returns at most 1 result', async ({ request }) => {
    await session(request)
    await request.post('/api/escrows', { data: standardPayload() })
    const body = await (await request.get('/api/escrows?page=1&limit=1')).json()
    const items = body.data ?? body
    expect(items.length).toBeLessThanOrEqual(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL ESCROW
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cancel Escrow', () => {
  test('creator can cancel a newly-created escrow', async ({ request }) => {
    await session(request)
    const { id, code } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    const cancelRes = await request.post(`/api/escrows/${id}/cancel`)
    expect(cancelRes.status()).toBe(200)

    const body = await (await request.get(`/api/escrows/${code}`)).json()
    expect(body.status).toBe('Cancelled')
  })

  test('cancelling already-cancelled escrow returns 4xx', async ({ request }) => {
    await session(request)
    const { id } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    await request.post(`/api/escrows/${id}/cancel`)
    const res = await request.post(`/api/escrows/${id}/cancel`)
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('cancel nonexistent id → 404', async ({ request }) => {
    await session(request)
    expect((await request.post('/api/escrows/nonexistent-id/cancel')).status()).toBe(404)
  })

  test('cancel without auth → 401', async ({ request }) => {
    expect((await request.post('/api/escrows/any-id/cancel')).status()).toBe(401)
  })

  test('cancelled escrow status is reflected in subsequent reads', async ({ request }) => {
    await session(request)
    const { id, code } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    await request.post(`/api/escrows/${id}/cancel`)

    const detail = await (await request.get(`/api/escrows/${code}`)).json()
    expect(detail.status).toBe('Cancelled')
  })

  test('Milestone escrow can also be cancelled before funding', async ({ request }) => {
    await session(request)
    const { id } = await (await request.post('/api/escrows', { data: milestonePayload() })).json()
    const res = await request.post(`/api/escrows/${id}/cancel`)
    expect(res.status()).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DISPUTE — Validation Guards
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dispute Validation', () => {
  test('dispute reason shorter than 10 chars → 400', async ({ request }) => {
    await session(request)
    const { id } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    const res = await request.post(`/api/escrows/${id}/dispute`, { data: { reason: 'short' } })
    expect(res.status()).toBe(400)
  })

  test('dispute on nonexistent escrow → 4xx', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows/nonexistent-id/dispute', {
      data: { reason: 'A detailed dispute reason that is long enough' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('dispute on Created-state escrow → 4xx (not yet in Held)', async ({ request }) => {
    await session(request)
    const { id } = await (await request.post('/api/escrows', { data: standardPayload() })).json()
    const res = await request.post(`/api/escrows/${id}/dispute`, {
      data: { reason: 'Cannot dispute an unfunded escrow ever' },
    })
    // 403 (emailVerified guard fires first) or 400/409 (business logic)
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})

test.describe('Dispute Resolution Validation', () => {
  test('resolve dispute with invalid decision returns 400', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows/disputes/some-id/resolve', {
      data: { resolution: 'Here is a detailed resolution text', decision: 'unsplit' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('resolve dispute with resolution too short → 400', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows/disputes/some-id/resolve', {
      data: { resolution: 'short', decision: 'release' },
    })
    expect(res.status()).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER BALANCE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Ledger Balance', () => {
  test('without auth → 401', async ({ request }) => {
    expect((await request.get('/api/escrows/some-id/balance')).status()).toBe(401)
  })

  test('nonexistent escrow id → 404', async ({ request }) => {
    await session(request)
    const res = await request.get('/api/escrows/totally-nonexistent-escrow-id/balance')
    expect(res.status()).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE — Submit / Approve Guards
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestone Operations', () => {
  test('submit without auth → 401', async ({ request }) => {
    expect((await request.post('/api/escrows/eid/milestones/mid/submit', { data: {} })).status()).toBe(401)
  })

  test('approve without auth → 401', async ({ request }) => {
    expect((await request.post('/api/escrows/eid/milestones/mid/approve', { data: {} })).status()).toBe(401)
  })

  test('submit on nonexistent escrow → 404', async ({ request }) => {
    await session(request)
    const res = await request.post('/api/escrows/nonexistent-escrow/milestones/mid/submit', { data: {} })
    expect(res.status()).toBe(404)
  })

  test('submit milestone on Created-state escrow → 4xx (not Held)', async ({ request }) => {
    await session(request)
    const { id, milestones } = await (await request.post('/api/escrows', { data: milestonePayload() })).json()
    const milestoneId = milestones[0].id
    const res = await request.post(`/api/escrows/${id}/milestones/${milestoneId}/submit`, { data: {} })
    // Escrow is in Created state, not Held — should be rejected
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FUND WITH TOKEN (Quick-link fund path)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fund With Token', () => {
  test('missing fundToken → 400', async ({ request }) => {
    const res = await request.post('/api/escrows/some-id/fund/quick', { data: {} })
    expect(res.status()).toBe(400)
  })

  test('invalid escrow id with valid-looking token → 4xx', async ({ request }) => {
    const res = await request.post('/api/escrows/nonexistent-escrow/fund/quick', {
      data: { fundToken: 'tok_test_abc123' },
    })
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })
})
