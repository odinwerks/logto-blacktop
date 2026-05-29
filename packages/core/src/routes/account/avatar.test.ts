import { UserScope } from '@logto/core-kit';
import {
  AccountCenterControlValue,
  type AccountCenter,
  StorageProvider,
  type User,
} from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import { mockUser } from '#src/__mocks__/index.js';
import SystemContext from '#src/tenants/SystemContext.js';
import type TenantContext from '#src/tenants/TenantContext.js';
import { MockTenant, type Partial2 } from '#src/test-utils/tenant.js';
import { createRequester } from '#src/utils/test-utils.js';
import type { ManagementApiRouter } from '#src/routes/types.js';

import type Queries from '#src/tenants/Queries.js';
import koaAccountCenter from './middlewares/koa-account-center.js';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

// Mock storage builder
const mockUploadFileFn = jest.fn();
const mockListFilesFn = jest.fn();
const mockDeleteFileFn = jest.fn();

await mockEsmWithActual('#src/utils/storage/index.js', () => ({
  buildUploadFile: jest.fn(() => ({
    uploadFile: mockUploadFileFn,
    listFiles: mockListFilesFn,
    deleteFile: mockDeleteFileFn,
  })),
}));

// Mock detectImageType
const mockDetectImageType = jest.fn();
await mockEsmWithActual('#src/utils/file.js', () => ({
  detectImageType: mockDetectImageType,
}));

// Mock get-scoped-profile
const mockGetScopedProfile = jest.fn();
const mockGetAccountCenterFilteredProfile = jest.fn();
await mockEsmWithActual('./utils/get-scoped-profile.js', () => ({
  getScopedProfile: mockGetScopedProfile,
  getAccountCenterFilteredProfile: mockGetAccountCenterFilteredProfile,
}));

const mockUpdateUserById = jest.fn().mockImplementation(async (_id: string, data: Partial<User>) => ({
  ...mockUser,
  ...data,
}));

const mockedQueries = {
  users: {
    findUserById: jest.fn(async () => mockUser),
    updateUserById: mockUpdateUserById,
  },
  accountCenters: {
    findDefaultAccountCenter: jest.fn(
      async (): Promise<AccountCenter> => ({
        tenantId: mockUser.tenantId,
        id: 'default',
        enabled: true,
        fields: {
          avatar: AccountCenterControlValue.Edit,
        },
        webauthnRelatedOrigins: [],
        deleteAccountUrl: null,
        customCss: null,
        profileFields: null,
      })
    ),
  },
} satisfies Partial2<Queries>;

const tenantContext = new MockTenant(undefined, mockedQueries);

const avatarRoutes = await pickDefault(import('./avatar.js'));

const avatarRequest = createRequester({
  authedRoutes: [
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    (router: ManagementApiRouter, tenant: TenantContext) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      router.use(koaAccountCenter(tenant.queries) as any);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      avatarRoutes(router as any, tenant);
    },
  ] as never[],
  tenantContext,
});

// Helper: create a buffer with valid JPEG magic bytes
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

beforeEach(() => {
  jest.clearAllMocks();
  // Reset SystemContext for each test
  SystemContext.shared.storageProviderConfig = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('POST /my-account/avatar', () => {
  it('should return 400 when no file is provided', async () => {
    const response = await avatarRequest.post('/my-account/avatar').send({});
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.invalid_input');
  });

  it('should return 400 when file exceeds max size', async () => {
    // maxUploadFileSize is 20MB (20 * 1024 * 1024 bytes).
    // Create a buffer larger than 20MB to trigger the size guard.
    const largeBuffer = Buffer.allocUnsafe(21 * 1024 * 1024); // 21MB
    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', largeBuffer, 'test.jpg');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.file_size_exceeded');
  });

  it('should return 400 when file is not an allowed image type', async () => {
    mockDetectImageType.mockReturnValue(undefined);

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', Buffer.from('not an image'), 'test.txt');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.mime_type_not_allowed');
  });

  it('should return 400 when magic bytes do not match the claimed MIME', async () => {
    // Upload file with text content but claiming image/png content type.
    // detectImageType returns undefined for non-image bytes.
    mockDetectImageType.mockReturnValue(undefined);

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', Buffer.from('pretending to be png'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.mime_type_not_allowed');
  });

  it('should return 400 when account center avatar field is not set to Edit', async () => {
    mockedQueries.accountCenters.findDefaultAccountCenter.mockResolvedValueOnce({
      tenantId: mockUser.tenantId,
      id: 'default',
      enabled: true,
      fields: {
        avatar: AccountCenterControlValue.ReadOnly,
      },
      webauthnRelatedOrigins: [],
      deleteAccountUrl: null,
      customCss: null,
      profileFields: null,
    });

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('account_center.field_not_editable');
  });

  it('should return 401 when token lacks profile scope', async () => {
    // Need to create a new requester without UserScope.Profile in scopes
    const noProfileRequest = createRequester({
      authedRoutes: [
        (router: ManagementApiRouter) => {
          // Override the default auth to set specific scopes
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          router.use(async (ctx, next) => {
            ctx.auth = {
              ...ctx.auth,
              id: mockUser.id,
              scopes: new Set([UserScope.Email]),
            };
            ctx.appendDataHookContext = jest.fn();
            return next();
          });
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        (router: ManagementApiRouter, tenant: TenantContext) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          router.use(koaAccountCenter(tenant.queries) as any);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          avatarRoutes(router as any, tenant);
        },
      ] as never[],
      tenantContext,
    });

    const response = await noProfileRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('auth.unauthorized');
  });

  it('should return 500 when storage provider is not configured', async () => {
    mockDetectImageType.mockReturnValue({ mime: 'image/jpeg', extension: 'jpg' });
    SystemContext.shared.storageProviderConfig = undefined;

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.not_configured');
  });

  it('should return 500 when storage provider is not S3Storage', async () => {
    mockDetectImageType.mockReturnValue({ mime: 'image/jpeg', extension: 'jpg' });
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.AzureStorage,
      connectionString: 'fake',
      container: 'fake',
    };

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.not_configured');
  });

  it('should upload avatar, clean up old files, update user record, and return profile', async () => {
    const now = Date.now();
    jest.useFakeTimers().setSystemTime(now);

    const detected = { mime: 'image/jpeg', extension: 'jpg' };
    mockDetectImageType.mockReturnValue(detected);

    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    // Mock the scoped profile response
    const profileResponse = {
      id: mockUser.id,
      name: mockUser.name,
      avatar: 'https://cdn.example.com/admin/foo/you.jpg?v=' + now,
    };
    mockGetScopedProfile.mockResolvedValue(profileResponse);
    mockGetAccountCenterFilteredProfile.mockReturnValue(profileResponse);

    // Mock storage: upload succeeds, list returns old files with different extensions
    mockUploadFileFn.mockResolvedValue({ url: 'https://cdn.example.com/admin/foo/you.jpg' });
    mockListFilesFn.mockResolvedValue([
      'admin/foo/you.png',
      'admin/foo/you.jpg',
      'admin/foo/you.webp',
    ]);
    mockDeleteFileFn.mockResolvedValue(undefined);

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(200);
    // Verify upload was called with the correct final key (not a temp key)
    expect(mockUploadFileFn).toHaveBeenCalledTimes(1);
    const uploadCallArgs = mockUploadFileFn.mock.calls[0];
    expect(uploadCallArgs[1]).toBe('admin/foo/you.jpg'); // finalKey, not temp
    expect(uploadCallArgs[2]).toEqual({
      contentType: 'image/jpeg',
      publicUrl: 'https://cdn.example.com',
    });

    // Verify cleanup deleted old files with different extensions
    expect(mockDeleteFileFn).toHaveBeenCalledTimes(2);
    expect(mockDeleteFileFn).toHaveBeenCalledWith('admin/foo/you.png');
    expect(mockDeleteFileFn).toHaveBeenCalledWith('admin/foo/you.webp');
    expect(mockDeleteFileFn).not.toHaveBeenCalledWith('admin/foo/you.jpg');

    // Verify user record was updated
    expect(mockUpdateUserById).toHaveBeenCalledWith(mockUser.id, {
      avatar: expect.stringContaining('cdn.example.com/admin/foo/you.jpg?v='),
    });

    // Verify profile was returned
    expect(mockGetScopedProfile).toHaveBeenCalled();
    expect(mockGetAccountCenterFilteredProfile).toHaveBeenCalled();
    expect(response.body).toEqual(profileResponse);

    jest.useRealTimers();
  });

  it('should return 500 when S3 upload fails', async () => {
    mockDetectImageType.mockReturnValue({ mime: 'image/jpeg', extension: 'jpg' });

    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    mockUploadFileFn.mockRejectedValue(new Error('S3 upload failed'));

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.upload_error');
  });

  it('should still return 200 when cleanup fails (best-effort)', async () => {
    const now = Date.now();
    jest.useFakeTimers().setSystemTime(now);

    mockDetectImageType.mockReturnValue({ mime: 'image/jpeg', extension: 'jpg' });

    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    const profileResponse = {
      id: mockUser.id,
      name: mockUser.name,
      avatar: 'https://cdn.example.com/admin/foo/you.jpg?v=' + now,
    };
    mockGetScopedProfile.mockResolvedValue(profileResponse);
    mockGetAccountCenterFilteredProfile.mockReturnValue(profileResponse);

    // Upload succeeds
    mockUploadFileFn.mockResolvedValue({ url: 'https://cdn.example.com/admin/foo/you.jpg' });
    // Cleanup fails
    mockListFilesFn.mockRejectedValue(new Error('List failed'));

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    // Should still succeed (cleanup is best-effort)
    expect(response.status).toBe(200);

    jest.useRealTimers();
  });
});
