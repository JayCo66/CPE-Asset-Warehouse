# Department Issue Heatmap Design

## Intent

Keep the Overview heatmap compact while allowing executives to inspect every department and compare its existing issue measures.

## Approaches

- **Rank by issue rate (chosen):** Show the five departments with the highest rate for the selected issue. This surfaces the strongest issue signal, and the initial department set changes with the selected column.
- **Rank by asset count:** Keep the same five largest departments visible while sorting issue columns to compare their missing-location, age, and damaged rates.

## Design

- Initially order rows by the selected issue rate descending (missing-location rate by default) and display at most five.
- Add a control below the heatmap to expand to all rows and collapse back to five. Omit it when five or fewer departments exist.
- Make the missing-location, age-over-threshold, and damaged column headers keyboard-accessible sort controls. Each click toggles ascending/descending by the displayed rate; unavailable rates remain last. Keep the existing age threshold and displayed count/denominator values.
- Preserve department drill-down buttons, horizontal table scrolling, and the separate Governance heatmap behavior.
- Keep sort and expansion state in the client. No API, database, or metric changes; do not create a combined issue score.

## Verification

Add regression coverage for default top-five ordering, expanding/collapsing, each sort direction, unavailable values, keyboard semantics, and the unchanged Governance heatmap. Run the focused tests and full Node test suite, plus `git diff --check`.
