import createError from 'http-errors';

import RequestError from '#src/errors/RequestError/index.js';

import { createContextWithRouteParameters } from '../utils/test-utils.js';

import koaErrorHandler from './koa-error-handler.js';

const { jest } = import.meta;

const httpError = createError(404, 'Not Found');

describe('koaErrorHandler middleware', () => {
  const mockBody = { data: 'foo' };

  const next = jest.fn().mockReturnValue(Promise.resolve());
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('expect to return error response if error type is RequestError', async () => {
    const ctx = createContextWithRouteParameters({
      customProperties: {
        body: mockBody,
      },
    });
    const error = new RequestError('auth.unauthorized');
    next.mockRejectedValueOnce(error);
    await koaErrorHandler()(ctx, next);
    expect(ctx.status).toEqual(error.status);
    expect(ctx.body).toEqual(error.toBody(ctx.i18n));
  });

  // Koa will handle `HttpError` with a built-in manner. Hence it needs to return 200 here.
  it('expect to return 200 if error type is HttpError', async () => {
    const ctx = createContextWithRouteParameters({
      customProperties: {
        body: mockBody,
        status: 404,
      },
    });
    next.mockRejectedValueOnce(httpError);
    await koaErrorHandler()(ctx, next);
    expect(ctx.status).toEqual(404);
  });

  it('expect to return original body if no error found', async () => {
    const ctx = createContextWithRouteParameters({
      customProperties: {
        body: mockBody,
      },
    });
    await koaErrorHandler()(ctx, next);
    expect(ctx.status).toEqual(200);
    expect(ctx.body).toEqual(mockBody);
  });

  it('expect the caching headers of the failed success response to be dropped', async () => {
    const ctx = createContextWithRouteParameters();
    next.mockImplementationOnce(async () => {
      ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
      ctx.set('ETag', '"abc"');
      ctx.set('Last-Modified', new Date(0).toUTCString());
      throw new Error('err');
    });
    await koaErrorHandler()(ctx, next);
    expect(ctx.status).toEqual(500);
    expect(ctx.response.get('Cache-Control')).toEqual('no-store');
    expect(ctx.response.get('ETag')).toBeFalsy();
    expect(ctx.response.get('Last-Modified')).toBeFalsy();
  });

  it('expect status 500 if error type is not RequestError', async () => {
    const ctx = createContextWithRouteParameters({
      customProperties: {
        body: mockBody,
      },
    });
    next.mockRejectedValueOnce(new Error('err'));
    await koaErrorHandler()(ctx, next);
    expect(ctx.status).toEqual(500);
  });
});
