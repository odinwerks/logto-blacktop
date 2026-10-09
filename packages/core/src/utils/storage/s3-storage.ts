import {
  S3Client,
  S3ServiceException,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

import type {
  DownloadFile,
  GetFileProperties,
  IsFileExisted,
  StorageProvider,
  UploadFile,
} from './types.js';

const getRegionFromEndpoint = (endpoint?: string) => {
  if (!endpoint) {
    return;
  }

  return /s3\.([^.]*)\.amazonaws/.exec(endpoint)?.[1];
};

type BuildS3StorageParameters = {
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
};

export const buildS3Storage = ({
  bucket,
  accessKeyId,
  secretAccessKey,
  region,
  endpoint,
  forcePathStyle,
}: BuildS3StorageParameters) => {
  if (!region && !endpoint) {
    throw new Error('Either region or endpoint must be provided');
  }

  // Endpoint example: s3.us-west-2.amazonaws.com
  const finalRegion = region ?? getRegionFromEndpoint(endpoint) ?? 'us-east-1';

  const client = new S3Client({
    region: finalRegion,
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const uploadFile: UploadFile = async (
    data,
    objectKey,
    { contentType, publicUrl, isPublic = true } = {}
  ) => {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: data,
      ContentType: contentType,
      // Buckets created with ACLs disabled (the AWS default) reject any ACL, so only send one when
      // the object has to be publicly readable.
      ACL: isPublic ? 'public-read' : undefined,
    });

    await client.send(command);

    if (publicUrl) {
      return { url: `${publicUrl}/${objectKey}` };
    }

    if (endpoint) {
      // Custom endpoint URL construction
      if (forcePathStyle) {
        // Path-style URL: https://endpoint/bucket/key
        return {
          url: `${endpoint}/${bucket}/${objectKey}`,
        };
      }
      // Virtual-hosted style URL: https://bucket.endpoint/key
      return {
        url: `${endpoint.replace(/^(https?:\/\/)/, `$1${bucket}.`)}/${objectKey}`,
      };
    }

    // AWS S3 standard URL construction
    if (forcePathStyle) {
      // Path-style URL: https://s3.region.amazonaws.com/bucket/key
      return {
        url: `https://s3.${finalRegion}.amazonaws.com/${bucket}/${objectKey}`,
      };
    }
    // Virtual-hosted style URL: https://bucket.s3.region.amazonaws.com/key
    return {
      url: `https://${bucket}.s3.${finalRegion}.amazonaws.com/${objectKey}`,
    };
  };

  /** Deletes an object from the S3 bucket. Does not throw if the object does not exist. */
  const deleteFile = async (objectKey: string): Promise<void> => {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    } catch (error: unknown) {
      // S3 answers a delete of a missing key with 204; some S3-compatible stores answer 404.
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        return;
      }
      throw error;
    }
  };

  const isFileExisted: IsFileExisted = async (objectKey) => {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));

      return true;
    } catch (error: unknown) {
      // `HeadObject` has no response body, so a missing object only shows as a 404.
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        return false;
      }

      throw error;
    }
  };

  const getFileProperties: GetFileProperties = async (objectKey) => {
    const { ContentLength } = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKey })
    );

    return { contentLength: ContentLength };
  };

  /**
   * Lists all object keys under a given prefix. Handles pagination
   * automatically; callers receive the complete list regardless of how many
   * pages S3 returns.
   */
  const listFiles = async (prefix: string): Promise<string[]> => {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      try {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
          })
        );

        if (result.Contents) {
          for (const item of result.Contents) {
            if (item.Key) {
              keys.push(item.Key);
            }
          }
        }

        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } catch (error: unknown) {
        // fast-xml-parser < 5.8 can't parse RustFS/MinIO XML entity refs like &#xD;
        if (error instanceof Error && error.message.includes('Invalid character')) {
          throw new Error(
            `S3 listFiles failed due to XML parsing error for prefix "${prefix}". ` +
              'This may be caused by RustFS/MinIO XML entity references. ' +
              `Original error: ${error.message}`
          );
        }
        throw error;
      }
    } while (continuationToken);

    return keys;
  };

  const downloadFile: DownloadFile = async (objectKey, offset, count) => {
    const { Body, ContentLength, ContentType, ETag, LastModified } = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Range: buildRange(offset, count),
      })
    );

    return {
      contentLength: ContentLength,
      contentType: ContentType,
      // The Node.js runtime of the SDK always answers with a Node.js readable stream.
      // eslint-disable-next-line no-restricted-syntax -- See above.
      readableStreamBody: Body as NodeJS.ReadableStream | undefined,
      etag: ETag,
      lastModified: LastModified,
    };
  };

  /** Copies an object within the same bucket. The copy inherits a `public-read` ACL by default. */
  const copyFile = async (sourceKey: string, destKey: string, isPublic = true): Promise<void> => {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        // `CopySource` is sent as a header, so the key has to be URL-encoded (keeping the `/`s).
        CopySource: `${bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
        Key: destKey,
        ACL: isPublic ? 'public-read' : undefined,
      })
    );
  };

  return {
    uploadFile,
    downloadFile,
    isFileExisted,
    getFileProperties,
    deleteFile,
    listFiles,
    copyFile,
  } satisfies StorageProvider;
};

/** The HTTP `Range` of `count` bytes starting at `offset`, like the Azure Blob `download()`. */
const buildRange = (offset?: number, count?: number) => {
  if (offset === undefined && count === undefined) {
    return;
  }

  const start = offset ?? 0;

  return `bytes=${start}-${count === undefined ? '' : start + count - 1}`;
};
