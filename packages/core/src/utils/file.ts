/**
 * Read a Readable stream to a string
 * @param stream - The Readable stream to read from
 * @returns A promise that resolves to a string containing the stream's data
 */
export async function streamToString(stream?: NodeJS.ReadableStream): Promise<string> {
  if (!stream) {
    return '';
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    // eslint-disable-next-line @silverhand/fp/no-mutating-methods
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString('utf8');
}

// Magic byte detection for image formats
// Matches the first bytes of a buffer against known image signatures
type ImageDetectionResult = {
  mime: string;
  extension: string;
};

const IMAGE_MAGIC_BYTES: Array<[number[], string, string]> = [
  [[0xff, 0xd8, 0xff], 'image/jpeg', 'jpg'],
  [[0x89, 0x50, 0x4e, 0x47], 'image/png', 'png'],
  [[0x47, 0x49, 0x46, 0x38], 'image/gif', 'gif'],
  [[0x42, 0x4d], 'image/bmp', 'bmp'],
];

const isWebP = (buffer: Uint8Array) =>
  buffer.length >= 12 &&
  buffer[0] === 0x52 &&
  buffer[1] === 0x49 &&
  buffer[2] === 0x46 &&
  buffer[3] === 0x46 &&
  buffer[8] === 0x57 &&
  buffer[9] === 0x45 &&
  buffer[10] === 0x42 &&
  buffer[11] === 0x50;

/**
 * Inspects the first bytes of a file buffer to determine its image type and
 * file extension. Detects JPEG, PNG, GIF, BMP, and WebP.
 *
 * Unlike the browser's `Content-Type` header (which can be spoofed), this
 * reads the actual file signature (magic bytes) from the raw binary data.
 *
 * @param buffer The first bytes of the file (at least 12 bytes for WebP
 * detection). A larger buffer is fine; only the relevant bytes are checked.
 * @returns The detected MIME type and extension, or `undefined` if the
 * buffer does not match any known image format.
 */
export const detectImageType = (buffer: Uint8Array): ImageDetectionResult | undefined => {
  for (const [signature, mime, extension] of IMAGE_MAGIC_BYTES) {
    if (
      buffer.length >= signature.length &&
      signature.every((byte, index) => buffer[index] === byte)
    ) {
      return { mime, extension };
    }
  }

  // WebP needs extra check: RIFF header + 'WEBP' at offset 8
  if (isWebP(buffer)) {
    return { mime: 'image/webp', extension: 'webp' };
  }
};
