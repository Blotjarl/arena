/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // packages/shared's package.json now points main/types at dist/ (Step 11, for real Node/Docker
  // resolution) instead of src/index.ts — this maps Jest straight back to source so tests never need a
  // prior `npm run build -w @arena/shared` step, matching how ts-jest has always resolved it.
  moduleNameMapper: {
    '^@arena/shared$': '<rootDir>/../shared/src/index.ts',
  },
};
