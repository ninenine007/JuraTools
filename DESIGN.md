---
name: "JuraTools Transaction Structure Workbench"
description: "A compact, local-first corporate drafting environment for truthful transaction states."
colors:
  workspace-chrome: "#ececf2"
  drafting-field: "#e9e9ef"
  paper: "#ffffff"
  panel: "#f8f8fb"
  ink: "#1c1c1e"
  muted: "#6e6e73"
  line: "#d9d9e1"
  line-strong: "#b9bac5"
  corporate-purple: "#6d28d9"
  corporate-purple-bright: "#7c3aed"
  corporate-purple-soft: "#f0eafe"
  connector-graphite: "#303038"
  relation-blue: "#2463a5"
  success-green: "#177245"
  warning-amber: "#a45b08"
  danger-red: "#c92a3a"
  grid-dot: "#c8c8d2"
  formal-frame-head: "#f7f5fc"
typography:
  canvas-headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Noto Sans Thai, sans-serif"
    fontSize: "18px"
    fontWeight: 750
  app-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Noto Sans Thai, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    letterSpacing: "-0.25px"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Noto Sans Thai, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Noto Sans Thai, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Noto Sans Thai, sans-serif"
    fontSize: "10.5px"
    fontWeight: 650
  section-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Noto Sans Thai, sans-serif"
    fontSize: "10.5px"
    fontWeight: 800
    letterSpacing: "0.68px"
rounded:
  node: "3px"
  frame: "4px"
  compact: "7px"
  control: "8px"
  surface: "9px"
  toolbar: "10px"
  dialog: "14px"
  capsule: "999px"
spacing:
  hairline: "4px"
  tight: "6px"
  control: "8px"
  compact: "10px"
  regular: "12px"
  panel: "14px"
  dialog: "18px"
  frame-inset: "24px"
components:
  button-primary:
    backgroundColor: "{colors.corporate-purple}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  button-workhorse:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.compact}"
    padding: "7px 8px"
  stage-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "10px 9px"
  canvas-toolbar:
    backgroundColor: "rgba(255,255,255,0.96)"
    textColor: "{colors.ink}"
    rounded: "{rounded.toolbar}"
    padding: "5px"
  drafting-frame:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
    size: "700px x 620px"
  entity-node:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.node}"
    size: "160px x 68px"
  inspector-tab-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.corporate-purple}"
    typography: "{typography.label}"
    padding: "12px 4px"
---

# Design System: JuraTools Transaction Structure Workbench

## Overview

**Creative North Star: "The Spatial Closing Table"**

JuraTools is a light-theme, local-first workbench for legal tasks, not a presentation layer. Its inherited character is dense but familiar: system typography, native controls, restrained borders, one decisive accent, and no ornament that does not reveal state. The transaction workbench carries that discipline into a spatial editor where before, closing, and after are adjacent truthful states rather than disconnected diagram files.

The workbench-specific world is a corporate drafting table: cool office chrome surrounds white export frames; a visible point grid makes placement measurable; graphite relationships and typed flow colors make structure legible; corporate purple marks selection, action, and navigation. Controls remain compact so the transaction stays dominant. Presentation comes from the ordered frame sequence and the precision of the drawing language, not from decorative illustration.

**Key Characteristics:**

- Laptop-first three-part workbench with commands overhead, stages at left, drafting field in the center, and inspector at right.
- White low-radius frames and nodes on a visible 20px measurement grid.
- Corporate purple reserved for selected, active, focused, and primary-command states.
- System typography with Thai-capable fallback and compact workhorse density.
- Local-only project state, reusable entity and theme libraries, and frame-based export.

**The Truthful State Rule.** A transaction stage is a data state with one or more independently arranged views; visual changes must never imply that separate frame files are the source of truth.

## Colors

The shell uses cool near-neutrals, white paper, graphite ink, and one corporate-purple action voice. Green, amber, red, and blue communicate specific legal-structure or system states; they are not decorative alternatives.

### Primary

- **Corporate Purple:** Primary commands, the active stage number, selected canvas objects, active tabs, note markers, and focus treatment.
- **Bright Selection Purple:** The stronger selection stroke used on a selected export frame.
- **Soft Corporate Purple:** Quiet selected backgrounds for active tools, status pills, and numbered action markers.

### Secondary

- **Relationship Blue:** Loan and debt connectors, their arrowheads, and debt labels.
- **Success Green:** Saved-local status, cash flows, and positive advisory panels.
- **Warning Amber:** Advisory ownership warnings and the Board Paper theme accent.
- **Danger Red:** Business-transfer flows, lifecycle strike-throughs, and destructive hover states.

### Neutral

- **Workspace Chrome:** The cool outer application background.
- **Drafting Field:** The central canvas ground beneath the measurement grid.
- **Paper:** Top bar, inspector, controls, nodes, and the default export-frame surface.
- **Panel:** Quiet side-panel fill and hover fill for the editable project name.
- **Ink:** Primary UI and formal-frame text.
- **Muted:** Metadata, helper text, inactive tabs, and field labels.
- **Line / Strong Line:** Shell dividers, control strokes, and formal-frame boundaries.
- **Connector Graphite:** Default ownership relationships and arrowheads.
- **Grid Dot:** One-pixel points repeated across the drafting field.
- **Formal Frame Head:** The faint purple-tinted header strip inside the default frame.

Three built-in frame themes change exported diagram material without recoloring the app shell:

| Theme | Paper | Header | Ink | Accent | Border | Connector |
| --- | --- | --- | --- | --- | --- | --- |
| Formal purple | `#ffffff` | `#f7f5fc` | `#1c1c1e` | `#6d28d9` | `#bbbcc7` | `#303038` |
| Board paper | `#fffefb` | `#f5f3ed` | `#24231f` | `#8a4d14` | `#bdb8ad` | `#3c3933` |
| Blueprint | `#f7fbff` | `#e9f3ff` | `#102a43` | `#2463a5` | `#9db8d2` | `#234f78` |

Entity fill is independent of the frame theme. The built-in choices are white plus restrained purple (`#efe9ff`), teal (`#dff5f2`), amber (`#fff0c2`), blue (`#dfeeff`), and red (`#fde2e4`) tints.

**The Purple Signals Action Rule.** Use corporate purple for agency and current state; keep the exported structure mostly paper and graphite so purple remains meaningful.

**The Semantic Connector Rule.** Ownership is graphite, control is purple dashed, loan and debt are blue dashed, cash is green, and business or asset movement is red dashed.

## Typography

**Display Font:** None; this is an operating surface.

**Body Font:** Native system sans with SF Pro Text, Segoe UI, and Noto Sans Thai fallbacks.

**Label/Mono Font:** The body stack is reused; numeric readouts use tabular figures rather than a separate monospace face.

**Character:** The type system is neutral, compact, and bilingual-capable. Hierarchy comes from weight, case, and small changes in size rather than a display family.

### Hierarchy

- **Canvas Headline** (750, 18px): Export-frame titles.
- **Dialog Headline** (700, 17px): Native dialog titles.
- **App Title** (700, 14px): JuraTools brand title; the editable project title is slightly smaller at 13.5px.
- **Body** (400, 13px): Global UI text and input content.
- **Control** (650, 12px, line-height 1): Buttons and canvas-tool commands.
- **Label** (650, 10.5px): Field names and compact metadata.
- **Section Label** (800, 10.5px, 0.68px tracking, uppercase): Inspector and panel section headings.
- **Drawing Microcopy** (700-800, 7.6-10.5px): Connector labels, notes, node types, status text, and the `TRANSACTION VIEW` frame tag.

**The No Display Type Rule.** Do not introduce a decorative or editorial font into the workbench; the transaction diagram is the visual subject.

**The Case Carries Structure Rule.** Reserve uppercase, tracked text for short categorical labels and statuses, never body instructions or legal notes.

## Layout

The application occupies the viewport and suppresses document scrolling. At widths above 900px it uses a 56px top bar over three columns: a fixed 236px stage rail, a central `minmax(440px, 1fr)` drafting field, and a fixed 306px inspector. The top bar spans all three columns; its right edge holds undo, redo, checkpoint, project-file, and export commands. The inspector aligns three equal tabs over one scrollable contextual panel.

The drafting field is an SVG world over a 20px radial grid. The sample opens as three 700px by 620px frames spaced 70px apart, showing before, closing, and after in one overview. `Overview` fits every frame inside the viewport; `Focus` centers the active frame with 55px breathing room and caps scale at 115%. Wheel zoom is cursor-centered and constrained to 25-180%. Empty-space drag pans; object drag snaps to 5-unit increments. Automatic layout uses 135px vertical levels and distributes siblings horizontally.

Frames use a 60px header and 24px horizontal inset. The common entity instance is 160px by 68px. Ownership connectors are orthogonal; transaction flows are cubic. Frame dimensions and entity dimensions remain editable in the inspector, and `Match previous` can copy shared entity geometry from the parent stage without removing later manual adjustments.

At 900px and below, editing is intentionally unavailable. The app shell is replaced by a centered information card that asks the user to reopen on a wider screen and links back to Corporate Tools. There is no compressed tablet or phone editor. The fixed side columns plus the 440px center establish a practical shell minimum of 982px even though the hard replacement breakpoint is 900px.

**The Three-Zone Rule.** Keep transaction sequence, spatial evidence, and contextual precision visible together on laptop screens.

**The Frame Is the Export Rule.** The canvas may feel infinite, but the white frame is the explicit output boundary; keep every exportable title, node, connector, flow, and note inside it.

**The No Silent Narrowing Rule.** Do not collapse the editor into a misleading narrow layout; below the supported breakpoint, state the laptop requirement plainly.

## Elevation & Depth

The workbench is flat by default. One-pixel dividers and tonal changes define the shell; shadows are reserved for objects that float above it: the brand mark, active stage, canvas toolbar, dialogs, and toasts. Nodes use a small drawn shadow inside SVG to read as movable diagram objects without turning the frame into a card stack.

### Shadow Vocabulary

- **Ambient Surface** (`0 8px 30px rgba(25,22,43,.09)`): General raised surface token and the narrow-screen information card.
- **Brand Mark** (`0 3px 9px rgba(109,40,217,.28)`): Purple identity mark only.
- **Active Stage** (`0 2px 8px rgba(42,31,74,.06)`): Barely lifted current-stage row.
- **Canvas Toolbar** (`0 5px 18px rgba(29,26,49,.1)`): Floating tool cluster over the grid.
- **Dialog** (`0 28px 80px rgba(24,18,45,.28)`): Modal separation over a 40% graphite backdrop.
- **Node Offset** (3px right, 4px down, 42% opacity): SVG-only object depth.

**The Flat Shell, Lifted Tools Rule.** Persistent panels stay flat; only transient or directly manipulable surfaces earn elevation.

## Shapes

The interface combines softly rounded work controls with precise drafting geometry. Inputs and the brand mark use 7px corners, buttons 8px, stage and action rows 9px, the canvas toolbar 10px, and dialogs 14px. Drafting frames use only 4px and entity nodes 3px, preserving a technical-document silhouette. Capsules are limited to compact status pills.

Borders are normally one pixel. Selection increases stroke weight instead of adding glow inside the SVG: frames rise to 2px or 2.4px on focus; nodes to 2.2px or 2.4px; connectors and free-form items to roughly 2.6px. Lifecycle strike-through is a deliberate 3.2px red diagonal with round ends.

**The Drafting Geometry Rule.** The closer an element is to exported legal structure, the squarer and more line-defined it becomes.

## Components

### Buttons

- **Shape:** Compact workhorse rectangles with gently rounded corners (8px).
- **Primary:** Corporate-purple fill, white text, 7px by 10px padding; used for creation confirmation, checkpoints, and frame export.
- **Secondary:** White fill with a neutral line; hover shifts the border and text toward purple over a near-white tint.
- **Danger:** Neutral at rest; destructive intent appears on hover through a pale red fill, red text, and red-tinted border.
- **Disabled:** 40% opacity with the pointer cursor removed.
- **Focus:** The global 3px translucent-purple focus ring remains visible outside the control.

### Inputs / Fields

- **Style:** White, one-pixel neutral stroke, 7px corners, and 7px by 8px padding. Labels sit above at 10.5px and weight 650.
- **Focus:** Border shifts to a lighter purple and gains a 3px translucent-purple outer outline.
- **Grouping:** Two related values may share a two-column row with an 8px gap; textareas begin at 68px and resize vertically.
- **Behavior:** Inspector edits commit on `change`, join the undo history, rerender the model, and autosave.

### Navigation

- **Top bar:** A 56px white command rail with brand, Corporate Tools breadcrumb, editable project name, saved-local status, and right-aligned history/file/export controls.
- **Stage rail:** Each row combines a numbered square, stage name, action/view counts, and a trailing dot. The active row becomes white, gains a light-purple border and slight lift, and turns its number and dot purple.
- **Inspector tabs:** Three equal text tabs. The active tab uses purple text and a 2px purple bottom rule; inactive tabs remain muted.

### Canvas Toolbar

The toolbar is a compact floating white cluster over the grid. It groups selection and model creation, free-form drafting, layout/view controls, and zoom with one-pixel separators. Active-tool state uses the soft-purple fill. Zoom percentage is tabular and fixed-width enough not to disturb neighboring controls.

### Drafting Frame

The signature export container is 700px by 620px in the sample, with a low 4px radius, one-pixel theme border, 60px theme header, categorical tag, title, action/entity count, and an optional notes footer. Selection affects only its outer stroke. Frame language can be English, Thai, or bilingual; this choice controls titles, entity labels, and structured notes together.

Frames begin with one of three reusable themes: Formal Purple, Board Paper, or Blueprint. A frame may locally override accent, paper, header, and connector colors. `Save as personal theme` stores the merged result as a named reusable theme; `Reset overrides` clears only the frame-level overrides.

### Entity Node and Connectors

The common node is a 160px by 68px low-radius rectangle with centered entity name, optional type line, optional numbered-note marker, and a small offset shadow. A single entity snapshot may have multiple linked visual instances, so layout can vary without duplicating legal identity. Dissolved and merged states reduce opacity and add a red diagonal strike plus uppercase lifecycle status.

Relationship arrows run holder-to-company. Ownership uses a graphite orthogonal line; control uses a purple dashed line; loan/financing uses a blue dashed line. Transaction flows are curved and dashed, with cash green, debt blue, and business or asset transfer red. Text uses a white paint-order halo so labels remain legible across lines.

### Advisory and Feedback States

Validation is advisory. Ownership totals above 100% or materially below 100% appear in an amber bordered panel; a non-blocking result appears in green. Short commit messages appear as dark toasts for 2.6 seconds. The top bar exposes `Saving...`, `Saved locally`, or `Storage unavailable` as persistent text status.

### Keyboard and Focus Behavior

Native controls retain browser keyboard behavior and native dialogs. Outside an input, textarea, or select, `Cmd/Ctrl+Z` undoes and `Cmd/Ctrl+Shift+Z` redoes. Arrow keys move a selected entity instance or free-form item by 5 units; holding Shift moves by 20. `Delete` or `Backspace` removes selected instances, relations, flows, and free-form items. `Escape` clears selection.

Every selectable frame, node, relation, flow, and free-form item is keyboard-focusable and carries a role and accessible label. Canvas focus is shown by a thicker purple object stroke rather than the global outline. Other controls use a 3px translucent-purple `:focus-visible` ring with 2px offset. Shortcuts are suspended while a text-entry or select control has focus.

### Local State and Project Files

Project state autosaves after a 180ms debounce to `juratools_transaction_workbench_v1`. It contains the project name, stages, views, active IDs, checkpoints, and settings. The personal entity library is separate at `juratools_transaction_entity_library_v1`; personal theme definitions are separate at `juratools_transaction_theme_library_v1`. All three stay in the current browser profile and no runtime network is used.

Undo and redo are memory-only, capped at 80 undo snapshots, and do not survive reload. Camera position, zoom, selection, open inspector tab, and dialog state are also session-only. Named checkpoints are stored inside project state; a checkpoint snapshot omits the checkpoint list, and restoring one preserves the current list.

`Download backup` exports project state only as a formatted `.juratools-transaction.json` file. It does not include the separate personal entity library or personal theme library. Per-frame theme overrides travel with the project, but a referenced personal theme definition does not. Import replaces the project state after checking for stage and view arrays; reset restores the sample project but does not clear the separate personal libraries.

**The Local Boundary Rule.** Never describe autosave, checkpoints, personal libraries, project backup, undo history, and camera state as one storage layer; each has a distinct persistence boundary.

### Export

Export always renders the active frame alone and removes editor selection styling. The English frame title is slugged for the filename, with `diagram` as fallback. SVG preserves the frame's native width and height and embeds the drawing CSS. PNG rasterizes the same SVG at 2x dimensions over a white backing. PDF opens a new landscape document with 8mm page margins and invokes the browser print dialog; if the new window is blocked, a toast asks the user to allow pop-ups. Editable PowerPoint is outside the implemented export set.

## Do's and Don'ts

### Do:

- **Do** keep commands compact and keep the three-frame transaction legible in the first laptop viewport.
- **Do** use white frames and precise graphite geometry to distinguish export truth from the gray drafting field.
- **Do** preserve advisory validation and permit manual adjustment after typed transaction actions.
- **Do** show active, selected, focused, saved, warning, and lifecycle states explicitly in text or stroke as well as color.
- **Do** treat English, Thai, and bilingual frame language as one coordinated frame setting.
- **Do** explain which data travels in a project backup and which personal libraries remain browser-local.

### Don't:

- **Don't** turn each stage into an unrelated file, card, or document whose data can silently diverge.
- **Don't** use purple as broad decoration; reserve it for agency, selection, focus, and the formal frame accent.
- **Don't** round drafting frames and nodes into soft consumer cards.
- **Don't** hide the measurement grid, export boundary, stage sequence, or contextual inspector on the supported laptop layout.
- **Don't** claim a mobile editor exists; the implemented narrow view is an informational fallback only.
- **Don't** imply PDF is generated in-app or that PNG remains vector; PDF uses browser print and PNG is a 2x raster.
