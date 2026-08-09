# Time Value of Money — design brief

## 1. What the tool is

Four financial calculators sharing one cash-flow timeline: **future value**, **present
value**, **net present value** and **level payment**. The user says what the money is,
how long it runs, at what rate, and which of the five quantities is the unknown; the tool
solves for it. Compounding runs at any frequency (m per year), payments fall at the start
or the end of each period, cash flows may be irregular and overridden period by period,
and where no closed form exists — solving for the interest rate — it runs four numerical
methods side by side and shows how each converged.

The diagram is not decoration. It is the primary output: the tool exists to make a
compounding chain *visible*, the way a textbook worked example is visible. Everything else
on the page supports it.

Single self-contained HTML file, vanilla JS in one IIFE, `'use strict'`, no build step, no
network, no dependencies. State lives in `localStorage` under `tvmCalc_v1`.

## 2. Page structure

```
nav.nav                          sticky, 52px
  .nav-brand / .nav-crumb ×2
  .nav-right
    #langToggle .lang-toggle     EN | ไทย
    a.nav-back
.hero                            h1 + .th + .sub
.wrap
  #tabs .tabs                    FV | PV | NPV | PMT
  #moneyCard .card               step 1 — the money
    #scenarioField               .mode-toggle#scenarioToggle (FV/PV tabs)
    #presetField                 .mode-toggle#presetToggle   (PMT tab)
    .field-row  #pvField #pmtField
    .field-row  #fvField #investField
    #npvPattern                  .field-row.three — amount / from / to
    #timingField                 .mode-toggle#timingToggle
    #periodsDetails details      per-period override table (#periodsTable)
  #timeCard .card                step 2 — time and rate
    .field-row.three             #fN  #fM (+#mCustomField)  #fRate + #rateChips
    #interestToggle              .mode-toggle — compound / simple
    #rateDerived .derived        rate per period, auto with override
    #periodsDerived .derived     total periods · effective annual rate
    #rateWarn
    .field-row                   #decimals  #rounding
  #solveCard .card               step 3 — what are we solving for
    #fSolve  #solveTolField      #validation
  #resultCard .card
    #resultBoxes .result-boxes   two .amount-box
    .diagram-head                title · #expandBtn · .diagram-hint
    .diagram-wrap > #diagram     ← the SVG lives here
    .legend
    #termsDetails details        #termsTable  period-by-period working
    #amortDetails details        #amortTable  amortisation (PMT tab only)
  #solverCard .card              rate solver — hidden unless solving for the rate
    #methodGrid .method-grid     four .method-card
    .conv-wrap > #convGraph      convergence SVG
    #iterDetails details         #iterTables
  #assumeDetails details         #assumeBody  formulas, conventions, not-modelled
  .actions-row                   save · history · copy · print · example · clear
#modalBack .modal-back           history & saved scenarios
footer                           .cites + disclaimer
```

## 3. Locked contract

Anything in this section is read or written by JS. Renaming or removing it breaks the tool.

### 3.1 Element IDs

**Money (step 1)** — `moneyCard` `scenarioField` `scenarioToggle` `presetField`
`presetToggle` `pvField` `pmtField` `fvField` `investField` `npvPattern` `timingField`
`timingNote` `periodsDetails` `periodsNote` `periodsTable` `clearOvrBtn`
Inputs: `fPV` `fPMT` `fFV` `fInvest` `fCfAmt` `fCfFrom` `fCfTo`
Labels rewritten per tab: `lblPV` `lblPMT` `lblFV` `lblInvest`
Notes: `notePV` `notePMT` `noteFV`

**Time and rate (step 2)** — `timeCard` `fN` `nSuffix` `lblN` `fM` `mCustomField`
`fMCustom` `fRate` `lblRate` `rateChips` `interestToggle` `interestNote` `rateDerived`
`perRateAuto` `fPerRate` `resetPerRate` `periodsDerived` `totPeriodsVal` `earLabel`
`earVal` `rateWarn` `decimals` `rounding`

**Solve (step 3)** — `solveCard` `fSolve` `solveNote` `solveTolField` `fTol` `validation`

**Result** — `resultCard` `resultBoxes` `expandBtn` `diagram` `termsDetails` `termsNote`
`termsTable` `amortDetails` `amortNote` `amortTable`

**Solver** — `solverCard` `methodGrid` `convGraph` `iterDetails` `iterTables`

**Chrome** — `tabs` `langToggle` `assumeDetails` `assumeBody` `saveBtn` `historyBtn`
`copyBtn` `printBtn` `exampleBtn` `clearBtn` `modalBack` `modalClose` `savedList`
`histList` `clearSavedBtn` `clearHistBtn`

`fPV` `fPMT` `fFV` `fN` `fRate` are also addressed through the `SOLVE_FIELD` map — the
one being solved for is set `readOnly`, given `.solved`, blanked, and shows the answer as
its **placeholder**. Their authored `placeholder` attributes are captured once at start-up
into `BASE_PH` and restored when the field stops being the answer, so keep a sensible
placeholder on each.

### 3.2 `data-` attributes

| Attribute | On | Meaning |
|---|---|---|
| `data-tab` | `#tabs .tab-btn` | `fv` \| `pv` \| `npv` \| `pmt` |
| `data-scenario` | `#scenarioToggle .mode-btn` | `single` \| `annuity` \| `both` \| `custom` |
| `data-preset` | `#presetToggle .mode-btn` | `loan` \| `save` \| `both` |
| `data-timing` | `#timingToggle .mode-btn` | `end` \| `due` |
| `data-interest` | `#interestToggle .mode-btn` | `compound` \| `simple` |
| `data-rate` | `#rateChips .chip` | rate in percent, written into `#fRate` |
| `data-lang` | `#langToggle .lang-btn` | `en` \| `th` |
| `data-i18n` | any text node | key into the `TH` table; see §3.5 |
| **`data-term`** | SVG groups, `.mterm`, `#termsTable tr` | **the highlight key — see §3.4** |
| `data-cf` | `#periodsTable input.cf` | period index this input overrides |
| `data-resetcf` | `#periodsTable button.reset-auto` | period index to restore to automatic |
| `data-prow` | `#periodsTable tr` | period index of the row |
| `data-load` / `data-del` | modal buttons | `saved:<id>` \| `hist:<id>` |

All list handling is **delegated** — listeners sit on `#periodsTable`, `#diagram`,
`#termsTable`, `#modalBack` and match by `data-` attribute. Never introduce
index-bearing IDs for generated rows.

### 3.3 State classes

| Class | Applied by | Means |
|---|---|---|
| `.active` | JS | current `.tab-btn`, `.mode-btn`, `.chip`, `.lang-btn` |
| `.changed` | JS | a value differs from automatic. On `#rateDerived` and on `#periodsTable tr`. **This class alone gates the `↻` button**: `.reset-auto` is always in the DOM, and on a non-`.changed` row it must be `cursor:default` with no affordance, or every row reads as dirty. |
| `.solved` | JS | the input currently holding the answer (paired with `readOnly`) |
| `.sel` | JS | this term is selected — on SVG `.term`, on `.mterm`, and on `#termsTable tr.term` |
| `.dim` | JS | on the diagram `<svg>` while something is selected; fades unselected terms |
| `.copied` | JS | transient confirmation on `#copyBtn` / `#saveBtn`, ~1.3s |
| `.open` | JS | `#modalBack` is showing |
| `.best` / `.failed` | JS | on `.method-card` — fastest converger / did not converge |

### 3.4 The highlight mechanism — do not break this

One **term id** is shared by three things: the arrow group in the SVG, the typeset formula
term (`g.mterm`), and the row in `#termsTable`. Clicking any of them calls `selectTerm(id)`,
which toggles `.sel` on every element with that `data-term` and `.dim` on the `<svg>`.
That is the whole of the bidirectional highlighting.

Term ids are `p<t>` for a single period and `g<from>-<to>` for a collapsed run.

Each `.term` group contains a `rect.halo` (opacity 0, raised to 1 by `.sel`) and a
`path.flow-line`. Both class names are load-bearing. Inside the typeset maths, the actual
glyphs carry `.mglyph`.

### 3.5 Bilingual text

Every element with `data-i18n` has its `innerHTML` captured once into `el._en`. Switching
to Thai sets `textContent` from the `TH` table; switching back restores `_en`. A
`.mode-btn` may therefore contain a `<span class="th">` sub-label in English which is
**replaced wholesale** in Thai — that is intended. Adding a new label means adding both
the attribute and a `TH` entry.

### 3.6 Input classes and number behaviour

- `.amt` — receives live thousands separators with caret preservation on every `input`
  event. Money fields are `type="text" inputmode="decimal"`, **never** `type="number"`.
  Counts, periods and percentages are plain `type="number"` and get no separators.
- `input.cf` — the per-period override inputs inside `#periodsTable`; also `.amt`.
- `.ovr` — `#fPerRate`, the manual rate-per-period override.
- Every numeric readout carries `font-variant-numeric: tabular-nums`. Figures must align
  down a column.

### 3.7 Structural invariants

- `#diagram` is an empty host; JS writes a complete `<svg>` into it. The SVG is built as a
  string, so it must remain a single element with a `viewBox` and `class="diagram-svg"`.
- `.diagram-svg` has `min-width: 620px` inside a scrolling `.diagram-wrap` on wide
  screens, and no min-width below 620px, where the **vertical layout** is used instead.
  The switch is driven by `matchMedia('(max-width: 620px)')` in JS — if that breakpoint
  moves in CSS, move it in JS too, or the wrong layout renders.
- `#periodsDetails`, `#iterDetails` must keep a working `open` property: their contents are
  rendered lazily on the `toggle` event.
- `#solverCard` and `#amortDetails` are shown and hidden by JS via `style.display`.
- The `↻` buttons (`.reset-auto`) are always present in the DOM. Visibility is purely the
  parent's `.changed` class.

## 4. Free to change

Colours, the gradient wash, type scale, spacing, radii, shadows, icon choices, card order
within a step, the look of tabs and toggles, breakpoint values (subject to §3.7), the
legend, the modal's presentation, button styling and ordering in `.actions-row`.

Inside the SVG: stroke weights, arrowhead shape, the halo colour, lane spacing, how the
grouped-run brace is drawn, and the convergence graph's grid and legend placement. The
per-method colours live in the `METHODS` table in JS and are used by both the graph and
the method cards — change them in one place and both follow.

## 5. Things worth preserving, and why

- **The diagram is the answer, not an illustration of it.** The result boxes exist so a
  figure can be copied quickly; the diagram is what the tool is for. Give it room, and
  keep it above the fold on a laptop once a result exists.

- **The lane layout reproduces the textbook picture.** Timeline along the bottom, one lane
  per cash flow fanning out above it, each lane ending in `= value` in a fixed right-hand
  column. The earliest cash flow takes the highest lane. This is the shape a Thai finance
  textbook draws, and matching it is the point — a user should recognise the picture before
  reading a word of the interface.

- **The right-hand label column is fixed-width for both directions.** FV arrows run right
  and PV arrows run left, but the values always land in the same column. That is what keeps
  the two modes readable as the same diagram.

- **Grouping is never silent.** When runs are collapsed, the segment says `×24`, the
  working table says `3–26 (×24)`, and `#expandBtn` offers the way out. A tool that quietly
  dropped periods would be lying about the arithmetic.

- **`.changed` + `↻` is the repo's auto-with-override rule.** Every computed value here —
  the rate per period, every individual period's cash flow — is overridable and restorable.
  Do not style `.reset-auto` so it looks live on clean rows.

- **The solved field shows its answer as a placeholder, not a value.** That is what lets the
  user switch which quantity is unknown without losing what they typed. Keep the visual
  distinction between "this is your number" and "this is the answer" — currently the
  `.solved` background — or the two become indistinguishable.

- **Three steps, numbered.** Money, then time and rate, then the unknown. The order is the
  order the question is actually asked in.

- **Compound and simple are one engine, not two.** Every factor goes through `accrue()` /
  `discountF()`, so the solvers, the diagram and the working table needed no special cases.
  Two things do change visibly and should stay changed: `#earLabel` becomes *Total interest
  factor* (a simple-interest rate has no effective annual equivalent), and the amortisation
  schedule is withheld, because paying a loan down on a simple-interest basis is a different
  instrument rather than a variation of this one.

- **The rate solver is floored at `rateFloor()`.** Under simple interest the objective has a
  pole at −1/t for every flow, and a pole is a sign change without being a root — bisection
  will bracket it and report it as an answer. The floor keeps every method inside the domain
  where all factors stay positive, and any root at or below it is rejected. Do not widen the
  search range without keeping that guard.
