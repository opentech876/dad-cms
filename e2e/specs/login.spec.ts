import { test, expect } from '@playwright/test';
import { createTestUser, generateOtpToken, fillOtpBoxes, deleteTestUser } from '../helpers/auth.helper';

// Requires supabase to be started and at least one owner + workspace to exist.

let testUserId: string | undefined;
const LOGIN_EMAIL = `login-e2e-${Date.now()}@test.dad`;

test.describe('Flux login', () => {
  test.beforeAll(async () => {
    // Create an invited user with editeur role
    testUserId = await createTestUser(LOGIN_EMAIL, 'editeur');
  });

  test.afterAll(async () => {
    if (testUserId) await deleteTestUser(testUserId);
  });

  test('L01 — Utilisateur authentifié sur / → redirigé vers /dashboard', async ({ page }) => {
    // Use OTP to log in first to establish session
    const token = await generateOtpToken(LOGIN_EMAIL);
    await page.goto(`/verifier?email=${encodeURIComponent(LOGIN_EMAIL)}&from=login`);
    await fillOtpBoxes(page, token);
    await expect(page).toHaveURL(/\/(espaces|dashboard)/, { timeout: 10000 });

    // Now navigate to root
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
  });

  test('L02 — Email inconnu sur /login → affiche message non invité', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', `unknown-${Date.now()}@test.dad`);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=invité')).toBeVisible({ timeout: 5000 });
  });
});
