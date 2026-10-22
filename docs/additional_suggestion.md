# Additional Suggestions — Member 1: Asset Inventory & Lifecycle

## Scope

This document contains suggestions relevant to **Member 1 — Asset Inventory & Lifecycle**, including cross-cutting dashboard guidance that applies to the asset dashboard. Suggestions specific to the Maintenance & Facility or Borrow & Utilization domains are intentionally excluded.

## 1. General Dashboard Improvements

### 1.1 Organize information from broad to specific

- Prioritize dashboard content in a **broad-to-narrow hierarchy**.
- Start with the overall asset inventory and high-level indicators, then provide category-level comparisons and finally individual asset details.
- Support drilling down from summaries to the underlying assets where appropriate.

### 1.2 Define and explain colors

- Document what each dashboard color represents and apply these meanings consistently.
- Make the color definitions accessible to users, for example through a legend near the visualization or a dedicated **Legend / Visual Guide** page.
- Do not rely on color alone to communicate important information.

### 1.3 Future data-schema flexibility

- **Future consideration:** Evolve the data schema and integration architecture to accommodate both **SQL and NoSQL** data sources.
- Treat this as a longer-term design consideration, not an immediate implementation requirement.

## 2. Asset Inventory & Lifecycle Dashboard

### 2.1 Replace the generic average asset-age metric with a richer visualization

- Consider replacing a standalone **average asset age** metric with a **dot plot or bubble chart** that conveys several dimensions of the asset inventory.
- An initial visualization concept is:
  - **X-axis:** Asset age
  - **Y-axis:** Number of assets
  - **Bubble size (radius/area):** Asset value
  - **Color:** Asset type or category
- This mapping is a **starting idea, not a fixed specification**. Select dimensions and chart types based on the questions the dashboard needs to answer and the level of aggregation available in the data.
- Clearly label units, aggregation rules, and encodings; provide an accessible way to inspect exact values.

### 2.2 Compare acquisition cost with accumulated maintenance cost

- Provide a comparison of **original acquisition cost** and **cumulative repair/maintenance cost** for assets.
- Make it possible to identify assets whose repair costs are substantial relative to their purchase cost.
- Include sorting and filtering options for:
  - Acquisition cost
  - Cumulative repair cost
  - Repair-cost-to-acquisition-cost percentage
- When available, allow users to explore these measures by asset or asset category.
- Clearly distinguish between recorded costs and missing or unavailable cost data. The maintenance-cost comparison depends on data being available and reliably linkable to the asset records.

## 3. Implementation Notes

- Keep visualization choices configurable rather than hardcoding a single chart layout or fixed categories.
- Reuse the project's existing design tokens and follow `docs/design-guide.md` and `docs/frontend-guide.md` for layout, accessibility, and visual consistency.
- Where a cost ratio is shown, state its calculation and handle zero or missing acquisition costs explicitly.
- Validate the availability and definitions of asset age, acquisition cost, asset category, and cumulative repair cost before implementing the proposed views.

## 4. Out of Scope

The source notes also include detailed suggestions for **Maintenance & Facility** (repair trends, repeat failures, repair duration, and open requests) and **Borrow & Utilization** (academic-term patterns and borrower behavior). Those domain-specific dashboard recommendations are outside Member 1's assigned scope and are not included here.
