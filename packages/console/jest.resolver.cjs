// Jest resolver that makes `*.svg?react` imports resolvable. `@/…svg?react` imports are already
// mapped to their file in `jest.config.ts`, but *relative* `svg?react` imports (e.g. the flag
// imports in `components/Region`) reach the resolver verbatim and fail, since the `?react` file
// does not exist on disk. Strip the suffix so resolution falls through to the real `.svg` file
// (which `jest-transformer-svg` then turns into a component).
const resolve = (request, options) =>
  options.defaultResolver(request.replace(/\?react$/, ''), options);

module.exports = resolve;
