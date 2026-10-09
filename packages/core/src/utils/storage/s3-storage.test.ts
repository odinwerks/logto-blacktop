import { Readable } from 'node:stream';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createMockUtils } from '@logto/shared/esm';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

const send = jest.fn();

await mockEsmWithActual('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send })),
}));

const { buildS3Storage } = await import('./s3-storage.js');

const storage = buildS3Storage({
  bucket: 'bucket',
  accessKeyId: 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
});

const buildServiceException = (httpStatusCode: number) =>
  new S3ServiceException({
    name: httpStatusCode === 404 ? 'NotFound' : 'Forbidden',
    $fault: 'client',
    $metadata: { httpStatusCode },
  });

describe('buildS3Storage()', () => {
  afterEach(() => {
    send.mockReset();
  });

  describe('uploadFile()', () => {
    it('should upload a publicly readable object by default', async () => {
      await expect(
        storage.uploadFile(Buffer.from('foo'), 'foo.txt', { contentType: 'text/plain' })
      ).resolves.toEqual({ url: 'http://localhost:9000/bucket/foo.txt' });

      const [command] = send.mock.calls[0] as [PutObjectCommand];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'bucket',
        Key: 'foo.txt',
        ContentType: 'text/plain',
        ACL: 'public-read',
      });
    });

    it('should not send an ACL for a private object', async () => {
      await storage.uploadFile(Buffer.from('foo'), 'foo.txt', { isPublic: false });

      const [command] = send.mock.calls[0] as [PutObjectCommand];
      expect(command.input.ACL).toBeUndefined();
    });

    it('should overwrite the same key on a re-upload', async () => {
      await storage.uploadFile(Buffer.from('one'), 'admin/user-assets/foo/you.png');
      await storage.uploadFile(Buffer.from('two'), 'admin/user-assets/foo/you.png');

      const keys = send.mock.calls.map(([command]) => (command as PutObjectCommand).input.Key);
      expect(keys).toEqual(['admin/user-assets/foo/you.png', 'admin/user-assets/foo/you.png']);
    });
  });

  describe('downloadFile()', () => {
    it('should download the whole object as the SDK Node.js stream, with its validators', async () => {
      const body = Readable.from('foo');
      const lastModified = new Date('2026-01-01T00:00:00Z');
      send.mockResolvedValueOnce({
        Body: body,
        ContentLength: 3,
        ContentType: 'text/plain',
        ETag: '"abc"',
        LastModified: lastModified,
      });

      await expect(storage.downloadFile('foo.txt')).resolves.toEqual({
        contentLength: 3,
        contentType: 'text/plain',
        readableStreamBody: body,
        etag: '"abc"',
        lastModified,
      });

      const [command] = send.mock.calls[0] as [GetObjectCommand];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({ Bucket: 'bucket', Key: 'foo.txt', Range: undefined });
    });

    it('should download `count` bytes from `offset`', async () => {
      send.mockResolvedValueOnce({ Body: Readable.from('o'), ContentLength: 1 });

      await storage.downloadFile('foo.txt', 1, 1);

      const [command] = send.mock.calls[0] as [GetObjectCommand];
      expect(command.input.Range).toBe('bytes=1-1');
    });

    it('should download to the end of the object without `count`', async () => {
      send.mockResolvedValueOnce({ Body: Readable.from('oo'), ContentLength: 2 });

      await storage.downloadFile('foo.txt', 1);

      const [command] = send.mock.calls[0] as [GetObjectCommand];
      expect(command.input.Range).toBe('bytes=1-');
    });

    it('should reject with the SDK error for a missing object', async () => {
      const error = buildServiceException(404);
      send.mockRejectedValueOnce(error);

      await expect(storage.downloadFile('missing.txt')).rejects.toBe(error);
    });
  });

  describe('isFileExisted()', () => {
    it('should return true when the object exists', async () => {
      send.mockResolvedValueOnce({});

      await expect(storage.isFileExisted('foo.txt')).resolves.toBe(true);

      const [command] = send.mock.calls[0] as [HeadObjectCommand];
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input).toEqual({ Bucket: 'bucket', Key: 'foo.txt' });
    });

    it('should return false when the object is missing', async () => {
      send.mockRejectedValueOnce(buildServiceException(404));

      await expect(storage.isFileExisted('foo.txt')).resolves.toBe(false);
    });

    it('should rethrow any other error', async () => {
      const error = buildServiceException(403);
      send.mockRejectedValueOnce(error);

      await expect(storage.isFileExisted('foo.txt')).rejects.toBe(error);
    });
  });

  describe('getFileProperties()', () => {
    it('should return the object size', async () => {
      send.mockResolvedValueOnce({ ContentLength: 42 });

      await expect(storage.getFileProperties('foo.txt')).resolves.toEqual({ contentLength: 42 });
    });
  });

  describe('deleteFile()', () => {
    it('should delete the object', async () => {
      send.mockResolvedValueOnce({});

      await storage.deleteFile('foo.txt');

      const [command] = send.mock.calls[0] as [DeleteObjectCommand];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({ Bucket: 'bucket', Key: 'foo.txt' });
    });

    it('should treat a missing object as deleted', async () => {
      send.mockRejectedValueOnce(buildServiceException(404));

      await expect(storage.deleteFile('foo.txt')).resolves.toBeUndefined();
    });

    it('should rethrow any other error', async () => {
      const error = buildServiceException(403);
      send.mockRejectedValueOnce(error);

      await expect(storage.deleteFile('foo.txt')).rejects.toBe(error);
    });
  });

  describe('listFiles()', () => {
    it('should list every key under the prefix across pages', async () => {
      send
        .mockResolvedValueOnce({
          Contents: [{ Key: 'prefix/1' }, { Key: undefined }, { Key: 'prefix/2' }],
          IsTruncated: true,
          NextContinuationToken: 'token',
        })
        .mockResolvedValueOnce({ IsTruncated: false });

      await expect(storage.listFiles('prefix/')).resolves.toEqual(['prefix/1', 'prefix/2']);

      const [first, second] = send.mock.calls.map(([command]) => command as ListObjectsV2Command);
      expect(first).toBeInstanceOf(ListObjectsV2Command);
      expect(first?.input).toEqual({ Bucket: 'bucket', Prefix: 'prefix/' });
      expect(second?.input).toEqual({
        Bucket: 'bucket',
        Prefix: 'prefix/',
        ContinuationToken: 'token',
      });
    });

    it('should return an empty list for an empty prefix', async () => {
      send.mockResolvedValueOnce({});

      await expect(storage.listFiles('empty/')).resolves.toEqual([]);
    });

    it('should explain a RustFS/MinIO XML parsing error', async () => {
      send.mockRejectedValueOnce(new Error('Invalid character in entity name'));

      await expect(storage.listFiles('prefix/')).rejects.toThrow(/XML parsing error/);
    });
  });

  describe('copyFile()', () => {
    it('should copy within the bucket with a URL-encoded source key', async () => {
      send.mockResolvedValueOnce({});

      await storage.copyFile('dir/a file+1.png', 'dir/b.png', false);

      const [command] = send.mock.calls[0] as [CopyObjectCommand];
      expect(command).toBeInstanceOf(CopyObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'bucket',
        CopySource: 'bucket/dir/a%20file%2B1.png',
        Key: 'dir/b.png',
        ACL: undefined,
      });
    });
  });
});
