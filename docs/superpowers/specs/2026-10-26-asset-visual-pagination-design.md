# Asset Dashboard Visual Pagination Design

## Intent

Keep the executive dashboard compact by showing five items initially in ranked charts and multi-row comparison tables. Let staff page through more results, change the page size, and sort by a meaningful field without changing the Asset Explorer workflow.

## Confirmed scope

- Apply to rankable lists and comparison tables in Overview, Portfolio, Departments, Locations, Aging & Replacement, Acquisition & Funding, and Governance.
- Keep fixed KPI/status/age-band distributions and chronological trend charts complete.
- Keep Asset Explorer's existing 10/25/50/100 pagination unchanged.
- Preserve existing filters, snapshot selection, drill-down behavior, metric definitions, and Thai UI.
- Do not change the database schema or borrowing/maintenance modules.

## Existing implementation

`executive-dashboard.mjs` uses shared `renderRankedBars`, `renderTable`, `renderTreemap`, and `renderRateHeatmap` functions. The current number of visible rows varies by chart, often 10–20, while table data may be capped at 40–100 rows. Overview's department heatmap has a top-five/show-all toggle and sortable issue-rate columns. Treemaps show five named groups plus an “other” group and expose a details table.

The dashboard endpoint is `assets_api/asset_inventory_dashboard.php`. It aggregates filtered fact rows in PHP and returns a single dashboard payload. Single-dimension arrays are generally complete. Some cross-dimension lists are capped at 100 and Governance exceptions at 50. Several convenience rankings are capped at 10, 15, or 20, but can be built from complete department/category/type arrays already in the payload. Exception totals are already reported separately. The Explorer pagination helpers and UI live in `pagination.mjs` and `app.js`.

## Approaches considered

1. **Client-side pagination for every visual.** Simple and avoids new requests, but cannot page beyond the API's existing 100-row and 50-row caps.
2. **Server-side pagination for every visual.** Guarantees complete data access but adds requests and backend work even for small aggregate lists already in the payload.
3. **Hybrid paging (selected).** Page complete aggregate arrays in the browser. Use an additive server page mode for API-capped combinations and high-volume exception rows. This keeps the initial view compact and makes all matching results reachable without sending every exception row to the browser.

## Behavior

- Default page size is **5**. Available dashboard visual sizes are **5, 10, 25, 50, and 100**. Asset Explorer retains its existing options and default.
- Each visual keeps its own page, page size, sort field, and direction. A filter or snapshot change resets that visual to page 1; page size and sort preference remain for the current browser session.
- Show pagination controls only when a visual has more than five items. Show the visible range and total, with first/previous/next/last navigation and a page-size control.
- Sort complete client-side lists before slicing the requested page. Keep unavailable values last and use a stable Thai-label tie-break. Ranked charts default to their current primary metric in descending order. Tables sort by their available columns. The Overview heatmap keeps its missing-location-rate default and its existing issue-rate sort choices.
- Keep ranked-bar scale based on the complete list, so changing pages does not change the meaning of bar lengths.
- Treemap tiles remain five named groups plus “other”; the expanded detail table gains pagination and sorting. Do not page the treemap geometry itself.
- Age bands, availability/damage states, KPI cards, and chronological snapshot/acquisition trends remain complete because their values form a fixed distribution or sequence rather than a ranked list.
- Preserve all existing row drill-downs and table semantics. Controls use Thai labels, keyboard focus, screen-reader state, and touch-sized targets, following the existing CPE design tokens.

## API behavior

- Keep the existing dashboard request and response envelope working unchanged for current callers.
- Add an optional, allow-listed `visualPage` request mode to `asset_inventory_dashboard.php` for capped cross-dimension lists and Governance exceptions. It accepts the existing global filters plus `page`, `pageSize`, `sort`, and `direction`, and returns only that visual's rows with `totalRows`, `totalPages`, and the resolved page/sort values.
- Validate page sizes against the supported list; clamp page numbers; allow-list visual and sort keys; use the existing snapshot/filter parsing and prepared-query conventions. The normal dashboard response adds total-row metadata for capped visuals so page controls can be rendered accurately.
- Client-page aggregate lists already returned in full, deriving convenience rankings from those complete arrays instead of their capped aliases. If the requested page exceeds a capped payload, or the requested sort differs from the server's default order, request the corresponding server page. Reset pending visual requests when filters change and ignore stale responses.
- Fetch capped visual pages only when a user changes page or sort; do not issue one extra request per visual during initial dashboard load. The current analytics layer scans the selected snapshot in PHP, so check page-request latency at the existing 4,324-asset baseline. If repeated scans become too slow, optimize the targeted group query while preserving the same filter builder and response contract.
- Reuse existing metric and exception-reason definitions. Do not add a composite score or change denominators. Do not change schema.

## Error and empty states

- Zero rows render the existing empty state without pagination controls.
- Clamp the current page after filters reduce the result count.
- Server-page failures show an inline retry state for that visual and keep other section visuals available.
- Preserve the existing loading state and global dashboard error handling for the initial dashboard request.

## Implementation slices

1. Add reusable per-visual page state and pagination controls; apply them to complete aggregate lists and sortable tables.
2. Replace the Overview heatmap show-all toggle with the same paginator; add paged treemap details.
3. Add the allow-listed server page mode and total metadata for capped combination lists and Governance exceptions.
4. Connect controls to the page mode, preserving filters and handling stale requests, page clamping, empty results, and inline errors.

## Verification targets

- Five items are shown initially in each eligible visual; page-size changes and sorting operate on the full available result set.
- Each visual's state is independent, while global filters and snapshot selection remain consistent.
- Capped datasets report correct totals and can be paged beyond their previous caps.
- Existing fixed distributions, trends, and Explorer pagination remain unchanged.
- Drill-downs, unknown values, null metrics, and zero denominators retain current behavior.
- Review responsive behavior at 390px, 768px, and 1280px, keyboard operation, API parameter validation, and existing relevant checks.

## Calls left to implementation

- Reuse existing API helpers and add the smallest route branch needed for `visualPage`; keep all SQL ordering fields behind explicit allow-lists.
- Use the existing pagination layout and token-based styles rather than introducing a new visual pattern.
- Keep page and sort state in memory; do not persist it to local storage or the database.
