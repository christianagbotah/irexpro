/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: { target: 'ES2020' } }],
  },
  testRegex: '.*\\.spec\\.tsx?$',
  testPathIgnorePatterns: ['/node_modules/'],
};
