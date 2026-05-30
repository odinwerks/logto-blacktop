import { StorageProvider } from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import { mockUser } from '#src/__mocks__/index.js';
import SystemContext from '#src/tenants/SystemContext.js';
import { MockTenant } from '#src/test-utils/tenant.js';
import { createRequester } from '#src/utils/test-utils.js';

const { jest } = import.meta;
const { mockEsm } = createMockUtils(jest);

// Mock storage builder
const mockUploadFileFunction = jest.fn();
const mockListFilesFunction = jest.fn();
const mockDeleteFileFunction = jest.fn();

mockEsm('#src/utils/storage/index.js', () => ({
  buildUploadFile: jest.fn(() => ({
    uploadFile: mockUploadFileFunction,
    listFiles: mockListFilesFunction,
    deleteFile: mockDeleteFileFunction,
  })),
}));

const userAssetsRoutes = await pickDefault(import('./user-assets.js'));

describe('me user-assets routes', () => {
  const tenantContext = new MockTenant();
  const meRequest = createRequester({
    authedRoutes: [
      (router) => {
        router.use(async (ctx, next) => {
          ctx.auth = {
            ...ctx.auth,
            id: mockUser.id,
          };

          return next();
        });
      },
      userAssetsRoutes as never,
    ],
    tenantContext,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('GET /user-assets/service-status should return not_configured when storage is not set', async () => {
    const response = await meRequest.get('/user-assets/service-status');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('not_configured');
  });

  it('POST /user-assets should return 400 when no file is provided', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    const response = await meRequest.post('/user-assets').send({});
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.invalid_input');
  });

  it('POST /user-assets should return 400 when file exceeds max size', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    const largeBuffer = Buffer.allocUnsafe(21 * 1024 * 1024);
    const response = await meRequest.post('/user-assets').attach('file', largeBuffer, 'test.zip');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.file_size_exceeded');
  });

  it('POST /user-assets should return 400 when mime type is not allowed', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('test'), { filename: 'test.txt', contentType: 'text/plain' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.mime_type_not_allowed');
  });

  it('POST /user-assets should return 500 when storage is not configured', async () => {
    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('test'), { filename: 'test.png', contentType: 'image/png' });
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.not_configured');
  });

  it('POST /user-assets with non-image should use app-assets path (publicUrl)', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    mockUploadFileFunction.mockResolvedValue({
      url: 'https://cdn.example.com/admin/app-assets/logo.zip',
    });

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('zip'), { filename: 'logo.zip', contentType: 'application/zip' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe('https://cdn.example.com/admin/app-assets/logo.zip');
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    expect(mockUploadFileFunction.mock.calls[0]?.[1]).toBe('admin/app-assets/logo.zip');
    expect(mockListFilesFunction).not.toHaveBeenCalled();
    expect(mockDeleteFileFunction).not.toHaveBeenCalled();
  });

  it('POST /user-assets with non-image should use app-assets path (no publicUrl)', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    mockUploadFileFunction.mockResolvedValue(null);

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('zip'), { filename: 'logo.zip', contentType: 'application/zip' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `${tenantContext.envSet.endpoint.origin}/api/app-assets/logo.zip`
    );
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    expect(mockUploadFileFunction.mock.calls[0]?.[1]).toBe('admin/app-assets/logo.zip');
    expect(mockListFilesFunction).not.toHaveBeenCalled();
    expect(mockDeleteFileFunction).not.toHaveBeenCalled();
  });

  it('POST /user-assets with image should use user-assets path, cleanup old files, and add cache-busting (publicUrl)', async () => {
    const now = Date.now();
    jest.useFakeTimers().setSystemTime(now);

    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    mockUploadFileFunction.mockResolvedValue({
      url: 'https://cdn.example.com/admin/user-assets/foo/you.png',
    });
    mockListFilesFunction.mockResolvedValue([
      'admin/user-assets/foo/you.png',
      'admin/user-assets/foo/you.jpg',
      'admin/user-assets/foo/you.webp',
    ]);
    mockDeleteFileFunction.mockResolvedValue(null);

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('png'), { filename: 'avatar.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `https://cdn.example.com/admin/user-assets/foo/you.png?v=${now}`
    );
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    expect(mockUploadFileFunction.mock.calls[0]?.[1]).toBe('admin/user-assets/foo/you.png');

    expect(mockListFilesFunction).toHaveBeenCalledTimes(1);
    expect(mockListFilesFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.');

    expect(mockDeleteFileFunction).toHaveBeenCalledTimes(2);
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.jpg');
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.webp');
    expect(mockDeleteFileFunction).not.toHaveBeenCalledWith('admin/user-assets/foo/you.png');

    jest.useRealTimers();
  });

  it('POST /user-assets with image should use user-assets path, cleanup, and add cache-busting (no publicUrl)', async () => {
    const now = Date.now();
    jest.useFakeTimers().setSystemTime(now);

    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    mockUploadFileFunction.mockResolvedValue(null);
    mockListFilesFunction.mockResolvedValue(['admin/user-assets/foo/you.png']);
    mockDeleteFileFunction.mockResolvedValue(null);

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('png'), { filename: 'avatar.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `${tenantContext.envSet.endpoint.origin}/api/user-assets/foo/you.png?v=${now}`
    );
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    expect(mockUploadFileFunction.mock.calls[0]?.[1]).toBe('admin/user-assets/foo/you.png');

    expect(mockListFilesFunction).toHaveBeenCalledTimes(1);
    expect(mockListFilesFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.');

    expect(mockDeleteFileFunction).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('POST /user-assets with image should still return 200 when cleanup fails (best-effort)', async () => {
    const now = Date.now();
    jest.useFakeTimers().setSystemTime(now);

    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    mockUploadFileFunction.mockResolvedValue({
      url: 'https://cdn.example.com/admin/user-assets/foo/you.jpg',
    });
    mockListFilesFunction.mockRejectedValue(new Error('List failed'));

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('jpg'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `https://cdn.example.com/admin/user-assets/foo/you.jpg?v=${now}`
    );

    jest.useRealTimers();
  });

  it('POST /user-assets should return 500 when upload fails', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    mockUploadFileFunction.mockRejectedValue(new Error('S3 upload failed'));

    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('png'), { filename: 'avatar.png', contentType: 'image/png' });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.upload_error');
  });
});
