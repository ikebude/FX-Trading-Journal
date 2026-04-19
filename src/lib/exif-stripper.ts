/**
 * EXIF Stripper for FXLedger Trade Screenshots
 *
 * T1.8 (S4): Removes metadata (EXIF, IPTC, XMP) from trade screenshots
 * before storage. Preserves the image content while removing all sensitive
 * metadata (timestamps, camera info, GPS, etc.).
 *
 * Uses sharp (WebP q85 encoder) which automatically strips EXIF when re-encoding.
 * Returns Buffer with metadata removed.
 */

import sharp from 'sharp';

/**
 * Strip all EXIF/IPTC/XMP metadata from an image buffer.
 *
 * @param imageBuffer - Raw image bytes (any format: JPEG, PNG, etc.)
 * @param format - Output format ('webp' | 'png' | 'jpeg'). Defaults to 'webp'.
 * @returns Promise<Buffer> - Image with all metadata removed
 * @throws Error if the image is invalid or processing fails
 */
export async function stripExif(
  imageBuffer: Buffer,
  format: 'webp' | 'png' | 'jpeg' = 'webp',
): Promise<Buffer> {
  try {
    let pipeline = sharp(imageBuffer);

    // T1.8: Normalize to the target format. sharp automatically strips all EXIF
    // during re-encoding. The 'withMetadata: false' is redundant but explicit.
    if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 85 });
    } else if (format === 'png') {
      pipeline = pipeline.png();
    } else if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 85, progressive: true });
    }

    const result = await pipeline.toBuffer();
    return result;
  } catch (err) {
    throw new Error(
      `Failed to strip EXIF from image: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Get basic image metadata (width, height, format) without EXIF details.
 * Used to validate image dimensions before storage.
 *
 * @param imageBuffer - Raw image bytes
 * @returns Promise<ImageMetadata | null> - Safe metadata, null if invalid
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
}

export async function getImageDimensions(imageBuffer: Buffer): Promise<ImageMetadata | null> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) {
      return null;
    }
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch {
    return null;
  }
}
