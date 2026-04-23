/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  _comment: 'Mutation testing for Assignment 3 — targets custom Rocket.Chat client library.',
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'json', 'dashboard'],
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.stryker.config.js',
    enableFindRelatedTests: true,
  },
  coverageAnalysis: 'perTest',
  mutate: ['lib/**/*.js'],
  thresholds: { high: 80, low: 60, break: 75 },
  timeoutMS: 60000,
  htmlReporter: { fileName: 'results/mutation/mutation-report.html' },
  jsonReporter: { fileName: 'results/mutation/mutation-report.json' },
  tempDirName: 'stryker-tmp',
  concurrency: 2,
};
