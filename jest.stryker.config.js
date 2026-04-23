// Jest config used by Stryker's jest runner — unit tests only (no network).
module.exports = {
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testTimeout: 15000,
  verbose: false,
  testEnvironment: 'node',
};
