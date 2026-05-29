import { Readable } from 'node:stream';

import { StorageProvider } from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import RequestError from '#src/errors/RequestError/index.js';
import SystemContext from '#src/tenants/SystemContext.js';
import createMockContext from '#src/test-utils/jest-koa-mocks/create-mock-context.js';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

const storageProviderConfig = {
  provider: StorageProvider.S3Storage as StorageProvider.S3Storage,
  bucket: 'test-bucket',
  accessKeyId: 'key',
  accessSecretKey: 'secret',
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
};

// eslint-disable-next-line @silverhand/fp/no-mutation
SystemContext.shared.storageProviderConfig = storageProviderConfig;

const mockedIsFileExisted = jest.fn(async (_filename: string) => true);
const mockedDownloadFile = jest.fn();

await mockEsmWithActual('#src/utils/storage/index.js', () => ({
  buildUploadFile: jest.fn(() => ({
    isFileExisted: mockedIsFileExisted,
    downloadFile: mockedDownloadFile,
  })),
}));

await mockEsmWithActual('#src/utils/tenant.js', () => ({
  getTenantId: jest.fn().mockResolvedValue(['default']),
}));

const koaServeCustomUiAssets = await pickDefault(import('./koa-serve-custom-ui-assets.js'));

describe('koaServeCustomUiAssets middleware', () => {
  const next = jest.fn();

  beforeEach(() => {
    mockedIsFileExisted.mockReset().mockResolvedValue(true);
    mockedDownloadFile.mockReset();
  });

  it('should serve a file asset directly when path contains a dot', async () => {
    const mockBody = Readable.from('console.log("hi")') as unknown as ReadableStream;
    mockedDownloadFile.mockResolvedValue({
      body: mockBody,
      contentType: 'text/javascript',
      contentLength: 17,
    });

    const ctx = createMockContext({ url: '/scripts.js' });
    await koaServeCustomUiAssets('asset-id-abc')(ctx, next);

    expect(mockedDownloadFile).toHaveBeenCalledWith('default/asset-id-abc/scripts.js');
    expect(ctx.type).toEqual('text/javascript');
    expect(ctx.status).toEqual(200);
  });

  it('should serve index.html when path has no dot (SPA route)', async () => {
    const mockBody = Readable.from('<html></html>') as unknown as ReadableStream;
    mockedDownloadFile.mockResolvedValue({
      body: mockBody,
      contentType: 'text/html',
      contentLength: 13,
    });

    const ctx = createMockContext({ url: '/sign-in' });
    await koaServeCustomUiAssets('asset-id-abc')(ctx, next);

    expect(mockedDownloadFile).toHaveBeenCalledWith('default/asset-id-abc/index.html');
    expect(ctx.type).toEqual('text/html');
  });

  it('should return 404 if file does not exist', async () => {
    mockedIsFileExisted.mockResolvedValue(false);
    const ctx = createMockContext({ url: '/missing.txt' });

    await expect(koaServeCustomUiAssets('asset-id-abc')(ctx, next)).rejects.toMatchError(
      new RequestError({ code: 'entity.not_found', status: 404 })
    );
  });

  it('should set Cache-Control to long-lived for file assets', async () => {
    mockedDownloadFile.mockResolvedValue({
      body: Readable.from('data') as unknown as ReadableStream,
      contentType: 'image/png',
      contentLength: 4,
    });

    const ctx = createMockContext({ url: '/logo.png' });
    await koaServeCustomUiAssets('asset-id-abc')(ctx, next);

    expect(ctx.response.headers['cache-control']).toMatch(/max-age/);
  });

  it('should set Cache-Control to no-cache for SPA routes', async () => {
    mockedDownloadFile.mockResolvedValue({
      body: Readable.from('<html>') as unknown as ReadableStream,
      contentType: 'text/html',
      contentLength: 6,
    });

    const ctx = createMockContext({ url: '/dashboard' });
    await koaServeCustomUiAssets('asset-id-abc')(ctx, next);

    expect(ctx.response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
  });
});
