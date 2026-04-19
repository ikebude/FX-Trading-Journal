import { describe, it, expect } from 'vitest';
import { stripExif, getImageDimensions } from '../src/lib/exif-stripper';
import sharp from 'sharp';

describe('stripExif', () => {
  it('strips EXIF from a valid image buffer', async () => {
    // Create a test image with sharp
    const originalBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer();

    const cleanBuffer = await stripExif(originalBuffer, 'webp');

    expect(cleanBuffer).toBeInstanceOf(Buffer);
    expect(cleanBuffer.length).toBeGreaterThan(0);
    // WebP format is smaller than JPEG usually
    expect(cleanBuffer.length).toBeLessThan(originalBuffer.length * 1.5);
  });

  it('preserves image dimensions when stripping EXIF', async () => {
    const testBuffer = await sharp({
      create: { width: 200, height: 150, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();

    const cleanBuffer = await stripExif(testBuffer, 'png');
    const metadata = await getImageDimensions(cleanBuffer);

    expect(metadata).not.toBeNull();
    expect(metadata?.width).toBe(200);
    expect(metadata?.height).toBe(150);
  });

  it('handles different output formats (WebP, PNG, JPEG)', async () => {
    const originalBuffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: 'green' },
    })
      .png()
      .toBuffer();

    const webpBuffer = await stripExif(originalBuffer, 'webp');
    const pngBuffer = await stripExif(originalBuffer, 'png');
    const jpegBuffer = await stripExif(originalBuffer, 'jpeg');

    expect(webpBuffer).toBeInstanceOf(Buffer);
    expect(pngBuffer).toBeInstanceOf(Buffer);
    expect(jpegBuffer).toBeInstanceOf(Buffer);

    // Verify all are valid images
    const webpMeta = await getImageDimensions(webpBuffer);
    const pngMeta = await getImageDimensions(pngBuffer);
    const jpegMeta = await getImageDimensions(jpegBuffer);

    expect(webpMeta?.width).toBe(50);
    expect(pngMeta?.width).toBe(50);
    expect(jpegMeta?.width).toBe(50);
  });

  it('throws on invalid image buffer', async () => {
    const invalidBuffer = Buffer.from('not an image');
    await expect(stripExif(invalidBuffer)).rejects.toThrow();
  });
});

describe('getImageDimensions', () => {
  it('returns dimensions for valid image', async () => {
    const buffer = await sharp({
      create: { width: 640, height: 480, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();

    const meta = await getImageDimensions(buffer);
    expect(meta).not.toBeNull();
    expect(meta?.width).toBe(640);
    expect(meta?.height).toBe(480);
    expect(meta?.format).toBe('png');
  });

  it('returns null for invalid image', async () => {
    const invalidBuffer = Buffer.from('garbage data');
    const meta = await getImageDimensions(invalidBuffer);
    expect(meta).toBeNull();
  });

  it('returns null for empty buffer', async () => {
    const emptyBuffer = Buffer.alloc(0);
    const meta = await getImageDimensions(emptyBuffer);
    expect(meta).toBeNull();
  });
});
