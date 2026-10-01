#!/usr/bin/env python3
"""List every value typed into the firm's own อ.ส.4 forms, for assemble.py's leak check.

    python3 make_leaklist.py <folder of the firm's filled อ.ส.4 PDFs> <leak.local.json>

The firm's forms carry real names, tax IDs, addresses and deal values. They are only ever read
here, from outside the repo, and the list this writes stays outside it too — the
repo keeps the script, never the values. assemble.py refuses to write the page if
any of these strings, or any of the ID numbers as bare digits, is inside it.
"""
import json
import re
import sys
from pathlib import Path

import pypdf


def main(folder: str, out: str) -> None:
    values = set()
    for pdf in sorted(Path(folder).glob("*.pdf")):
        for name, field in (pypdf.PdfReader(pdf).get_fields() or {}).items():
            v = field.get("/V")
            if v is None or str(v).startswith("/"):
                continue
            v = re.sub(r"\s+", " ", str(v)).strip()
            if len(v) >= 4 and not re.fullmatch(r"[\d,.\s-]+", v):
                values.add(v)                              # names, addresses, dates in words
            d = re.sub(r"\D", "", v)
            if len(d) == 13 and set(d) != {"0"}:
                values.add(d)                              # tax IDs, as digits
            elif re.fullmatch(r"[\d,\s]+", v) and len(d.lstrip("0")) >= 6:
                values.add("#amount:" + d.lstrip("0"))     # deal values from the table (shorter numbers are everywhere)
    Path(out).write_text(json.dumps(sorted(values), ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(values)} values → {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
