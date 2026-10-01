#!/usr/bin/env python3
"""Font metrics the PDF font dictionary needs, read once from the embedded font.

    python3 build_fontinfo.py            # assets/NotoSansThaiLooped-Regular.ttf → fontinfo.json

The engine shapes text with HarfBuzz at run time and positions every glyph
itself, so it never needs the font's layout tables. What the PDF needs is
static: the advance width of every glyph (/W), the bounding box, ascent,
descent and cap height (/FontDescriptor), and the character behind each glyph
that has one (/ToUnicode, so text copied out of the form reads as Thai).

The font is Noto Sans Thai Looped (SIL Open Font License 1.1), a static
Regular instance of the variable font made with
    fonttools varLib.instancer NotoSansThaiLooped[wdth,wght].ttf wght=400 wdth=100
Its fsType is 0 — installable embedding, no restriction.
"""
import hashlib
import json
from pathlib import Path

from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "assets" / "NotoSansThaiLooped-Regular.ttf"
OUT = HERE / "fontinfo.json"


def main() -> None:
    data = SRC.read_bytes()
    f = TTFont(SRC)
    assert f["OS/2"].fsType == 0, "the font must allow embedding"
    upm = f["head"].unitsPerEm
    assert upm == 1000, "the engine assumes 1000 units per em (PDF glyph space)"
    order = f.getGlyphOrder()
    widths = [f["hmtx"][g][0] for g in order]
    to_unicode = {}
    for cp, g in sorted(f.getBestCmap().items()):
        gid = order.index(g)
        to_unicode.setdefault(gid, chr(cp))          # first code point wins (e.g. space over nbsp)
    head, hhea, os2 = f["head"], f["hhea"], f["OS/2"]
    name = f["name"].getDebugName(6)
    out = {
        "file": SRC.name,
        "sha256": hashlib.sha256(data).hexdigest(),
        "postScriptName": name,
        "upm": upm,
        "bbox": [head.xMin, head.yMin, head.xMax, head.yMax],
        "ascent": hhea.ascent,
        "descent": hhea.descent,
        "capHeight": os2.sCapHeight,
        "xHeight": os2.sxHeight,
        "widths": widths,
        "toUnicode": {str(k): v for k, v in sorted(to_unicode.items())},
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{name}: {len(widths)} glyphs, {len(to_unicode)} mapped → {OUT.name}")


if __name__ == "__main__":
    main()
