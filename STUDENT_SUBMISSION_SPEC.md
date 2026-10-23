# GradeBridge Student Submission: the app as built

**Version 1, 20 October 2026.** One document for the whole app, written from the code
rather than from the earlier specifications, because several of those describe flows the
app no longer has.

**Read from the repository, never from a copy.** A stale copy of a specification has
already cost this project a session's work.

**Status of the tree this describes:** branch `main`, commit `df9e50b` of 20 October 2026,
which carries work item W3 tasks 1 to 4: the fixed-layout answer pages (section 9b), the
entry and payload key that carry them, and the fitting gate (section 8b). Section 13 says
what the preceding commit `175c7b9` carried.

**This is also what students now get.** Deployed 20 October 2026 from `df9e50b`, after CI
run #53 passed, with `gh-pages` at `91c58ac`. Verified against the served bytes rather than
the version string: the live bundle `index-rIBFmPLP.js` contains `GBHW-1`, the
`fixed_layout` key and the approved fitting wording, where the previous live bundle
`index-Dp-LcOFV.js` contained none of them. **The version string is not evidence of what is
deployed**: `constants.ts` read `v4.1.0` for days while the live build was `5bf0ba4` of
15 October, so the deploy check is a search of the served bundle for `GBHW-1`.

---

## 0. What this replaces

| Document | What it is for | Standing now |
|---|---|---|
| `AUTOGRADER_ZIP_SPEC.md` | The submission ZIP interface, v7.3 of 20 October 2026 | **Current and authoritative for the output.** This document does not restate the field tables; it points at them. v7.3 adds `files` (§3.4) and `fixed_layout` (§3.5) |
| `README.md` | Orientation and the live demo link | Current in substance. Its version badge says 3.9.0 while `constants.ts` says `v4.1.0`, so the badge is stale |
| `COMPLETION_*.md` and `WORKORDER_*.md`, about twenty files | One record per change, with the reasoning | Historical record. Cited here where a behaviour rests on one |
| `HANDWRITTEN_REGIONS_SPEC_v4_2026-10-17.md`, in the Assignment Maker repository | Regions, student marking, grading pipeline | **Partly superseded.** Its §5 describes a `RegionMarker` in which students drag rectangles. The ruling of 7 October 2026 replaced that with the student labelling whole pages, and no such component exists in this app |

**If the code and a document disagree, the code wins and the document is the bug.**

## 1. Terms

| Term | Meaning |
|---|---|
| **Assignment file** | The one file a student loads, produced by the Assignment Maker as `{stem}_OPEN_IN_APP.json` |
| **Page** | One photograph of one printed answer sheet, after ingest |
| **Registration** | Finding a page's four corner marks and its QR, and computing the transform that maps the printed sheet's geometry onto the photograph |
| **Crop** | The rectangle of one answer region, cut from a registered page. On the generic sheet it is the whole writing box, never trimmed |
| **Part** | One answerable sub-part of a problem. What a crop is attributed to |
| **`part_source`** | Where that attribution came from: `layout`, meaning the printed sheet said so, or `student`, meaning the student said so in the app |
| **Generic sheet** | `GBGEN1`, layout `5F0B10BC`. One printed page with a single writing box, used by every generic-sheet assignment |
| **Suitcase** | The single ZIP the student downloads and uploads. Called the submission ZIP in `AUTOGRADER_ZIP_SPEC.md` |
| **Payload** | `{stem}.json` inside the suitcase: plain JSON, no encoding, read with `JSON.parse` |

## 2. What the app is

A client-side React and TypeScript application, built with Vite, served as a static page
from GitHub Pages.

**It makes no network call and no upload.** Photographs are taken and processed in the
phone's browser and leave the phone only as the suitcase the student uploads. This was
checked against the code on 19 October 2026 for the P3 review and is the basis of proposed
change C7 to the assignment route. Anything that would introduce a request breaks that
statement and must not be added without a decision.

Three browser storage keys, in `constants.ts`: `gradebridge_submission` for work in
progress, `gradebridge_privacy_acknowledged`, and `gradebridge_pdf_notice_shown`.

React 19.2, Vite 6, Tailwind 3.4, TypeScript 5.8. `VERSION` is `v4.1.0`.

## 3. Input

**The assignment file is found by what it is, not by what it is called**
(`services/assignmentBundle.ts`). A student picks a file; the app identifies it rather than
trusting its name. `services/loadRefusal.ts` decides whether a file that decoded cleanly
must still be refused, and in what words.

**A demo assignment** (`demoAssignment.ts`) lets a student try the app with no file.

**Photographs** arrive through `components/PageUploader.tsx` and `imageIngest.ts`, from the
camera or the file picker, including HEIC via `heic2any`.

**A PDF** arrives through `services/pdfIntake.ts`, built under
`WORKORDER_SS_PDF_INTAKE_2026-10-08` because tablet apps such as GoodNotes and Notability
export PDF by default. `services/pdfLoader.ts` fetches pdf.js only when a student actually
picks a PDF, so a student who never does downloads nothing extra. pdf.js is pinned to
`pdfjs-dist` 6.3.289, legacy build for older phone browsers, by the ruling of 8 October
2026, and **its worker is served from the app's own origin, never a CDN**: a reader that
parses files a student supplies is the last thing to fetch from elsewhere.
`services/pdfImagePage.ts` recognises a PDF page that is really one photograph and unwraps
it rather than treating it as a document.

**Ingest limits** (`constants.ts`): pages are downsampled to 2,200 px on the long edge, JPEG
quality 0.85. 2,200 px is about 200 dpi on a letter page, the resolution the EEC130B corpus
transcribed at and the last comfortable stop before superscripts start breaking up. A
source photograph under 1,500 px on its long edge is rejected, which replaced a file-size
gate: pages are downsampled anyway, so the only input worth refusing is one with too few
pixels to transcribe.

## 4. The registration pipeline

`services/registration.ts` runs stages 1 to 4 of the page format specification's section 6,
and **the stage order is load-bearing and is not reordered for convenience.**

1. **Decode the QR** (`services/qrDecode.ts`). The reader is zxing-cpp compiled to
   WebAssembly (`services/zxingReader.ts`), with the binary inlined into the bundle as
   `vendor/zxingReaderWasm.ts`. jsQR is kept only as a fallback rung and the file records
   why. The payload grammar and the layout id hash are in `services/qrPayload.ts`, ported
   from the Assignment Maker's copy.
2. **Find the four registration marks** (`services/markDetect.ts`), ported from the
   Assignment Maker's own template test so the detector and the generator agree.
3. **Compute the four-point transform** (`services/homography.ts`).
4. **Cut the regions** (`services/cropRegions.ts`), selecting the layout map's rows for this
   page and multiplying fractions by the page.

`services/raster.ts` holds DOM-free image primitives, so everything downstream of a decoded
photograph works on plain typed arrays and is testable without a browser.
`services/pageCrops.ts` is the only part of the pipeline that touches a DOM.

`services/layoutMap.ts` reads `layout_{ID}.csv`, eleven columns, one row per declared
region, and checks its hash against the layout id in the QR. The map is the geometry
contract.

## 5. The capture gate

`services/captureGate.ts` judges one photograph at the moment it is taken and asks for a
retake rather than accepting a page that cannot be used. **A page whose registration marks
are not found is refused, not merely warned about**, following the ruling of 15 October 2026
after students reported trouble when their photographs left the QR out of frame.

Capture-time quality thresholds are advisory and deliberately loose, measured on a 400 px
proxy: a false warning costs a glance, a missed blur costs a regrade.

The suite `tests/gate-tests.mjs` runs the gate over a labelled corpus of 41 photographs and
asserts agreement with `LABELS.csv`. Twenty-five of those are other people's coursework and
are not in the repository, so a CI run covers the sixteen that are tracked and names each
skip.

## 6. The generic sheet path

`services/genericSheet.ts`. On this path the printed page does not say which part an answer
belongs to, so the student does.

The student chooses the problem for a page and ticks the parts on it. One page may carry
several parts of one problem, added in v7.2 of the ZIP interface on 7 October 2026: such a
page is written once under each part it carries, so the same `page_file` appears under more
than one crop, with no field added or renamed.

`part_source` is `student` here and `layout` on the app-printed sheet.

`services/genericWording.ts` holds every sentence a student sees on this path and nowhere
else, and its header records that a change to any string there needs approval again. The
sentences include the per-page note for an unlabelled page, "No part chosen yet. This page
is still submitted, but it will not be filed under any part", and the coverage summaries
for unlabelled, repeated and blank-looking pages.

`services/inkBox.ts` records where the writing is inside a crop **as metadata. Nothing is
cut.** On the generic sheet the crop is the whole writing box, never trimmed, which is the
rule the exam side shares.

## 7. What the student confirms, and what the app refuses to carry

`services/personalInfo.ts` holds the student's confirmation that no answer shows who they
are, required before a package is built, with a wording version recorded in the payload so
a confirmation cannot silently refer to different words.

`services/identityGuard.ts` asserts that a submission payload never names the student. It
runs **once, on the assembled payload, before a single byte is read from the store**, so a
package that is going to be refused is refused before the student waits for sixteen
photographs. A test asserts it is called exactly once.

**Removed 20 October 2026: the handwriting expectation.** The app used to show a stated
expectation before a student added pages, reading `Assignment.handwritingExpected`. The
Assignment Maker never wrote that field, so no course could turn it on, and the Maker's
cross-app whitelist check failed on the drift. Andre Knoesen's ruling of 20 October:
nothing can check whether work was handwritten, so it is an expectation rather than a
rule, and the instructor states it in the assignment when they write it, in their own
words and under their own name. `services/handwritingExpectation.ts`,
`components/HandwritingExpectationNotice.tsx` and their two test suites were deleted, and
the field removed from `types.ts`.

## 8. The completeness gate

`services/completeness.ts` counts how many answers the assignment has, how many the archive
carries, and which are missing. `components/CompletenessGate.tsx` shows it.

**It informs and never blocks**, under the standing rule that a guard on a constructive
action must fail open: downloading is constructive, and a guard over it that failed closed
would turn partial credit into a zero. It is a modal panel rather than a banner, so it
cannot be scrolled past, with "Download anyway" inside it. Nothing is default-activated,
the heading takes focus, and Escape returns to the work and never downloads.

It replaced a `window.confirm` on 9 September 2026 for a reason worth keeping: a suppressed
`confirm()` returns false without showing anything, which the old handler read as "the
student cancelled", so a student in a background tab could tap Download and get nothing at
all, permanently, with the only on-screen text telling them to try again.

The gate reports missing parts. Unlabelled pages, repeated parts and blank-looking pages
are reported earlier, on the page review screen, in `components/GenericPageReview.tsx`.

### 8b. The fitting gate

A second gate, added 20 October 2026 for work item W3 task 2, on the generic answer sheet
only. It says that a part has more pages than the assignment has room for, and that the
pages will be made smaller to fit. `services/fitNotice.ts` writes the sentences and
`components/FitGate.tsx` shows them. The approved wording, for a part with three pages and
an allotment of two, is:

> Part 1(a) has three pages and room for two. Your pages will be fitted into the two pages
> the assignment allows, so they will appear smaller. You can rewrite more compactly, or
> download anyway.

It is a sibling of the completeness gate rather than a second mode of it, because the two
offer different ways out: that one sends the student back to add a missing answer, this one
back to rewrite one more compactly. Everything that gate argues for is kept unchanged, in
the page rather than a dialog, nothing default-activated, Escape to the work, "Download
anyway" inside the panel.

**It informs and never blocks**, for a reason specific to this case: every page the student
photographed is in the document either way. The allotment cannot flex, because one blank
template has to align every submission in the class, so the only alternative to fitting is
refusing the download, which under the fail-open rule is not an alternative at all. What
the student is being told is a legibility cost they may prefer to avoid.

**The warning is read off the built payload's `fixed_layout.parts`, not recomputed.** The
sentence has to describe the document that is about to be downloaded, and the payload is
that document's own account of itself; a second computation could warn about a part that
fitted, or stay silent about one that did not.

Both gates can have something to say about the same download, so what the student has
already answered travels with the attempt as a `DownloadAcks` object. It is an object and
not a pair of positional booleans because three call sites pass the download handler
straight to an `onClick`: a positional boolean there receives the click event, which is
truthy, and would skip the gate for everyone, while a field read off an event object is
`undefined` and still gates. The acknowledgements expire with the attempt.

## 9. Output: the suitcase

One ZIP, named `{assignmentId}_submission_{YYYYMMDD-HHMM}`. **No student name is in it,
because the app does not have one** (3 September 2026); the timestamp is what keeps two
students' downloads from colliding in a Downloads folder.

Contents, in this order: the payload, then the pages, then the crops, then any electronic
image answers. The electronic path also carries a PDF. **The generic answer sheet also
carries `{stem}_answers.pdf`**, the fixed-layout answer pages of section 9b.

**A handwritten submission carries no PDF at all**, by the decision of 1 September 2026. The
PDF it used to carry was the blank question paper: nothing consumed it, it was roughly half
the archive by bytes, and it duplicated the page images that are kept. A blank PDF nobody
is supposed to read is worse than no PDF, because sooner or later somebody opens it and
concludes the student submitted nothing.

**The payload is plain JSON**, two-space indented, no encoding, since 21 September 2026. It
used to be encoded and sealed with a public key; the key shipped inside this public app, so
the encoding kept nothing secret and stopped nobody editing a payload. The pipeline's
integrity comes from hashes instead, so the relay needs no key and `JSON.parse` reads the
entry directly.

Top-level payload keys, asserted exactly by `tests/package-plain-tests.mjs`:

- Handwritten: `course_code`, `assignment_id`, `ai_feedback`, `submission_data`,
  `last_saved`, `personal_info_confirmed`, `personal_info_wording`, `input_mode`,
  `layout_id`, `pages`, `crops`, `files`, and, on the generic answer sheet only,
  `fixed_layout`.
- Electronic: `course_code`, `assignment_id`, `pdf_filename`, `ai_feedback`,
  `submission_data`, `last_saved`, `personal_info_confirmed`, `personal_info_wording`,
  `files`.

`files` maps every archive entry except the payload to the SHA-256 of its bytes, for work
item W3 of the assignment route of 19 October 2026. It is **in the tree but not yet
deployed**, so the build students are using today writes every key above except this one.
The payload cannot fingerprint itself, so what the relay checks is that every file it
extracts matches what the app recorded. Base64 entries are decoded before hashing, because
the relay recomputes from the file it extracts, and the payload is written after the other
entries, since its own bytes cannot exist until theirs do.

Compression is DEFLATE level 6, named in `SUBMISSION_ZIP_OPTIONS` so that the app and any
test harness produce the same archive rather than differing by a default.

The field tables for `pages`, `crops` and `submission_data` are in
`AUTOGRADER_ZIP_SPEC.md` and are not restated here.

## 9b. The fixed-layout answer pages

Work item W3 tasks 1 to 4 of the assignment route, built 20 October 2026, on the generic
answer sheet only. The archive carries `{stem}_answers.pdf`: one page per allotted page, in
the assignment's order, so Gradescope aligns every student's document against a single
blank template and a grader grades by question.

The geometry is `GBHW-1`, section 3 of
`workorders\CONTRACT_HOMEWORK_TO_GRADESCOPE_v1_2026-10-19.md`. **Neither program invents
its own**: `services/fixedLayout.ts` holds the geometry and the page order as data, once,
and both the student's document and the blank template are drawn from that one plan by
`services/fixedLayoutPdf.ts`. A millimetre of drift between the two would put a student's
answer under the wrong question for a whole class, which is why every number is a constant
and none is computed from a font metric.

The page order is the name page, then each part's allotted pages. The total is 1 plus the
sum of the allotments, **whatever the student submitted**, which is the property that lets
one template align every submission. A part with no page says "No page submitted for this
part". The allotment comes from the assignment file's `allotment` field, and **an absent
value means two**: the Assignment Maker does not emit the field yet, so today every part
takes the default, which lives in one constant rather than as a `?? 2` at each use.

A part with more pages than its allotment is dealt one per page while they fit and the rest
stacked on the last allotted page, in the student's own page order, because the common case
is a student who ran a few lines over and the page that overran should be the one that pays
for it. The payload records it as `fitted: true`, and the student is told before the
download (section 8b).

**The page images are placed directly into the PDF**, not rendered from the screen, by the
work order's own direction: rasterising a page view is the step that fails on an older
phone. The crops' bytes are read once and kept by their payload key, because reading the
store twice on a phone is the difference between a slow download and a failed one.

The payload's `fixed_layout` block names the file, the geometry, the page count, and for
each part its `allotment`, `first_page`, `placed` keys and `fitted` flag. By section 5a of
the contract, v1.1 of 20 October 2026, **the relay rebuilds these pages rather than
trusting the file**: the PDF in the archive is for the student to look at, and a consumer is
told not to grade it and not to treat it as evidence. The app is public JavaScript, so
nothing it ships can be made tamper-proof; the answer is that the authoritative document is
built from the crops by something the student does not run.

**The same work gives the same bytes.** jsPDF writes a `/CreationDate` from the clock and an
`/ID` from `Math.random()` unless it is told otherwise, so until 20 October 2026 this entry
was different on every build: two cases of `tests/multipart-pages-tests.mjs` over one
fixture disagreed on its SHA-256, and a student downloading the same work twice would have
had two different fingerprints recorded for it. Both values are now functions of the pinned
inputs, the assignment, the pinned `last_saved` and the plan, and the date is written in UTC
so the building machine does not show in the bytes. Handing jsPDF the ISO timestamp the
packager pins would also have thrown on every generic-sheet download, since its string path
accepts only `D:YYYYMMDDHHmmSS+hh'mm'`; the conversion is in `services/fixedLayoutPdf.ts`.

`tests/fixed-layout-tests.mjs` checks all of it by parsing the PDF's own drawing operators
rather than by eye, 37 checks, including the approved wording of section 8b word for word
and the reproducibility above.

## 10. What the app deliberately does not do

- **No network call, no upload, no server.**
- **No AI.** Everything in it is plain code. It shows the student their own photographs and
  crops and nothing a model produced.
- **It never knows the student's name.** There is no student-info step; identity comes from
  the authenticated submitter on the platform the student uploads to.
- **It does not grade** and holds no rubric or answer key. `STUDENT_SPEC_FIELDS` on the
  Assignment Maker side is a whitelist, because `assignment_spec.json` once carried grading
  prompts into the student's browser.
- **It cuts nothing from a crop.** The ink box is metadata.
- **It does not infer a blank answer.** A part with no labelled page is not submitted; the
  ink measure says `present`, `none` or `uncertain`, and claims `none` only when sure.

## 11. Code map

| Area | Files |
|---|---|
| Data model | `types.ts` |
| Shell | `App.tsx`, `components/Sidebar.tsx`, `components/Common.tsx` |
| Input | `services/assignmentBundle.ts`, `services/loadRefusal.ts`, `imageIngest.ts`, `components/PageUploader.tsx`, `demoAssignment.ts` |
| PDF intake | `services/pdfIntake.ts`, `services/pdfLoader.ts`, `services/pdfImagePage.ts` |
| Registration | `services/registration.ts`, `qrDecode.ts`, `zxingReader.ts`, `markDetect.ts`, `homography.ts`, `cropRegions.ts`, `pageCrops.ts`, `raster.ts`, `layoutMap.ts`, `pageFormat.ts`, `qrPayload.ts`, `vendor/zxingReaderWasm.ts` |
| Judgement | `services/captureGate.ts`, `services/inkBox.ts`, `services/completeness.ts`, `components/CompletenessGate.tsx` |
| Generic sheet | `services/genericSheet.ts`, `services/genericWording.ts`, `components/GenericPageReview.tsx` |
| Review and preview | `components/CropReview.tsx`, `components/PrintView.tsx`, `services/previewWording.ts`, `components/SubmissionWidget.tsx` |
| Privacy | `services/personalInfo.ts`, `services/identityGuard.ts` |
| Output | `services/submissionPackage.ts`, `downloadFile.ts`, `pageStore.ts` |
| Shared verbatim with the Assignment Maker | `services/figureBlocks.ts`, `services/mathDelimiters.ts`, `services/pageFormat.ts`, `services/qrPayload.ts` |

Four of those are shared with the Assignment Maker and must not drift. `pageFormat.ts`
records that it is a ported subset and names the authoritative copy.

## 12. How this app is checked

### 12a. A green suite is not a deployed app

**On 20 October 2026 every one of the 762 automated checks passed while the live app was
refusing to build an electronic submission at all.** `jsPDF.output('arraybuffer')` returns
an ArrayBuffer; `App.tsx` handed it on typed as a `Uint8Array`, a cast that was simply
false, and the new `files` hashing called `.arrayBuffer()` on it. Every ENG 6 student saw
"A.arrayBuffer is not a function" on Download. The suite missed it because its fixture
passed a `Uint8Array`, the shape the test author found convenient, rather than the shape
the app produces. **A fixture tidier than the caller is not a test of the caller**, and
`tests/package-plain-tests.mjs` section 6 now builds the same package from each shape the
app can really hand over.

Two rules follow, and they are not optional:

- **Deploy only when no course has an open submission window.** If one cannot wait, the
  instructor of every affected course is told beforehand. Andre Knoesen, 21 October 2026.
- **After every deploy, run the post-deploy check**, both routes, before walking away. It
  is five minutes and it is written down, with its two test assignments, in
  `App_Test_Pack_2026-10-20\POST_DEPLOY_CHECK.md` beside this repository. The electronic
  route is checked first, because it is the one nothing else exercises: every test pack
  built before 21 October 2026 covered only the generic answer sheet, which is why the
  people testing the app could not have found this one either.


`npm test` runs 27 suites, two fewer since the handwriting expectation was removed on 20 October 2026, written as plain Node scripts rather than in a framework, plus
browser probes. A green CI run does not cover everything: 25 of the 41 labelled capture
photographs are not in the repository, and the suite names each skip.

`predeploy` runs `scripts/check-ci-green.mjs` before it will build, so a deploy cannot ship
a red suite. Two pre-push hooks run on every push: `no-personal-names` reads all tracked
files for absolute paths, image metadata, personal names and product names, with three
documented excusals; `no-process-records` refuses tracked process records by filename.
**A process record must therefore not be committed to this repository.**

**A standing hazard, recorded on 15 October 2026 and worth knowing before adding a test.**
Any new `esbuild.build()` call in `tests/` that bundles a component or service must either
go through `loadModule` or pass `vendorFromDisk`. Without the stub, esbuild is handed the
inlined wasm as a 12,000-node concatenation, memory grows without bound, and the CI runner
dies with no failure message and no exit code. It has happened twice, at two call sites, one of
which went with the handwriting expectation on 20 October 2026, leaving
`tests/generic-sheet-tests.mjs` as the remaining hand-rolled build.
A bundler that dies is not a test that failed.

**Three suites cannot be run from the agent's Linux shell, recorded 20 October 2026.**
`node_modules` is installed for Windows, so `pdf-intake-tests` cannot load
`@napi-rs/canvas`; `qr-decoder-tests` bundles the vendored wasm and esbuild dies in a 3.9 GB
VM; and `generic-sheet-tests` runs longer than a single shell call allows. The other 24 run
there. **Those three are verified by running `npm test` on the Windows side**, which is the
run that gates the push in any case, and a background job is no way around the limit:
each shell call has its own process namespace, so a job put in the background dies with the
call that started it.

## 13. What commit `175c7b9` carried, 20 October 2026

Fourteen files, committed together on 20 October as "W3: fingerprint every archive entry, and
drop the handwriting expectation". Seven come from work item W3 of the assignment route:

- **`App.tsx`**: the `handwritingExpectedFor` import and the prop it fed are gone, with the
  handwriting expectation (section 7).

  **A change here was made and reverted the same day.** Step 3 of the walkthrough was
  rewritten to name Canvas, for work item W3. `tests/platform-neutral-tests.mjs` refused it,
  and rightly: Andre Knoesen ruled on 21 September 2026 that **student-facing text must not
  name any submission platform**, after a tester found the app telling students to upload to
  Gradescope. ENG17 and EEC130A upload to Canvas, other courses submit elsewhere again, so
  the instructor says where and the app says "as your instructor has told you to". The
  approved sentence is restored.
- **`components/Sidebar.tsx`**: a code comment said identity comes from Gradescope's
  authenticated submitter. The student uploads to Canvas, so the comment is corrected, with
  a note. No student ever saw the word.

- **`services/submissionPackage.ts`**: the `files` fingerprints of section 9. Three
  additions: `entryBytes` and `sha256Hex`, the `fileFingerprints` map over every entry
  except the payload, and the move of the payload's own `add` call to after the other
  entries are known. The archive's order is unchanged, because `add` still records the JSON
  first.
- **`tests/package-plain-tests.mjs`**: `files` in both closed key lists, and ten checks,
  five per path: the fingerprinted set is the archive minus the payload, the payload does
  not fingerprint itself, every value is 64 lowercase hex characters, every value matches
  the bytes actually in the archive, and a single flipped byte changes the value. 38 checks
  pass.

  **This work was written once, lost, and written again on 20 October 2026.** The first
  pass passed at the same 38 checks and was never committed; both files later matched
  `8f16f96` byte for byte, with the edits absent from the working tree, from `HEAD` and from
  the reflog. The likely cause is the `git switch -c hw5` and `git switch main` pair, or a
  second session working in this checkout at the same time. The lesson belongs here rather
  than in a findings note because it bears on how this repository is worked: **commit each
  work item before switching branches**, and treat a second session in the same checkout as
  a live hazard, since one has already committed `8ad4611` in the Assignment Maker during
  this work.

- **`tests/multipart-pages-tests.mjs`**: the golden held the payload of `0b82d9b` byte for
  byte, and `files` is a key `0b82d9b` did not write, so the byte comparison could not
  stand. Rather than regenerate the golden, which would have thrown away what it proves,
  the check now asserts that the payload's keys are the golden's plus `files`, that
  everything outside `files` is unchanged, that the text is still the two-space
  serialisation of its own object, that every page and crop is byte-identical to the
  golden's, and that the fingerprints the app recorded equal the hashes the harness
  computes independently over the same archive. 40 checks pass, where 38 did.
- **`tests/generic-sheet-tests.mjs`**: the same three repairs as the multipart golden, for the
  same reason. The closed top-level key list gains `files`; the electronic comparison against
  the `c72450e` golden holds out the payload entry, whose size and checksum move with the new
  key, and compares the parsed payload outside `files`, the two-space formatting, and the
  fingerprinted set against the archive; and the printed-sheet comparison, which already
  stripped `part_source`, now strips `files` as well and asserts it names the archive minus
  the payload. Every other entry on both paths is still held byte for byte to the deployed
  builder's output.
- **`AUTOGRADER_ZIP_SPEC.md`**: v7.3, the relay's contract for the new key. Section 3.4
  states that the keys are the archive minus the payload, that the hash is over the decoded
  bytes, and that a mismatch means the file is not the student's original rather than that
  the student did something. It also says plainly that this is integrity and not
  authorship, and that an archive without `files` is not an error, since every archive
  built before today lacks it.

The remaining seven files differ from `8f16f96` because the handwriting expectation was
removed (section 7): `components/PageUploader.tsx` and `types.ts` are edited,
`package.json` drops two suites from its `test` script, and
`services/handwritingExpectation.ts`, `components/HandwritingExpectationNotice.tsx`,
`tests/handwriting-expectation-tests.mjs` and `tests/handwriting-expectation-browser.mjs`
are deleted.

## 14. Gaps against the assignment route of 19 October 2026

**Work item W3, first half: done.** The per-file SHA-256 fingerprints are built and tested,
and `AUTOGRADER_ZIP_SPEC.md` v7.3 of 20 October 2026 describes the key in §3.4.

**Work item W3, second half: rests on a false premise and needs a ruling.** It asks that the
app's instructions "name Canvas, not Gradescope, as the upload". The app names no platform
at all and has not since 21 September 2026, by the ruling above, which is a stronger
position than naming Canvas and is the only one correct for a course that submits
elsewhere. So W3's second half is either already satisfied, or it is a request to reverse
that ruling. It is not a defect in the app, and it should not be implemented as written.

**The app now assembles the answer pages** (section 9b), which this document said on the
morning of 20 October that it did not. Tasks 1 to 4 of the Canvas-upload work order are
built and tested: the plan, the PDF, the blank template from the same code, the archive
entry and the `fixed_layout` payload key, and task 2's fitting gate (section 8b).

**What is still open on that work order:**

- **Task 5, where to upload: ruled satisfied**, Andre Knoesen, 20 October 2026, in
  `RULING_W3_TASK5_PLATFORM_WORDING_2026-10-20.md`. The work order asks that every
  student-facing sentence name Canvas. The ruling of 21 September 2026 stands instead: no
  student-facing text names any submission platform, because naming Canvas is correct only
  for the courses that use Canvas and the assignment sheet already names the platform for
  its own course. No code change; `tests/platform-neutral-tests.mjs` is the guard. The
  reversal attempted on 19 October and undone on 20 October is recorded in section 13.
- **Task 7, the deploy: done**, 20 October 2026 from `df9e50b`. Both wording approvals that
  gated it were given that day: task 2's wording is quoted in section 8b, and task 5 is
  ruled satisfied above. The header records how the live build was verified, and why the
  version string was not used to do it.
- **The `allotment` field.** Every part takes the default of two until the Assignment Maker
  emits it, which is that repository's W2. Nothing here needs to change when it arrives:
  `allotmentOf` already reads the field.
- **The fixture is stale.** `tests/fixtures/GradeBridge_answer_page_GBGEN1.pdf` and its
  300 dpi render date from 25 September and are not the current blank sheet.

Two incidental notes on that work: `jspdf` was already a dependency and is what draws the
pages, and `html2canvas` loses a reason to be kept, since the answer pages are not made by
rasterising the screen.

**The ink-outside-box warning is not required by the route as it now reads.** It is named in
the route's revision log and in S7 of `SUGGESTIONS_ROUTES_FROM_BUILD_2026-10-19.md`, but the
revision of 19 October at 19:39 does not ask for it in step 2.

## 15. Method

Every statement above was read from the code in the working tree on 20 October 2026, or
from a real built package in the test suite, not from the earlier specifications. Where a
claim rests on a document rather than on code, the document is named. The app was not run.
