# Member 1 Inventory Dashboard Improvement Report

Date: 2026-10-23

Scope: Impeccable Issue 1 — clarify sample versus connected data; Scope 3 covering all four identified issues.

## Outcome

The Member 1 inventory dashboard now derives its summaries and analysis from the local warehouse API, labels its data source and date, and uses unavailable states rather than sample metrics when confirmed data is absent. CSV export follows the active search and filters on the currently loaded page, with that scope stated in Thai. Snapshot comparison uses the latest two real warehouse snapshots and shows a dated empty state when history is missing. The inactive workspace-menu control was removed; the existing module navigation remains.

No database schema or production data was changed. The existing response fields and pagination behavior remain intact; the API summary is additive. Borrowing, returning, maintenance, and repair workflows were not changed.

## Work by issue

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

## Verification

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

## Impeccable audit and critique

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

## Incomplete work and data blockers

- **Historical comparison:** only one actual snapshot is available. Historical ETL retention is needed before a previous-period delta can be shown.
- **Audit status:** the current API has no per-asset annual audit confirmation data. Adding it would require new API/business data support and was not invented here.
- **Threshold definition:** project documentation describes `is_below_threshold_flag` inconsistently: the schema comment refers to a ฿5,000 value threshold, while the ETL/README logic derives the flag from asset type codes or names. The UI now says “ตามธงต่ำกว่าเกณฑ์” and makes no monetary claim, but the data owner should confirm the authoritative definition before changing its meaning.
- **Global search/export:** the current API paginates records and has no server-side search/export contract. This implementation clearly states page-local scope rather than fetching or exporting unrelated pages. Supporting all matching rows requires a separately approved API change.
- **Download verification:** CSV contents and filters pass unit tests, but the browser harness cancelled the download before the resulting file could be inspected.
- **Responsive polish:** the mobile table-scroll cue, back-to-top overlap, and small text are follow-up UI work, not blockers for the four requested issues.

## Files changed for this improvement

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
