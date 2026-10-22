# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: CPE warehouse staff and asset administrators responsible for inventory tracking, annual physical inventory, and asset lifecycle monitoring.
- Secondary: managers who need an overview of inventory status and asset readiness.

## Product Purpose

An internal CPE asset and warehouse inventory dashboard that helps users understand inventory quantities, status, readiness, threshold exceptions, asset age, and lifecycle trends. It should turn warehouse data into information people can use for annual audits and management decisions without manually analyzing raw records.

Success means users can quickly understand the inventory situation, identify assets or issues that need attention, and make better-informed decisions using accurate data.

## Positioning

The dashboard focuses on historical warehouse snapshots and lifecycle analysis for CPE inventory work, making changes and trends useful for audits and decisions rather than showing only an isolated inventory view.

## Operating Context

Warehouse staff and asset administrators use the dashboard to monitor inventory, prepare for and conduct annual physical checks, investigate exceptions, and review historical trends. Managers use it for a high-level view of inventory status and readiness. Inventory snapshots are maintained in the warehouse for analysis over time.

## Capabilities and Constraints

- Monitor inventory quantities, asset information, and status/readiness.
- Analyze recurring warehouse snapshots, historical inventory trends, asset age, and lifecycle.
- Identify low-stock or threshold exceptions and assets requiring attention.
- Support inventory audits, reporting, and management decisions.
- Keep the interface in Thai and support desktop, tablet, and mobile use.
- Preserve the existing plain HTML, CSS, JavaScript, PHP, and MySQL architecture, backend API, database structure, and business logic. Do not migrate to React, Vue, Next.js, or another framework.
- Member 1 scope is inventory management and monitoring, asset information and status, lifecycle and age analysis, warehouse snapshots, and inventory analytics/reporting.
- Borrowing/return and maintenance/repair workflows belong to other team members. Do not implement or change their business logic unless explicitly requested.

## Evidence on Hand

- Existing dashboard: `src/asset-inv/`.
- Warehouse API documentation: `assets_api/README.md`; the dashboard reads the local warehouse through `assets_api/fact_asset_inventory.php`.
- Warehouse ETL and snapshot workflow: `README.md` and `etl_warehouse.py`.
- The repository includes a `fact_asset_inventory` warehouse table and related dimensions. Treat displayed counts as data-dependent; do not invent or present a fixed total as current without checking the data source.

## Product Principles

1. Make the overall inventory situation understandable at a glance.
2. Surface important exceptions and assets that need attention.
3. Use recurring snapshots to explain change over time, not only current state.
4. Support trustworthy audit and management decisions without requiring manual raw-data analysis.
5. Respect team ownership boundaries and preserve existing data and business contracts.

## Accessibility & Inclusion

Prioritize accessible interaction, readable information, clear data representations, and responsive use across desktop, tablet, and mobile. No specific accessibility conformance level has been established.
