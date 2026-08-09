# Design brief — Thai Personal Income Tax Calculator

Companion to `thai-pit-calculator.html`. This file exists so a restyle can move
anything visual without breaking the calculation engine. **Everything under
"Locked contract" is read or written by JavaScript.** Everything else is yours.

---

## What the tool is

An approximate Thai PIT estimator. Income is entered per Revenue Code §40
category, the tool applies the statutory เหมา expense deductions, itemised
ค่าลดหย่อน with their real shared cap-groups, the §40(4) final-tax elections, and
the progressive rates — ending at refund or further tax payable.

Single self-contained HTML file, vanilla JS in one IIFE, no build step, no
network. Same house pattern as `thai-wht-calculator.html`.

## Page structure

```
nav.nav                    sticky breadcrumb → index.html
div.summary-bar            sticky live totals (sits below nav at top:52px)
div.hero                   title + Thai subtitle
div.wrap
  card                     Taxpayer — age/disability, spouse, decimals, rounding
  card                     Income by category — §40(1)…(8) + §48(5) severance
  card                     Allowances — family / insurance / retirement / other / donations
  card                     Tax already paid — WHT, P.N.D. 94
  card > details.rules     Rates, brackets & caps (collapsed)
  card                     Result — waterfall + three amount boxes
  card                     Bracket breakdown
  card #electCard          §40(4) election comparison (hidden when no §40(4) income)
  card                     Headroom & marginal effect
  div.actions-row          Copy summary · Reset everything
footer                     citations + disclaimer
```

---

## Locked contract

### Element IDs read or written by JS

**Taxpayer / global**
`tpElderly` `tpSpouse` `decimals` `rounding` `elderlyAmtLbl` `sevMinLbl`

**Income — fixed fields**
`s1` `s2` `s3kind` `s3amt` `s4int` `s4div` `s4noCredit`
`autoElect` `forceWrap` `forceInt` `forceDiv`
`s7amt` `s7act` `s7actWrap` `s7actAmt`
`sevOn` `sevWrap` `sevAmt` `sevYears`

**Income — dynamic line hosts and their add buttons**
`lines5` `lines6` `lines8` — innerHTML is regenerated wholesale by `renderLines()`
Add buttons are matched by attribute, not id: `[data-add="5"|"6"|"8"]`

**Allowances** — rendered wholesale by `renderAllowances()` into
`allowFamily` `allowIns` `allowRet` `allowOther` `allowFree`
Group meters: `grpLH` `grpRET` `grpDON`
Donations: `don2x` `donGen`

**Credits** `crWht` `crPnd94`

**Rules** `rulesPanel` `brkRows` `ruleGroups` `resetRules` `addBrk`

**Results**
`waterfall` `brkTable` `electCard` `electTable` `electNote`
`headroomTable` `minTaxNote`
`boxNet` `boxNetSub` `boxTax` `boxTaxSub`
`boxSettleWrap` `boxSettleLabel` `boxSettle` `boxSettleSub`

**Sticky bar** `barNet` `barTax` `barEff` `barMarg` `barSettleK` `barSettle`

**Row notes written on every repaint**
`mid-s1` `mid-s2` `mid-s4int` `mid-s4div` `mid-s7` `mid-don2x` `mid-donGen`
`note-s12` `note-s3` `note-s4` `note-sev`
plus one per allowance: `mid-al-<key>` and `al-<key>` (see keys below)

### Data attributes — structural, do not rename

| Attribute | Meaning |
|---|---|
| `data-add="5\|6\|8"` | "add another line" button for that category |
| `data-cat` `data-i` | on `.line` — which category and which index |
| `data-f="sub\|rate\|amt\|act\|actAmt"` | field role inside a `.line` |
| `data-del` | remove-line button inside a `.line` |
| `data-calc` | per-line "gross − expenses = net" note target |
| `data-al="<key>"` | an allowance input |
| `data-free="<i>"` / `data-ff="l\|amt\|cap"` | free-form allowance row and its fields |
| `data-rk="<ruleKey>"` | a rule input in the rules panel |
| `data-rreset="<ruleKey>"` | that rule's reset-to-auto button |
| `data-rrow="<ruleKey>"` | the rule's row wrapper (gets `.changed`) |
| `data-brk="<i>"` / `data-bf="upto\|rate"` | bracket row and its fields |
| `data-brkdel="<i>"` | remove-band button |

### State classes — JS toggles these, style them however you like

| Class | Applied to | Meaning |
|---|---|---|
| `.changed` | `.rule`, `.brk-row` | value differs from default; **reveals the reset-to-auto button** |
| `.full` | `.grp-used`, `.meter i` | a cap-group is at its ceiling |
| `.warn` | `.grp-note`, `.callout` | something disallowed or needing attention |
| `.best` | `#electTable tr` | cheapest election |
| `.copied` | `#copyBtn` | transient post-copy state |
| `.total` `.sub` `.hl` `.muted` `.ind` | `table.data tr`/`td` | waterfall row weights; `.ind` = indented detail row |
| `.green` `.rose` `.plain` | `.amount-box`, `.sum-v` | refund vs. payable vs. neutral |

**Important:** `.reset-auto` buttons are *always in the DOM* and made
interactive purely by the parent's `.changed` class. If you restyle them, keep
the rule that a non-`.changed` row's button is non-interactive
(`cursor:default`, no affordance) — otherwise every row looks editable-dirty.

### Input classes

- `.amt` — right-aligned money input that receives **live thousands separators**
  via `liveFormat()`. Any new money input must carry `.amt` and be registered in
  `AMOUNT_IDS` (fixed fields) or handled by the delegated line/allowance/free
  handlers. Number inputs (counts, percentages) must **not** get `.amt`.

### Allowance keys (used in `al-<key>`, `mid-al-<key>`, `data-al`, and rule keys `cap_<key>` / `unit_<key>` / `pct_<key>`)

```
personal spouse child1 child2 parent disabled maternity
life health parHealth spLife
pvd gpf rmf annuity nsf
homeLoan sso party
```

`personal` and `spouse` render **disabled** inputs whose value JS overwrites —
they are outputs wearing an input's clothes. `spouse` is driven by the
`tpSpouse` checkbox in the Taxpayer card, not by its own field.

---

## Free to change

Colours, type scale, spacing, radii, shadows, backgrounds, the gradient wash,
card order *within* a section, icon choices, breakpoints, whether the rules
panel is a `<details>` or something else (as long as `#rulesPanel` still has an
`open` property — if you replace it, the `toggle` listener and
`S.rulesOpen` persistence need rewiring).

The three-column `.result-boxes` grid, the `.row` grid, and the `.line-grid`
are all plain CSS grid — retemplate freely.

## Things worth preserving

1. **The sticky bar is the whole point of the layout.** With twenty allowances,
   the tax figure must stay visible while scrolling inputs. It sits at
   `top: 52px` because the nav is 52px — move one, move the other.
2. **Cap-group meters teach the rule.** `used X / cap Y` plus the per-member
   breakdown is why the tool beats a bracket table. Don't reduce them to a bare
   number.
3. **The nav crumb ellipsises below 620px** and the wordmark hides below 430px.
   "Personal Income Tax" is longer than the other tools' crumbs and will wrap
   into the back button without this.
4. **Wide tables scroll inside `.tbl-wrap`,** never the body.
5. **The "verify" tag** (`.verify-tag`) marks figures that are my reading rather
   than settled fact. It should stay visually distinct from ordinary hints.

---

## Figures seeded as editable defaults — verify before relying on them

The tool is deliberately **year-agnostic**: there is no tax-year selector. Every
rate, bracket, cap and threshold is a pre-filled editable input in the rules
panel with per-field reset-to-auto. Defaults reflect the long-stable structural
rules, not any particular year's stimulus measures — use the free-form allowance
rows for those.

Carrying a `verify` tag in the UI:

| Rule | Default | Why flagged |
|---|---|---|
| `exp3Share` | off | Whether §40(3) copyright shares the §40(1)+(2) 100,000 ceiling or has its own. Shipped as *separate* ceilings. |
| `minTaxDeMin` | 5,000 | The §48(2) de-minimis carve-out. The 0.5% rate and 120,000 threshold are solid; this figure is not. |
| `sevZeroBand` | off | Reading that the 150,000 zero-rate band does **not** apply inside the §48(5) severance computation, because Royal Decree 470 attaches to net income under §48(1). |

Also worth a look, though unflagged: SSF and Thai ESG are **not** shipped as
named rows — if they apply, use a free-form row with its own ceiling, since
whether they sit inside or outside the 500,000 retirement group is exactly the
kind of thing that moves.

## Not modelled (v2)

- Joint vs. separate filing for two earning spouses (§57 ฉ). The spouse
  *allowance* is in; the two-column comparator is not.
- The full Royal Decree No. 11 §40(8) schedule — twelve common types plus
  "Other — set the rate".
- Scenario save/compare, CSV export.
