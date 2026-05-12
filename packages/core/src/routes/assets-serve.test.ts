import { StorageProvider } from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import SystemContext from '#src/tenants/SystemContext.js';
import { MockTenant } from '#src/test-utils/tenant.js';
import { createRequester } from '#src/utils/test-utils.js';

const { jest } = import.meta;
const { mockEsm } = createMockUtils(jest);

// Mock storage builder - use mockEsm to avoid "already linked" errors
const mockDownloadFileFn = jest.fn();

mockEsm('#src/utils/storage/index.js', () => ({
  buildUploadFile: jest.fn(() => ({
    downloadFile: mockDownloadFileFn,
  })),
}));

const tenantContext = new MockTenant();

const assetsServeRoutes = await pickDefault(import('./assets-serve.js'));

const assetsRequest = createRequester({
  anonymousRoutes: [assetsServeRoutes],
  tenantContext,
});

beforeEach(() => {
  jest.clearAllMocks();
  // Reset SystemContext for each test
  SystemContext.shared.storageProviderConfig = undefined;
});

describe('GET /assets/:userId/:filename', () => {
  it('should return 400 when userId contains invalid characters', async () => {
    const response = await assetsRequest.get('/assets/user!@#/file.png');
    expect(response.status).toBe(400);
  });

  it('should return 400 when filename contains path traversal', async () => {
    const response = await assetsRequest.get('/assets/user123/../secrets');
    expect(response.status).toBe(400);
  });

  it('should return 400 when filename starts with a dot', async () => {
    const response = await assetsRequest.get('/assets/user123/.hidden');
    expect(response.status).toBe(400);
  });

  it('should return 404 when storage provider is not configured', async () => {
    SystemContext.shared.storageProviderConfig = undefined;

    const response = await assetsRequest.get('/assets/user123/file.png');
    expect(response.status).toBe(404);
  });

  it('should return 404 when storage provider is not S3Storage', async () => {
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.AzureStorage,
      connectionString: 'fake',
      container: 'fake',
    };

    const response = await assetsRequest.get('/assets/user123/file.png');
    expect(response.status).toBe(404);
  });

  it('should stream the file with correct headers', async () => {
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('image-content'));
        controller.close();
      },
    });

    mockDownloadFileFn.mockResolvedValue({
      body: mockBody,
      contentType: 'image/png',
      contentLength: 13,
    });

    const response = await assetsRequest.get('/assets/user123/file.png');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('should return 404 when file is not found in S3', async () => {
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    const notFoundError = new Error('Not Found');
    notFoundError.name = 'NotFound';
    mockDownloadFileFn.mockRejectedValue(notFoundError);

    const response = await assetsRequest.get('/assets/user123/file.png');

    expect(response.status).toBe(404);
  });

  it('should return 500 on unexpected S3 errors', async () => {
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    mockDownloadFileFn.mockRejectedValue(new Error('Internal S3 Error'));

    const response = await assetsRequest.get('/assets/user123/file.png');

    expect(response.status).toBe(500);
  });
});
