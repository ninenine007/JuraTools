#!/usr/bin/env python3
"""The page's preview background: the RD's blank form as an image.

    python3 build_background.py          # assets/OS4_150861.pdf → background.png

Rendered by poppler at 144 dpi (twice the PDF's 72 units per inch, so it stays
sharp on a high-density screen) with the form's widgets hidden — the RD's red
"ล้างข้อมูล" button has no print flag and never reaches paper — then reduced to
32 colours. The page draws every value over it from the same glyph positions the
PDF's appearance streams are written from, so the preview and the file agree.
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "assets" / "OS4_150861.pdf"
OUT = HERE / "background.png"


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", "144", "-png", "-hide-annotations", "-singlefile", str(SRC),
                        str(Path(tmp) / "bg")], check=True, stderr=subprocess.DEVNULL)
        im = Image.open(Path(tmp) / "bg.png").convert("RGB")
    q = im.quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q.save(OUT, optimize=True)
    print(f"{im.size[0]}×{im.size[1]} → {OUT.name} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
