---
target: CPE Asset Warehouse dashboard
total_score: 33
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\Sutham\\Desktop\\Programming\\Projects\\Y4S1_CPE\\CPE-Asset-Warehouse\\src\\asset-inv\\index.html"
target_fingerprint: "sha256:4c7986c849867f98a33ba7481aa5d238a343b912999d19877741c664a8e391e4"
target_path: "C:\\Users\\Sutham\\Desktop\\Programming\\Projects\\Y4S1_CPE\\CPE-Asset-Warehouse\\src\\asset-inv\\index.html"
timestamp: 2026-10-22T20-12-39Z
slug: src-asset-inv-index-html
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 4/4 | Connected data, snapshot date, counts, and result/export scope are visible. |
| 2 | Match System / Real World | 3/4 | Thai inventory labels and real asset fields are clear; the threshold flag remains undefined. |
| 3 | User Control and Freedom | 4/4 | Search, filters, refresh, pagination, and both export scopes remain available. |
| 4 | Consistency and Standards | 3/4 | CPE tokens and patterns are retained; tablet and desktop retain the dense table. |
| 5 | Error Prevention | 4/4 | Exports remain scoped, and unavailable category/location values are not fabricated. |
| 6 | Recognition Rather Than Recall | 4/4 | Cards prioritize name, code, status, category, and location; secondary fields are disclosed in place. |
| 7 | Flexibility and Efficiency | 3/4 | Phone cards aid scanning; tablet users still pan across the wide table. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The mobile register is more legible while staying within the CPE visual system; the wider register remains dense. |
| 9 | Error Recovery | 3/4 | API unavailable states remain explicit; live failure recovery was not simulated in-browser. |
| 10 | Help and Documentation | 2/4 | Inline guidance exists, but there is no task-oriented help surface. |
| **Total** | | **33/40** | **Good** |

The score remains 33/40, unchanged from the previous critique. The mobile card layout improves phone-level scanning, but it does not resolve threshold semantics, missing historical data, broad task help, or tablet panning. The score was not raised solely for adding a presentation variant.

## Responsive and accessibility findings

- At 390×844, stacked cards show the primary inventory fields first, with secondary fields in a native `<details>` disclosure. The existing table is absent from the accessibility tree at this breakpoint.
- At 768×1024 and 1280×900, the original table is retained. Tablet still requires horizontal scrolling.
- Disclosure and detail-link targets are at least 44px high and have visible focus styles. Native summary/details keyboard behavior is provided, but physical keyboard operation was not manually tested.
- The fixed back-to-top control can overlap table content near the bottom at 768px and 1280px. At the inspected mobile view it did not cover the card detail link.
- Only Chromium-backed headless Edge was tested; no Safari, Firefox, physical touch, or real-device checks were available.

## Priority issues

- **P2:** Clarify the threshold flag with the data owner before changing its label or calculation.
- **P2:** Provide an actual prior snapshot and annual audit data before showing historical trends or audit status.
- **P2:** Resolve the floating back-to-top overlap with table content at tablet/desktop scroll positions.
- **P2:** Validate search/query latency as warehouse volume grows; do not change schema without approval.
- **P3:** Increase the two existing overview notes measured at 11.68px and assess task-oriented help with staff.

No P0 or P1 issue was identified in this focused review. No schema, API contract, production data, or out-of-scope module was changed.
