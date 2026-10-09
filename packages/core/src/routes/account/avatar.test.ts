/* eslint-disable @silverhand/fp/no-mutation -- tests stub the shared SystemContext storage config directly */
import { UserScope } from '@logto/core-kit';
import {
  AccountCenterControlValue,
  type AccountCenter,
  StorageProvider,
  type User,
} from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';

import { mockUser } from '#src/__mocks__/index.js';
import koaErrorHandler from '#src/middleware/koa-error-handler.js';
import koaI18next from '#src/middleware/koa-i18next.js';
import type { ManagementApiRouter } from '#src/routes/types.js';
import type Queries from '#src/tenants/Queries.js';
import SystemContext from '#src/tenants/SystemContext.js';
import type TenantContext from '#src/tenants/TenantContext.js';
import { MockTenant, type Partial2 } from '#src/test-utils/tenant.js';
import { createRequester } from '#src/utils/test-utils.js';

import koaAccountCenter from './middlewares/koa-account-center.js';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

// Mock storage builder
const mockUploadFileFunction = jest.fn();
const mockListFilesFunction = jest.fn();
const mockDeleteFileFunction = jest.fn();

await mockEsmWithActual('#src/utils/storage/index.js', () => ({
  buildStorage: jest.fn(() => ({
    uploadFile: mockUploadFileFunction,
    listFiles: mockListFilesFunction,
    deleteFile: mockDeleteFileFunction,
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

const mockUpdateUserById = jest
  .fn()
  .mockImplementation(async (_id: string, data: Partial<User>) => ({
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
  middlewares: [koaI18next(), koaErrorHandler()],
  authedRoutes: [
    (router: ManagementApiRouter) => {
      // Grant the profile scope the route requires; the default test auth has none.
      router.use(async (ctx, next) => {
        ctx.auth.scopes = new Set([UserScope.Profile]);
        ctx.appendDataHookContext = jest.fn();
        return next();
      });
    },

    (router: ManagementApiRouter, tenant: TenantContext) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      router.use(koaAccountCenter(tenant.queries) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  Reflect.deleteProperty(SystemContext.shared, 'storageProviderConfig');
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
    // MaxUploadFileSize is 20MB (20 * 1024 * 1024 bytes).
    // Create a buffer larger than 20MB to trigger the size guard.
    const largeBuffer = Buffer.allocUnsafe(21 * 1024 * 1024); // 21MB
    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', largeBuffer, 'test.jpg');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('guard.file_size_exceeded');
  });

  it('should return 400 when file is not an allowed image type', async () => {
    // DetectImageType returns undefined for non-image data
    // eslint-disable-next-line unicorn/no-useless-undefined -- mock must return undefined
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
    // DetectImageType returns undefined for non-image data
    // eslint-disable-next-line unicorn/no-useless-undefined -- mock must return undefined
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
      middlewares: [koaI18next(), koaErrorHandler()],
      authedRoutes: [
        (router: ManagementApiRouter) => {
          // Override the default auth to set specific scopes

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

        (router: ManagementApiRouter, tenant: TenantContext) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          router.use(koaAccountCenter(tenant.queries) as any);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    Reflect.deleteProperty(SystemContext.shared, 'storageProviderConfig');

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
      avatar: 'https://cdn.example.com/admin/user-assets/foo/you.jpg?v=' + now,
    };
    mockGetScopedProfile.mockResolvedValue(profileResponse);
    mockGetAccountCenterFilteredProfile.mockReturnValue(profileResponse);

    // Mock storage: upload succeeds, list returns old files with different extensions
    mockUploadFileFunction.mockResolvedValue({
      url: 'https://cdn.example.com/admin/user-assets/foo/you.jpg',
    });
    mockListFilesFunction.mockResolvedValue([
      'admin/user-assets/foo/you.png',
      'admin/user-assets/foo/you.jpg',
      'admin/user-assets/foo/you.webp',
    ]);
    // eslint-disable-next-line unicorn/no-useless-undefined -- deleteFile mock resolves void
    mockDeleteFileFunction.mockResolvedValue(undefined);

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(200);
    // Verify upload was called with the correct final key (not a temp key)
    expect(mockUploadFileFunction).toHaveBeenCalledTimes(1);
    const [, uploadedKey, uploadOptions] = mockUploadFileFunction.mock.calls[0] as [
      unknown,
      string,
      { contentType: string; publicUrl: string; isPublic: boolean },
    ];
    expect(uploadedKey).toBe('admin/user-assets/foo/you.jpg'); // FinalKey, not temp
    expect(uploadOptions).toEqual({
      contentType: 'image/jpeg',
      publicUrl: 'https://cdn.example.com',
      isPublic: true,
    });

    // Verify cleanup deleted old files with different extensions
    expect(mockDeleteFileFunction).toHaveBeenCalledTimes(2);
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.png');
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.webp');
    expect(mockDeleteFileFunction).not.toHaveBeenCalledWith('admin/user-assets/foo/you.jpg');

    // Verify user record was updated
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    const [, updatePayload] = mockUpdateUserById.mock.calls[0] as [string, { avatar?: string }];
    expect(updatePayload.avatar).toMatch(
      /^https:\/\/cdn\.example\.com\/admin\/user-assets\/foo\/you\.jpg\?v=\d+$/
    );

    // Verify profile was returned
    expect(mockGetScopedProfile).toHaveBeenCalled();
    expect(mockGetAccountCenterFilteredProfile).toHaveBeenCalled();
    expect(response.body).toEqual(profileResponse);
  });

  it('should keep the bucket private and point the avatar at the proxy route without a publicUrl', async () => {
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(1_785_066_085_172);
    mockDetectImageType.mockReturnValue({ mime: 'image/png', extension: 'png' });

    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'logto',
      endpoint: 'http://rustfs:9000',
      forcePathStyle: true,
      accessKeyId: 'key',
      accessSecretKey: 'secret',
    };
    mockGetAccountCenterFilteredProfile.mockReturnValue({});
    mockUploadFileFunction.mockResolvedValue({ url: 'http://rustfs:9000/logto/whatever' });
    mockListFilesFunction.mockResolvedValue([
      'admin/user-assets/foo/you.png',
      'admin/user-assets/foo/you.jpg',
    ]);

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'holiday photo.png');

    expect(response.status).toBe(200);
    expect(mockUploadFileFunction).toHaveBeenCalledWith(
      expect.any(Buffer),
      'admin/user-assets/foo/you.png',
      { contentType: 'image/png', publicUrl: undefined, isPublic: false }
    );
    expect(mockListFilesFunction).toHaveBeenCalledWith('admin/user-assets/foo/');
    expect(mockDeleteFileFunction).toHaveBeenCalledTimes(1);
    expect(mockDeleteFileFunction).toHaveBeenCalledWith('admin/user-assets/foo/you.jpg');
    expect(mockUpdateUserById).toHaveBeenCalledWith('foo', {
      avatar: `${tenantContext.envSet.endpoint.origin}/api/user-assets/foo/you.png?v=1785066085172`,
    });
    dateNow.mockRestore();
  });

  it('should return 500 and leave the old avatar alone when S3 upload fails', async () => {
    mockDetectImageType.mockReturnValue({ mime: 'image/jpeg', extension: 'jpg' });

    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'test-bucket',
      region: 'us-east-1',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      publicUrl: 'https://cdn.example.com',
    };

    mockUploadFileFunction.mockRejectedValue(new Error('S3 upload failed'));

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('storage.upload_error');
    expect(mockListFilesFunction).not.toHaveBeenCalled();
    expect(mockDeleteFileFunction).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it('should still return 200 when cleanup fails (best-effort)', async () => {
    const now = Date.now();

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
      avatar: 'https://cdn.example.com/admin/user-assets/foo/you.jpg?v=' + now,
    };
    mockGetScopedProfile.mockResolvedValue(profileResponse);
    mockGetAccountCenterFilteredProfile.mockReturnValue(profileResponse);

    // Upload succeeds
    mockUploadFileFunction.mockResolvedValue({
      url: 'https://cdn.example.com/admin/user-assets/foo/you.jpg',
    });
    // Cleanup fails
    mockListFilesFunction.mockRejectedValue(new Error('List failed'));

    const response = await avatarRequest
      .post('/my-account/avatar')
      .attach('file', jpegBuffer, 'test.jpg');

    // Should still succeed (cleanup is best-effort)
    expect(response.status).toBe(200);
  });
});
/* eslint-enable @silverhand/fp/no-mutation */
