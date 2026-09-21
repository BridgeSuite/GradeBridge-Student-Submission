# Tests

Plain Node (>= 18), no test framework. `npm test` runs every suite in turn and
stops at the first one that fails.

## 1. The submission package — `npm test`

**Since v4.0.0 (2026-09-21) nothing in the submission is encrypted or encoded**,
and nothing here needs a key, a fixture or a private file of any kind.
`WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21` removed the per-course
public-key envelope and the gb1 encoding of the payload; the suites that proved
the envelope were rewritten to prove the opposite claims rather than deleted.

- `run-tests.mjs` — `cryptoService.ts` decodes an assignment spec written by the
  Assignment Maker (round trip, whitespace, envelope length, `isEncoded()`, the
  refusals) and **can no longer encode anything**: it exports exactly
  `isEncoded` and `decryptJson`, and no module in the app imports an encoder.
  Specs are encoded here by `gb1Encode.mjs`, the Maker's encoder restated in
  Node with the key read out of `cryptoService.ts` rather than copied.
- `package-plain-tests.mjs` (was `package-encryption-tests.mjs`) — the archive
  is plain: the same entries, order, names, bytes and DEFLATE level as ever,
  and a payload `JSON.parse` reads directly. A spec that still carries a
  `coursePublicKey` changes nothing. The identity guard refuses, and is proven
  live through the builder. **The payload's keys are a closed list** on both
  paths, so a new one fails here until someone adds it on purpose.
- `personal-info-tests.mjs` — the student's personal-information confirmation:
  no confirmation, no package, on both paths; unticked on first appearance;
  cleared by retaking a crop or a page, replacing an image or editing a typed
  answer; recorded in the payload with its wording version. The component is
  rendered with the real React server renderer.

Where a property lives in `App.tsx`, which cannot be imported in Node, the
wiring is asserted over the shipped source, and each such check says which
mutation it was watched failing on.

## 2. The rendering contracts

Both guard files held byte-identical with the Assignment Maker (each SKIPs its
mirror check when that repo is not checked out alongside):

- `math-delimiter-tests.mjs` — `services/mathDelimiters.ts`: the `$...$` /
  `$$...$$` split, and no second copy of the regex anywhere in the tree.
- `figure-tests.mjs` — `services/figureBlocks.ts`: a ` ```svg ` block or a
  `![alt](url)` line is lifted out **before** the math splitter ever sees it (a
  `$` in the drawing's path data would otherwise shred it), the split is exact,
  each inlined copy of a drawing gets its own id namespace so the same figure on
  two problems cannot capture the other's markers, and nothing executable
  survives into the student's page.
- `ai-feedback-tests.mjs` — the per-assignment `aiFeedback` pass-through: the
  field is on `Assignment`, the submission JSON emits `ai_feedback` as a real
  boolean for every spec shape (`true` / `false` / absent / `"true"` / `1` /
  `null`), the flag survives the autosave round-trip, and no student-facing
  surface mentions it. These read the expression out of `App.tsx` and evaluate
  it, rather than restating it — App.tsx cannot be imported here.

## 3. Interoperability — Python reads the archive with the standard library

```bash
node tests/interop-emit.mjs <out-dir> > emitted.json   # builds real archives with the app's own builder
python tests/interop-check.py emitted.json             # opens them with zipfile + json, nothing else
```

`interop-emit.mjs` builds a handwritten and an electronic submission with
`services/submissionPackage.ts` and writes both archives. `interop-check.py`
opens them as a Python relay or autograder would, **with no key, no fixture and
no third-party package**: the entries are the ones the app reports, the payload
is JSON that `json.loads` reads and that equals what the app built, every file
it names is present and is a real JPEG or PDF, every crop carries `region_id`,
`part_id` and `page_k`, no key anywhere is identity-shaped, and the
personal-information confirmation is recorded.

Not in `npm test`, only because CI would need Python. It needs no secret, so
anyone can run it.

**Until v4.0.0 this section was a two-direction check of the sealed envelope**
against the autograder's `crypto_utils.py` and its author's private test key,
with a fixture that could not be committed. The forward direction became the
check above. **The reverse direction (`interop-reverse.mjs`) was deleted**: it
proved this app could read an envelope the autograder wrote, and nothing the
autograder writes is read by this app any more.

One property of the archive worth knowing when writing a consumer: JSZip writes
a `crops/` **directory entry** alongside the crop files, as it always has. Skip
entries ending in `/`.

## 4. Harnesses that need data outside the repo

- `milestone-zero.mjs` — `MILESTONE_EXPORT=<student/ folder>`: two real
  photographs of ENG17 HW1 through gate, registration, crop and package, the
  archive written to disk and reopened. Prints the entry names, the payload
  keys and the crops for a person to look at.
- `full-assignment.mjs` — `FULL_EXPORT` and `FULL_PAGES`: all sixteen pages,
  rendered from `assignment.pdf`.
- `qr-corpus-tests.mjs` — `QR_CORPUS=<the seventeen-frame folder>`.

**Both packaging harnesses call `initQrReader()` on the gate bundle before the
first photograph**, since 2026-09-21. From the decoder merge of 2026-09-08
until then they did not, every page failed at `page_code` with "QR decoder not
built", and milestone-zero still reported most of its checks green over an
archive with no pages and no crops in it.
