import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.integration.env.ts'],
  globalSetup: '<rootDir>/jest.integration.global-setup.ts',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/__tests__/integration/**/*.postgres.test.ts'],
  maxWorkers: 1,
};

export default createJestConfig(config);
