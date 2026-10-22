---
target: asset-inventory dashboard
total_score: 25
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Sutham\\Desktop\\Programming\\Projects\\Y4S1_CPE\\CPE-Asset-Warehouse\\src\\asset-inv\\index.html"
target_fingerprint: "sha256:6f19ef92ce7fecc2c2a906ac2a898edb971e85fa097e04a3e206183fa2085163"
target_path: "C:\\Users\\Sutham\\Desktop\\Programming\\Projects\\Y4S1_CPE\\CPE-Asset-Warehouse\\src\\asset-inv\\index.html"
timestamp: 2026-10-22T18-34-29Z
slug: src-asset-inv-index-html
---
Method: dual-agent (A: `01a164de-acaf-7250-be7d-24d77c6124fc` · B: `01a164de-add8-7240-8529-b09cff6af14f`)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Summary is labeled sample data while the register reports a warehouse connection. |
| 2 | Match System / Real World | 3/4 | Thai inventory language fits; “Member 1” and raw schema names do not. |
| 3 | User Control and Freedom | 2/4 | The workspace-menu button has no behavior; some actions end with only a transient toast. |
| 4 | Consistency and Standards | 3/4 | Cohesive styling, but data provenance is not consistently distinguished. |
| 5 | Error Prevention | 2/4 | “Export view” ignores the active search and category filter. |
| 6 | Recognition Rather Than Recall | 3/4 | Comparing snapshots requires remembering one view while switching to another. |
| 7 | Flexibility and Efficiency | 2/4 | Search and pagination help; there are no bulk actions or saved views. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clear overview, then a long, dense register with technical metadata. |
| 9 | Error Recovery | 3/4 | API errors have guidance, but raw HTTP status may appear; failure state wasn’t verified live. |
| 10 | Help and Documentation | 1/4 | No visible, task-focused help entry. |
| **Total** |  | **25/40** | **Acceptable (62.5%)** |

## Design Specificity Verdict

**Moderately product-specific.** Thai CPE inventory language, annual audit progress, age analysis, location coverage, and threshold exceptions ground the dashboard in its real domain. The dark shell and KPI-card pattern are familiar enough to fit many other asset dashboards; the strongest product character comes from the operational content and audit workflow.

**Deterministic scan:** 2 findings, both likely false positives after checking their context:

- `hero-eyebrow-chip` at `src/asset-inv/index.html:46–49` matches content inside a hidden, empty module-placeholder section—not the live dashboard.
- `side-tab` at `src/asset-inv/styles.css:1445` matches the `.toast` status notification, not a card.

**Visual overlay:** No reliable user-visible overlay is available. A fresh Edge tab rendered the dashboard, but the browser evaluation was read-only (`document.createElement` was unavailable and `document.title` had only a getter), so the injection preflight failed and overlay injection was skipped. There were no page console logs.

## Overall Impression

The opening gives staff a useful inventory overview and the page follows a sensible operational order. The biggest risk is trust: the summary and live-connected register appear together despite having different data sources. Snapshot comparison and export behavior also fall short of the dashboard’s audit and decision-support goals.

## Cognitive Load

**3 of 8 checklist failures — moderate.**

- **Failed:** The lower register has eight fields per row; the category filter exposes six choices; comparing current and prior readiness requires remembering values across views.
- **Passed:** Inventory status anchors the page; sections are grouped; hierarchy is clear; decisions are not forced into a multi-step flow; the register follows the overview rather than interrupting it.

## Emotional Journey

The opening feels organized and credible, and the readiness, progress, and location metrics offer reassurance. Confidence drops when a sample-data notice sits above a register labeled connected. The exceptions table provides a useful action point; the dense register and technical labels later create scanning fatigue, and queue actions resolve with only a temporary toast.

## What’s Working

- The first view prioritizes useful signals: inventory total, readiness, threshold exceptions, and location coverage.
- The page progresses from overview through audit, lifecycle, and items needing attention.
- Statuses include text labels; the source also has a skip link, semantic table headings, labeled controls, visible focus styling, and reduced-motion handling.

## Priority Issues

1. **[P1] Sample and connected data appear together.** The overview’s metrics, readiness, age bands, and exceptions are fixtures in `src/asset-inv/app.js:17`, while the lower register loads from the warehouse and reports a connection. Both show 4,324 assets, making it easy to mistake sample summaries for current data. **Fix:** Make provenance unmistakable on each affected section, and use the same snapshot source for decision-support summaries when available. **Suggested command:** `$impeccable harden src/asset-inv/index.html`.
2. **[P1] Snapshot trends require manual comparison.** The readiness selector switches between current and prior views without showing a delta; users must retain the earlier values. The age profile is a single distribution. **Fix:** Show dated change or a side-by-side comparison using available snapshots; don’t imply comparisons where data is missing. **Suggested command:** `$impeccable shape annual snapshot comparison`.
3. **[P1] Export scope does not match its label or filters.** “ส่งออกมุมมอง” exports the hardcoded exception list rather than the filtered view or connected register, so output can differ from what staff believe they reviewed. **Fix:** Export the displayed filtered records, or label the export’s actual scope clearly. **Suggested command:** `$impeccable harden src/asset-inv/index.html`.
4. **[P2] The workspace-menu control appears actionable but has no behavior.** The header button is labeled “เปิดเมนูพื้นที่ทำงาน” in `src/asset-inv/index.html:29`, but the target source has no corresponding handler. **Fix:** Wire it to a real menu or avoid exposing it as an active control. **Suggested command:** `$impeccable harden src/asset-inv/index.html`.

## Persona Red Flags

- **Alex, power user:** Export ignores active filters; snapshot comparison is manual; there are no bulk actions, shortcuts, or saved views. Search and pagination help, but common audit work still takes extra steps.
- **Sam, accessibility-dependent user:** The skip link, labels, text-backed statuses, and focus styling are good foundations. The eight-column register and small supporting text may be difficult at zoom; module links are 40px high and buttons 42px in source. Keyboard and screen-reader flows were not exercised live.

## Minor Observations

- “สมาชิก 1” and footer references to schema fields/API endpoints read like team notes, not warehouse-user guidance.
- The age chart shows counts but no scale.
- The dark CPE palette and purple primary action are consistent with the project guides.

## Questions to Consider

- Would managers rely on the readiness figure if the overview is sample data but the register says it is connected?
- Should “export view” produce exactly the filtered records currently on screen?
- What annual snapshot change should be visible without asking staff to remember the prior chart?
