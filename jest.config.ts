import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/src/setup-jest.ts'],
  testEnvironment: 'jsdom',
  // Angular TestBed cannot be re-initialized across workers; serial execution is required
  maxWorkers: 1,
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverageFrom: [
    'src/app/**/*.ts',
    '!src/app/**/*.spec.ts',
    // Declarative bootstrap/wiring — no logic worth unit-testing.
    '!src/app/app.config.ts',
    '!src/app/app.routes.ts',
  ],
  coverageThreshold: {
    // Pragmatic split: 90% on statements/functions/lines (all comfortably
    // above), 80% on branches — real components plateau in the low-80s on
    // branches because of defensive `??`/`?.`/error paths that aren't worth
    // contorting a test to reach. Current: st 93.8 / br 80.2 / fn 92.3 / ln 96.4.
    global: { statements: 90, branches: 80, functions: 90, lines: 90 },
  },
};

export default config;
