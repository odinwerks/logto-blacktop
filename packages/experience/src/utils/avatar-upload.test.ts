import { buildCroppedAvatarFile } from './avatar-upload';

describe('buildCroppedAvatarFile', () => {
  it('names a WebP blob .webp and keeps its type (the cropper now exports WebP)', () => {
    const blob = new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: 'image/webp' });
    const file = buildCroppedAvatarFile(blob, 'Holiday Photo.png');

    expect(file.name).toBe('Holiday Photo.webp');
    expect(file.type).toBe('image/webp');
  });

  it('keeps a JPEG blob as .jpg when the caller asks for that type', () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });
    const file = buildCroppedAvatarFile(blob, 'avatar.png');

    expect(file.name).toBe('avatar.jpg');
    expect(file.type).toBe('image/jpeg');
  });

  it('falls back to WebP naming when the blob carries no type', () => {
    const blob = new Blob([new Uint8Array([0x52])]);
    const file = buildCroppedAvatarFile(blob);

    expect(file.name).toBe('avatar.webp');
    expect(file.type).toBe('image/webp');
  });
});
