module.exports = {
  preset: 'jest-expo',
  // Bun's isolated store adds a .bun layer before the same native packages.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-svg|\\.bun))',
  ],
  modulePathIgnorePatterns: ['<rootDir>/.qa/'],
  testMatch: ['<rootDir>/tests/component/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/tests/component/setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  clearMocks: true,
  restoreMocks: true,
  maxWorkers: 1,
  testTimeout: 10000,
};
