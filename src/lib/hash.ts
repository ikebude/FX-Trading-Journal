/**
 * T4.11 — content hashing for auto-update integrity.
 * Pure wrappers around node:crypto so they can be unit-tested directly.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Lowercase hex SHA-256 of a buffer/string. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Streamed lowercase hex SHA-256 of a file (constant memory). */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(path);
    s.on('error', reject);
    s.on('data', (chunk) => h.update(chunk));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

/** Constant-time-ish case-insensitive hex comparison. */
export function hashesMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
