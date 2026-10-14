import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  roots: ['<rootDir>/src'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        sourceMaps: true,
        jsc: {
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
        },
      },
    ],
    '\\.(svg)$': 'jest-transformer-svg',
    '\\.(png)$': 'jest-transform-stub',
  },
  moduleNameMapper: {
    // The CSS-module stub must precede the `@/` path alias: the greedy `^@/(.*)$` rule would
    // otherwise intercept `@/scss/foo.module.scss` and resolve it to the raw SCSS file, which `swc`
    // cannot transform. Stubbing first keeps CSS-module imports (both `@/`-prefixed and relative)
    // class-names proxies in every test.
    '^@/(.*)\\.svg\\?react$': '<rootDir>/src/$1.svg',
    // `@withtyped/client` is ESM-only (no `require`/`default` export condition) so jest cannot
    // resolve it; stub it with the minimal `ResponseError` shape the code under test uses.
    '^@withtyped/client$': '<rootDir>/jest.withtyped-client.cjs',
    '\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@logto/shared/(.*)$': '<rootDir>/../shared/lib/$1',
  },
  // Strips the `?react` suffix from *relative* `svg?react` imports (e.g. `components/Region`'s
  // flag imports) so they resolve to the real `.svg` file handled by `jest-transformer-svg`.
  resolver: '<rootDir>/jest.resolver.cjs',
  transformIgnorePatterns: ['node_modules/(?!(.*(nanoid|jose|ky|@logto|@silverhand))/)'],
};

export default config;
