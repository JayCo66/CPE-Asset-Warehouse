# Member 1 Inventory Dashboard Improvement Report

Date: 2026-10-23

Scope: Follow-up phases 1–4 covering threshold semantics, server-side search/export, mobile usability, and verification, plus a stacked mobile asset-register layout. The prior Issue 1 / Scope 3 pass is retained below as history.

## Outcome

The Member 1 inventory dashboard derives its summaries and analysis from the local warehouse API, labels its data source and date, and uses unavailable states rather than sample metrics when confirmed data is absent. Inventory search now covers the complete latest snapshot server-side. CSV export supports both the current page and all records matching the active search and filters. Snapshot comparison uses real adjacent snapshots and shows an empty state when history is missing. The asset register now keeps its desktop table and presents prioritized stacked cards on phones, using the same fetched rows and existing search, filters, pagination, and export controls. The inactive workspace-menu control was removed; existing module navigation remains.

No database schema or production data was changed. The existing response fields and pagination behavior remain intact; the API summary is additive. Borrowing, returning, maintenance, and repair workflows were not changed.

## Follow-up pass — stacked mobile asset register (2026-10-23)

### Implementation

- Kept the existing table presentation at tablet and desktop widths. At widths up to 720px, the table is replaced visually and in the accessibility tree by a semantic list of stacked asset cards; both presentations are rendered from the existing `assetApiState.rows` and make no additional API request.
- Each card prioritizes the available asset name, asset code, status, category, and location. Secondary API fields are inside native, keyboard-operable `<details>` / `<summary>` disclosure. Missing category/location values remain unavailable markers; no inventory values are inferred or fabricated.
- Preserved the existing detail route, Thai text, and CPE design tokens. The disclosure and detail link meet the 44px minimum touch-target size and have visible keyboard focus styling. Tablet continues to use the existing horizontally scrollable table and its scroll cue.
- Search, category/type and status filters, pagination, current-page export, and all-matching export are unchanged. No schema, API contract, fetch path, business logic, or out-of-scope module changed.

### Verification

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` with the local live API integration enabled | Passed, 34/34 tests, including responsive-layout regressions and read-only API integration |
| PHP lint: `assets_api/fact_asset_inventory.php`, `assets_api/inventory_query.php` | Passed; no syntax errors |
| `php tests/fact_asset_inventory_api.test.php` | Passed, 7/7 tests |
| `node --check src/asset-inv/app.js` and `node --check tests/asset-inv-responsive.test.mjs` | Passed |
| `git diff --check` | Passed; Git emitted line-ending normalization warnings only |
| Browser check — 390×844 | Passed in headless Edge against the local connected app: cards visible, table absent from the accessibility tree, disclosure opened, API data present, no page/console errors |
| Browser check — 768×1024 | Passed in headless Edge: existing table visible, cards absent, horizontal-scroll cue present, no page/console errors |
| Browser check — 1280×900 | Passed in headless Edge: desktop table visible, cards absent, cue absent, no page/console errors |
| Impeccable detector — 390×844 / 768×1024 / 1280×900 | Rendered all viewports; reported 18 / 19 / 21 heuristic findings respectively. These are design findings, not test failures. Documented CPE palette matches and intentionally nested card/table surfaces account for many; two existing overview text elements remain 11.68px. |

The viewport checks used the bundled Chromium-backed detector and isolated headless Edge browser scenarios; no physical device or touch hardware was available. Keyboard operation follows native disclosure semantics and visible focus styling, but was not manually exercised with a physical keyboard. Safari and Firefox were not available for this pass. At 768px and 1280px, the existing fixed back-to-top control can overlap table content near the bottom of a scrolled view; it was not changed because that control is outside this focused layout change. The mobile view does not show that overlap against the inspected card details.

### Accessibility and responsive review

- The mobile representation is a labeled list with one list item/article per asset, a level-three asset heading, definition-list labels for key values, and native details disclosure. The desktop table is hidden from assistive technology when the cards are active, avoiding duplicate rows.
- The disclosure summary and detail link have at least 44px height, retain keyboard focus visibility, and do not rely on status color alone. Horizontal scrolling remains available for the tablet/desktop table; the page itself remains vertically scrollable.
- Impeccable static detection still reports `hero-eyebrow-chip` on the hidden dynamic placeholder and an existing `side-tab` accent. The viewport detector also reports CPE-token palette matches and nested-surface/card patterns; the palette is documented by `docs/design-guide.md`, and the mobile card grouping is intentional for this requested layout.

### Impeccable audit and critique

**Audit Health Score: 16/20 — Good.** Accessibility 3/4, Performance 3/4, Theming 3/4, Responsive Design 3/4, Implementation Integrity 4/4. Mobile record scanning and touch disclosure improve the responsive experience, while tablet still requires horizontal panning and the existing floating control can overlap the table near the bottom.

**Design Health Score: 33/40 — Good, unchanged from the previous critique.** The mobile card layout improves readability and recognition, but the unresolved threshold meaning, absent historical snapshot, dense operational controls, and task-help gap remain. The score was intentionally not raised solely for adding a responsive presentation.

The installed Impeccable CLI exposes `detect` and `critique-storage`, but not executable `audit` or `critique` commands. Accordingly, the audit and 10-heuristic critique were completed manually against the installed skill guidance and paired with the actual detector and browser results above; no automated audit/critique command is claimed. The critique review was single-context because no sub-agent tool was available. A new critique snapshot and score trend are recorded separately in `.impeccable/critique/`.

Stored critique trend: **25/40 → 31/40 → 33/40 → 33/40**. The latest saved review is `.impeccable/critique/2026-10-22T20-12-39Z__src-asset-inv-index-html.md`.

### Files changed in this pass

- `src/asset-inv/sections/asset-register.html`
- `src/asset-inv/app.js`
- `src/asset-inv/styles.css`
- `tests/asset-inv-responsive.test.mjs`
- `IMPROVEMENT_REPORT.md`
- `.impeccable/critique/` (generated latest critique snapshot)

Remaining broader issues are unchanged: only one actual warehouse snapshot is available, query scaling has not been benchmarked at larger data volumes, user-facing task help is absent, and cross-browser/device/touch validation remains outstanding.

## Follow-up pass — 2026-10-23

### Phase 1 — Server-side search and export

- Added bounded, validated `q`, `status`, and `type` filters to `assets_api/fact_asset_inventory.php`; search now spans every record in the latest snapshot and the available asset, type, category, department, and location fields.
- The API uses fixed SQL columns and prepared parameters, escapes `LIKE` wildcard characters, and keeps existing response fields/pagination while adding `matchedTotal`, effective `page`, and complete-snapshot filter options.
- Kept current-page CSV export and added an all-matching CSV endpoint. The latter uses the same filters, ignores page boundaries, fetches rows in 500-record keyset batches, and avoids building the result set in browser memory.
- CSV output retains Thai headings, includes a UTF-8 BOM, neutralizes formula-like values, and returns headings only for zero matches. Search input is limited to the API's 200-character bound.
- Added an opt-in live API integration test. Against the local read-only MySQL API, it found a record from the final page via search, verified combined filters, checked the all-match CSV bytes/Thai heading/row count, checked an empty export, and confirmed invalid input is rejected.

### Phase 2 — Mobile UI and typography

- Added a visible short Thai search label, a 200-character input limit, and a concise placeholder.
- Preserved the wide table with horizontal scrolling; added a visible small-screen scroll cue and a named, keyboard-focusable table region.
- Raised inventory summary, table-heading, and secondary row text sizes; added space around wrapped CSV buttons; and increased the row-detail link to a 44px minimum touch target.
- Kept existing CPE colors/tokens, Thai font fallback stack, breakpoints, and compact back-to-top control with safe-area positioning. No unrelated module styling or business logic was changed.

### Phase 3 — Verification and audit

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` with `WAREHOUSE_API_BASE_URL=http://127.0.0.1:8000/assets_api/fact_asset_inventory.php` | Passed, 31/31 tests including live read-only API integration |
| PHP lint for `assets_api/fact_asset_inventory.php` and `assets_api/inventory_query.php` | Passed |
| `php tests/fact_asset_inventory_api.test.php` | Passed, 7/7 regression tests |
| `node --check` for changed application and integration-test modules | Passed |
| `git diff --check` | Passed; only existing Git line-ending normalization warnings |
| Live API data check | Passed: latest snapshot `2026-10-22`, 4,324 rows, 10 rows per page, four status options, 62 type options, no previous snapshot |
| Impeccable URL scan at 1280×900 | Rendered; 21 detector findings reported. The CLI returned exit 1, which its help defines as a partial scan where at least one target could not be scanned. |
| Impeccable URL scan at 390×844 | Rendered; 10 detector findings reported. Same partial-scan exit status. The remaining mobile text-size findings are in the overview date and unknown-age note; other findings include documented CPE palette usage and nested surfaces. |
| Edge/CUA interactive browser, screenshot, console, and manual DOM inspection | Not completed: the selected Edge automation service could not start. The Impeccable headless URL scans exercised both viewport sizes, but they do not substitute for interactive visual/browser verification. |

#### Impeccable audit

**Audit Health Score: 16/20 — Good.** The Implementation Integrity verdict is pass: the Member 1 dashboard follows a coherent CPE system, uses real database data, and labels unavailable/undefined information instead of fabricating it.

| Dimension | Score | Evidence / limitation |
| --- | ---: | --- |
| Accessibility | 3/4 | Labeled controls, live status regions, skip link, keyboard-focusable table region, visible focus styles, and 44px mobile controls are present; screen-reader/keyboard flows were not exercised live. |
| Performance | 3/4 | Search and pagination are server-side; all-match CSV uses 500-row keyset batches and bounded PHP memory. Contains-search over joined fields has not been benchmarked at larger scale. |
| Theming | 3/4 | Existing CPE tokens and Thai font fallback are reused. Detector color warnings match documented CPE primary/status colors. |
| Responsive design | 3/4 | Mobile controls stack, table scrolls horizontally with a cue, and back-to-top uses safe-area offsets. Interactive tablet/device behavior remains unverified. |
| Implementation integrity | 4/4 | No fixture metrics/history, parameterized SQL, formula-safe exports, and no schema/data or out-of-scope module changes. The static hidden-placeholder finding is a false positive. |

Remaining audit findings:

- **[P2] Search scaling:** `%term%` matching across multiple joined fields can require broad scans. Measure latency as the warehouse grows; do not change schema/indexes without approval.
- **[P2] Mobile table width:** the 1,160px register still requires horizontal panning, although the cue, keyboard region, typography, and detail-button target are improved.
- **[P3] Small overview notes:** the final 390×844 scan still flags the snapshot-date and unknown-age-note text below 12px.
- **[P3] User help:** controls have inline hints, but there is no task-oriented help surface.

The live URL detector returned 21 desktop findings at 1280×900 and 10 mobile findings at 390×844. The mobile findings were two remaining small overview text items, three CPE palette matches, and five nested-surface matches. The CPE palette is required by `docs/design-guide.md`; the nested-surface warnings are existing summary/table composition, not a broken workflow. Detector invocations exited 1, which the CLI documents as indicating that at least one target could not be scanned, so these are partial scans rather than clean passes. The static scan also reported one `hero-eyebrow-chip` in the hidden dynamic module placeholder (false positive).

#### Impeccable critique

**Design Health Score: 33/40 — Good**, up from 31/40 in the prior report. All ten heuristics apply to this operational dashboard.

| # | Heuristic | Score | Key issue |
| --- | --- | ---: | --- |
| 1 | Visibility of System Status | 4/4 | Connected/loading/error states, snapshot date, result count, and export scope are visible. |
| 2 | Match System / Real World | 3/4 | Thai inventory language is clear; the threshold flag remains undefined pending owner confirmation. |
| 3 | User Control and Freedom | 4/4 | Search, filters, refresh, current/all export, page sizes, and direct page selection are available. |
| 4 | Consistency and Standards | 3/4 | Existing CPE tokens and control patterns remain; the operational table is dense. |
| 5 | Error Prevention | 4/4 | Query input is bounded, SQL parameters are bound, export scope is explicit, and CSV formulas are neutralized. |
| 6 | Recognition Rather Than Recall | 4/4 | Filters, matched totals, snapshot dates, and both export scopes are stated in the interface. |
| 7 | Flexibility and Efficiency | 3/4 | Whole-snapshot search/export and pagination are available; no shortcuts or saved views exist. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The dashboard remains task-focused and uses the established visual system; the register still spans a wide table. |
| 9 | Error Recovery | 3/4 | Errors offer refresh guidance and no sample fallback; live interactive error recovery was not exercised. |
| 10 | Help and Documentation | 2/4 | Inline export and scroll guidance exist, but no task-oriented help is available. |
| **Total** |  | **33/40** | **Good** |

Design specificity is product-specific and operational, grounded in CPE inventory fields, the live warehouse, snapshot dates, and Thai labels. The strongest improvement is data trust: search now reaches records beyond the loaded page, exports have explicit scopes, and the undefined flag is not presented as low stock. The main remaining concerns are the unconfirmed threshold semantics, missing history/audit data, and horizontal navigation through a wide mobile table.

Priority issues are **P2** threshold meaning (obtain a data-owner answer), **P2** missing previous snapshot/annual-count source (supply real data/API support), **P2** wide mobile table (validate whether a responsive row/card alternative would help), and **P3** task help (add only if staff need guidance beyond inline labels). No P0/P1 issue was found.

The cognitive-load review is moderate: the table is dense and several search/filter/export/page controls appear in one grouped area, but result scope, active filters, and dated comparison values are now explicit. The most relevant personas are the warehouse administrator (threshold meaning/history), the keyboard/screen-reader user (accessibility hooks exist, but live use was not tested), and the mobile user (horizontal panning remains necessary).

This critique was a **degraded single-context** review because no sub-agent tool was exposed. The Edge CUA service could not start, so no screenshot, manual DOM inspection, console review, or interactive resizing was possible. The Impeccable URL scans did render the live page at both requested viewport sizes. No overlay injection was attempted without a mutable browser tab. The PHP server was already running for the user and was left running.

### Current remaining issues and next steps

- **P2 — Threshold semantics:** retain the undefined label until the data owner answers the documented questions. Do not change the flag's calculation meanwhile.
- **P2 — Historical/audit data:** ingest a real prior snapshot and provide per-asset annual-count confirmation through an approved data/API contract before displaying trends or audit progress.
- **P2 — Mobile table:** horizontal scrolling is now cued and keyboard reachable, but the 1,160px-wide register still requires panning on a phone. A rendered Edge/device check should confirm the affordance and the back-to-top control's position.
- **P2 — Search scale:** substring matching uses `LIKE` over multiple joined fields. It worked against the current 4,324-row snapshot; measure query time as the warehouse grows before considering a schema/index/search-service change.
- **P3 — User help:** inline export scope and table-scroll guidance are present, but there is no task-oriented help surface.
- **Browser coverage:** run interactive Edge/Chrome and Safari/Firefox checks when browser automation is available; verify touch gestures, zoom, reduced motion, and actual downloaded CSV behavior.

### Files changed in this follow-up pass

- `assets_api/README.md`
- `assets_api/fact_asset_inventory.php`
- `assets_api/inventory_query.php` (new)
- `src/asset-inv/app.js`
- `src/asset-inv/index.html`
- `src/asset-inv/inventory-api.mjs` (new)
- `src/asset-inv/sections/asset-register.html`
- `src/asset-inv/sections/overview.html`
- `src/asset-inv/styles.css`
- `tests/asset-inv-api.test.mjs` (new)
- `tests/asset-inv-content.test.mjs`
- `tests/asset-inv-responsive.test.mjs` (new)
- `tests/fact_asset_inventory_api.test.php` (new)
- `tests/fact_asset_inventory_api.integration.test.mjs` (new; opt-in live test)
- `IMPROVEMENT_REPORT.md`
- `.impeccable/critique/2026-10-22T19-45-29Z__src-asset-inv-index-html.md` (generated critique snapshot)

## Previous pass details — Issue 1 / Scope 3

### 1. Data source reliability

- Removed fabricated dashboard counts, age-band values, exception records, readiness comparisons, and annual-audit progress.
- Added read-only `summary.current` and `summary.previous` aggregates to `assets_api/fact_asset_inventory.php`, including totals, readiness, threshold flags, location coverage, age bands, and snapshot date.
- The dashboard identifies connected MySQL data and its date. On failure or incomplete summary data, it shows unavailable states and no invented metrics.
- Detail and register dates now say “วันที่ชุดข้อมูล” / “ข้อมูล ณ วันที่” and use the explicit `snapshot_date` field instead of implying a per-asset update timestamp.

### 2. Export accuracy

- CSV export uses only rows currently loaded by the API and matching the active search, status, and type filters.
- The search field visibly says it searches the current page. The export button and adjacent note disclose that only matching rows on the current page are exported; other pages are excluded.
- Thai headings are retained. CSV cells are quoted, prefixed with a UTF-8 BOM, and neutralized against spreadsheet formula execution.
- Export is disabled when the API is unavailable or no rows match; it cannot silently export fixture data.

### 3. Snapshot comparison

- Added comparison of actual latest and immediately previous snapshots, including counts, count deltas, and valid percentage-point changes, with Thai date labels.
- When no previous snapshot is available, the dashboard explains that no historical comparison can be calculated. No historical rows are generated.
- Current warehouse data contains one snapshot (`2026-10-22`), so the comparison table correctly remains in its empty state until historical snapshots are available.
- Annual audit progress also remains an empty state because the API does not provide per-asset audit confirmation status.

### 4. Workspace menu

- Removed the inert “เปิดเมนูพื้นที่ทำงาน” control and its unused styles.
- Kept the existing data-driven module navigation links for inventory, borrowing, and maintenance unchanged.

## Previous pass verification (historical)

| Check | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | Passed, 22/22 tests |
| PHP lint for `assets_api/fact_asset_inventory.php` | Passed |
| `node --check` for `src/asset-inv/app.js` and `src/asset-inv/inventory-data.mjs` | Passed |
| `git diff --check` | Passed; Git emitted only existing line-ending normalization warnings |
| Read-only local API GET | Passed: 4,324 rows; current snapshot `2026-10-22`; no previous snapshot; 10 rows returned for page 1 |
| Edge browser at 1280×900 and 390×844 | Both rendered; connected state, real summary, current date, no-history state, visible page-only search/export scope, and removal of the workspace control verified in rendered DOM/screenshots |
| Search/filter behavior | Browser scenario and unit tests confirmed a unique search returns only its matching row from the current API page |
| CSV file download | Export construction and row filtering are unit-tested. The browser harness cancelled the download, so a saved file was not independently inspected. |

The browser console also reported one unrelated `favicon.ico` 404. No other page errors were observed. Browser validation was performed in Edge only; cross-browser visual testing was not run.

## Previous pass Impeccable audit and critique

Method: dual-agent critique (A: `01a164fd-3bf8-7d31-badf-53b755e7e986`; B: `01a164fd-3dde-7261-aa45-f196adc375f3`), followed by a manual review of the rendered Edge page and the detector. Detector-overlay injection was unavailable, so screenshots and rendered DOM were used as evidence. The two agents could not launch nested reviewer agents in their isolated contexts.

### Synthesized design health score

| # | Heuristic | Score | Assessment |
| --- | --- | ---: | --- |
| 1 | Visibility of system status | 4/4 | Connected/error/unavailable states and data date are explicit. |
| 2 | Match with the real world | 3/4 | Thai inventory language is clearer; the business meaning of the threshold flag remains ambiguous. |
| 3 | User control and freedom | 3/4 | Refresh, filters, pagination, and export work; search/export intentionally cover only the loaded page. |
| 4 | Consistency and standards | 3/4 | Existing design tokens and module navigation are retained; dense table typography remains. |
| 5 | Error prevention | 4/4 | No sample metrics on failure; export scope is explicit and spreadsheet formulas are neutralized. |
| 6 | Recognition rather than recall | 3/4 | Snapshot dates and missing-history reasons are visible; threshold semantics need a verified definition. |
| 7 | Flexibility and efficiency | 3/4 | Page-size and page selection remain available; there is no all-matching-record export/search API. |
| 8 | Aesthetic and minimalist design | 3/4 | Hierarchy and responsive layout remain coherent; the detector notes dense text and nested surfaces. |
| 9 | Error recovery | 3/4 | Failure states and refresh guidance are present; a live API-failure state was not simulated in-browser. |
| 10 | Help and documentation | 2/4 | API contract is documented, but there is no user-facing explanation for threshold semantics or page-local search beyond its label. |
| **Total** |  | **31/40** | **Good** |

The stored Impeccable critique on 2026-10-22 scored 25/40; this synthesis scores 31/40 after the data provenance, export, comparison, and workspace-menu changes.

### Detector and remaining findings

The final detector run reported 1 static warning, 47 desktop findings (1280×800), and 29 mobile findings (390×844). The command exits with status 2 when it finds patterns; this is a findings result, not a test failure. Main remaining findings:

- Small supporting text and table headings (including a 10.88px table-heading measurement) reduce legibility, especially on mobile.
- Dense nested-card styling and a missing horizontal-scroll cue for the wide mobile inventory table remain polish opportunities.
- The floating back-to-top control can overlap content while scrolling on mobile; it was left unchanged to keep this pass focused on the four requested issues and avoid unrelated navigation changes.
- A detector palette warning overlaps the project’s documented CPE action-gradient palette; no conflicting colors were introduced.
- The hidden/dynamic module placeholder and asset-detail route contribute hero-chip findings that are not visible on the initial inventory dashboard.

## Previous pass blockers (see current status above)

- **Historical comparison:** only one actual snapshot is available. Historical ETL retention is needed before a previous-period delta can be shown.
- **Audit status:** the current API has no per-asset annual audit confirmation data. Adding it would require new API/business data support and was not invented here.
- **Global search/export:** the current API paginates records and has no server-side search/export contract. This implementation clearly states page-local scope rather than fetching or exporting unrelated pages. Supporting all matching rows requires a separately approved API change.
- **Download verification:** CSV contents and filters pass unit tests, but the browser harness cancelled the download before the resulting file could be inspected.
- **Responsive polish:** the mobile table-scroll cue, back-to-top overlap, and small text are follow-up UI work, not blockers for the four requested issues.

## Previous pass files

- `assets_api/README.md`
- `assets_api/fact_asset_inventory.php`
- `src/asset-inv/app.js`
- `src/asset-inv/index.html`
- `src/asset-inv/inventory-data.mjs` (new)
- `src/asset-inv/sections/analysis.html`
- `src/asset-inv/sections/asset-detail.html`
- `src/asset-inv/sections/asset-register.html`
- `src/asset-inv/sections/overview.html`
- `src/asset-inv/styles.css`
- `tests/asset-inv-content.test.mjs` (new)
- `tests/asset-inv-data.test.mjs` (new)
- `tests/asset-inv-navigation.test.mjs`
- `IMPROVEMENT_REPORT.md` (new)
- `.impeccable/critique/2026-10-22T19-15-24Z__src-asset-inv-index-html.md` (generated critique record)

Other pre-existing dirty/untracked worktree files were left untouched.
