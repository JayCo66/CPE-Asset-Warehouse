# Responsibility Schema

## Model 2: Business Domain End-to-End

This approach is suitable for instructors or team leads who want every member to gain hands-on experience across the full workflow—ETL development, data modeling, and dashboard creation—within their assigned business domain.

## Responsibility Assignment

| Member | Responsible Domain | Scope of Work | Related Tables |
|---|---|---|---|
| **Member 1** | **Asset Inventory & Lifecycle** | - Extract and restore data for 4,324 assets<br>- Analyze asset readiness, the proportion falling below the required threshold, and asset age<br>- Develop a dashboard for annual asset inventory checks | `fact_asset_inventory`<br>`dim_asset`<br>`dim_asset_type`<br>`dim_asset_category` |
| **Member 2** | **Borrow & Utilization** | - Manage borrowing history and records of borrowed assets<br>- Analyze borrowing behavior, overdue returns, and equipment demand<br>- Develop a dashboard for asset utilization statistics | `fact_borrow_transaction`<br>`dim_user`<br>`dim_department` |
| **Member 3** | **Maintenance & Facility** | - Manage asset repair data and general maintenance requests (including Excel data)<br>- Analyze repair costs, technician SLAs, and frequently recurring issues by building<br>- Develop a dashboard for maintenance tracking and budget monitoring | `fact_asset_maintenance`<br>`fact_general_maintenance`<br>`dim_maintenance_type`<br>`dim_location` |

## End-to-End Responsibilities

Each team member is responsible for the complete workflow within their assigned business domain:

1. **ETL:** Extract, transform, and load data for analysis.
2. **Data Modeling:** Design and manage data models using the relevant tables.
3. **Dashboard:** Build dashboards to monitor and analyze information within the assigned scope.

> **Note:** The domains, work scopes, and table names follow the original reference image. This document does not specify column schemas, table relationships, or additional technical implementation details.
