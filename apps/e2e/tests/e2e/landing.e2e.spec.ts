import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {
  test('loads without errors', async ({ page }) => {
    await page.goto('/')
    await expect(page).not.toHaveTitle(/Error/)
  })

  test('sign-in link is visible', async ({ page }) => {
    await page.goto('/')
    const signIn = page.getByRole('link', { name: /sign.?in/i })
    await expect(signIn).toBeVisible()
  })
})

test.describe('Auth pages', () => {
  test('sign-in page renders the form', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })

  test('sign-up page renders the form', async ({ page }) => {
    await page.goto('/sign-up')
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })
})
