export type CropAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const loadImage = async (source: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => {
      resolve(image);
    });
    image.addEventListener('error', () => {
      reject(new Error('Failed to load image for cropping.'));
    });
    // Allow drawing cross-origin images (e.g. existing avatar URLs) onto the canvas.
    /* eslint-disable @silverhand/fp/no-mutation */
    image.crossOrigin = 'anonymous';
    image.src = source;
    /* eslint-enable @silverhand/fp/no-mutation */
  });

/**
 * Crop the given image to the provided pixel area and export it as a WebP blob.
 *
 * The output is always a square WebP (the crop aspect ratio is enforced to 1:1 by the
 * cropper UI) so every avatar this UI uploads lands at the server's fixed `you.webp` key and
 * `user.avatar` keeps a stable URL shape. Browsers that cannot encode WebP fall back to PNG per
 * the canvas spec; the server derives the stored extension from magic bytes and pins
 * `user.avatar` to whatever was actually stored, so that fallback is safe.
 */
export const getCroppedImageBlob = async (
  imageSource: string,
  cropAreaPixels: CropAreaPixels,
  { mimeType = 'image/webp', quality = 0.92 }: { mimeType?: string; quality?: number } = {}
): Promise<Blob> => {
  const image = await loadImage(imageSource);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to acquire canvas context for cropping.');
  }

  const size = Math.round(Math.max(cropAreaPixels.width, cropAreaPixels.height));

  // eslint-disable-next-line @silverhand/fp/no-mutation
  canvas.width = size;
  // eslint-disable-next-line @silverhand/fp/no-mutation
  canvas.height = size;

  // Flatten transparency onto white so a transparent PNG avatar keeps the exact look it had
  // before (opaque, never composited onto the viewer's background color).
  /* eslint-disable @silverhand/fp/no-mutation */
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  /* eslint-enable @silverhand/fp/no-mutation */

  context.drawImage(
    image,
    Math.round(cropAreaPixels.x),
    Math.round(cropAreaPixels.y),
    size,
    size,
    0,
    0,
    size,
    size
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to export cropped image.'));
        }
      },
      mimeType,
      quality
    );
  });
};
