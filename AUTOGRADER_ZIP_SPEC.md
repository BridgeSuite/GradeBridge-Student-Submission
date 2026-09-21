# GradeBridge — submission ZIP interface

**Version:** v7.0
**Date:** 2026-09-21
**App version:** v4.0.0

> ## BREAKING. **Nothing in the archive is encrypted or encoded any more.**
>
> Two changes, shipped together in one app version so a consumer meets one
> breaking change and not two
> (`WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21`):
>
> 1. **The payload is plain JSON.** `*_submission.json` is UTF-8 JSON, two-space
>    indented. **No `gb1:` prefix, no envelope, no key.** Read it with
>    `json.load`. It was gb1-encoded by default until now, with a key that ships
>    inside the public student app — so the encoding kept nothing secret and
>    stopped nobody editing a payload and re-encoding it. Integrity comes from a
>    hash the relay computes, not from anything in the file. **A consumer needs
>    no key at all.**
> 2. **The per-course public-key envelope is gone entirely.** No sealed payload,
>    no sealed images or PDF, no `.gb2` entry names, and the payload keys
>    `image_encryption` and `encrypted_entries` are never written. Entries are
>    `page_1.jpg`, `crops/p1a.jpg`, `p0s1_image_0.jpg` and `{stem}.pdf` on every
>    course. A spec that still carries a `coursePublicKey` builds exactly the
>    same archive as one that does not; the field is not read.
>
> **Everything else is unchanged**: the same entries, in the same order, under
> the same names, with the same DEFLATE level. Measured, not argued: built from
> the same inputs by v3.9.1 (no course key) and by v4.0.0, every entry but the
> JSON is **byte-identical** — 5 of 5 on the two-photograph milestone-zero
> archive, 33 of 33 on the sixteen-page run.
>
> **Two keys are added to the payload**, both on both paths:
> `personal_info_confirmed` (always `true` — the app will not build a package
> otherwise) and `personal_info_wording` (which sentence the student confirmed).
> §3.
>
> **Consequences for a consumer:**
>
> - Delete the gb1 decode of the payload. `decrypt(open(...).read())` on this
>   file now fails — it has no `gb1:` prefix.
> - Delete any per-entry decrypt, and any branch on `image_encryption`. Open the
>   names the payload gives you directly.
> - **Adjudication no longer needs a key.** A person can open `page_1.jpg` by
>   double-clicking it, as they could before v6.0.
> - **Nothing in the payload is a fact you can trust about the student.** Every
>   value in it was written by the student's browser, and the student could
>   have edited it. Identity is Gradescope's authenticated submitter.

**Supersedes:** v6.0, 2026-09-03 — which sealed every entry on a course with a
public key. **Everything v6.0 said about `.gb2` entries, `image_encryption`,
`encrypted_entries`, the envelope layout, sealing costs and opening a sealed
submission by hand is withdrawn.** v6.0 and v5.x otherwise hold where this
document does not contradict them.

**Also supersedes:** v5.1, 2026-09-03 — which corrected four stale statements in
v5.0 and changed no code, among them that the §1 archive-name block carried a
student name. **It carries none**, and `tests/spec-matches-code.mjs` holds that
claim against the code.

**Also supersedes:** v5.0, 2026-09-03 — **`student_name` was removed from the
payload.** It is absent, not empty. Identity is Gradescope's authenticated
submitter metadata (`/autograder/submission_metadata.json`), and a name typed
into a box never caught an impostor, only a typo. The comparison v4.3 asked for
("a mismatch is for instructor review") is gone with it, on purpose.

**Also supersedes:** v4.3, 2026-09-03
**Also supersedes:** v4.2, 2026-09-02 — **the `low-resolution` quality flag is
retired and is never emitted again.** See §6.
**Supersedes:** v4.1, 2026-09-02 — `pages[]` gained `marks_declined` and
`held_out_mm`.
**Supersedes:** v4.0, 2026-09-01 — `pages[]` gained `marks_detected`, and a page
may report `marks_found: 3`. Both in §3.2.
**Supersedes:** v3.1, 2026-04-08
**Audience:** whoever writes the relay or the autograder

---

## What changed, and why v3.1 must not be used

v3.1 described the archive as **flat, one JSON and one PDF**, and said "all
downstream file formats are unchanged". That was true of an electronic
assignment in April. It is not true of a handwritten one, and a reader following
it would extract two files, find every answer `null`, and conclude the student
submitted nothing.

**This document is written from one real archive, not from the code.** Every
filename, field, type, byte size and value below was read out of the archive
`GradeBridge-Student-Submission/tests/milestone-zero.mjs` wrote on 2026-09-21,
from ENG17 Homework 1 (`layout_id` **95438EDF**, the frozen export in
`GradeBridge2026/CaptureSet/frozen_export/student`) and two phone photographs,
`tests/captures/real/cap01.jpg` and `cap11.jpg`. Where this document states
something that archive does not contain, it says so explicitly.

**Every non-JSON byte in that archive is identical to the archive v3.9.1 builds
from the same inputs**, compared entry by entry. The sizes in §1 and §4.4 are
today's; they differ slightly from v6.0's because the crop encoder has moved
since, not because of this change.

**Nothing here is aspirational.** If a statement is not marked as unobserved, it
came off that ZIP.

---

## 1. The archive

One file, uploaded to Gradescope:

```
{assignment_id}_submission_{YYYYMMDD-HHMM}.zip
```

**No name is in it**, because the app does not have one, and a timestamp because
without a discriminator every student in a class downloads an identically named
file. The timestamp is `last_saved`, in **UTC**, so a late-evening submission can
carry the next day's date.

Sanitised by replacing anything outside `a-z A-Z 0-9 _ -` with `_`. **Case is
preserved** — `ENG17` stays `ENG17`.

The `.json`, the `.pdf` where there is one, and the backup JSON all share this
stem. DEFLATE, level 6.

### Observed manifest, in archive order

| bytes | entry |
|---:|---|
| 3,167 | `ENG17_Homework_1_submission_{timestamp}.json` |
| 474,470 | `page_1.jpg` |
| 501,463 | `page_2.jpg` |
| 0 | `crops/` — a directory entry |
| 41,289 | `crops/p1a.jpg` |
| 38,290 | `crops/p1b.jpg` |
| 81,421 | `crops/p1c.jpg` |

Archive total 1,116,541 bytes. The image entries are byte-identical between runs
of the same inputs; the JSON moves because `last_saved` is a timestamp.

**There is no PDF.** See §5 — this is a decision, not an omission.

**It is not flat.** There is a `crops/` directory entry. An extractor that calls
`os.path.basename()` on every member — as the v3.1 snippet does — collapses
`crops/p1a.jpg` into `p1a.jpg` and silently breaks the `file` paths the payload
gives you. See §7.

### Entry kinds

| pattern | count here | first bytes | what it is |
|---|---|---|---|
| `*_submission.json` | 1 | `7b 0a 20 20` (`{`, newline, indent) | the payload, §3 |
| `crops/{region_id}.jpg` | 3 | `ff d8 ff e0` | **the grader's input**, §4 |
| `page_{n}.jpg` | 2 | `ff d8 ff e0` | **retained, not consumed**, §4 |
| `*_submission.pdf` | 0 here | `25 50 44 46` (`%PDF`) | the rendered answers — **electronic only**, §5 |
| `p{i}s{j}_image_{n}.jpg` | 0 here | `ff d8 ff` | an uploaded image answer — **electronic only** |

**Consumed is not the same as retained.** The crops are the interface; the page
images are the record of what the student photographed, kept so a dispute can be
adjudicated. Do not feed the pages to a grader. §4 says why both exist.

**Not present in this archive, and declared by the app rather than observed:**
the electronic path's `*_submission.pdf`, written first after the JSON, and its
`p{i}s{j}_image_{n}.jpg` answers at the archive root, written last. They are
covered by `tests/package-plain-tests.mjs` rather than by an archive on disk, and
`tests/interop-check.py` opens both kinds with Python's standard library.

`{n}` in `page_{n}.jpg` is **the position in the ZIP, counting from 1**. It is
not the page of the sheet. See §4.

---

## 2. Do not assume every file is there

The observed archive is a **partial submission**: 2 pages of a 16-page sheet, 3
regions of 17. This is not a degraded case to be handled defensively — it is a
student part-way through, and the app packages it deliberately and without
complaint.

So:

- **A region absent from `crops` is a region the student has not reached.** Not
  an error, not a missing file. Award it what an unattempted part gets.
- **A page absent from `pages` was never photographed.**
- There is no field anywhere that says "this submission is complete", because the
  app does not know and does not ask.

---

## 3. The payload

### Encoding: none

The JSON entry is JSON on disk: UTF-8, two-space indented, beginning `{`. **No
prefix, no envelope, no key, no base64.** `json.load` reads it and nothing else
is needed.

Until v7.0 it began `gb1:` (and `gb2:` on a course with a public key). If you see
either, the archive was written by an app older than v4.0.0.

**The payload carries no identity field**, and neither do the filenames. Since
v4.0.0 the app **refuses to build** a package whose payload carries an
identity-shaped key at any depth — `student_name`, `email`, `sid`, `student_id`,
`name`, `netid` and their spellings — on both paths. It used to strip four of
them on one encoding path. Identity is the authenticated upload, not anything in
the archive.

### Structure — all eleven top-level keys, as observed

```json
{
  "course_code": "ENG17",
  "assignment_id": "ENG17_Homework_1",
  "ai_feedback": false,
  "submission_data": { "p0s0": { "answer": null, "images_submitted": 0 }, … },
  "last_saved": "2026-09-21T04:47:04.321Z",
  "personal_info_confirmed": true,
  "personal_info_wording": "pi-1",
  "input_mode": "handwritten",
  "layout_id": "95438EDF",
  "pages": [ … ],
  "crops": { … }
}
```

| key | type | note |
|---|---|---|
| ~~`student_name`~~ | — | **REMOVED in v5.0. The key is absent.** Identity is Gradescope's authenticated submitter. |
| `course_code` | string | |
| `assignment_id` | string | `{courseCode}_{title with spaces → _}`. **Not** the `assignment_id` in `layout_*.csv`, which is `ENG17HOM496F`. Two different identifiers; do not join on this one. |
| `pdf_filename` | string | **Electronic only.** Absent from a handwritten payload, because a handwritten archive has no PDF and a field naming a file that is not there is a defect rather than a courtesy. Do not index it unconditionally. |
| `ai_feedback` | boolean | Always a real boolean, never absent, so "off" is never confusable with an older app version. |
| `submission_data` | object | §3.1 |
| `last_saved` | string | ISO 8601, UTC. |
| `personal_info_confirmed` | boolean | **Added v7.0.** The student ticked, over exactly the answers in this archive, that none of them shows their name, student ID, email address or anyone else's. **Always `true`**: the app refuses to build a package otherwise, and the tick stops counting if any answer changes after it is given. Per-submission evidence that the step existed. |
| `personal_info_wording` | string | **Added v7.0.** Which sentence the student ticked. `"pi-1"` observed. A new wording gets a new value; it does not change what `personal_info_confirmed` means. |
| `input_mode` | string | `"handwritten"` observed. **Absent entirely on an electronic assignment** — its absence is the signal, so test for presence rather than for a value. |
| `layout_id` | string | The map the app recomputed. Must equal the `layout_id` in every page's QR; the app refuses to crop when it does not. |
| `pages` | array | §3.2. Handwritten only. |
| `crops` | object | §3.3. Handwritten only. |
| ~~`image_encryption`~~, ~~`encrypted_entries`~~ | — | **Withdrawn in v7.0.** Never written. |

The `file` field of every `pages[]` and `crops` entry **names the entry as it
appears in the archive.** Open what the payload names.

`input_mode`, `layout_id`, `pages` and `crops` are written **only** when the
assignment is handwritten. An electronic payload carries the other **eight**
keys — `course_code`, `assignment_id`, `pdf_filename`, `ai_feedback`,
`submission_data`, `last_saved`, `personal_info_confirmed`,
`personal_info_wording` — and none of those four. **Both lists are closed**:
`tests/package-plain-tests.mjs` fails if a key is added, removed or reordered, so
a new key cannot arrive without someone meaning it.

**Everything in the payload is a claim, not a fact.** The student's browser wrote
every value, and the student could have edited any of them before uploading. The
app adds no token, code, key or flag for a downstream consumer to trust, and a
consumer should derive anything it needs to trust from Gradescope's own context.

### 3.1 `submission_data` — read this, then ignore it

Seventeen entries observed, `p0s0` `p0s1` `p0s2` `p0s3` `p1s0` `p1s1` `p1s2`
`p2s0` `p2s1` `p2s2` `p3s0` `p4s0` `p5s0` `p6s0` `p7s0` `p8s0` `p9s0`. Every one
of them:

```json
{ "answer": null, "images_submitted": 0 }
```

**This is correct for a handwritten submission and it looks exactly like an empty
one.** The answers are images, and they are in `crops`. The keys here are
`p{problem}s{subsection}` positions in the *spec*; they do not correspond to
`region_id` and cannot be joined to it.

On an electronic assignment this object is the whole submission and behaves as
v3.1 described.

### 3.2 `pages` — both entries, verbatim

```json
[
  { "file": "page_1.jpg", "width": 1650, "height": 2200,
    "k": 2, "n": 16, "registration": "ok",
    "marks_found": 4, "marks_detected": ["NW", "NE", "SW", "SE"],
    "marks_declined": [], "residual_mm": 0.5020944912553341, "held_out_mm": 0 },
  { "file": "page_2.jpg", "width": 1650, "height": 2200,
    "k": 3, "n": 16, "registration": "ok",
    "marks_found": 4, "marks_detected": ["NW", "NE", "SW", "SE"],
    "marks_declined": [], "residual_mm": 0.40788180387840645, "held_out_mm": 0 }
]
```

| field | note |
|---|---|
| `file` | Entry name in this archive. |
| `width`, `height` | Pixels of the **stored** image, after the app's ingest. |
| `k`, `n` | Page number and page count **read from that page's own QR**, never from upload order. |
| `registration` | `"ok"` observed. `"degraded"` (a three-mark affine fit, crops may be slightly off) is declared but **not observed here**. |
| `marks_found` | 4 observed. A page may legitimately register on **3**: the capture gate accepts a three-mark fit that meets the same 1.0 mm residual budget as a four-mark one. Such a page reads `"registration": "degraded"`. |
| `marks_detected` | Which of `NW`, `NE`, `SW`, `SE` the fit was built on, in that order. `[]` when nothing fitted. On a `degraded` page the absent corner names the end of the sheet the transform **inferred rather than measured**, which is where to look first if a crop from that page is disputed. `marks_found` is this array's length. |
| `marks_declined` | Corners where a mark **was detected and the chosen fit did not use it**. `[]` observed. **This is not the complement of `marks_detected`:** a corner in neither list was never found, and a corner here was found, measured and set aside. |
| `residual_mm` | QR reprojection error. Full float precision; do not expect it rounded. |
| `held_out_mm` | Worst error, in millimetres, at a mark named in `marks_declined`. `0` observed, and `0` whenever `marks_declined` is empty. A page with a small `residual_mm` and a large `held_out_mm` is a fit that has tilted itself to satisfy the symbol. |

**`page_1.jpg` is page 2 of the sheet.** The filename counts position in the ZIP;
`k` counts position on the paper. Always use `k`.

### 3.3 `crops` — all three, verbatim

```json
{
  "p1a": { "region_id": "p1a", "part_id": "1(a)", "page_k": 2,
           "is_drawing": false, "max_points": 3,
           "crop_source": "registration", "student_review": "signed_off",
           "quality_flags": [],
           "file": "crops/p1a.jpg", "width": 842, "height": 541 },
  "p1b": { …, "part_id": "1(b)", "page_k": 3, "max_points": 2,
           "file": "crops/p1b.jpg", "width": 1033, "height": 324 },
  "p1c": { …, "part_id": "1(c)", "page_k": 3, "max_points": 2,
           "file": "crops/p1c.jpg", "width": 1095, "height": 602 }
}
```

Keyed by `region_id`. Every label a grader needs is on the row — nothing is
parsed out of `region_id`, which is opaque and must stay so. **Every crop carries
`region_id`, `part_id` and `page_k`**, and each agrees with its row in the layout
map; `tests/milestone-zero.mjs` checks both on this archive.

| field | observed | note |
|---|---|---|
| `region_id` | `p1a` `p1b` `p1c` | Opaque. Do not parse. |
| `part_id` | `1(a)` `1(b)` `1(c)` | The human label. Display this. |
| `page_k` | 2, 3 | Which sheet page it was cut from. |
| `is_drawing` | `false` | What the **author** asked for. See §6. |
| `max_points` | 3, 2, 2 | From the map. (The frozen export totals 100; a current export of the same sheet totals 200 with the same `layout_id`, because points are outside the hash.) |
| `crop_source` | `registration` | Cut from a declared rectangle on a registered page. `direct_capture` — the student framed the answer themselves, no rectangle, no registration, framing is theirs — is declared but **not observed here**. Do not assume `registration`. |
| `student_review` | `signed_off` | What the student said after looking at it. `flagged` and `not_reviewed` are declared but **not observed here**. |
| `quality_flags` | `[]` | Advisory, never blocks. `looks-empty` is the only flag the app now emits and is **not observed here**. |
| `file` | `crops/p1a.jpg` | Path **including the `crops/` prefix**. Use it as given. |
| `width`, `height` | see above | Pixels. |

---

## 4. The images

### 4.1 They are JPEGs

Every image entry is a JPEG on disk, on every course. v6.0's sealed entries are
gone, and §4.2 and §4.3 of v6.0 (the envelope on an image, and what sealing
cost) are withdrawn with them. The section numbers below are kept so a reference
to §4.4 or §4.5 from an older document still lands in the right place.

### 4.4 The crops — measured off this archive

| region | pixels | declared rectangle | mm per pixel | px per mm | ink | bytes |
|---|---|---|---|---|---|---|
| p1a | 842 × 541 | 191.2 × 123.0 mm | 0.2271 | 4.40 | 0.48% | 41,289 |
| p1b | 1033 × 324 | 191.2 × 60.0 mm | 0.1851 | 5.40 | 0.97% | 38,290 |
| p1c | 1095 × 602 | 191.2 × 105.0 mm | 0.1745 | 5.73 | 0.97% | 81,421 |

Pixels × mm-per-pixel reproduces each declared rectangle to within **0.1 mm**, so
a crop covers the rectangle the map declares and nothing else. JPEG, quality 0.9,
never upsampled past the resolution the photograph actually had.

**One caveat on the byte sizes.** The app encodes its JPEGs with the browser's
canvas; the harness that produced this archive cannot, so it used `jpeg-js` at the
same quality. Same format, same pixels, same dimensions — but **an archive
produced by a browser will have slightly different byte sizes**. Treat the sizes
in §1 as the right order of magnitude and the dimensions, paths and fields as
exact.

**Confirmed by eye, 2026-09-01**: each crop lands on its own region, correctly
rectified, with the right handwriting in it; `p1b` and `p1c` are not swapped.

### 4.5 The page photographs — retained, not consumed

`page_1.jpg`, `page_2.jpg` — 1650 × 2200 each, the student's own pictures after
the app's ingest (EXIF-uprighted, all metadata removed, long edge stepped to
2200 px, JPEG 0.85).

**These are not a grader input and must not be treated as one.** They are kept
for one reason: **a crop is a derived artefact.** It depends on the layout map
being right and on the homography being right for that page. If either is wrong,
or a student says "I wrote it and the tool cut it off", the page image is the
only thing that can settle it — and once discarded, that evidence does not come
back. **Since v7.0 nobody needs a key to look at one.**

So they are what a dispute is adjudicated against. Roughly 0.5 MB per page, about
8 MB for a full sixteen-page HW1; cheap for what it buys. Whether pages, crops or
both travel beyond Gradescope is decided downstream of this archive, not by it.

Do not run a reading pass over them. §6 says why.

---

## 5. There is no PDF

**A handwritten submission carries no PDF.** Decision of 2026-09-01,
`GradeBridge2026\workorders\DECISION_PACKAGE_CONTENTS_2026-09-01.md`. The
electronic path still carries one.

Until that decision the archive held a `*_submission.pdf`, and it was **the blank
question paper**: `PrintView` never receives `pages` or `crops`, so a handwritten
submission's PDF was the electronic answer-sheet render with every answer empty.

The obvious fix was to fill it with the student's photographs. That is not what
was decided, and the reasoning is worth carrying because it applies again the
next time something in this archive has no reader:

- **Nothing consumes it.** On the autograder path Gradescope does not render it.
- **It was roughly half the archive.**
- **It duplicated `page_N.jpg`**, which is kept.
- **A blank PDF that nobody is supposed to read is worse than no PDF**, because
  sooner or later somebody opens it and concludes the student submitted nothing.

**The electronic PDF is a plain PDF again**, `{stem}.pdf`, named by
`pdf_filename`. v6.0 sealed it.

**Consequences for a reader:**

- Do not look for a PDF in a handwritten archive, and do not treat its absence as
  a malformed submission.
- `pdf_filename` is **absent from a handwritten payload**. Indexing it
  unconditionally raises. Test `input_mode` first.
- If a human grader needs to see the whole page, `page_N.jpg` is that, at full
  ingest resolution.

---

## 6. How to read a crop

Three findings from the visual inspection of this archive. Each is a real
observation, not a precaution.

**`is_drawing` does not predict what the answer looks like.** `p1c` is declared
`is_drawing: false` and the student answered it with drawn circuit fragments. The
field says what the *author* asked for, not what the *student* did. Do not route
on it as though it forecast prose, and do not treat a drawing found under
`is_drawing: false` as an error.

**Some crops are genuinely unreadable, and the assist must say so.** `p1a` is
faint pencil and partly illegible **to a person**. An assist that guesses at faint
pencil produces a confident wrong transcription, which is worse than returning
nothing: the next person to notice is a student disputing a mark on work they did
correctly. Make "cannot read this" a first-class outcome that reaches a human.

**Page-level OCR is unnecessary.** The crops are clean enough to work from
directly. Running OCR across a whole page and then attributing text back to
regions reintroduces exactly the attribution problem the declared rectangles have
already solved, and it is the step most likely to put one part's answer under
another part's mark.

On `low-resolution`: **retired 2026-09-03, never emitted again.** It was measured
and found false: the OCR triage of 23 real crops caught all four of its firings
and every one of those crops read completely, and the same answer region at 118
and 194 dpi read identically. **`px_per_mm` is unaffected and stays.**

---

## 7. Extraction

Replace the v3.1 snippet. It filters to `.json` and `.pdf`, which drops every
image, and it flattens with `basename()`, which breaks `crops/…` paths.

```python
import os, zipfile, glob

SUBMISSION_DIR = '/autograder/submission/'

def _safe_join(base, member):
    """Resolve a ZIP member under base, or return None if it escapes."""
    target = os.path.realpath(os.path.join(base, member))
    if os.path.commonpath([os.path.realpath(base), target]) != os.path.realpath(base):
        return None                      # path traversal — refuse it
    return target

for archive in glob.glob(os.path.join(SUBMISSION_DIR, '*.zip')):
    with zipfile.ZipFile(archive) as z:
        for member in z.namelist():
            if member.endswith('/'):
                continue                 # directory entry, e.g. "crops/"
            target = _safe_join(SUBMISSION_DIR, member)
            if target is None:
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(member) as src, open(target, 'wb') as dst:
                dst.write(src.read())
```

**Keep the directory structure.** `crops/p1a.jpg` must land at `crops/p1a.jpg`,
because that is the string the payload's `file` field gives you. Path traversal
is still refused, by containment rather than by flattening.

Then:

```python
import json

# v7.0: plain JSON. No prefix, no decrypt, no key.
with open(glob.glob(SUBMISSION_DIR + '*_submission.json')[0], encoding='utf-8') as f:
    payload = json.load(f)

def entry_bytes(entry):
    with open(os.path.join(SUBMISSION_DIR, entry), 'rb') as f:
        return f.read()

if payload.get('input_mode') == 'handwritten':
    for region_id, crop in payload['crops'].items():
        jpeg = entry_bytes(crop['file'])
        # crop['part_id']      -> the label a human recognises
        # crop['max_points']   -> from the map
        # crop['page_k']       -> which sheet page
        # crop['student_review'], crop['quality_flags'] -> advisory only
else:
    pdf = entry_bytes(payload['pdf_filename'])
    ...                                          # v3.1 behaviour otherwise
```

`tests/interop-check.py` in the app repository is a working version of this over
real archives the app builds, standard library only.

---

## 8. Backward compatibility

| student uploads | behaviour |
|---|---|
| `submission.zip` from app v4.0.0 or later | Plain JSON payload, plain entries, this document |
| `submission.zip` from an older app, no course key | The payload begins `gb1:` and needs the shared key; every other entry is as here |
| `submission.zip` from v3.9.x on a course **with** a key | The payload begins `gb2:` and every other entry ends `.gb2`. v6.0 of this document describes it. **No student has submitted through this pipeline**, so none is expected |
| `submission.json` + `submission.pdf` (v3.0) | No ZIP found, proceeds as before |

Nothing in this document changes the electronic path beyond the encoding:
`input_mode`, `layout_id`, `pages` and `crops` are written only for a handwritten
assignment.

It is **not** identical to April's, though: `ai_feedback` was added to every
payload on 2026-08-18, and `personal_info_confirmed` and `personal_info_wording`
in v7.0. **If a consumer validates the payload against a fixed key set, those
keys have to be in it** — §3 has both lists.

---

## 9. What this document does not cover

- **`grading_rubric.json`** — unchanged, and it is the file that carries
  `answer_modality`, `problem_statement` and the grading prompts. It reaches the
  autograder by its own route and never travels in a student's ZIP.
- **`results.json`** — unchanged.
- **Keys.** **v7.0 needs none.** The gb1 key still decodes the *assignment spec*
  the student loads, inside the two browser apps; nothing downstream of the
  student uses it. The course keypairs of `GB2_KEY_MANAGEMENT_DECISION_2026-08-10`
  have no role in this archive any more.
- **Integrity.** The relay computes a hash of what it receives; nothing in the
  archive vouches for itself.
- **Anything about how to grade.** This document says what is in the box.

### One thing to check on arrival

The payload must contain **no answer-key material**: no `aiGradingPrompt`, no
`grading_prompt`, no `REFERENCE:` text, no `graderNote`, no rubric. That was
verified on this archive and on the `assignment_spec.json` the student loads,
both clean. It is worth re-checking on the first real submission, because a spec
carrying grading prompts shipped to students once already — see
`GradeBridge2026/CLAUDE.md`, Recent Changes 2026-08-31.

---

## 10. Opening a submission by hand

Unzip it. Every entry opens with the application a double-click chooses: the
JSON in a text editor, the images in an image viewer, the electronic PDF in a PDF
reader. **No key is needed.** v6.0's reference decryptor and worked byte offsets
are withdrawn.

---

## Provenance

Every number, filename and value above was read out of
`ENG17_Homework_1_submission_{timestamp}.zip`. Regenerate it with
`MILESTONE_EXPORT=<CaptureSet/frozen_export/student> npm run milestone:zero` in
`GradeBridge-Student-Submission`; the harness re-derives the whole package from
the assignment export and two photographs, and prints the entry names in archive
order, the payload keys, the payload and the crop measurements.

`FULL_EXPORT=… FULL_PAGES=… npm run full:assignment` does the same over sixteen
pages and seventeen regions and reports the archive size, wall clock and peak
RSS.
