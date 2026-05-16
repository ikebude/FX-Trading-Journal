import { describe, it, expect } from 'vitest';
import { sha256Hex, hashesMatch } from '../src/lib/hash';

describe('sha256Hex — T4.11', () => {
  it('matches the known SHA-256 of "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('hashes the empty string to the well-known digest', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('is stable for Buffers', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(sha256Hex('abc'));
  });
});

describe('hashesMatch — T4.11', () => {
  it('true for equal hex regardless of case/whitespace', () => {
    expect(hashesMatch('ABC123', ' abc123 ')).toBe(true);
  });
  it('false for differing or empty', () => {
    expect(hashesMatch('abc', 'abd')).toBe(false);
    expect(hashesMatch('', '')).toBe(false);
    expect(hashesMatch('abc', 'abcd')).toBe(false);
  });
});
