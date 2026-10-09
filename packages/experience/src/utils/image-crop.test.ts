/* eslint-disable @silverhand/fp/no-mutation -- tests swap the jsdom canvas/Image stubs directly */
import { getCroppedImageBlob } from './image-crop';

const fillRect = jest.fn();
const drawImage = jest.fn();
const toBlob = jest.fn(
  (callback: (blob: Blob | null) => void, mimeType?: string, quality?: number) => {
    callback(new Blob([new Uint8Array([0x52, 0x49])], { type: mimeType ?? 'image/png' }));
  }
);

/** jsdom never fires `load` and has no canvas; resolve immediately and stub the 2D context. */
class ImmediateImage {
  public addEventListener(event: string, listener: () => void) {
    if (event === 'load') {
      queueMicrotask(listener);
    }
  }

  public set src(_value: string) {
    // The stub image "loads" on subscription, so the source is ignored.
  }
}

const originalImage = globalThis.Image;

describe('getCroppedImageBlob', () => {
  beforeAll(() => {
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ fillStyle: '', fillRect, drawImage } as unknown as never);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(toBlob as never);
  });

  beforeEach(() => {
    toBlob.mockClear();
    fillRect.mockClear();
    drawImage.mockClear();
    globalThis.Image = ImmediateImage as unknown as typeof Image;
  });

  afterAll(() => {
    globalThis.Image = originalImage;
    jest.restoreAllMocks();
  });

  it('exports the crop as WebP at quality 0.92 by default', async () => {
    const blob = await getCroppedImageBlob('blob:source', { x: 1, y: 2, width: 100, height: 100 });

    expect(toBlob).toHaveBeenCalledTimes(1);
    const [, mimeType, quality] = toBlob.mock.calls[0] ?? [];
    expect(mimeType).toBe('image/webp');
    expect(quality).toBe(0.92);
    expect(blob.type).toBe('image/webp');
  });

  it('fills the canvas opaque so a transparent source keeps its previous look', async () => {
    await getCroppedImageBlob('blob:source', { x: 0, y: 0, width: 64, height: 64 });

    expect(fillRect).toHaveBeenCalledWith(0, 0, 64, 64);
  });

  it('honors a caller-provided mime type', async () => {
    await getCroppedImageBlob(
      'blob:source',
      { x: 0, y: 0, width: 32, height: 32 },
      { mimeType: 'image/png' }
    );

    expect(toBlob.mock.calls[0]?.[1]).toBe('image/png');
  });
});
