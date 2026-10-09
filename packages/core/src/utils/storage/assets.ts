import { adminTenantId, StorageProvider, type StorageProviderData } from '@logto/schemas';

import type { StorageProvider as Storage } from './types.js';

/**
 * Blacktop: the fork's self-cleaning asset layout.
 *
 * - A user's avatar always lives at `admin/user-assets/{userId}/you.{ext}`, whatever the uploaded
 *   file was called. The folder only ever holds the current avatar: a re-upload overwrites the same
 *   key, and any other object in the folder (e.g. the previous avatar's other extension) is deleted
 *   once the new one is stored. The folder is removed with the user.
 * - Branding assets live at `{tenantId}/app-assets/branding/{filename}`; uploading the same name
 *   again replaces the object.
 * - Without a `publicUrl` the bucket stays private and the objects are served by the
 *   `/api/user-assets` and `/api/app-assets` proxy routes. Returned URLs carry `?v={timestamp}`, which
 *   is what busts caches, since the keys themselves never change.
 */

export const getUserAssetsPrefix = (userId: string) => `${adminTenantId}/user-assets/${userId}/`;

export const getUserAvatarKey = (userId: string, extension: string) =>
  `${getUserAssetsPrefix(userId)}you.${extension}`;

export const getBrandingAssetKey = (tenantId: string, filename: string) =>
  `${tenantId}/app-assets/branding/${filename}`;

const maxAssetFilenameLength = 128;

/**
 * Make an uploaded filename usable as a branding key: the proxy route only serves names matching
 * `[\w.-]+` that don't start with a dot, so anything else would upload fine but never load.
 */
export const sanitizeAssetFilename = (filename: string) =>
  (filename.split(/[/\\]/).pop() ?? '')
    .replaceAll(/[^\w.-]/g, '-')
    .replace(/^\.+/, '')
    .slice(-maxAssetFilenameLength) || 'asset';

/**
 * Whether objects can be uploaded privately: with a `publicUrl` the CDN in front of the bucket reads
 * them directly, otherwise only the proxy routes do.
 */
export const isPublicAsset = (storageProviderConfig: StorageProviderData) =>
  Boolean(storageProviderConfig.publicUrl);

/** Delete every object in the user's asset folder except `keep`. No-op for providers without list/delete. */
export const removeUserAssets = async (storage: Storage, userId: string, keep?: string) => {
  const { listFiles, deleteFile } = storage;

  if (!listFiles || !deleteFile) {
    return;
  }

  const keys = await listFiles(getUserAssetsPrefix(userId));
  await Promise.all(keys.filter((key) => key !== keep).map(async (key) => deleteFile(key)));
};

type StoreUserAvatarParameters = {
  storage: Storage;
  storageProviderConfig: StorageProviderData;
  userId: string;
  data: Buffer;
  /** The MIME type detected from the file content. */
  contentType: string;
  extension: string;
  /** The origin of this Logto endpoint, which serves the `/api/user-assets` proxy route. */
  endpointOrigin: string;
  logError: (message: string, error: unknown) => void;
};

/**
 * Store the user's avatar at its fixed key, then delete whatever else is left in the user's asset
 * folder. Upload errors propagate; the cleanup is best-effort and only runs after the new object is
 * stored, so a failed upload never loses the current avatar.
 *
 * @returns The cache-busted URL of the new avatar.
 */
export const storeUserAvatar = async ({
  storage,
  storageProviderConfig,
  userId,
  data,
  contentType,
  extension,
  endpointOrigin,
  logError,
}: StoreUserAvatarParameters): Promise<string> => {
  const objectKey = getUserAvatarKey(userId, extension);
  const { publicUrl } = storageProviderConfig;

  const uploaded = await storage.uploadFile(data, objectKey, {
    contentType,
    publicUrl,
    isPublic: isPublicAsset(storageProviderConfig),
  });

  try {
    await removeUserAssets(storage, userId, objectKey);
  } catch (error: unknown) {
    logError('Avatar cleanup failed:', error);
  }

  const getUrl = () => {
    if (publicUrl) {
      return `${publicUrl}/${objectKey}`;
    }

    // The proxy route only reads from S3; other providers keep handing out their own URL.
    return storageProviderConfig.provider === StorageProvider.S3Storage
      ? `${endpointOrigin}/api/user-assets/${userId}/you.${extension}`
      : uploaded.url;
  };

  return `${getUrl()}?v=${Date.now()}`;
};
