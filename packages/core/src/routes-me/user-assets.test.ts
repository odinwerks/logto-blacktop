import { StorageProvider } from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import { mockUser } from '#src/__mocks__/index.js';
import koaErrorHandler from '#src/middleware/koa-error-handler.js';
import koaI18next from '#src/middleware/koa-i18next.js';
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
  buildStorage: jest.fn(() => ({
    uploadFile: mockUploadFileFunction,
    listFiles: mockListFilesFunction,
    deleteFile: mockDeleteFileFunction,
  })),
}));

const userAssetsRoutes = await pickDefault(import('./user-assets.js'));

// The route picks the avatar path from the magic bytes, not the claimed MIME type — and the
// end marker must be present too, so the fixtures are complete images.
const png = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63FCFFFFFF1F00040501FE6F1B5F570000000049454E44AE426082',
  'hex'
);
const jpeg = Buffer.from(
  'FFD8FFE000104A46494600010100000100010000FFDB004300080606070605080707070909080A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C231C1C2837292C30313434341F27393D38323C2E333432FFDB0043010909090C0B0C180D0D1832211C213232323232323232323232323232323232323232323232323232323232323232FFC00011080001000103011100021100031100FFC4001500010100000000000000000000000000000000FFC40014100100000000000000000000000000000000FFDA000C03010002110311003F00FFD9',
  'hex'
);

describe('me user-assets routes', () => {
  const tenantContext = new MockTenant();
  const meRequest = createRequester({
    middlewares: [koaI18next(), koaErrorHandler()] as never[],
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
    jest.spyOn(Date, 'now').mockRestore();
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

  it('POST /user-assets should return 400 when storage is not configured', async () => {
    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('test'), { filename: 'test.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('storage.not_configured');
  });

  it.each([
    ['zip', 'logo.zip', 'application/zip'],
    ['svg', 'my logo.svg', 'image/svg+xml'],
    ['ico', 'favicon.ico', 'image/x-icon'],
  ])(
    'POST /user-assets should reject non-avatar upload %s even when the declared type is allowed',
    async (_name, filename, contentType) => {
      // eslint-disable-next-line @silverhand/fp/no-mutation
      SystemContext.shared.storageProviderConfig = {
        provider: StorageProvider.S3Storage,
        bucket: 'test-bucket',
        region: 'us-east-1',
        accessKeyId: 'key',
        accessSecretKey: 'secret',
        publicUrl: 'https://cdn.example.com',
      };

      const response = await meRequest
        .post('/user-assets')
        .attach('file', Buffer.from('content'), { filename, contentType });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('guard.mime_type_not_allowed');
      expect(mockUploadFileFunction).not.toHaveBeenCalled();
    }
  );

  it('POST /user-assets should reject an image whose magic bytes are not avatar types', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };

    // SVG payload declared (and accepted) as image/svg+xml is not an avatar type by content
    const response = await meRequest
      .post('/user-assets')
      .attach('file', Buffer.from('<svg><script>alert(1)</script></svg>'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.mime_type_not_allowed');
    expect(mockUploadFileFunction).not.toHaveBeenCalled();
  });

  it('POST /user-assets with image should use user-assets path, cleanup old files, and add cache-busting (publicUrl)', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

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
      .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `https://cdn.example.com/admin/user-assets/foo/you.png?v=${now}`
    );
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    expect(mockUploadFileFunction.mock.calls[0]?.[1]).toBe('admin/user-assets/foo/you.png');

    expect(mockListFilesFunction).toHaveBeenCalledTimes(1);
    expect(mockListFilesFunction).toHaveBeenCalledWith('admin/user-assets/foo/');

    expect(mockDeleteFileFunction).toHaveBeenCalledTimes(2);
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.jpg');
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.webp');
    expect(mockDeleteFileFunction).not.toHaveBeenCalledWith('admin/user-assets/foo/you.png');
  });

  it('POST /user-assets with image should use user-assets path, cleanup, and add cache-busting (no publicUrl)', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

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
      .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `${tenantContext.envSet.endpoint.origin}/api/user-assets/foo/you.png?v=${now}`
    );
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    expect(mockUploadFileFunction.mock.calls[0]?.[1]).toBe('admin/user-assets/foo/you.png');

    expect(mockListFilesFunction).toHaveBeenCalledTimes(1);
    expect(mockListFilesFunction).toHaveBeenCalledWith('admin/user-assets/foo/');

    expect(mockDeleteFileFunction).not.toHaveBeenCalled();
  });

  it('POST /user-assets with image should still return 200 when cleanup fails (best-effort)', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

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
      .attach('file', jpeg, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(
      `https://cdn.example.com/admin/user-assets/foo/you.jpg?v=${now}`
    );
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
      .attach('file', png, { filename: 'avatar.png', contentType: 'image/png' });

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.upload_error');
  });
});
