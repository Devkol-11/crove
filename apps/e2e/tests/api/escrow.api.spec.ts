import { test, expect } from '@playwright/test'

// ── Quick Link escrow — full creation + join flow ─────────────────────────────

test.describe('Quick Link Escrow', () => {
  test('initiateQuick returns an intentId', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: {
        title: 'E2E Test Escrow',
        amount: 5000,
        currency: 'NGN',
        creatorName: 'Alice',
        creatorEmail: 'alice@example.com',
        creatorRole: 'Payer',
        expiresInDays: 7,
      },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('intentId')
    expect(typeof body.intentId).toBe('string')
  })

  test('initiateQuick rejects missing required fields', async ({ request }) => {
    const res = await request.post('/api/escrows/quick/initiate', {
      data: { title: '' },
    })
    expect(res.status()).toBe(400)
  })

  test('public view returns escrow metadata', async ({ request }) => {
    // Create escrow first (we need a valid code — use a known test fixture code if seeded)
    // This test is a placeholder that can be expanded once test seeding is in place
    const res = await request.get('/api/escrows/INVALID/public')
    expect(res.status()).toBe(404)
  })
})

// ── Authenticated escrow creation ─────────────────────────────────────────────

test.describe('Authenticated Escrow', () => {
  test('create escrow without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/escrows', {
      data: {
        type: 'Standard',
        title: 'Test Standard Escrow',
        amount: 10000,
        currency: 'NGN',
        creatorRole: 'Payer',
      },
    })
    expect([401, 403]).toContain(res.status())
  })
})

// ── Health check ──────────────────────────────────────────────────────────────

test('API health check passes', async ({ request }) => {
  const res = await request.get('/health')
  expect(res.status()).toBe(200)
})
