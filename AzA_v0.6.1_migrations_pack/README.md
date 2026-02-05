# AzA v0.6.1 migrations pack

This pack contains numbered migrations for the AzA database schema.
Apply in order.

Requirements:
- psql
- DATABASE_URL

Usage:
- make migrate DATABASE_URL="postgres://user:pass@host:5432/db"
- make seed    DATABASE_URL="postgres://user:pass@host:5432/db"
- make all     DATABASE_URL="postgres://user:pass@host:5432/db"

Files:
- migrations/001_init_extensions.sql
- migrations/002_types_enums.sql
- migrations/003_tables_core.sql
- migrations/004_constraints_indexes.sql
- migrations/005_triggers_views.sql
- migrations/900_seed_dev.sql
