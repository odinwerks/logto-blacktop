import { StorageProvider, type StorageProviderData } from '@logto/schemas';

import {
  removeUserAssets,
  sanitizeAssetFilename,
  storeUserAvatar,
  getUserAvatarKey,
} from './assets.js';
import type { StorageProvider as Storage } from './types.js';

const { jest } = import.meta;

const s3Config: StorageProviderData = {
  provider: StorageProvider.S3Storage,
  bucket: 'logto',
  endpoint: 'http://rustfs:9000',
  accessKeyId: 'key',
  accessSecretKey: 'secret',
  forcePathStyle: true,
};

/** An in-memory bucket, to check what is left after a sequence of uploads. */
const createMemoryStorage = () => {
  const objects = new Map<string, Buffer>();
  const storage = {
    uploadFile: jest.fn(async (data: Buffer, key: string) => {
      objects.set(key, data);
      return { url: `http://rustfs:9000/logto/${key}` };
    }),
    downloadFile: jest.fn(),
    isFileExisted: jest.fn(),
    getFileProperties: jest.fn(),
    listFiles: jest.fn(async (prefix: string) =>
      [...objects.keys()].filter((key) => key.startsWith(prefix))
    ),
    deleteFile: jest.fn(async (key: string) => {
      objects.delete(key);
    }),
  } satisfies Storage;

  return { objects, storage };
};

const storeAvatar = async (
  storage: Storage,
  extension: string,
  config: StorageProviderData = s3Config
) =>
  storeUserAvatar({
    storage,
    storageProviderConfig: config,
    userId: 'foo',
    data: Buffer.from(extension),
    contentType: `image/${extension}`,
    extension,
    endpointOrigin: 'https://auth.example.com',
    logError: jest.fn(),
  });

describe('storeUserAvatar()', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should keep exactly one avatar object across re-uploads, whatever the extension', async () => {
    const { objects, storage } = createMemoryStorage();
    // A stray object from an older layout in the same folder
    objects.set('admin/user-assets/foo/old-avatar.jpg', Buffer.from('old'));
    // Another user's folder that shares the id prefix must be left alone
    objects.set('admin/user-assets/foobar/you.png', Buffer.from('other'));

    await storeAvatar(storage, 'png');
    await storeAvatar(storage, 'png');
    expect([...objects.keys()].filter((key) => key.startsWith('admin/user-assets/foo/'))).toEqual([
      'admin/user-assets/foo/you.png',
    ]);

    await storeAvatar(storage, 'jpg');
    expect([...objects.keys()].sort()).toEqual([
      'admin/user-assets/foo/you.jpg',
      'admin/user-assets/foobar/you.png',
    ]);
    expect(objects.get('admin/user-assets/foo/you.jpg')?.toString()).toBe('jpg');
  });

  it('should upload privately and return the cache-busted proxy URL without a `publicUrl`', async () => {
    jest.useFakeTimers().setSystemTime(1_785_066_085_172);
    const { storage } = createMemoryStorage();

    await expect(storeAvatar(storage, 'png')).resolves.toBe(
      'https://auth.example.com/api/user-assets/foo/you.png?v=1785066085172'
    );
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'admin/user-assets/foo/you.png',
      { contentType: 'image/png', publicUrl: undefined, isPublic: false }
    );
  });

  it('should upload publicly and return the CDN URL with a `publicUrl`', async () => {
    jest.useFakeTimers().setSystemTime(1000);
    const { storage } = createMemoryStorage();

    await expect(
      storeAvatar(storage, 'png', { ...s3Config, publicUrl: 'https://cdn.example.com' })
    ).resolves.toBe('https://cdn.example.com/admin/user-assets/foo/you.png?v=1000');
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'admin/user-assets/foo/you.png',
      { contentType: 'image/png', publicUrl: 'https://cdn.example.com', isPublic: true }
    );
  });

  it('should pin the URL to the actually stored key across WebP re-uploads', async () => {
    jest.useFakeTimers().setSystemTime(1_791_571_306_000);
    const { objects, storage } = createMemoryStorage();

    await expect(storeAvatar(storage, 'webp')).resolves.toBe(
      'https://auth.example.com/api/user-assets/foo/you.webp?v=1791571306000'
    );

    jest.setSystemTime(1_791_571_311_000);
    await expect(storeAvatar(storage, 'webp')).resolves.toBe(
      'https://auth.example.com/api/user-assets/foo/you.webp?v=1791571311000'
    );
    expect([...objects.keys()]).toEqual(['admin/user-assets/foo/you.webp']);
  });

  it('should keep the current avatar when the upload fails', async () => {
    const { objects, storage } = createMemoryStorage();
    await storeAvatar(storage, 'png');
    storage.uploadFile.mockRejectedValueOnce(new Error('upload failed'));

    await expect(storeAvatar(storage, 'jpg')).rejects.toThrow('upload failed');
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect([...objects.keys()]).toEqual(['admin/user-assets/foo/you.png']);
  });

  it('should still succeed when the cleanup fails', async () => {
    const { storage } = createMemoryStorage();
    storage.listFiles.mockRejectedValueOnce(new Error('list failed'));
    const logError = jest.fn();

    await expect(
      storeUserAvatar({
        storage,
        storageProviderConfig: s3Config,
        userId: 'foo',
        data: Buffer.from('png'),
        contentType: 'image/png',
        extension: 'png',
        endpointOrigin: 'https://auth.example.com',
        logError,
      })
    ).resolves.toMatch(/^https:\/\/auth\.example\.com\/api\/user-assets\/foo\/you\.png\?v=\d+$/);
    expect(logError).toHaveBeenCalledWith('Avatar cleanup failed:', expect.any(Error));
  });
});

describe('removeUserAssets()', () => {
  it("should delete the user's whole folder", async () => {
    const { objects, storage } = createMemoryStorage();
    objects.set(getUserAvatarKey('foo', 'png'), Buffer.from(''));
    objects.set('admin/user-assets/foobar/you.png', Buffer.from(''));

    await removeUserAssets(storage, 'foo');

    expect(storage.listFiles).toHaveBeenCalledWith('admin/user-assets/foo/');
    expect([...objects.keys()]).toEqual(['admin/user-assets/foobar/you.png']);
  });

  it('should do nothing for a provider without list/delete', async () => {
    await expect(
      removeUserAssets(
        {
          uploadFile: jest.fn(),
          downloadFile: jest.fn(),
          isFileExisted: jest.fn(),
          getFileProperties: jest.fn(),
        },
        'foo'
      )
    ).resolves.toBeUndefined();
  });
});

describe('sanitizeAssetFilename()', () => {
  it('should keep names the proxy route can serve', () => {
    expect(sanitizeAssetFilename('gear.png')).toBe('gear.png');
    expect(sanitizeAssetFilename('my logo (1).svg')).toBe('my-logo--1-.svg');
    expect(sanitizeAssetFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAssetFilename('C:\\dir\\logo.png')).toBe('logo.png');
    expect(sanitizeAssetFilename('.hidden.png')).toBe('hidden.png');
    expect(sanitizeAssetFilename('')).toBe('asset');
    expect(sanitizeAssetFilename(`${'a'.repeat(200)}.png`)).toHaveLength(128);
    expect(sanitizeAssetFilename(`${'a'.repeat(200)}.png`)).toMatch(/\.png$/);
  });
});
