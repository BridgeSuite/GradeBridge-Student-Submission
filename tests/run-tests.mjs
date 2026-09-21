// =====================================================
// cryptoService test runner — gb1 decoding, and nothing else
// =====================================================
// Plain Node (>=18) — no test framework. Transpiles cryptoService.ts with the
// esbuild that ships inside Vite and exercises it against the browser-identical
// WebCrypto global.
//
//   npm test
//
// **Since 2026-09-21 this file does one thing: decode an assignment spec.**
// `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` removed the per-course
// public-key envelope entirely (§3) and the gb1 encoding of the submission
// payload (§4). This suite used to hold forty-odd checks on the envelope; they
// went with it. What replaces them is the other half of the claim: that the
// service can no longer encode anything, so nobody can quietly start using it
// for a submission again, and that the one thing it still does — decoding what
// the Assignment Maker wrote — is exactly what it was.
//
// The spec is encoded here by `tests/gb1Encode.mjs`, which is the Assignment
// Maker's encoder restated in Node with the key read out of `cryptoService.ts`.
// =====================================================

import { build } from 'esbuild';
import { webcrypto } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeGb1 } from './gb1Encode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// cryptoService.ts is browser code: it reaches for the crypto/btoa/atob globals.
globalThis.crypto ??= webcrypto;

// ---------- tiny assertion harness ----------
let passed = 0, failed = 0;
const results = [];

const check = (name, fn) => {
  try {
    fn();
    passed++;
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL  ${name}\n          ${err.message}`);
  }
};
const checkAsync = async (name, fn) => {
  try {
    await fn();
    passed++;
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL  ${name}\n          ${err.message}`);
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const assertEqual = (actual, expected, msg) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n          expected: ${e}\n          actual:   ${a}`);
};

// ---------- load cryptoService.ts ----------
const outDir = mkdtempSync(join(tmpdir(), 'gb-crypto-test-'));
const outFile = join(outDir, 'cryptoService.mjs');
await build({
  entryPoints: [join(REPO, 'cryptoService.ts')],
  outfile: outFile,
  format: 'esm',
  target: 'es2022',
  bundle: false,
  logLevel: 'silent',
});
const svc = await import(pathToFileURL(outFile).href);
const source = readFileSync(join(REPO, 'cryptoService.ts'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\ncryptoService — decodes an assignment spec, encodes nothing\n');

// =====================================================
// 1. It can no longer encode
// =====================================================
check('the service exports exactly isEncoded and decryptJson', () =>
  assertEqual(Object.keys(svc).sort(), ['decryptJson', 'isEncoded'],
    'cryptoService exports something beyond spec decoding — an encoder has come back'));

check('no public-key cryptography remains in the code', () => {
  for (const token of ['RSA-OAEP', "'spki'", 'generateKey', 'exportKey', 'wrapKey']) {
    assert(!code.includes(token), `cryptoService.ts still uses ${token}`);
  }
});

check('nothing in the code calls subtle.encrypt', () =>
  assert(!/subtle\.encrypt\s*\(/.test(code),
    'cryptoService.ts encrypts something again; the submission is plain JSON since 2026-09-21'));

check('no module in the app imports an encoder from cryptoService', () => {
  for (const rel of ['App.tsx', 'services/submissionPackage.ts']) {
    const src = readFileSync(join(REPO, rel), 'utf8');
    const imports = /import\s*\{([^}]*)\}\s*from\s*'\.{1,2}\/cryptoService'/.exec(src)?.[1] ?? '';
    assert(!/encrypt/i.test(imports), `${rel} imports ${imports.trim()} from cryptoService`);
  }
});

// =====================================================
// 2. It decodes what the Assignment Maker writes, as before
// =====================================================
const spec = {
  id: 'a1', courseCode: 'ENG17', title: 'Homework 1', inputMode: 'handwritten',
  preamble: 'Show your work — units, too.', problems: [], createdAt: 1, updatedAt: 2,
};
const encoded = await encodeGb1(spec);

await checkAsync('gb1: decryptJson returns the spec the Maker encoded', async () =>
  assertEqual(await svc.decryptJson(encoded), spec, 'gb1 decode mismatch'));

await checkAsync('gb1: leading and trailing whitespace is tolerated, as a saved file has it', async () =>
  assertEqual(await svc.decryptJson(`\n  ${encoded}\r\n`), spec, 'a padded gb1 file did not decode'));

check('gb1: the envelope is iv[12] | ciphertext+tag, no length prefix', () => {
  const raw = Buffer.from(encoded.slice(4), 'base64');
  const expected = 12 + Buffer.byteLength(JSON.stringify(spec)) + 16;
  assert(raw.length === expected, `gb1 envelope is ${raw.length} bytes, expected ${expected}`);
});

check('isEncoded recognises gb1, with or without leading whitespace', () => {
  assert(svc.isEncoded(encoded) === true, 'isEncoded() rejected a gb1 string');
  assert(svc.isEncoded(`  \n${encoded}`) === true, 'isEncoded() rejected an indented gb1 string');
});

check('isEncoded rejects plain JSON and any other prefix', () => {
  assert(svc.isEncoded(JSON.stringify(spec)) === false, 'isEncoded() accepted plain JSON');
  assert(svc.isEncoded('gbX:AAAA') === false, 'isEncoded() accepted another prefix');
});

await checkAsync('decryptJson refuses a string with no gb1: prefix', async () => {
  let threw = null;
  try { await svc.decryptJson(JSON.stringify(spec)); } catch (e) { threw = e; }
  assert(threw && /missing gb1: prefix/.test(threw.message), `got ${threw?.message ?? 'no error'}`);
});

await checkAsync('decryptJson refuses a tampered spec rather than returning garbage', async () => {
  const raw = Buffer.from(encoded.slice(4), 'base64');
  raw[20] ^= 0x01;
  let threw = null;
  try { await svc.decryptJson(`gb1:${raw.toString('base64')}`); } catch (e) { threw = e; }
  assert(threw && /Decryption failed/.test(threw.message), `got ${threw?.message ?? 'no error'}`);
});

// ---------- report ----------
console.log(results.join('\n'));
console.log(`\n${passed} passed, ${failed} failed\n`);
rmSync(outDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
