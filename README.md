# GradeBridge Student Submission

Complete academic assignments in your browser: type answers with LaTeX support and get a PDF, or photograph a printed sheet and get one cropped image per answer. Either way you download a single ZIP and upload it to your course's learning management system. Nothing is sent anywhere.

![Version](https://img.shields.io/badge/version-3.9.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**[Live Demo](https://bridgesuite.github.io/GradeBridge-Student-Submission/)** 

---

## The Problem

**Traditional submissions:** Inconsistent formatting, broken equations, messy PDFs that are a nightmare to grade.

**GradeBridge workflow:** Guided, structured submission forms that auto-generate perfectly formatted PDFs.

**The GradeBridge apps:**

This app handles lab reports, mini-projects, and homework:
1. **[Assignment Maker](https://github.com/BridgeSuite/GradeBridge-Assignment-Maker)** - Instructors create structured assignments
2. **Student Submission** (this app) - Students complete work and generate grading-ready PDFs

**Result:** No more "my formatting broke" excuses. Consistent submissions that make grading 50% faster.

---

## Key Features

- **100% Browser-Based** - No server, no account, no data transmission. Everything stays on your computer.
- **Auto-Save** - Work saved every second to browser storage
- **LaTeX Math Support** - Live preview with built-in cheatsheet (fractions, integrals, Greek letters, matrices)
- **Multiple Answer Types** - Text with LaTeX, image uploads, text + image combined, AI-graded responses
- **PDF generation** - output matching the instructor's template, for typed assignments
- **Images in ZIP** - Uploaded images are included as individual files in the submission ZIP so graders can see them without opening the PDF
- **Try Demo** - One-click sample assignment to explore features instantly
- **Backup & Restore** - Export/import work as JSON

---

## Quick Start

### Try It Now
1. Go to the [Live Demo](https://bridgesuite.github.io/GradeBridge-Student-Submission/)
2. Click **"Try Demo Assignment"** in the sidebar
3. Click **"LaTeX Math Help"** for math notation reference

### Complete an assignment — typed
1. Get the assignment file from your instructor
2. Click **"Upload assignment"** in the sidebar
3. Complete each problem (text / images / text+image / AI-graded response)
4. Click **"Download for Gradescope"** — downloads a single ZIP containing the submission JSON and PDF
5. Upload the ZIP file to Gradescope

The app never asks who you are, in either walkthrough. You are identified by the
authenticated upload in step 5 — see [Data and privacy](#data-and-privacy).

### Complete an assignment — handwritten
Handwritten assignments are answered on paper. You get **two files**: a PDF to
print, and one file to upload.

1. Print the PDF **at 100%** — not "fit to page", which changes the scale and
   moves the corner marks the app registers against
2. Write your answers in the printed boxes
3. Load the **upload file** in the app. It holds the questions and the page
   geometry together, which is what lets the app tell a stale sheet from a
   current one — there is nothing to open and nothing to choose
4. Photograph your pages and upload them. They do not have to be in order — each
   page says which page it is, in the code printed in its top-right corner
5. **Check every answer.** The app shows you each one cut out, exactly as your
   grader will see it. Sign each off, or flag it
6. If a picture is wrong: retake the whole page, or photograph just that answer
   and hand that picture in directly. Either works
7. Click **"Download for Gradescope"** and upload the ZIP

Flagging an answer does **not** stop you submitting — the flag goes to your
grader with the picture.

**If your assignment came as a zip of three files**, that still works exactly as
it did: open it, print `assignment.pdf`, and load the same zip in step 3. Nothing
about an assignment already in your hands has changed.

### Local Development
```bash
git clone https://github.com/BridgeSuite/GradeBridge-Student-Submission.git
cd GradeBridge-Student-Submission
npm install
npm run dev
```

---

## Assignment JSON Format

Assignments are created in the **[Assignment Maker](https://github.com/BridgeSuite/GradeBridge-Assignment-Maker)**
and reach you as one `gb1:`-prefixed file — on its own, or inside an assignment
zip alongside `layout_{ID}.csv` and `assignment.pdf`. Below is what it decodes to.

A handwritten spec may carry the page geometry inside itself, as two optional
fields that are always both present or both absent:

| field | |
|---|---|
| `layoutCsvName` | the name that map would have had, e.g. `layout_ENG17HOM496F.csv` |
| `layoutCsv` | the **exact** text of that file, unchanged, newlines and all |

Verbatim is the point. `layout_id` is hashed over the *parsed rows*, never over
the file's bytes, so the same text through the same parser gives the same rows
by construction and the id printed in the QR on every page cannot move. A
separate `layout_{ID}.csv` beside the spec still wins wherever one is present.

**The spec carries no grading material of any kind** — no grading prompts, no
grader notes, no answer key, no reference solutions. That is not a convention
anyone has to remember: the Assignment Maker builds this file from an explicit
whitelist of the fields this app reads (`STUDENT_SPEC_FIELDS` in its
`services/exportService.ts`), so a field added for the grader is excluded by
default rather than included by accident. Grading material travels to the
autograder by its own route, in a file students never receive.

Every field below is one this app actually reads; the shape is `types.ts`.

```json
{
  "id": "a3f1c8e0-4b21-4d9a-9c77-2e5b1f0a6d34",
  "courseCode": "ENG17",
  "title": "Homework 1",
  "preamble": "Show your working. Answers without working receive no credit.",
  "createdAt": 1756944000000,
  "updatedAt": 1756944000000,
  "inputMode": "handwritten",
  "aiFeedback": false,
  "problems": [
    {
      "id": "p1",
      "name": "Node Voltage",
      "description": "The circuit below is driven by 10 V.",
      "subsections": [
        {
          "id": "p1a",
          "name": "Transfer function",
          "description": "Derive the transfer function.",
          "points": 50,
          "submissionType": "Text"
        },
        {
          "id": "p1b",
          "name": "Step response",
          "description": "Plot the step response.",
          "points": 30,
          "submissionType": "Image",
          "maxImages": 2
        },
        {
          "id": "p1c",
          "name": "Reflection",
          "description": "Explain your approach.",
          "points": 20,
          "submissionType": "AI Graded: Short",
          "minWords": 50,
          "config": "half"
        }
      ]
    }
  ]
}
```

**Assignment level.** `id`, `courseCode`, `title`, `preamble`, `problems`,
`createdAt` and `updatedAt` are always present. Two are written only when the
assignment carries them, so a spec from before a field existed is byte-for-byte
what it was:

| field | meaning |
|---|---|
| `inputMode` | `"electronic"` or `"handwritten"`. Absent means electronic. |
| `aiFeedback` | Per-assignment AI-feedback flag, carried through to Gradescope. Absent means off. |

`coursePublicKey` is no longer read (v4.0.0). A spec that still carries one loads
and builds exactly the same submission as one that does not.

**Problem level.** `id`, `name`, `description`, `subsections` — all required.

**Subsection level.** `id`, `name`, `description`, `points` and `submissionType`
are always present. `minWords`, `maxImages` and `config` appear only where the
author set them: `maxImages` caps an image upload, `minWords` is guidance shown
beside an AI-graded answer and is never enforced, and `config` carries the
authored answer-space size for a handwritten part.

**Submission Types:** `Text`, `Image`, `Text and Image`, `AI Graded: Binary`, `AI Graded: Short`, `AI Graded: Medium`, `AI Graded: Long`

`AI Formative` was retired on 2026-08-18. An archived spec that still names it loads unchanged — the part renders as plain text.

---

## Math notation (LaTeX)

Problem and subsection descriptions support LaTeX math, rendered with KaTeX, using the same
convention as the Assignment Maker (so what the instructor authored is what you see).

- **Inline:** single dollars, `$...$` — e.g. `$V_x = 6\,\text{V}$`, `$I = 0.1\,V_x$`.
- **Display:** double dollars, `$$...$$` — a centered block equation.
- Use LaTeX for anything with structure: subscripts `$V_x$`, fractions `$\frac{17}{7}$`,
  exponentials `$e^{-0.2(t-8)}$`, Greek and units `$\Omega$`. Plain text is fine for a bare symbol.
- Every `$` must be paired; an inline expression may not contain a `$`; a literal dollar sign in
  prose will be mis-parsed. Invalid LaTeX is never dropped silently — KaTeX flags the offending part
  in the rendered output, and if rendering fails outright the raw expression is shown with its
  delimiters — so keep the LaTeX valid.

Single-dollar inline works because rendering uses a custom splitter, not KaTeX auto-render. That
splitter lives in **`services/mathDelimiters.ts`, a byte-identical mirror of the same file in
`GradeBridge-Assignment-Maker`** — so an instructor's math cannot render one way when they author it
and another way when the student reads it. `npm test` compares the two copies and fails if they
drift, and also greps the tree for a second copy of the regex. Edit one, copy it to the other; never
re-implement the splitter locally.

---

## Data and privacy

**This app collects no student-identifying information.** There is no name
field, no student ID field, no email field, no account and no login. It asks
who you are at no point, because it never needs to know.

### Where identity actually comes from

You download a submission file and upload it yourself to your institution's
learning management system. **You authenticate there**, under the agreement your
institution already holds with that provider, and that authenticated upload is
what ties the work to you. Identity is established once, by your institution's
own system, and this app is not part of it.

The tool is LMS-neutral. It produces a file. Where that file goes is the
instructor's and the institution's choice.

### What the app does with your work

- **Once the page has loaded, nothing leaves your browser.** The app makes no
  request to any server after load — no analytics, no telemetry, no fonts, no
  CDN. Verified on the live site: the only requests after load are `blob:` URLs,
  which are handles to data already in your own browser. Your work is held in
  browser storage on your device until you download it.
- **The submission file carries no identity field.** Not your name, not an ID,
  not an email. Filenames carry none either; they are built from the assignment
  and a timestamp, like `ENG17_Homework_1_submission_20260903-0303.zip`.
- **Photograph metadata is removed.** Phone photographs carry EXIF data naming
  the device, the software version and the time and sometimes the place of
  capture. The app decodes and re-encodes every page, and **all** of it goes,
  not only EXIF: measured on a photograph as it came off the phone, an
  8,912-byte EXIF block plus two further metadata segments, against a 16-byte
  JFIF header and nothing else in the corresponding image inside the
  submission. (The photographs in this repository's own test set have since had
  their metadata stripped, so that first figure cannot be reproduced from them.)

### For handwritten assignments

- **The printed sheet has no name or ID line, deliberately.** Page 1 tells you:
  *"Do not write your name or student ID anywhere on these pages. You are
  identified when you upload."*
- **You see exactly what will be submitted, before you download it.** The review
  step shows every image that will be sent — one per answer, cut from your
  pages — and you confirm each one.
- **You confirm that none of your answers shows who you are.** Below the answers
  there is one box: *"I have looked at every answer above. None of them shows my
  name, my student ID, my email address, or anyone else's."* The download waits
  for it. It is never ticked for you, and it unticks itself if you retake a
  page, retake an answer, replace an image or edit a typed answer afterwards,
  because the tick covered what was on screen when you gave it. The same box
  appears under a typed assignment, where it matters more: an uploaded
  photograph is not cut down to an answer region, so your own check is the only
  one.

### What this app cannot do, stated plainly

- **Signing off each image is not enforced, on purpose, and neither is
  completeness.** You can download with answers unreviewed or missing: a student
  part-way through sixteen pages at a deadline must still be able to hand in
  what they have. Whether you signed off each answer is *recorded* for your
  grader, and a missing answer is *shown* to you before the download, but
  neither stops you.
- **The personal-information box is the one thing that does block the
  download**, and the difference is deliberate. Completeness is a judgement you
  are entitled to make against advice; the box is a single tick you can always
  give truthfully, after retaking an answer if you need to. If you press
  Download without it, the page says so and takes you to the box. The
  submission records that you ticked it, and which wording you ticked.
- **It cannot read your handwriting, so it cannot detect identifying information
  you write on the page.** The instruction and the review step are the controls;
  the app does not screen the content of an image. Downstream processing may
  apply a best-effort screen, but the reliable protection is that the sheet never
  asks for your name and you check what is sent.
- **A page photograph is the whole frame.** Whatever else is in shot is in the
  image. Photograph the page on a plain surface.
- **The submission is not encrypted, and does not claim to be.** Since v4.0.0
  it is plain JSON and plain JPEGs (and, for a typed assignment, a PDF). Earlier
  versions encoded the JSON with a key that shipped inside this public app, so
  the encoding kept nothing secret and stopped nobody editing it. What protects
  you instead is what the file contains: no identity field (the app refuses to
  build one that has one), no metadata in the photographs, and your own
  confirmation that no answer names you. The assignment file you load is still
  `gb1:`-encoded by the Assignment Maker; that is tamper resistance for the
  question paper, not confidentiality.
- **Your work is in browser storage and can be lost.** Clearing site data
  deletes it. Use *Save Backup*.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Assignment won't load | Verify the file was exported from the Assignment Maker (a `gb1:`-encoded `.json` file) |
| LaTeX not rendering | Refresh the page. KaTeX is bundled, so this is not a connection problem |
| Single `$...$` shows as raw text | Check the `$` signs are paired and the expression is valid LaTeX (see [Math notation](#math-notation-latex)) |
| PDF generation fails | Refresh and try again. Everything needed is bundled; the app makes no network requests |
| Lost work | Use "Save Backup" regularly; restore with "Load Work" |
| Images too large | Files over 4 MB are rejected; compress or use JPG instead of PNG |
| Word count displayed | Shows current word count as guidance — no minimum or maximum is enforced |
| Download says "One check before you download" | Tick the personal-information box below your answers, then press Download again. If you changed an answer after ticking it, it has unticked itself — look again and re-tick |

---

## The submission package

The download button produces a single ZIP. For a typed assignment it contains:
- `*_submission.json` — the answer data (text responses, image counts), as plain JSON
- `*_submission.pdf` — formatted PDF matching the instructor template (one page per subsection)
- `p{N}s{N}_image_{N}.jpg` — one file per uploaded image, downsampled for fast loading

For a handwritten assignment it contains the JSON, `page_{n}.jpg` for each page
you photographed, and `crops/{region}.jpg` for each answer cut out of them. There
is no PDF.

### The payload is plain JSON

Since v4.0.0 the `*_submission.json` entry is UTF-8 JSON, two-space indented,
read with `JSON.parse` or Python's `json.loads` and nothing else. **No prefix,
no envelope, no key.** Every other entry is exactly what it always was: the same
names, the same order, the same bytes, the same DEFLATE level. The archive also
holds a `crops/` directory entry, as it always has; a consumer that iterates the
archive should skip entries ending in `/`.

**The payload's keys are a closed list**, held by `tests/package-plain-tests.mjs`
so a new one cannot arrive unnoticed:

| path | keys |
|---|---|
| electronic | `course_code`, `assignment_id`, `pdf_filename`, `ai_feedback`, `submission_data`, `last_saved`, `personal_info_confirmed`, `personal_info_wording` |
| handwritten | `course_code`, `assignment_id`, `ai_feedback`, `submission_data`, `last_saved`, `personal_info_confirmed`, `personal_info_wording`, `input_mode`, `layout_id`, `pages`, `crops` |

`personal_info_confirmed` is always `true` in a built package — the app refuses
to build one otherwise — and `personal_info_wording` names the sentence the
student ticked (`pi-1`). **Nothing in the payload is a fact about the student
that a consumer should trust**: every value in it is something the student's
browser wrote and the student could have edited.

**No identity field, enforced rather than stripped.** `services/identityGuard.ts`
refuses to build a package whose payload carries an identity-shaped key at any
depth — `student_name`, `email`, `sid`, `student_id`, `name`, `netid` and their
spellings — on both paths. It used to be a four-field strip on one encoding
path; a strip hides the defect that put the field there, and a refusal names it.

Identity comes from the authenticated upload to your institution's LMS, not from
anything in the file. The full interface is `AUTOGRADER_ZIP_SPEC.md` v7.0.

The PDF is designed to match Assignment Maker templates:
- One page per subsection
- Consistent headers on all pages
- Image answers get dedicated pages

See the [Assignment Maker README](https://github.com/BridgeSuite/GradeBridge-Assignment-Maker#readme) for technical details on the grading rubric format.

---

## Development

### Tech Stack
React 19 + TypeScript + Vite + Tailwind CSS + KaTeX + html2canvas + jsPDF + JSZip + jsqr

**Everything is bundled into `dist/` at build time.** No CDN script tag, no
runtime `fetch`, no wasm pulled from a URL, no dynamic import from a URL — a
student photographing homework on a phone with no signal must still be able to
submit. `jsqr` was chosen over the better-known QR decoders for exactly this
reason: it is pure JavaScript and needs no wasm. (The one `cdnjs` string in the
built bundle is a literal inside jsPDF's own `pdfobject` viewer path, which this
app never calls; it is not a request.)

### Build & Deploy
```bash
npm run build      # Production build
npm run deploy     # Deploy to GitHub Pages
```

### Tests
```bash
npm test           # every suite, including registration and crop
npm run captures   # regenerate the synthetic capture set on its own
```
`tests/registration-tests.mjs` runs the handwritten path end to end in plain
Node: the zip loader, the `layout_id` hash check, QR decode, mark detection, the
transform and the crops, over a generated set of degraded captures. It prints a
detection table. **That set is synthetic and is not the evidence the work order
asks for** — see `tests/captures/README.md`, and drop real photographs into
`tests/captures/real/` to have them scored alongside.

**The submission package needs no fixture and no key**, since v4.0.0.
`tests/package-plain-tests.mjs` holds the plain archive, the identity guard and
the closed list of payload keys; `tests/personal-info-tests.mjs` holds the
personal-information confirmation; `tests/run-tests.mjs` holds that
`cryptoService.ts` decodes an assignment spec and can no longer encode anything.
The cross-language check — Python reading a real archive with the standard
library alone — is `tests/interop-emit.mjs` plus `tests/interop-check.py`; see
`tests/README.md`.

---

## Changelog

### v4.0.0 — a plain submission, and a confirmation the student gives
**Breaking for anything that reads the archive.** One change, not two:
- **The payload is plain JSON.** It was `gb1:`-encoded by default, with a key
  that ships inside this public app, so the encoding kept nothing secret and
  stopped nobody editing a payload. Integrity comes from a hash the relay
  computes. A consumer now needs no key at all.
- **The per-course public-key envelope is gone entirely** — the sealed JSON, the
  sealed images and PDF, the `.gb2` entry names, `image_encryption`,
  `encrypted_entries` and the `coursePublicKey` spec field. Entries are back to
  `page_1.jpg`, `crops/p1a.jpg`, `p0s1_image_0.jpg` and `{stem}.pdf`. Measured on
  the milestone-zero capture and on the sixteen-page ENG17 run: every entry but
  the JSON is byte-identical to what v3.9.1 wrote for a course with no key.
- **The student confirms that no answer shows who they are**, once, below the
  answers, on both paths, before any download. Never pre-ticked; unticked again
  by any change to what it covered; recorded as `personal_info_confirmed` and
  `personal_info_wording`. This is the only step in the app that blocks a
  download; completeness still informs and never blocks.
- **An identity-shaped key in the payload now stops the build** instead of being
  stripped from one path.

### v3.9.1 — a sheet to print and one file to upload
- **The spec can carry the layout map inside it**, as `layoutCsvName` and
  `layoutCsv` — the exact CSV text, unchanged. A student gets a PDF to print and
  a single file to upload, with nothing to open, no second file to choose
  wrongly, and no readable, editable map of where their answers get cut from.
- **The hash does not move.** `layout_id` is hashed over the rows
  `parseLayoutCsv` produces, not over the file's bytes, so the same text through
  the same parser is identical by construction. Measured on the real ENG17
  Homework 1 map: `95438EDF` from both routes, rows deeply equal,
  `canonicalMapSerialization` byte-identical. Nothing in `services/qrPayload.ts`
  or `services/layoutMap.ts` was touched.
- **A separate `layout_{ID}.csv` still wins.** Every packet already in
  circulation loads exactly as it did.
- **A handwritten assignment with no map from either source is now refused**,
  not warned about. It used to set the state and *then* alert, which left the
  student in the broken state the message described — free to photograph sixteen
  pages before discovering their answers could not be cut out.

### v3.9.0 — the submission carries no identity, and a keyed course seals everything
*Sealing was removed in v4.0.0, and the payload is no longer encoded at all. Kept as history.*

- **`student_name` is gone from the payload and from every filename.** There was
  never a field to type it into; the app was carrying a value it had inferred.
  Identity is the authenticated upload to your institution's LMS and nothing
  else. Filenames are built from the assignment and a timestamp, like
  `ENG17_Homework_1_submission_20260903-0303.zip`. The `gb2` strip list still
  names `student_name`, `email`, `sid` and `student_id` — that is belt and
  braces over a payload that no longer builds them, not the mechanism.
  **What is given up, deliberately:** the spec used to say a grader should
  compare the typed name against Gradescope's submitter and flag a mismatch.
  That check is gone. A self-typed name never caught an impostor, only a typo.
- **On a course with a key, every entry in the archive is sealed — not only the
  JSON.** Page photographs, answer crops, uploaded image answers and the
  submission PDF each get their own standard `gb2` envelope with its own content
  key and IV, and are named `.gb2`: `page_1.jpg.gb2`, `crops/p1a.jpg.gb2`,
  `{stem}.pdf.gb2`. The defect this closes is specific: on a handwritten
  assignment the JSON holds no answers at all — the answers *are* the images —
  so a hardened course was encrypting the envelope and shipping the letter in
  the clear. The PDF was the same thing one file along.
- **The payload declares what it sealed**, in `image_encryption` (`"gb2"`) and
  `encrypted_entries` (every sealed entry name, in archive order).
  **A consumer should drive its decrypt from that list, not from filenames it
  decides in advance**: the list names what was *actually written*, so a partial
  submission's list is short rather than wrong. Both fields are absent — absent,
  not `null` — when the course has no key, so test for presence.
- **A course with no key is unchanged**, byte for byte. Nothing about the
  keyless path moved, and a submission from such a course is as readable as it
  always was.
- Interface details for consumers: `AUTOGRADER_ZIP_SPEC.md` v6.0, which is
  **breaking for a course with a key** and carries the decrypt reference.

### v3.8.0 — the handwritten submission path
- **The student loads one file: the assignment zip.** It carries
  `assignment_spec.json` and `layout_{ID}.csv` together. A bare
  `assignment_spec.json` still loads, so electronic assignments and every file
  already in circulation are unaffected.
- **`layout_id` is recomputed from the map and checked against the QR on every
  page.** On a mismatch nothing is cropped and the student is told the file does
  not match their pages. This is the one check that catches a student printing
  this week's sheet and loading last week's zip — a failure that is otherwise
  completely silent, producing correct rectangles under the wrong labels.
- **Pages are registered and answers are cut out**: QR decode, reorient
  (including 180 degrees), find the four registration marks, fit a four-point
  transform, sample each declared rectangle. No network, no wasm, no full-page
  warp. `jsqr` is the only new runtime dependency.
- **Every answer is shown back before submission**, in assignment order,
  labelled as exactly what the grader will see. The student signs each off or
  flags it. **A flag never blocks submission.**
- **Two recovery routes**: retake the whole page, or photograph just that answer
  area — in which case the photograph *is* the crop, recorded as
  `crop_source: "direct_capture"`. The second route also covers a student with
  no printer, who writes on blank paper.
- **Fixed: the pages never shipped.** The ZIP builder did not reference the
  uploaded pages at all, so a handwritten student submitted a PDF of the blank
  question paper and a JSON in which every answer was `null`. Three comments in
  the tree asserted otherwise; all three are corrected.
- Submission JSON gains `input_mode`, `layout_id`, `pages` (each with its `k`
  and `N` from its own QR) and `crops`. `ai_feedback` is unchanged.

### v3.6.0
- **`gb2:` hardened submission encoding.** When the loaded assignment spec carries a `coursePublicKey` (SPKI PEM), the submission JSON is encoded as a public-key envelope and de-identified — `student_name`, `email`, `sid`, and `student_id` are stripped from the payload. Specs without that field are unaffected and still produce `gb1:`. *(Removed in v4.0.0.)*
- A spec whose `coursePublicKey` cannot be imported now fails the download with a clear message instead of silently falling back to `gb1:`.
- PDF, ZIP filename, and image files are unchanged in both paths.
- Added `npm test` — a dependency-free `cryptoService` suite covering the gb2 round trip, envelope layout, de-identification, key-failure handling, and gb1 regression.

### v3.5.0
- Uploaded images are written into the submission ZIP as individual downsampled JPEGs (`p{N}s{N}_image_{n}.jpg`) so human graders can see them inline.

### v3.2.0
- HEIC image support — iPhone photos are converted on upload.

### v3.1.0
- "Download for Gradescope" produces a single ZIP containing both the submission JSON and the PDF.

---

## Known Limitations

- **Long Text Answers** - Very long answers that exceed one page may have imperfect breaks (html2pdf limitation)
- **Mobile Experience** - Optimized for desktop for typed assignments; a handwritten assignment is meant to be done on the phone that took the photographs
- **The capture path has not been walked by hand end to end.** Registration thresholds *are* measured against real photographs — 41 of them, and the gate agrees with their reviewed labels — but the whole flow from loading an assignment to downloading a package has been exercised by test harnesses rather than by a person clicking through it. See `tests/captures/README.md`.

## Browser Support

Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

---

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with clear commits
4. Submit pull request

---

## License

MIT License - Free for personal and commercial use.

---

## Links

- **Live App**: [bridgesuite.github.io/GradeBridge-Student-Submission](https://bridgesuite.github.io/GradeBridge-Student-Submission/)
- **Assignment Maker**: [bridgesuite.github.io/GradeBridge-Assignment-Maker](https://bridgesuite.github.io/GradeBridge-Assignment-Maker/)
- **Issues**: [GitHub Issues](https://github.com/BridgeSuite/GradeBridge-Student-Submission/issues)

---

Built with React, TypeScript, [KaTeX](https://katex.org/), [html2canvas](https://html2canvas.hertzen.com/), [jsPDF](https://github.com/parallax/jsPDF), [JSZip](https://stuk.github.io/jszip/), and [Lucide](https://lucide.dev/).

MIT License · © 2026 The Regents of the University of California · Provided free by **UC Davis**.
