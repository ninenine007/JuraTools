# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a Thai corporate lawyer working at a desktop computer in an office. Colleagues may use links shared by the author. Users need dependable working instruments, not marketing pages or generic legal content.

## Product Purpose

JuraTools is a collection of local-first legal, numerical, and drafting tools. It turns recurring professional calculations and structured reasoning tasks into inspectable browser workflows. Success means that a user can enter the relevant facts, see the mathematical or legal working, preserve the model, and obtain a trustworthy result without sending client data to a server.

## Positioning

Each JuraTools page is a self-contained professional instrument that exposes its assumptions and working. The tools support a lawyer's judgment; they do not replace it or silently infer legal meaning from user data.

## Operating Context

JuraTools is used mainly in current desktop Safari and Chrome under ordinary office lighting. Tools may be opened directly from disk or served as static files. Work is often saved locally, exported to a file, printed, or handed to another JuraTools page. Inputs may include confidential client or matter data.

## Capabilities and Constraints

- Static HTML, CSS, and vanilla JavaScript with no build step or framework.
- Browser-only computation, no runtime API, analytics, or data upload.
- One self-contained HTML file per tool unless several tools genuinely share a domain engine.
- Exact arithmetic where rounding would change a legal or mathematical answer.
- Versioned local persistence and explicit import/export for reusable work.
- English working UI; Thai is included only where a tool's legal domain requires it.
- Desktop-first for dense workbenches, with an honest usable narrow-screen state.
- Calculations show the working and distinguish invalid inputs, zero outcomes, unsupported methods, and estimates.
- Nothing is cleared, truncated, or overwritten silently.

## Brand Commitments

The product name is JuraTools. The voice is concise, professional, and explicit about scope. Existing tools use native system typography, a light office-oriented palette, compact controls, restrained semantic color, and a visible statement that all processing remains in the browser. Decorative elements must communicate state or structure.

## Evidence on Hand

- `HOUSE-STYLE.md` records the repository's established build and interface conventions.
- `DESIGN.md` records the incumbent workbench language for the transaction-structure surface.
- Existing tools and collection hubs are the source of truth for navigation, persistence, export, print, and local-only behavior.
- The user supplied reference images covering permutation, combination, stars and bars, probability, and the binomial theorem.
- No customer claims, benchmarks, or external endorsements are available and none should be invented.

## Product Principles

1. Help the user think by making the model visible before showing the answer.
2. Keep computation exact, reproducible, and independently checkable.
3. Treat user-defined entities and labels as neutral data; the user decides their real-world meaning.
4. Preserve agency through explicit controls, warnings, and reversible local state.
5. Prefer a complete, inspectable working tool over decorative presentation.

## Accessibility & Inclusion

Use semantic HTML, keyboard-operable controls, visible focus treatment, sufficient contrast, responsive reading order, reduced-motion support, and status announcements for long-running operations.
