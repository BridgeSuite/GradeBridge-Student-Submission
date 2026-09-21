"""
Cross-language interop check: a Python consumer reads the submission archive
with the standard library alone.

Opens the archives written by tests/interop-emit.mjs, which builds them with the
app's own services/submissionPackage.ts, and reads them the way a relay or an
autograder written in Python would: zipfile and json, no key, no fixture, no
third-party package.

Until 2026-09-21 this check needed the course private key and the autograder's
crypto_utils.py, because the archive was sealed. Nothing is sealed or encoded
now (WORKORDER_SS_PIPELINE_RECALIBRATION_2026-09-21 sections 3 and 4), and the
point of this file is to hold that across the language boundary: if anything
ever needs a key to open again, this fails.

Usage:
    node tests/interop-emit.mjs <out-dir> > emitted.json
    python tests/interop-check.py emitted.json

See tests/README.md.
"""
import json
import sys
import zipfile
from pathlib import Path

# utf-8-sig: PowerShell's `>` writes a BOM, and a check that fails on how it was invoked is noise.
emitted = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
fails = 0

IDENTITY = {
    "name", "fullname", "firstname", "lastname", "studentname", "username", "userid",
    "email", "emailaddress", "sid", "studentid", "studentnumber", "netid",
}


def check(name, cond, detail=""):
    global fails
    print(("  PASS  " if cond else "  FAIL  ") + name)
    if not cond:
        fails += 1
        if detail:
            print(f"          {detail}")


def keys_in(value, path=""):
    if isinstance(value, dict):
        for k, v in value.items():
            here = f"{path}.{k}" if path else k
            yield here, k
            yield from keys_in(v, here)
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from keys_in(v, f"{path}[{i}]")


print("\ninterop: the app's archive, read by Python's standard library\n")

for archive in emitted["archives"]:
    label = archive["label"]
    print(f"  {label}: {Path(archive['path']).name}")
    with zipfile.ZipFile(archive["path"]) as z:
        # JSZip also writes a `crops/` directory entry, as it always has. A
        # consumer iterating the archive must skip it; files are what is compared.
        names = [n for n in z.namelist() if not n.endswith("/")]
        check(f"[{label}] the entries are the ones the app reports, in order",
              names == archive["entries"], f"{names}")
        check(f"[{label}] no entry is named as sealed",
              not any(n.lower().rsplit(".", 1)[-1].startswith("gb") for n in names), f"{names}")

        json_name = next(n for n in names if n.endswith(".json"))
        raw = z.read(json_name)
        text = raw.decode("utf-8")
        check(f"[{label}] the payload is UTF-8 JSON with no encoding prefix",
              text.lstrip().startswith("{"), repr(text[:8]))
        payload = json.loads(text)
        check(f"[{label}] json.loads gives exactly the payload the app built",
              payload == archive["payload"])

        named = [p["file"] for p in payload.get("pages", [])]
        named += [c["file"] for c in payload.get("crops", {}).values()]
        if "pdf_filename" in payload:
            named.append(payload["pdf_filename"])
        missing = [n for n in named if n not in names]
        check(f"[{label}] every file the payload names is in the archive", not missing, f"{missing}")

        for n in names:
            if n.endswith(".jpg"):
                check(f"[{label}] {n} is a JPEG", z.read(n)[:3] == b"\xff\xd8\xff")
            elif n.endswith(".pdf"):
                check(f"[{label}] {n} is a PDF", z.read(n)[:5] == b"%PDF-")

        for rid, crop in payload.get("crops", {}).items():
            check(f"[{label}] crop {rid} carries region_id, part_id and page_k",
                  crop.get("region_id") == rid and bool(crop.get("part_id"))
                  and isinstance(crop.get("page_k"), int))

        bad = [p for p, k in keys_in(payload)
               if "".join(ch for ch in k.lower() if ch.isalnum()) in IDENTITY]
        check(f"[{label}] no identity-shaped key anywhere", not bad, f"{bad}")
        check(f"[{label}] the personal-information confirmation is recorded",
              payload.get("personal_info_confirmed") is True
              and isinstance(payload.get("personal_info_wording"), str))
    print()

print(f"{'ALL INTEROP CHECKS PASSED' if fails == 0 else f'{fails} INTEROP CHECK(S) FAILED'}\n")
sys.exit(1 if fails else 0)
