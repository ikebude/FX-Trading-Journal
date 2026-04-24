/**
 * Text encoding utilities for imported broker reports.
 *
 * MT5 terminal exports "Report History" HTML as **UTF-16 LE with BOM** (FF FE).
 * Our pre-v1.0.8 code read files as UTF-8 unconditionally, which turned every
 * character into a NUL-interspersed mojibake string and caused cheerio to report
 * "no tables found" — the root cause of the mass import-failure reports.
 *
 * This module decodes a raw `Buffer` by inspecting its BOM and falls back to
 * UTF-8 when no BOM is present. It also provides a string-level BOM stripper
 * for defence-in-depth inside the parsers themselves.
 */

/**
 * Decode a raw file buffer into a string, respecting any leading BOM.
 *
 * Supported encodings:
 *   - UTF-16 LE  (BOM: FF FE)                 — MT5 "Report History" default
 *   - UTF-16 BE  (BOM: FE FF)                 — rare, some localised builds
 *   - UTF-8 with BOM (EF BB BF)               — Excel-exported statements
 *   - UTF-8 (no BOM)                          — everything else
 */
export function decodeImportBuffer(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    // UTF-16 LE
    return stripBom(buf.toString('utf16le'));
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16 BE — Node has no native utf16be, swap bytes then decode LE.
    const swapped = Buffer.allocUnsafe(buf.length);
    for (let i = 0; i + 1 < buf.length; i += 2) {
      swapped[i] = buf[i + 1];
      swapped[i + 1] = buf[i];
    }
    return stripBom(swapped.toString('utf16le'));
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8').replace(/^\uFEFF/, '');
  }
  return buf.toString('utf8');
}

/** Remove a leading U+FEFF BOM codepoint from an already-decoded string. */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
