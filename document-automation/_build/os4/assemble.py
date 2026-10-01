#!/usr/bin/env python3
"""Assemble document-automation/os4-share-transfer.html (อ.ส.4 for a share transfer instrument only).

    python3 assemble.py <leak.local.json>          # → ../../os4-share-transfer.html

Inlines into page.src.html: the engine (os4-engine.js), HarfBuzz (assets/hb.js,
assets/hbjs.js — harfbuzzjs 0.10.3, MIT) and one data block — the RD's blank form
(assets/OS4_150861.pdf), the font (assets/NotoSansThaiLooped-Regular.ttf, OFL),
the HarfBuzz WebAssembly, fieldmap.json, fontinfo.json and background.png, the
binaries base64. The page then works opened from disk, offline (House Style §1).

Before writing, it checks that the RD's file is the pinned one and that no value
from the firm's own filled forms is anywhere in the page (make_leaklist.py writes
that list, outside the repo).
"""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
A = HERE / "assets"
DEST = HERE.parents[1] / "os4-share-transfer.html"


def b64(p: Path) -> str:
    return base64.b64encode(p.read_bytes()).decode()


def script_safe(js: str, name: str) -> str:
    if re.search(r"</script", js, re.I):
        sys.exit(f"{name} contains </script> — cannot be inlined")
    return js


def main(leak_file: str) -> None:
    fieldmap = json.loads((HERE / "fieldmap.json").read_text(encoding="utf-8"))
    fontinfo = json.loads((HERE / "fontinfo.json").read_text(encoding="utf-8"))
    pdf = (A / "OS4_150861.pdf").read_bytes()
    if hashlib.sha256(pdf).hexdigest() != fieldmap["source"]["sha256"]:
        sys.exit("assets/OS4_150861.pdf is not the file fieldmap.json was built from — re-run build_fieldmap.py")
    font = (A / "NotoSansThaiLooped-Regular.ttf").read_bytes()
    if hashlib.sha256(font).hexdigest() != fontinfo["sha256"]:
        sys.exit("the font is not the one fontinfo.json was built from — re-run build_fontinfo.py")
    data = {
        "pdf": base64.b64encode(pdf).decode(),
        "font": base64.b64encode(font).decode(),
        "wasm": b64(A / "hb.wasm"),
        "fieldmap": fieldmap,
        "fontinfo": fontinfo,
        "bg": "data:image/png;base64," + b64(HERE / "background.png"),
    }
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = (HERE / "page.src.html").read_text(encoding="utf-8")
    parts = {
        "__OS4_DATA__": blob,
        "__HB_JS__": script_safe((A / "hb.js").read_text(encoding="utf-8"), "hb.js"),
        "__HBJS_JS__": script_safe((A / "hbjs.js").read_text(encoding="utf-8"), "hbjs.js"),
        "__OS4_ENGINE__": script_safe((HERE / "os4-engine.js").read_text(encoding="utf-8"), "os4-engine.js"),
    }
    for k, v in parts.items():
        if page.count(k) != 1:
            sys.exit(f"page.src.html: expected one {k}")
        page = page.replace(k, v)
    if "__OS4_" in page or "__HB" in page:
        sys.exit("a placeholder was not filled")

    # ── leak check ──
    # Words any อ.ส.4 contains — the form's own vocabulary, not anyone's data.
    generic = {"ตราสารการโอนหุ้น", "คู่ฉบับ", "ใบโอนหุ้น", "กรุงเทพมหานคร", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
               "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"}
    listed = json.loads(Path(leak_file).read_text(encoding="utf-8"))
    amounts = [s[8:] for s in listed if s.startswith("#amount:")]
    leaks = [s for s in listed if s and len(s) >= 4 and s not in generic and not s.startswith("#amount:")]
    found = sorted({s for s in leaks if s in page})
    text = re.sub(r'"(pdf|font|wasm|bg)":"[^"]*"', "", page)                     # outside the binaries
    flat = re.sub(r"\D", "", text)
    found += sorted({s for s in leaks if s.isdigit() and s in flat})
    # an amount written with or without thousands separators, as a whole number
    for a in amounts:
        pattern = r"(?<![\d,])" + r",?".join(a) + r"(?![\d])"
        if re.search(pattern, text):
            found.append("amount " + a)
    if found:
        sys.exit(f"LEAK — refusing to write the page: {found[:20]!r}")
    DEST.write_text(page, encoding="utf-8")
    print(f"wrote {DEST.relative_to(HERE.parents[2])} {round(len(page.encode()) / 1024)} KB; "
          f"leak check clean over {len(leaks)} values and {len(amounts)} amounts")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
