module.exports = {
  testMatch: [
    '**/tests/api/**/*.test.js',
    '**/tests/unit/**/*.test.js',
  ],
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    'tests/api/**/*.test.js',
    'tests/unit/**/*.test.js',
    'lib/**/*.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary'],
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
    },
    {
      displayName: 'api',
      testMatch: ['<rootDir>/tests/api/**/*.test.js'],
      testEnvironment: 'node',
      testTimeout: 30000,
    },
  ],
};
