import { PassThrough } from 'node:stream';

import createMockContext from '#src/test-utils/jest-koa-mocks/create-mock-context.js';

import koaBodyEtag from './koa-body-etag.js';

const { jest } = import.meta;

describe('koaBodyEtag', () => {
  it('should set an etag for a JSON body', async () => {
    const ctx = createMockContext({ method: 'GET' });
    await koaBodyEtag()(ctx, async () => {
      ctx.body = { foo: 'bar' };
    });

    expect(ctx.response.etag).toBeTruthy();
  });

  it('should skip a stream body whose circular refs would make JSON.stringify throw', async () => {
    const ctx = createMockContext({ method: 'GET' });
    // Mimic the S3 SDK's IncomingMessage <-> socket cycle
    class CircularStream extends PassThrough {
      socket = { parser: { socket: this } };
    }
    const body = new CircularStream();
    const next = jest.fn(async () => {
      ctx.body = body;
    });

    await expect(koaBodyEtag()(ctx, next)).resolves.not.toThrow();
    expect(ctx.response.etag).toBeFalsy();
    expect(ctx.body).toBe(body);
  });
});
