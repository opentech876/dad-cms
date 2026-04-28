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
  ],
  coverageThreshold: {
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },
  },
};

export default config;
