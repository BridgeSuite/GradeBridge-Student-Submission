// =====================================================
// GradeBridge Encoding Service — Student Submission
// =====================================================
// AES-256-GCM symmetric decoding using the Web Crypto API.
//
// PURPOSE
//   • Decodes assignment_spec.json when the student loads it (encoded by the
//     Assignment Maker at export time).
//
//   **That is the only thing this file does, since 2026-09-21.** It used to
//   encode the submission payload too (gb1 by default, a per-course RSA
//   public-key envelope where the spec carried one), and both were removed by
//   `WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21`:
//
//   - **gb1 on the submission protected nothing.** The key below ships inside
//     this public app, so anyone who extracts it can edit a payload and
//     re-encode it so that it loads cleanly. The pipeline's integrity comes
//     from a hash the relay computes, not from this. The payload is now plain
//     JSON, and nothing downstream needs a key to read it.
//   - **The public-key envelope is gone entirely**, key handling and all. What leaves the
//     student's hands now is bounded by what is IN the package (answer crops,
//     a de-identified payload, a student-confirmed absence of personal
//     information), not by sealing it.
//
//   Do not add an encoder back here. A submission is not a secret from the
//   student who made it, and an encoding that looks like protection and is not
//   is how the previous design got reasoned about as if it were.
//
// FORMAT
//   gb1:<base64( iv[12 bytes] | ciphertext | gcm-tag[16 bytes] )>
//     Shared-key AES-256-GCM. Assignment specs only, decode only.
//
// KEY
//   Must match GradeBridge-Assignment-Maker/services/cryptoService.ts, which
//   encodes the spec. After 2026-09-21 nothing outside the two browser apps
//   uses this key: no autograder, relay or Docker image decodes a submission
//   with it, because there is nothing encoded left to decode. Rotating it is a
//   two-repo change, and it invalidates every spec already distributed.
// =====================================================

const KEY_HEX = '4a7f3c2e9b1d8f5a0e6c4b3d9f2a7e1b5d8c3f9a2e7b4d0c6f8a3e1b5d9c2f4e';
const ENCODING_PREFIX = 'gb1:';

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const getCryptoKey = (): Promise<CryptoKey> => {
  const keyBytes = hexToBytes(KEY_HEX);
  const keyBuffer = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength) as ArrayBuffer;
  return crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

const base64ToUint8 = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export const isEncoded = (s: string): boolean =>
  s.trimStart().startsWith(ENCODING_PREFIX);

export const decryptJson = async (encoded: string): Promise<unknown> => {
  const trimmed = encoded.trim();
  if (!trimmed.startsWith(ENCODING_PREFIX)) {
    throw new Error('Not a GradeBridge encoded file (missing gb1: prefix)');
  }

  const key = await getCryptoKey();
  const combined = base64ToUint8(trimmed.slice(ENCODING_PREFIX.length));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Decryption failed — file may be corrupted or tampered with');
  }

  return JSON.parse(new TextDecoder().decode(decrypted));
};
