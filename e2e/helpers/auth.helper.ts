import { createClient } from '@supabase/supabase-js';
import type { Page } from '@playwright/test';

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Génère un OTP via l'API admin, sans envoyer d'email.
 * Crée l'utilisateur s'il n'existe pas encore.
 */
export async function generateOtpToken(email: string): Promise<string> {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'http://localhost:4200/verifier' },
  });

  if (error || !data?.properties?.email_otp) {
    throw new Error(`generateOtpToken failed for ${email}: ${error?.message}`);
  }

  return data.properties.email_otp;
}

/**
 * Remplit les 6 cases OTP en simulant la frappe clavier depuis la première case.
 * Cette approche déclenche les événements Angular (input + focus auto) de façon fiable.
 */
export async function fillOtpBoxes(page: Page, token: string): Promise<void> {
  await page.locator('.step__otp-box').first().click();
  await page.keyboard.type(token);
}

/**
 * Crée un utilisateur de test avec un rôle donné via la clé service_role.
 * Retourne l'ID du nouvel utilisateur.
 */
export async function createTestUser(email: string, role?: string): Promise<string> {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: role ? { role } : {},
  });

  if (error || !data.user) {
    throw new Error(`createTestUser failed: ${error?.message}`);
  }

  return data.user.id;
}

/**
 * Supprime un utilisateur de test via l'API admin.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  await adminClient.auth.admin.deleteUser(userId);
}
