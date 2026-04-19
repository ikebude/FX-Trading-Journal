/**
 * src/lib/security/zip-slip.ts
 *
 * Zip-slip vulnerability protection (CWE-22).
 * Ensures ZIP extraction cannot write files outside the target directory.
 *
 * Usage:
 *   const safePath = validateZipEntryPath(zipEntry.name, targetDir);
 *   // Now use safePath for extraction
 */

import * as path from 'path';

/**
 * validateZipEntryPath — rejects ZIP entries that escape the target directory
 *
 * @param entryPath — the path as extracted from the ZIP file (may contain traversal attempts)
 * @param targetDir — the directory where files should be extracted
 * @returns the validated absolute path (safe for writing)
 * @throws if entryPath would write outside targetDir
 *
 * Protection against:
 *   - Relative path traversal: ../../../etc/passwd
 *   - Absolute paths: /etc/passwd, C:\Windows\System32
 *   - Mixed traversal: ./../../sensitive.txt
 *   - Null bytes: file.txt\0../../../../etc/passwd
 */
export function validateZipEntryPath(entryPath: string, targetDir: string): string {
  if (!entryPath) {
    throw new Error('ZIP entry path cannot be empty');
  }

  // Normalize the target directory (resolve to absolute path)
  const normalizedTarget = path.resolve(targetDir);

  // Resolve the full path (this normalizes .. and . sequences)
  const fullPath = path.resolve(targetDir, entryPath);

  // Ensure the resolved path is under targetDir
  // We check both startsWith (for subdirs) and equality (for the dir itself)
  const isUnderTarget =
    fullPath === normalizedTarget ||
    fullPath.startsWith(normalizedTarget + path.sep);

  if (!isUnderTarget) {
    throw new Error(
      `Zip-slip detected: entry "${entryPath}" would extract outside ${targetDir}`
    );
  }

  return fullPath;
}

/**
 * List safe ZIP entries (filters out directory entries and validates all paths)
 *
 * @param entries — array of entry names from ZIP file
 * @param targetDir — target extraction directory
 * @returns array of safe entry paths, or throws on first zip-slip attempt
 */
export function validateZipEntries(entries: string[], targetDir: string): string[] {
  return entries
    .filter((entry) => !entry.endsWith('/') && entry.trim() !== '') // Skip directories
    .map((entry) => validateZipEntryPath(entry, targetDir));
}
