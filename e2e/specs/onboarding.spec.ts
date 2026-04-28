import { test, expect } from '@playwright/test';
import { generateOtpToken, fillOtpBoxes, deleteTestUser } from '../helpers/auth.helper';

// This spec requires a fresh local Supabase instance with no users.
// Run: supabase db reset && supabase start before executing.

const OWNER_EMAIL = `owner-e2e-${Date.now()}@test.dad`;
let ownerUserId: string | undefined;

test.describe('Flux onboarding — premier owner', () => {
  test.afterAll(async () => {
    if (ownerUserId) await deleteTestUser(ownerUserId);
  });

  test('E01 — Étape email : naviguer vers /verifier avec email en param', async ({ page }) => {
    await page.goto('/demarrer');
    await page.fill('input[type="email"]', OWNER_EMAIL);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/verifier/);
    await expect(page.url()).toContain(encodeURIComponent(OWNER_EMAIL));
  });

  test('E02 — Étape OTP : saisir le code reçu → naviguer vers /espaces', async ({ page }) => {
    // Get the token via admin API (no email check needed)
    const token = await generateOtpToken(OWNER_EMAIL);
    await page.goto(`/verifier?email=${encodeURIComponent(OWNER_EMAIL)}&from=signup`);

    await fillOtpBoxes(page, token);

    await expect(page).toHaveURL(/\/(espaces|dashboard)/, { timeout: 10000 });
  });

  test('E03 — Workspace modal : créer workspace + profil → naviguer vers /dashboard', async ({ page }) => {
    await page.goto('/espaces');
    // Wait for the workspace step to be ready
    await expect(page.locator('.step__create')).toBeVisible();

    // Step 1 — Workspace name
    await page.click('.step__create');
    await page.fill('.modal__input', 'E2E Test Workspace');
    await page.click('.modal__btn-primary');

    // Step 2 — Personal info
    await page.fill('input[placeholder="Nom complet"]', 'Elvis Test');
    await page.fill('input[placeholder="Numéro de téléphone"]', '+242 06 999 0000');
    await page.click('.modal__btn-primary');

    // Step 3 — Skip invitations
    await page.click('.modal__btn-skip');

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });
});
