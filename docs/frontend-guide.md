# Frontend Design Guide: Floating Module Navigation

> **Purpose:** Define a scalable, credible, accessible dashboard experience using a floating global module switcher instead of a persistent sidebar. Apply the anti-vibecoded design principles as a critical review framework—not a checklist of visual trends to ban.
>
> **Scope:** Design and implementation guidance only. Module names, counts, routes, permissions, dashboard metrics, and business data must come from the application, not this document.

## 1. Product and design intent

Build a content-first, modular web application with a restrained **floating module navigation** near the top of the workspace. It should read as genuine application navigation, not a decorative segmented control or an animated landing-page element.

**Proposed brand qualities** (validate against the actual product): **clear, dependable, precise, practical, calm**.

Core principles:

- Navigation is obvious; content remains the focus.
- Distinctiveness comes from product-specific information hierarchy, precise typography, useful interaction, and authentic workflows—not gratuitous decoration.
- Make the UI feel designed for real operational work: high information density where appropriate, legible data, predictable controls, and clear statuses.
- Reuse existing brand assets, components, tokens, and conventions before inventing a new visual language.
- Do not assume any fixed number or list of modules.

## 2. Information architecture

Use a two-level navigation hierarchy:

1. **Global module navigation:** Switches between independently routed modules.
2. **Local module navigation:** Switches between views within the active module, only when those views exist.

Page structure:

```text
Application shell
├── Compact application header
│   ├── Brand / application identity
│   └── Global utilities and user actions
├── Floating module navigation (global)
├── Active module header
│   ├── Contextual title and description (when useful)
│   └── Contextual actions (when available)
├── Local navigation (optional, module-specific)
└── Main route content
    └── Module-owned layouts, data, states, and workflows
```

Avoid adding a redundant heading for every layer. Keep contextual controls close to their related content.

## 3. Floating module navigation

### Visual treatment

- Place a compact, horizontally oriented floating navigation surface near the top of the content region, visually separated from the application header.
- Use a restrained border, subtle elevation *if needed*, and a deliberate radius. A pill silhouette is acceptable; do not over-round every component in the system.
- Center the switcher when it fits naturally; allow alignment to adapt when there are many modules or a narrow viewport.
- Make the selected module identifiable through more than color alone: consider background, weight, shape, or an indicator.
- Use icons only when they add recognition. Do not automatically assign an icon or emoji to every module.
- Avoid default purple gradients, glassmorphism, glowing blobs, rainbow accents, excessive shadows, and ornamental motion unless the actual brand warrants them.

### Behavior and data ownership

- Render navigation from **application-owned module metadata**, not hardcoded arrays in the shared layout.
- Support changing module counts, labels, order, visibility, icon availability, authorization, and nested routes.
- Keep access control authoritative in the application/backend; hiding a link is not a security boundary.
- Derive the active module from the router, including deep links and child routes.
- Use actual navigation links for URL changes; preserve browser back/forward and direct-link behavior.
- Do not let navigation styling depend on a particular module's name or URL string.
- Preserve the active module's visibility when the list overflows.

### Scaling beyond a few modules

- **Roomy desktop:** Display the visible set while it fits within a sensible maximum width.
- **Crowded desktop:** Introduce horizontal scrolling with affordances, or an accessible overflow menu; choose based on task frequency and discoverability.
- **Tablet:** Allow bounded scroll or compact overflow; never shrink text until labels become unreadable.
- **Mobile:** Consider a compact current-module picker or accessible horizontally scrollable tabs. Ensure the trigger clearly communicates that it switches modules.
- Do not wrap the floating navigation into multiple unpredictable rows by default.
- Avoid layout shift when labels change, permissions load, or the selected module changes.

## 4. Local navigation and module content

- Each module owns its own subnavigation and content structure.
- Display local navigation only when it adds value; do not invent tabs solely for visual symmetry.
- Distinguish global module selection from local page selection through placement, scale, and styling.
- Put search, filtering, bulk actions, and record-level controls near their relevant content rather than in the global module switcher.
- Support tables, forms, charts, lists, detail views, and workflows without forcing each module into identical three-card or bento-grid layouts.
- Avoid fabricated counts, fake user activity, testimonial-style content, and decorative placeholder charts. In real implementations, show data from actual sources or transparently labeled fixtures.
- Include meaningful empty, error, permission-denied, and loading states. Use skeletons only where they help with genuine asynchronous waiting.

## 5. Visual system: intentional, not template-driven

### Typography

- Select typefaces based on readability, language coverage, and existing brand character—not because they are fashionable defaults.
- Establish a coherent type scale for application titles, module headers, controls, table data, labels, and supporting text.
- Use typography and whitespace to express hierarchy before adding borders, cards, or colors.
- Keep dense operational data legible; tabular numerals may help with numeric columns.

### Color and surfaces

- Derive a compact palette from established brand tokens or product context: neutrals, a restrained primary accent, and semantic success/warning/error states.
- Maintain sufficient contrast across default, hover, active, disabled, and focus states.
- Use accent colors intentionally for actions and state—not as decorative fill on every card.
- Avoid making every panel the same elevated rounded rectangle. Group content by meaning, with dividers or spacing where simpler.

### Layout and spacing

- Define spacing, radii, borders, surfaces, and elevation as reusable tokens.
- Keep primary content widths appropriate for the material: wide for tables, controlled for reading and forms.
- Preserve alignment between module header, subnavigation, and content.
- Prefer real workflow requirements over artificial symmetry or repetitive dashboard tiles.

### Motion

- Use restrained transitions only to clarify hover, selection, expansion, or route context.
- Avoid animated arrows, perpetual glowing elements, exaggerated slides, and ornamental floating movement.
- Respect `prefers-reduced-motion`; do not make understanding the current state depend on an animation.

## 6. Responsive and accessible interaction

- Use semantic `<nav>` landmarks with distinguishable accessible names for global and local navigation.
- Use links for route navigation; indicate the current destination with `aria-current` as appropriate.
- Provide clear keyboard focus, predictable tab order, and full keyboard access to overflow menus or module pickers.
- Maintain touch-friendly target sizes and readable labels across viewports.
- Ensure selected, hover, focus, and disabled states are visually distinct without relying only on color.
- Test very long labels, translated UI strings, zoomed text, reduced motion, and restricted permissions.
- Preserve orientation and context for screen-reader users when changing modules.

## 7. Technical architecture

Suggested responsibilities, adaptable to the existing framework:

| Concern | Responsibility |
| --- | --- |
| Application shell | Shared header, overall layout, content boundaries |
| Module registry / navigation adapter | Reads authorized, ordered, app-provided module metadata |
| Floating module navigation | Renders visible modules, active state, overflow, accessible navigation |
| Active module resolver | Maps the current nested route to its owning module |
| Module layout | Module heading, contextual actions, optional local navigation |
| Module content | Module-specific screens, workflows, data, and states |
| Design tokens | Shared typography, colors, spacing, focus, borders, and elevation |

Implementation constraints:

- Integrate with the project's existing router and design system.
- Keep module navigation config separate from presentational code; treat any examples as schematic, not source data.
- Preserve deep links, route transitions, URL state, browser history, forms, API contracts, and permission boundaries.
- Avoid unnecessary dependencies and large rewrites of unrelated UI.
- Do not force all modules into one common dashboard schema unless their requirements genuinely align.

## 8. Anti-vibecoded review process

Use the attached **Anti-Vibecoded Website Skill** as a review lens. Its examples are *signals to investigate*, not prohibited components.

### Step 1 — Understand

Inspect real screens and code; identify product purpose, user roles, brand assets, existing patterns, responsive breakpoints, and frequent workflows. Establish whether the floating switcher improves access to real modules.

### Step 2 — Audit with evidence

Record each issue as **present**, **not present**, or **unknown**, with the affected screen/component, evidence, severity, and proposed adjustment. Do not claim visual problems solely from source-code inspection.

Audit areas:

- Template-like gradients, purple SaaS defaults, glows, glass effects, and redundant shadows.
- Identical card silhouettes, repetitive three-column KPI layouts, decorative grids, and overused icons.
- Weak typographic hierarchy, generic product copy, invented statistics, and content that does not reflect real workflows.
- Gratuitous motion, inaccessible navigation, misleading active states, awkward overflow, and small-screen usability.
- Broken or missing empty/error/loading states; relevant legal or privacy links where required by the product, flagged for review rather than fabricated.

### Step 3 — Prioritize

Fix broken flows, deceptive claims, permissions, keyboard access, contrast, and responsive issues before aesthetic refinements.

### Step 4 — Define visual direction

Confirm 3–5 brand adjectives and an intentional system of typography, palette, spacing, surfaces, and a limited number of distinctive motifs grounded in the product.

### Step 5 — Implement targeted changes

Reuse the actual components and preserve working behavior. Keep changes focused, reviewable, and consistent with the project structure.

### Step 6 — Verify

Run available build, lint, and tests. Inspect mobile, tablet, desktop, keyboard navigation, focus states, contrast, reduced motion, deep links, back/forward, long labels, and overflow. Explicitly document checks that could not be completed.

## 9. Expected delivery format for an implementation or audit

When applying this guide to a real repository, provide the following report:

### A. Audit report

| Area | Finding and evidence | Status (present / not present / unknown) | Severity (High / Medium / Low) | Recommended change |
| --- | --- | --- | --- | --- |
| Navigation | To be inspected in the actual project | unknown | — | Verify module overflow, route-derived selection, and keyboard behavior |
| Visual consistency | To be inspected in actual screenshots | unknown | — | Check existing typography, color, shadows, and repetitive components |
| Responsive behavior | To be tested | unknown | — | Validate compact navigation and long labels |

*This table is a starting template, not a completed audit.*

### B. Design direction

Document brand personality, visual principles, typography, palette, layout, navigation behavior, and motion decisions.

### C. Implementation

List changed file paths, describe the reason for each change, and identify any preserved interfaces/contracts.

### D. QA results

List executed build/tests, viewport checks, accessibility checks, route and permission regression checks, and anything not verified.

### E. Before / after summary

Identify 3–8 concrete improvements and any remaining follow-up work, based on observed changes rather than marketing claims.

## 10. Acceptance criteria

- [ ] The app uses floating global module navigation rather than a persistent global sidebar.
- [ ] Module labels, counts, routes, and permissions are not hardcoded in the floating navigation component.
- [ ] Nested routes correctly identify and highlight their parent module.
- [ ] Back/forward, direct links, and local navigation behave correctly.
- [ ] Overflow works for additional modules and long labels at common breakpoints.
- [ ] Keyboard, screen-reader, focus, contrast, touch, and reduced-motion behavior are addressed.
- [ ] The design uses authentic product content and task-relevant component layouts.
- [ ] Decorative gradients, icons, shadows, cards, and animation are justified rather than automatically added or banned.
- [ ] Existing features, forms, APIs, SEO needs, and permissions remain intact.
- [ ] Any claimed design improvements and QA results are supported by actual inspection or tests.

---

**Design north star:** A confident, practical dashboard that uses floating navigation to make modules easy to discover and switch, while allowing the product's real workflows—not AI-template conventions—to determine the interface.

**Source incorporated:** User-provided `SKILL.md` (`anti-vibecoded-website`), including its audit methodology, visual warning signs, accessibility/product-readiness priorities, and reporting format. No repository or working interface was audited as part of writing this guide.
