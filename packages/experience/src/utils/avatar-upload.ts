import type { RequestErrorBody } from '@logto/schemas';
import { avatarFileExtensionsLabel, isAvatarMimeType, maxUploadFileSize } from '@logto/schemas';

export type { AvatarMimeType as AllowedAvatarMimeType } from '@logto/schemas';
export {
  avatarFileAccept,
  avatarFileExtensionsLabel as avatarFileExtensions,
  avatarMimeTypes as allowedAvatarMimeTypes,
  isAvatarMimeType as isAllowedAvatarMimeType,
} from '@logto/schemas';

export const validateAvatarFile = (file: File): 'file_size_exceeded' | 'file_type' | undefined => {
  if (file.size > maxUploadFileSize) {
    return 'file_size_exceeded';
  }

  if (!isAvatarMimeType(file.type)) {
    return 'file_type';
  }

  return undefined;
};

type AvatarUploadTranslate = (key: string, options?: Record<string, string>) => string;

export const getAvatarUploadErrorMessage = (
  { code }: Pick<RequestErrorBody, 'code'>,
  translate: AvatarUploadTranslate
) => {
  switch (code) {
    case 'storage.not_configured': {
      return translate('error_storage_not_configured');
    }
    case 'guard.file_size_exceeded': {
      return translate('error_file_size', { limit: formatFileSizeLimit(maxUploadFileSize) });
    }
    case 'guard.mime_type_not_allowed': {
      return translate('error_file_type', { extensions: avatarFileExtensionsLabel });
    }
    default: {
      return translate('error_upload');
    }
  }
};

/** File extensions for the blob types the cropper can produce. The server re-derives the stored extension from magic bytes, so these only name the upload. */
const croppedAvatarFileExtensions: Readonly<Record<string, string>> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

/**
 * Wrap a cropped blob (WebP by default) into a `File` for upload, deriving the filename from the
 * original selection so the backend can build a stable, human-readable object key.
 */
export const buildCroppedAvatarFile = (blob: Blob, originalFileName?: string): File => {
  const baseName = originalFileName?.replace(/\.[^./\\]+$/, '').trim();
  const mimeType = blob.type || 'image/webp';
  const extension = croppedAvatarFileExtensions[mimeType] ?? 'webp';
  const fileName = baseName ? `${baseName}.${extension}` : `avatar.${extension}`;

  return new File([blob], fileName, { type: mimeType });
};

export const getAvatarPersistErrorMessage = (
  { code }: Pick<RequestErrorBody, 'code'>,
  translate: AvatarUploadTranslate
) => {
  switch (code) {
    case 'storage.not_configured': {
      return translate('error_storage_not_configured');
    }
    default: {
      return translate('error_save');
    }
  }
};

export const formatFileSizeLimit = (bytes: number) => {
  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 1) {
    return `${Math.round(megabytes)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
};
