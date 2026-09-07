# Design brief — Share Transfer & Swap Tax

`tax-tools/share-swap-tax-calculator.html`
ภาษีเงินได้นิติบุคคลและภาษีหัก ณ ที่จ่าย จากการโอนหุ้นและการแลกหุ้นระหว่างบริษัท

## What the tool is

A single self-contained HTML file — vanilla JS in one IIFE, `'use strict'`, no
build step, no network, no framework — that models moving shares between
companies as a chain of steps and prices the tax on each one. A step is a sale,
a share-for-share swap, an entire business transfer or an amalgamation. For each
step the engine computes gain or loss under s.65, tests the transfer price
against book value under s.65 bis (4), runs the s.5 sattaras exemption as a
conditions checklist, decides whether s.70 withholding is due on a foreign
transferor, and reports which accounting period the event falls in.

Where the consideration is **existing** shares rather than cash or newly issued
shares, the step is two disposals and the tool computes both. Each side's gain
is the value it receives less its own cost, and s.65 bis (4) is run against each
side's own price: cash for shares can only be tested against the seller, but
shares for shares gives the officer a transfer on each side to test. Where the
consideration is newly issued shares the second side is capital and bears no
tax, which the tool says instead of computing it.

The reason it is a chain rather than a calculator is that the interesting Thai
positions are about timing, not arithmetic. Acquiring below market value is not
income at acquisition; the charge moves to the onward sale. Uplift out of an
amalgamation is s.40(4)(ฉ) income but is not taxed until realised. Both only
become visible when step 2 takes its cost base from step 1, which is what the
`fromLeg` cost mode does and what the timeline draws.

## Page structure

```
nav.nav                                  breadcrumb, 52px
.summary-bar                             sticky at top:52px — steps, gain, CIT, WHT, exposure
.hero                                    H1 + Thai subtitle + scope paragraph
.wrap
  .card  (1) Rates, periods and rounding  CIT rate, WHT rate, default period end, dp, rounding
  .card  (2) The steps of the transaction
    #legHost
      .leg  (repeated)
        .leg-head                        tag · name · status pill · ↑ ↓ ⧉ ✕
        .leg-body
          .mode-toggle                   sale / ebt / amalgamation
          .sub-head "The parties"        transferor, transferee, target, type, date, period end
          .sub-head "The shares…"        shares, par, price (per share|total), cost, book value, consideration
          .sub-head "The other side…"    only when consideration = existing shares: its shares, par,
                                         cost, book value, value received, residence, purpose, cause
          details.panel                  cause, purpose, cost method, s.5 สัตตรส conditions
          .leg-res                       working table · per-share table · .diagram (ladder, one per side) ·
                                         treatment table · .callout findings ·
                                         "And what it does to <transferee>" table + its findings
  .card  (3) When each tax event falls    #timelineHost — .diagram (lane timeline) + period table
  .card  (4) Result                       #resultTable · .result-boxes · #findingsHost
  .card  What the engine applies          six details.panel rules panels
.actions-row                             Copy · Export · Import · Print · Reset
footer                                   citation line + disclaimer
```

## Locked contract

### Element IDs read or written by JS

| Card | IDs |
|---|---|
| Summary bar | `sbSteps` `sbGain` `sbCit` `sbWht` `sbExp` |
| 1 Rates | `citRate` `whtRate` `fyEnd` `decimals` `rounding` |
| 2 Steps | `legHost` `addLegBtn` `exampleBtn` |
| 3 Timeline | `timelineHost` |
| 4 Result | `resultTable` `gainValue` `gainSub` `citValue` `citSub` `whtValue` `whtSub` `findingsHost` |
| Actions | `copyBtn` `exportBtn` `importBtn` `importFile` `resetBtn` |

`#legHost` and `#timelineHost` are rewritten wholesale; everything inside them is
generated. All listeners on step inputs are **delegated on `#legHost`** and match
on `data-` attributes, never on IDs or index.

### Data attributes — structural, do not rename

| Attribute | On | Meaning |
|---|---|---|
| `data-id` | every input/select/textarea inside a step | the step's `leg.id` |
| `data-k` | same | the state key that input writes |
| `data-cat` | `.mode-btn` in a step | `sale` / `ebt` / `amalgamation` |
| `data-act` | `.icon-btn` in a step head | `up` / `down` / `dup` / `del` |
| `data-res` | `.leg-res` wrapper | step id — the partial-repaint target |
| `data-pill` | span around the status pill | step id |
| `data-name` | `.leg-name` | step id |

The other side's fields use the same `data-k` mechanism with a `c` prefix
(`cShares`, `cPar`, `cCostPerShare`, `cBvPerShare`, `cValue`, `cTarget`,
`cCauseNote`, `cInvestmentPurpose`, `cTreaty`) plus `transfereeType` and the
`otherSide` switch. A blank `cValue` means "take the other side's shares at book
value", and the working table says so rather than silently filling the field.

`data-res`, `data-pill` and `data-name` exist so that typing in a money field
repaints only the results, keeping focus and caret. Remove them and every
keystroke rebuilds the form. The `input` handler deliberately ignores
`select`, checkbox, radio and `type="date"`; those go through `change`, which
does a full repaint because they change which fields are shown.

### State classes

| Class | Applied by | Means |
|---|---|---|
| `.mode-btn.active` | render | the step's category |
| `.pill-green/-amber/-red/-info/-grey` | `statusPill()` | exempt / disallowed / taxable / deferred / not income |
| `.callout-green/-amber/-red/-violet` | `findingHtml()` | tone of a finding: safe · watch · charge or exposure · deferred |
| `.btn.copied` | copy handler | 1.3s confirmation |
| `tr.total` `tr.hl` `tr.muted` | result tables | sum row · the tax lines · secondary lines |

Tone is semantic, not decorative: violet means "deferred, not avoided" and is
used nowhere else. Red is a charge or an exposure. Amber is a condition not yet
satisfied.

### Input classes

`.amt` receives live thousands separators with caret preservation. Applied to
every money and count field; never to a percentage or a date. Money fields are
`type="text" inputmode="decimal"` — do not convert them to `type="number"`.

### The two SVGs

Generated as strings by `ladder(cfg)` (wrapped by `ladderBlock`, called from
`ladderSvg`) and `renderTimeline()`, both inside `.diagram` — which owns the
horizontal scroll — with a `.diagram-cap` beneath. A step draws one ladder per
taxable side, so the two-sided case renders two.

`ladder(cfg)` takes `{ key, giver, taker, shares, costPer, parPer, bvPer,
pricePer, gain, uplift, exposed, caption }`. `key` must be unique per SVG on the
page: every gradient, pattern and marker id is suffixed with it, and duplicates
make one diagram inherit another's fill. `chip(x, y, text, colour, anchor)`
draws the rounded label pills and supports `start` / `middle` / `end`.

Colours live in the `LC` object at the top of the ladder section, and are the
same semantics as the callouts: slate cost, rose par, emerald book value, indigo
price, amber for the ม.65 ทวิ (4) band. Draw order matters — the hatched
exposure band goes down first, then a white knock-out, then the gain block, so a
loss inside the exposure band stays readable.

## Free to change

Palette, type scale, spacing, radii, shadows, the gradient wash, the icon
choices, breakpoints, the order of the cards, the shape of the step head, how a
collapsed step looks, whether the rules panels are `details` or tabs.

## Things worth preserving

- **The price ladder is the tool's argument, not an ornament.** Height is value
  a share, width is the number of shares, so the block between cost and price
  *is* the taxable gain and the hatched band above the price *is* what s.65 bis
  (4) would add. The diagonal arrow is the transfer itself: shares leaving the
  giver's line at cost and landing on the taker's line at the price. Redraw it
  however you like, but keep the area meaning the money, keep the vector, and
  keep the two company lines at the edges — that is the lawyer's own whiteboard.
- **Two ladders mean two disposals.** When both sides are computed they are
  drawn as a mirrored pair inside `.ladder-pair`, each under a numbered
  `.ladder-head` naming who gives what and what it costs them, giver always on
  the left. That pairing is the point being made: do not merge them into one
  picture, and do not let the two drift apart on the page.
- **The timeline is lanes, not a list.** One lane per company, arrows drawn from
  the transferor's lane to the transferee's at the date, bands for accounting
  periods. It answers "when", which is the half of this problem a table hides.
- **The summary bar carries `s.65 bis (4) exposure`.** It is the number a
  reviewer is looking for and it must stay visible while scrolling the steps.
  It sits at `top:52px` because the nav is 52px — move one, move the other.
- **Findings sit under the step they belong to, each with its citation.** They
  are the working. Do not collapse them behind a toggle by default.

## Not modelled (v1)

Individual shareholders · stamp duty (the Stamp Duty Calculator has it) · VAT
and SBT · loss carry-forward, group relief, BOI · ss.71 bis / 71 ter transfer
pricing for related parties · the Director-General's Notification (No. 3)
conditions beyond same-period transfer, dissolution and liquidation, which are
a checklist for the user to satisfy rather than a rule the engine applies.

## Figures seeded as editable defaults — verify before relying on them

| Field | Default | Why it is a default, not a constant |
|---|---|---|
| `citRate` | 20% | The ordinary rate; SME bands, BOI and rate changes are the user's to enter. |
| `whtRate` | 15% | s.70 on s.40(4) income; a treaty may reduce it, and the treaty checkbox removes it entirely. |
| `fyEnd` | 31 December | The common Thai period end, overridable per step. |
