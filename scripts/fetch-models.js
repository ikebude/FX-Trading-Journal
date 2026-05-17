/**
 * fetch-models.js — package-time AI model fetcher (T6.1–T6.3).
 *
 * BEST-PRACTICE design (not "defer"): the heavy offline-AI model weights
 * are NOT npm artefacts and must never be downloaded on the END USER's
 * machine (Rule 11 — zero runtime network/telemetry). Instead they are
 * fetched ONCE here, on the connected BUILD machine, into build/models/
 * and shipped inside the NSIS installer via electron-builder
 * `extraResources` (see package.json build.extraResources). At runtime the
 * app reads them from resources/ and copies them into <data_dir>/models/
 * on first launch — so the installed product is fully offline and the AI
 * features work out of the box.
 *
 * Idempotent: skips any model already present (size-checked). Network is
 * used ONLY here, at build time, by the maintainer — never by users.
 *
 * Usage:  node scripts/fetch-models.js          (run before packaging)
 *         SKIP_MODEL_FETCH=1 node scripts/...   (CI/offline: skip; the
 *                                                app degrades gracefully)
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, '..', 'build', 'models');

/**
 * Each model: destination (relative to build/models), source URL, and a
 * minimum byte size sanity floor so a truncated/HTML-error download is
 * re-fetched rather than shipped.
 */
const MODELS = [
  {
    name: 'Whisper base.en (speech-to-text, T6.1)',
    dest: join('whisper', 'ggml-base.en.bin'),
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    minBytes: 100 * 1024 * 1024,
  },
  {
    name: 'all-MiniLM-L6-v2 ONNX (embeddings, T6.2)',
    dest: join('embeddings', 'all-MiniLM-L6-v2.onnx'),
    url: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx',
    minBytes: 20 * 1024 * 1024,
  },
  {
    name: 'Tesseract eng.traineddata (OCR, T6.3)',
    dest: join('tessdata', 'eng.traineddata'),
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata',
    minBytes: 1 * 1024 * 1024,
  },
];

async function fetchModel(m) {
  const out = join(MODELS_DIR, m.dest);
  if (existsSync(out) && statSync(out).size >= m.minBytes) {
    console.log(`✓ ${m.name} — already present, skipping`);
    return;
  }
  mkdirSync(dirname(out), { recursive: true });
  console.log(`↓ ${m.name}\n  ${m.url}`);
  const res = await fetch(m.url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${m.name}`);
  }
  await pipeline(res.body, createWriteStream(out));
  const size = statSync(out).size;
  if (size < m.minBytes) {
    throw new Error(
      `${m.name}: downloaded ${size} bytes < expected ${m.minBytes} — refusing to ship a truncated model`,
    );
  }
  console.log(`✓ ${m.name} — ${(size / 1e6).toFixed(1)} MB`);
}

async function main() {
  // Always ensure the dir exists so electron-builder's extraResources
  // (from: build/models) never fails, even when models are skipped.
  mkdirSync(MODELS_DIR, { recursive: true });
  if (process.env.SKIP_MODEL_FETCH === '1') {
    console.log(
      'SKIP_MODEL_FETCH=1 — skipping AI model fetch. The installer will ' +
        'ship without models; the app degrades gracefully (manual ' +
        'transcript / FTS search / no OCR — never a network call).',
    );
    return;
  }
  mkdirSync(MODELS_DIR, { recursive: true });
  for (const m of MODELS) await fetchModel(m);
  console.log('\nAll AI models present in build/models/ — ready to package.');
}

main().catch((err) => {
  console.error('\nfetch-models failed:', err.message);
  console.error(
    'Re-run with network access, or set SKIP_MODEL_FETCH=1 to package ' +
      'without bundled models (features degrade gracefully).',
  );
  process.exit(1);
});
