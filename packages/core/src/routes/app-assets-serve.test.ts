/* eslint-disable @silverhand/fp/no-mutation -- tests stub the shared SystemContext storage config directly */
import { PassThrough, Readable } from 'node:stream';

import { S3ServiceException } from '@aws-sdk/client-s3';
import { StorageProvider } from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import koaBodyEtag from '#src/middleware/koa-body-etag.js';
import koaErrorHandler from '#src/middleware/koa-error-handler.js';
import koaI18next from '#src/middleware/koa-i18next.js';
import SystemContext from '#src/tenants/SystemContext.js';
import { createRequester } from '#src/utils/test-utils.js';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

const downloadFile = jest.fn();

await mockEsmWithActual('#src/utils/storage/index.js', () => ({
  buildStorage: jest.fn(() => ({ downloadFile })),
}));

const getTenantId = jest.fn();
await mockEsmWithActual('#src/utils/tenant.js', () => ({ getTenantId }));

const appAssetsServeRoutes = await pickDefault(import('./app-assets-serve.js'));

const requester = createRequester({
  // Same order as the real `/api` app: the error handler outside the ETag middleware
  middlewares: [koaI18next(), koaErrorHandler(), koaBodyEtag()] as never[],
  anonymousRoutes: appAssetsServeRoutes,
});

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const lastModified = new Date('2026-07-26T11:41:25.000Z');
const longLivedCache = 'public, max-age=31536000, immutable';

/** A stream with the S3 SDK `IncomingMessage` <-> socket cycle that `JSON.stringify` chokes on. */
class CircularStream extends PassThrough {
  socket = { parser: { socket: this } };
}

const mockObject = (body: Buffer = png) => {
  const stream = new CircularStream();
  stream.end(body);
  downloadFile.mockResolvedValueOnce({
    readableStreamBody: stream,
    contentType: 'image/png',
    contentLength: body.length,
    etag: '"5ad6058c"',
    lastModified,
  });

  return stream;
};

const notFound = () =>
  new S3ServiceException({
    name: 'NoSuchKey',
    $fault: 'client',
    $metadata: { httpStatusCode: 404 },
  });

describe('storage proxy routes', () => {
  beforeEach(() => {
    downloadFile.mockReset();
    getTenantId.mockReset().mockResolvedValue(['default', false]);
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'logto',
      endpoint: 'http://rustfs:9000',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      forcePathStyle: true,
    };
  });

  afterAll(() => {
    Reflect.deleteProperty(SystemContext.shared, 'storageProviderConfig');
  });

  describe('GET /user-assets/:userId/:filename', () => {
    it('should stream the private object with its headers', async () => {
      mockObject();

      const response = await requester
        .get('/user-assets/qmgo3uszv7k4/you.png?v=1785066085172')
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            callback(null, Buffer.concat(chunks));
          });
        });

      expect(downloadFile).toHaveBeenCalledWith('admin/user-assets/qmgo3uszv7k4/you.png');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(png);
      expect(response.headers).toMatchObject({
        'content-type': 'image/png',
        'content-length': String(png.length),
        'cache-control': longLivedCache,
        etag: '"5ad6058c"',
        'last-modified': lastModified.toUTCString(),
        'cross-origin-resource-policy': 'cross-origin',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
    });

    it('should answer 304 for a matching `If-None-Match` and release the S3 stream', async () => {
      const stream = mockObject();

      const response = await requester
        .get('/user-assets/qmgo3uszv7k4/you.png')
        .set('If-None-Match', '"5ad6058c"');

      expect(response.status).toBe(304);
      expect(response.headers.etag).toBe('"5ad6058c"');
      // Koa destroys the body stream once the response finished
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      expect(stream.destroyed).toBe(true);
    });

    it('should answer 404 without caching for a missing object', async () => {
      downloadFile.mockRejectedValueOnce(notFound());

      const response = await requester.get('/user-assets/qmgo3uszv7k4/missing.png');

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.etag).toBeUndefined();
    });

    it('should serve image/webp for a `.webp` object with the long-lived cache', async () => {
      const webp = Buffer.from('5249464624000000574542501234', 'hex');
      const stream = new CircularStream();
      stream.end(webp);
      downloadFile.mockResolvedValueOnce({
        readableStreamBody: stream,
        contentType: 'image/webp',
        contentLength: webp.length,
        etag: '"9f86d081"',
        lastModified,
      });

      const response = await requester
        .get('/user-assets/qmgo3uszv7k4/you.webp?v=1791571306460')
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            callback(null, Buffer.concat(chunks));
          });
        });

      expect(downloadFile).toHaveBeenCalledWith('admin/user-assets/qmgo3uszv7k4/you.webp');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(webp);
      expect(response.headers).toMatchObject({
        'content-type': 'image/webp',
        'content-length': String(webp.length),
        'cache-control': longLivedCache,
        etag: '"9f86d081"',
      });
    });

    it('should answer 404 without caching for a missing `.webp` object', async () => {
      downloadFile.mockRejectedValueOnce(notFound());

      const response = await requester.get('/user-assets/qmgo3uszv7k4/you.webp?v=1791571306460');

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.etag).toBeUndefined();
    });

    it('should answer 500 without caching when storage fails', async () => {
      downloadFile.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const response = await requester.get('/user-assets/qmgo3uszv7k4/you.png');

      expect(response.status).toBe(500);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('should answer 500 without caching when the object has no body', async () => {
      downloadFile.mockResolvedValueOnce({ contentType: 'image/png' });

      const response = await requester.get('/user-assets/qmgo3uszv7k4/you.png');

      expect(response.status).toBe(500);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it.each(['.env', 'a%2Fb', 'you.svg+xml'])(
      'should reject the unsafe filename %s',
      async (filename) => {
        const response = await requester.get(`/user-assets/qmgo3uszv7k4/${filename}`);

        expect(response.status).toBe(400);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(downloadFile).not.toHaveBeenCalled();
      }
    );

    it('should answer 404 when the storage is not S3', async () => {
      SystemContext.shared.storageProviderConfig = {
        provider: StorageProvider.AzureStorage,
        connectionString: 'connection',
        container: 'container',
      };

      const response = await requester.get('/user-assets/qmgo3uszv7k4/you.png');

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(downloadFile).not.toHaveBeenCalled();
    });
  });

  describe('GET /app-assets/:filename', () => {
    it("should stream the tenant's branding object", async () => {
      mockObject(Buffer.from('gear'));

      const response = await requester.get('/app-assets/gear.png?v=1');

      expect(downloadFile).toHaveBeenCalledWith('default/app-assets/branding/gear.png');
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(longLivedCache);
    });

    it('should answer 400 without caching for an unknown tenant', async () => {
      getTenantId.mockResolvedValueOnce([undefined, false]);

      const response = await requester.get('/app-assets/gear.png');

      expect(response.status).toBe(400);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('should answer 404 without caching for a missing object', async () => {
      downloadFile.mockRejectedValueOnce(notFound());

      const response = await requester.get('/app-assets/missing.png');

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  it('should not keep the long-lived cache header when a later middleware fails', async () => {
    mockObject();
    const failingRequester = createRequester({
      middlewares: [
        koaI18next(),
        koaErrorHandler(),
        async (_ctx: unknown, next: () => Promise<void>) => {
          await next();
          // E.g. the old `koaBodyEtag`, which `JSON.stringify`'d the stream and threw
          throw new Error('after the route');
        },
      ] as never[],
      anonymousRoutes: appAssetsServeRoutes,
    });

    const response = await failingRequester.get('/user-assets/qmgo3uszv7k4/you.png');

    expect(response.status).toBe(500);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    expect(response.headers['last-modified']).toBeUndefined();
  });

  it('should serve a real Node.js stream body end to end', async () => {
    downloadFile.mockResolvedValueOnce({
      readableStreamBody: Readable.from([png]),
      contentType: 'image/png',
    });

    const response = await requester.get('/user-assets/qmgo3uszv7k4/you.png');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
  });
});
