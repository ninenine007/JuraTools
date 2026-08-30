# JuraTools

Kornrawee, a law and study enthusiast, has compiled a collection of web-based utility tools for his personal use and that of his friends.

Every tool is a single self-contained HTML file that runs entirely in the browser — no build step, no server, no data sent anywhere.

## Structure

Tools are grouped into collections, each with its own hub page:

| Folder | Collection |
|---|---|
| `date-time-tools/` | Date & Time Tools for Legal — GM notices (CCC s.1175), CCC time & deadline counting (§§193/2–193/8, incl. working days), chronology & intervals, recurring deadlines, clear days |
| `corporate-tools/` | Corporate Tools for Legal — shareholder voting, share certificates, share register book, share transfer instrument, incorporation wizard, dividends & legal reserve, CorpDesk share register workbench, instrument checklists |
| `tax-tools/` | Thai Tax Tools — personal income tax, land sale tax comparison, stamp duty, withholding tax |
| `labour-tools/` | Thai Labour Law Tools — termination payment suite on shared `labour-core.js`/`.css` |
| `finance-tools/` | Finance Tools — time value of money (PV, FV, NPV, PMT) on an interactive cash-flow timeline |
| `corpus-tools/` | Corpus Tools — Contract Concordance (KWIC, clause library, collocations, wordlist) over a corpus built locally from your own contracts |
| `utilities/` | Utilities — Thai line formatting, baht text, text sanitizer, subtitle converter, pro-rata allocation, rounding lab, percentages |
| `tools/` | Local scripts — `srv-to-paragraphs`, and `contract-corpus` (the Python pipeline that builds the corpus file for Corpus Tools) |

Standalone tools (`ccc-default-interest.html`, `intestate-succession.html`, `copywork.html`, `marginalia.html`) live at the root next to `index.html`.

Old root-level tool URLs redirect to their new locations via `404.html` on GitHub Pages.

## Working on this repo

Conventions live in `HOUSE-STYLE.md` (how a tool is built), `PRODUCT.md` (what
the product is for), and a `*.design-brief.md` beside each larger tool (its
locked JS contract).

If you are working with an AI assistant, point it at **`CLAUDE.md`** first — it
maps those documents, gives the commands that actually verify a change, and
records the traps that have already cost time.
