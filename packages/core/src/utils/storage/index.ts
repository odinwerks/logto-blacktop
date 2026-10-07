import type { StorageProviderData } from '@logto/schemas';

import { buildAzureStorage } from './azure-storage.js';
import { buildGoogleStorage } from './google-storage.js';
import { buildS3Storage } from './s3-storage.js';
import type { Storage, StorageProvider, UploadFile } from './types.js';

/**
 * Blacktop: build the configured storage provider with the fork's optional op set.
 */
// eslint-disable-next-line @typescript-eslint/ban-types -- Google doesn't allow us to use Uint8Array
export const buildStorage = (config: StorageProviderData): StorageProvider => {
  if (config.provider === 'AzureStorage') {
    const storage = buildAzureStorage(config.connectionString, config.container);

    // eslint-disable-next-line no-restricted-syntax
    return storage as unknown as StorageProvider;
  }
  if (config.provider === 'GoogleStorage') {
    const { projectId, keyFilename, bucketName } = config;
    const storage = buildGoogleStorage(projectId, keyFilename, bucketName);

    // eslint-disable-next-line no-restricted-syntax
    return storage as unknown as StorageProvider;
  }

  const { endpoint, bucket, accessKeyId, forcePathStyle, accessSecretKey, region } = config;

  const storage = buildS3Storage({
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey: accessSecretKey,
    region,
    forcePathStyle,
  });

  return storage;
};

/**
 * Upstream API: the provider's upload function on its own.
 */
// eslint-disable-next-line @typescript-eslint/ban-types -- Google doesn't allow us to use Uint8Array
export const buildUploadFile = (config: StorageProviderData): UploadFile<Buffer> =>
  buildStorage(config).uploadFile;

export type { Storage, StorageProvider };
