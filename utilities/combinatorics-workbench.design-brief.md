# Combinatorics Workbench — Phase 1 brief

## Scope and mode

Operate. A professional, English-only, desktop-first reasoning tool inside the JuraTools Utilities collection. The visualization is output-only.

## Job

Let a user define abstract members and groups, choose or diagnose a combinatorial model, apply practical constraints, obtain an exact count, inspect the mathematical calculation, visualize representative outcomes, and optionally generate every outcome locally.

## Phase 1 methods

- Permutations with and without repetition
- Combinations with and without repetition
- Multiset arrangements
- Subsets and power sets
- Circular permutations
- Multinomial allocation
- Distinct-member distribution to labeled groups
- Stars and bars with lower and upper bounds
- Addition and multiplication rules

## Phase 1 constraints

Required and excluded members; together and separated members; fixed position or group; labeled-group minimum and maximum capacity; empty/non-empty groups; exact/minimum/maximum tag counts; adjacency/non-adjacency; and allocation lower/upper bounds. Phase 1 combines active rules with AND.

## Inputs and outputs

Quantity rows support a label, quantity, identical/distinct identity mode, and tags. Named individuals are rows with quantity 1. Also support one-name-per-line paste, fixed-column CSV import, six editable templates, local named saves, JSON reopen, and small URL shares. Results show one compact model-summary sentence, exact arbitrary-precision count, dual notation, concise mathematical working, cross-check status, selected output-only visualization, and deterministic outcomes.

## Performance and privacy

All work stays in the browser. Formula counts update live when cheap; constrained work requires Calculate and becomes visibly stale after edits. Generate All is explicit, cancellable, deterministic, and has no artificial cap. Warn above 10,000 outcomes; show a high-risk warning above 1,000,000 outcomes or roughly 100 MB and recommend streamed export. Support CSV, JSON, and TXT export plus browser print. Share URLs disclose that their contents are readable by recipients; anonymized export is available.

## Layout and direction

Three-zone analytical desk: model setup at left, a large output-only evidence field in the center, and mathematical result/working at right. On narrow screens the zones become tabs. Use the established JuraTools light workbench language with the math accent `#ea580c`, flat office-paper surfaces, compact native controls, tabular figures, and semantic status colors. The memorable moment is changing one structural assumption and watching the model summary, formula, exact count, and visualization change together.

## Shipped visual system

**Creative North Star: “The Counting Desk.”** The implemented surface treats a counting problem as a visible working model before it becomes a number. Warm office chrome surrounds a white evidence sheet; compact paper controls and graphite rules keep the tool practical, while burnt orange identifies mathematical action and current state. The center visualization is deliberately an output surface, never an editor.

### Colors

- **Paper** (`#ffffff`): top bar, result pane, evidence sheet, controls, and raised working surfaces.
- **Warm Ground** (`#f4f3f1`): application ground and print-adjacent neutral.
- **Quiet Panel** (`#f9f8f6`): setup pane and subdued control surfaces.
- **Evidence Field** (`#eeece8`): dotted drafting ground behind the white sheet.
- **Graphite Ink** (`#202124`) and **Muted Graphite** (`#68696e`): primary and secondary text.
- **Rule** (`#dad8d3`): pane divisions, table structure, and control boundaries.
- **Burnt Orange** (`#c44d12`): primary actions, the JuraTools mark, active visualization tabs, progress, and model stamps. **Bright Math Orange** (`#ea580c`) is the basis of the translucent focus treatment; **Soft Orange** (`#fff0e6`) supplies restrained active backgrounds, while text selection uses a pale orange field (`#fed7aa`).
- **Member Blue** (`#edf5ff` fill, `#244f7d` text, `#bdcbe0` border): selected members and representative outcome objects.
- **Green** (`#167247` / `#eaf8f0`): saved, exact, and independently verified states.
- **Amber** (`#9a5a0a` / `#fff7df`): stale, method, and generation-risk states.
- **Red** (`#b42335` / `#fff0f1`): invalid, destructive, and error states.

**The One Orange Voice Rule.** Burnt orange marks agency and mathematical state; do not spread it across passive surfaces or use the semantic colors decoratively.

### Typography

The operating UI uses the native sans stack (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `Segoe UI`, sans-serif) at a compact 13px / 1.45 base. Pane titles are 14px; controls are 12px at weight 650; field labels are 10.5px; and tracked uppercase section labels are 10.5px at weight 800. Tabular figures keep counts and outcome indices stable.

Exact results and mathematical working switch to Georgia with Times New Roman fallback. The exact count is 28–42px at weight 600 and the working is 17px / 1.6. This serif is evidence typography, not a general display face.

**The Serif Proves the Work Rule.** Use serif type only for exact numerical results and mathematical expressions; navigation, labels, controls, and explanations remain native sans.

### Layout and responsive behavior

The 56px top command rail sits above a viewport-height three-column grid. At full width the columns are 310px setup, a flexible evidence field with a 460px minimum, and 350px results. At 1100px they tighten to 280px, a 420px-minimum center, and 320px. The setup and result panes scroll independently while the evidence field holds a toolbar, scrollable canvas, and generation rail.

The evidence canvas uses a 20px point grid and 30px inset around a centered white sheet. The sheet is at most 820px wide, at least 540px tall, and uses 34px internal padding. Its visualization stage reserves at least 360px so the model remains dominant even before generation.

At 900px and below, the three columns become one-pane-at-a-time `Model`, `Visual`, and `Result` tabs beneath the sticky top bar. Project title, save state, and secondary desktop commands leave the narrow header. At 560px and below, the brand wordmark is hidden, sheet and canvas padding contract, paired fields become one column, and result actions stack. Print becomes a two-column report: evidence plus a 340px result column, without application chrome, generation controls, roadmap, canvas grid, sheet shadow, or sheet border.

**The Evidence Dominates Rule.** The center sheet is the visual subject on desktop; setup and result panes support it rather than becoming equivalent card columns.

**The Honest Narrow State Rule.** Narrow screens retain the complete workflow through explicit tabs; never squeeze all three zones into an unreadable miniature desk.

### Elevation and shapes

The shell is flat and separated by one-pixel rules. Elevation is reserved for the orange brand mark (`0 3px 9px rgba(196,77,18,.25)`), active tabs (`0 1px 4px rgba(30,28,24,.08)`), the evidence sheet (`0 8px 26px rgba(37,31,24,.08)`), toast (`0 10px 30px rgba(0,0,0,.2)`), and modal dialog (`0 28px 80px rgba(24,18,12,.25)`).

Controls use compact 7–9px corners: inputs 7px, buttons and working containers 8px, tab groups 9px, and dialogs 14px. The evidence sheet and its mathematical objects are squarer: the sheet uses 4px corners, while slots and group boxes use 5px and member chips 6px. Capsules are reserved for statuses, method chips, and progress.

**The Flat Desk, Lifted Evidence Rule.** Persistent panes stay flat; only the working sheet, transient feedback, and direct state controls earn shadow.

### Components and states

- **Primary button:** 32px minimum height, 8px corners, 7px by 10px padding, burnt-orange fill, white text. Neutral buttons are white with a warm gray rule; destructive intent appears red on hover rather than at rest.
- **Fields:** white fill, 1px warm-gray border, 7px corners, 34px minimum height, and 7px by 8px padding. Focus moves the border toward orange and adds a translucent 3px orange outline.
- **Tabs:** segmented warm-gray track with 6px inner corners. Active tabs rise onto white; entry tabs use graphite text, visualization and narrow-navigation tabs use orange text.
- **Status pills:** compact uppercase capsules. Neutral means phase/context, amber means stale or caution, and green means exact or saved.
- **Evidence sheet:** white office paper with a thin rule, quiet shadow, title and model summary at top, method stamp at upper right, output visualization in the center, and an explicit local-only/output-only footer.
- **Model objects:** position slots and allocation groups are warm paper boxes; selected members are restrained blue chips; stars are orange disks with a white inset ring; outcome lists use a compact sticky-header table.
- **Result block:** warm-orange summary panel, oversized serif exact count, serif formula lines, amber method capsule, and green or amber verification panel. Invalid and unsupported states become explicit red panels rather than blank results.
- **Dialogs and feedback:** a white 14px-radius dialog sits over a 42% warm-graphite backdrop; short status messages use a dark toast that rises 20px while fading in.

Button color and border transitions run for 150ms; toast movement and opacity run for 180ms. Reduced-motion preference removes all transitions and animation. Keyboard focus uses a visible 3px translucent-orange outline with 2px offset, tab lists support arrow/Home/End navigation, progress and feedback use live regions, and dialog opening makes the underlying application inert.

### Surface guardrails

- Keep the working model, exact count, formula, and visualization visually synchronized around the same orange action voice.
- Keep the evidence visualization output-only and state that boundary in the sheet footer and empty state.
- Preserve warm neutral paper, thin graphite rules, compact native controls, and semantic status colors.
- Do not turn the setup sections or result working into a loose dashboard of floating cards.
- Do not use the serif as decorative branding or use orange as an all-purpose highlight.
- Do not remove the visible stale/exact/error distinction, the local-only statement, reduced-motion behavior, or the dedicated print composition.

## Phase boundaries

Phase 2 adds nested OR/NOT logic, safe expressions, multi-stage models, cases, side-by-side comparison, and both decision-tree types. Phase 3 adds advanced methods (derangements, partitions, Stirling/Bell/Catalan, Burnside, recurrence, pigeonhole) and approximate counting. Phase 1 may expose these as a roadmap but must not pretend they are implemented.
