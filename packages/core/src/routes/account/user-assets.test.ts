/* eslint-disable @silverhand/fp/no-mutation -- tests stub the shared SystemContext storage config and the in-memory bucket directly */
import { UserScope } from '@logto/core-kit';
import {
  AccountCenterControlValue,
  type AccountCenter,
  StorageProvider,
  type StorageProviderData,
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

// An in-memory bucket behind the mocked storage builder, so a test can assert what is actually
// left after a sequence of uploads — the invariant the fixed route must keep.
const objects = new Map<string, Uint8Array>();
const uploadFile = jest.fn(async (data: Uint8Array, key: string) => {
  objects.set(key, data);
  return { url: `http://rustfs:9000/logto/${key}` };
});
const listFiles = jest.fn(async (prefix: string) =>
  [...objects.keys()].filter((key) => key.startsWith(prefix))
);
const deleteFile = jest.fn(async (key: string) => {
  objects.delete(key);
});

await mockEsmWithActual('#src/utils/storage/index.js', () => ({
  buildStorage: jest.fn(() => ({ uploadFile, listFiles, deleteFile })),
}));

const mockUpdateUserById = jest.fn(async (_id: string, data: Partial<User>) => ({
  ...mockUser,
  ...data,
}));

const mockedQueries = {
  users: {
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
        maximumAuthenticationAgeInSeconds: 600,
        profileFields: null,
      })
    ),
  },
} satisfies Partial2<Queries>;

const tenantContext = new MockTenant(undefined, mockedQueries);

const accountUserAssetsRoutes = await pickDefault(import('./user-assets.js'));

const requester = createRequester({
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
      accountUserAssetsRoutes(router as any, tenant);
    },
  ] as never[],
  tenantContext,
});

// Complete, valid images: `uploadAvatar` validates magic bytes *and* the end marker.
const validPng = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63FCFFFFFF1F00040501FE6F1B5F570000000049454E44AE426082',
  'hex'
);

const validJpeg = Buffer.from(
  'FFD8FFE000104A46494600010100000100010000FFDB004300080606070605080707070909080A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C231C1C2837292C30313434341F27393D38323C2E333432FFDB0043010909090C0B0C180D0D1832211C213232323232323232323232323232323232323232323232323232323232323232323232FFC00011080001000103011100021100031100FFC4001500010100000000000000000000000000000000FFC40014100100000000000000000000000000000000FFDA000C03010002110311003F00FFD9',
  'hex'
);

/** A minimal complete WebP: RIFF size consistent with the buffer length, `WEBP` at offset 8. */
const buildWebp = (filler: number) => {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer.fill(filler, 16);
  return buffer;
};

// What the updated account/experience UI uploads after converting the cropped canvas to WebP:
// WebP bytes, regardless of the file name the user picked.
const webpOne = buildWebp(0x01);
const webpTwo = buildWebp(0x02);

const avatarKey = (extension: string) => `admin/user-assets/${mockUser.id}/you.${extension}`;
const avatarUrl = (extension: string, time: number) =>
  `${tenantContext.envSet.endpoint.origin}/api/user-assets/${mockUser.id}/you.${extension}?v=${time}`;

describe('POST /my-account/user-assets/avatar', () => {
  // eslint-disable-next-line @silverhand/fp/no-let
  let currentTime: number;

  beforeEach(() => {
    objects.clear();
    jest.clearAllMocks();
    Reflect.deleteProperty(SystemContext.shared, 'storageProviderConfig');
    currentTime = 1_791_571_306_000;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    SystemContext.shared.storageProviderConfig = {
      provider: StorageProvider.S3Storage,
      bucket: 'logto',
      endpoint: 'http://rustfs:9000',
      accessKeyId: 'key',
      accessSecretKey: 'secret',
      forcePathStyle: true,
    } satisfies StorageProviderData;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should store two converted uploads as one you.webp and re-pin user.avatar with a new ?v=', async () => {
    const first = await requester
      .post('/my-account/user-assets/avatar')
      .attach('file', webpOne, { filename: 'photo.png', contentType: 'image/png' });

    expect(first.status).toBe(200);
    expect(first.body.url).toBe(avatarUrl('webp', 1_791_571_306_000));
    // Magic bytes decide the key, not the claimed filename or content type
    expect(uploadFile).toHaveBeenCalledWith(webpOne, avatarKey('webp'), {
      contentType: 'image/webp',
      publicUrl: undefined,
      isPublic: false,
    });
    expect([...objects.keys()]).toEqual([avatarKey('webp')]);
    expect(mockUpdateUserById).toHaveBeenLastCalledWith(mockUser.id, {
      avatar: avatarUrl('webp', 1_791_571_306_000),
    });

    currentTime = 1_791_571_311_000;
    const second = await requester
      .post('/my-account/user-assets/avatar')
      .attach('file', webpTwo, { filename: 'Holiday Photo.jpeg', contentType: 'image/jpeg' });

    expect(second.status).toBe(200);
    expect(second.body.url).toBe(avatarUrl('webp', 1_791_571_311_000));
    // The cache buster moved with the upload
    expect(second.body.url).not.toBe(first.body.url);
    // Still exactly one object, holding the newest bytes
    expect([...objects.keys()]).toEqual([avatarKey('webp')]);
    expect(objects.get(avatarKey('webp'))).toEqual(webpTwo);
    expect(mockUpdateUserById).toHaveBeenLastCalledWith(mockUser.id, {
      avatar: avatarUrl('webp', 1_791_571_311_000),
    });
  });

  it('should pin user.avatar to the actually stored key for a direct non-WebP upload', async () => {
    const first = await requester
      .post('/my-account/user-assets/avatar')
      .attach('file', webpOne, { filename: 'avatar.webp', contentType: 'image/webp' });

    expect(first.status).toBe(200);
    expect(first.body.url).toBe(avatarUrl('webp', 1_791_571_306_000));

    // A raw PNG posted straight at the API (no client-side conversion): stored as you.png and
    // the row follows the real key, replacing the previous you.webp URL instead of drifting.
    currentTime = 1_791_571_320_000;
    const second = await requester
      .post('/my-account/user-assets/avatar')
      .attach('file', validPng, { filename: 'holiday photo.png', contentType: 'image/png' });

    expect(second.status).toBe(200);
    expect(second.body.url).toBe(avatarUrl('png', 1_791_571_320_000));
    expect([...objects.keys()]).toEqual([avatarKey('png')]);
    expect(objects.get(avatarKey('png'))).toEqual(validPng);
    expect(mockUpdateUserById).toHaveBeenLastCalledWith(mockUser.id, {
      avatar: avatarUrl('png', 1_791_571_320_000),
    });
  });

  it('should leave the previous user.avatar row and object intact when the upload fails', async () => {
    const first = await requester
      .post('/my-account/user-assets/avatar')
      .attach('file', webpOne, { filename: 'avatar.webp', contentType: 'image/webp' });

    expect(first.status).toBe(200);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);

    uploadFile.mockRejectedValueOnce(new Error('S3 upload failed'));
    currentTime = 1_791_571_330_000;

    const second = await requester
      .post('/my-account/user-assets/avatar')
      .attach('file', validJpeg, { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(second.status).toBe(500);
    expect(second.body.code).toBe('storage.upload_error');
    // The old object was not deleted and the old row was not touched
    expect(deleteFile).not.toHaveBeenCalled();
    expect([...objects.keys()]).toEqual([avatarKey('webp')]);
    expect(objects.get(avatarKey('webp'))).toEqual(webpOne);
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserById).toHaveBeenLastCalledWith(mockUser.id, {
      avatar: avatarUrl('webp', 1_791_571_306_000),
    });
  });
});
/* eslint-enable @silverhand/fp/no-mutation */
