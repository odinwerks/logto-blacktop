// Test stub for `@withtyped/client`. The real package is ESM-only (`exports` declares just the
// `import` condition), so jest's CJS resolver cannot resolve it and every suite importing the
// `utils/subscription.ts` chain fails at load. Tests never exercise the client itself — they only
// need `ResponseError` to exist for `instanceof` checks.
class ResponseError extends Error {
  constructor(response, body) {
    super(`ResponseError: ${response?.status ?? 'unknown'}`);
    this.name = 'ResponseError';
    this.response = response;
    this.body = body;
  }
}

module.exports = { ResponseError };
