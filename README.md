# JuraTools

Kornrawee, a law and study enthusiast, has compiled a collection of web-based utility tools for his personal use and that of his friends.

Every tool is a single self-contained HTML file that runs entirely in the browser — no build step, no server, no data sent anywhere.

## Structure

Tools are grouped into collections, each with its own hub page:

| Folder | Collection |
|---|---|
| `date-time-tools/` | Date & Time Tools for Legal — GM notices (CCC s.1175), CCC time & deadline counting (§§193/2–193/8, incl. working days), chronology & intervals, recurring deadlines, clear days |
| `corporate-tools/` | Corporate Tools for Legal — shareholder voting, share certificates, share register book, share transfer instrument, incorporation wizard, dividends & legal reserve, CorpDesk share register workbench, instrument checklists |
| `tax-tools/` | Thai Tax Tools — land sale tax comparison, stamp duty, withholding tax |
| `labour-tools/` | Thai Labour Law Tools — termination payment suite on shared `labour-core.js`/`.css` |
| `utilities/` | Utilities — Thai line formatting, baht text, text sanitizer, subtitle converter, pro-rata allocation, rounding lab, percentages |
| `tools/` | Local scripts (e.g. `srv-to-paragraphs`) |

Standalone tools (`ccc-default-interest.html`, `intestate-succession.html`, `copywork.html`, `marginalia.html`) live at the root next to `index.html`.

Old root-level tool URLs redirect to their new locations via `404.html` on GitHub Pages.
