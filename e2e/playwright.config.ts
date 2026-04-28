import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load local Supabase credentials for the auth helper
config({ path: '.env.e2e' });

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // run serially to avoid auth state collisions
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  // Enforce run order: onboarding creates the workspace that login + rbac tests depend on
  testMatch: [
    '**/onboarding.spec.ts',
    '**/login.spec.ts',
    '**/rbac.spec.ts',
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'ng serve --configuration=local',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env['CI'],
    timeout: 120 * 1000,
  },
});
