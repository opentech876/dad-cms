import { test, expect } from '@playwright/test';
import { createTestUser, generateOtpToken, fillOtpBoxes, deleteTestUser } from '../helpers/auth.helper';

// Tests verifying that roleGuard blocks access to routes for unauthorized roles.
// Requires supabase to be running with the app fully initialized (owner + workspace).

interface UserFixture {
  email: string;
  role: string;
  userId?: string;
}

const fixtures: UserFixture[] = [
  { email: `editeur-rbac-${Date.now()}@test.dad`, role: 'editeur' },
  { email: `comms-rbac-${Date.now()}@test.dad`, role: 'charge_communication' },
];

async function loginAs(page: any, email: string): Promise<void> {
  const token = await generateOtpToken(email);
  await page.goto(`/verifier?email=${encodeURIComponent(email)}&from=login`);
  await fillOtpBoxes(page, token);
  await page.waitForURL(/\/(espaces|dashboard)/, { timeout: 10000 });
}

test.describe("Contrôle d'accès RBAC", () => {
  test.beforeAll(async () => {
    for (const fixture of fixtures) {
      fixture.userId = await createTestUser(fixture.email, fixture.role);
    }
  });

  test.afterAll(async () => {
    for (const fixture of fixtures) {
      if (fixture.userId) await deleteTestUser(fixture.userId);
    }
  });

  test('R01 — editeur accédant à /campagnes → redirigé', async ({ page }) => {
    await loginAs(page, fixtures[0].email);
    await page.goto('/campagnes');
    // roleGuard should redirect away from campagnes (charge_communication+ only)
    await expect(page).not.toHaveURL(/\/campagnes$/, { timeout: 5000 });
  });

  test('R02 — charge_communication accédant à /evenements → redirigé', async ({ page }) => {
    await loginAs(page, fixtures[1].email);
    await page.goto('/evenements');
    // roleGuard should redirect away from evenements (editeur+ only)
    await expect(page).not.toHaveURL(/\/evenements$/, { timeout: 5000 });
  });

  test('R03 — editeur accédant à /utilisateurs → redirigé', async ({ page }) => {
    await loginAs(page, fixtures[0].email);
    await page.goto('/utilisateurs');
    // roleGuard should redirect away from utilisateurs (owner only)
    await expect(page).not.toHaveURL(/\/utilisateurs$/, { timeout: 5000 });
  });
});
