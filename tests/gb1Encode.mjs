// =====================================================
// A gb1 encoder, for tests only — the Assignment Maker's half of the format
// =====================================================
// Since 2026-09-21 the app decodes gb1 and never encodes it: the only gb1 file
// it ever sees is an assignment spec, and the Assignment Maker writes those.
// `encryptJson` was removed from `cryptoService.ts` with the submission
// encoding (`WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` §4).
//
// Tests that build a spec still need to write one, so this is the Maker's
// encoder, restated here in Node. **The key is read out of the app's own
// `cryptoService.ts`, not copied**: a second copy of the key would be one more
// place to update on rotation and one more place to get wrong.
//
//   gb1:<base64( iv[12] | ciphertext | gcm-tag[16] )>
// =====================================================

import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const src = readFileSync(join(REPO, 'cryptoService.ts'), 'utf8');
const m = /const KEY_HEX = '([0-9a-f]{64})';/.exec(src);
if (!m) {
  throw new Error('tests/gb1Encode.mjs: no KEY_HEX found in cryptoService.ts — ' +
    'the key moved or changed shape; update this reader rather than copying the key here.');
}
const KEY = Buffer.from(m[1], 'hex');

/** Encode an object exactly as the Assignment Maker encodes a spec. */
export const encodeGb1 = async (obj) => {
  const key = await webcrypto.subtle.importKey('raw', KEY, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return `gb1:${Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString('base64')}`;
};
