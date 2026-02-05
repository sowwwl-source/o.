DATABASE_URL ?=
PSQL = psql "$(DATABASE_URL)" -v ON_ERROR_STOP=1

MIGRATIONS = \
	migrations/001_init_extensions.sql \
	migrations/002_types_enums.sql \
	migrations/003_tables_core.sql \
	migrations/004_constraints_indexes.sql \
	migrations/005_triggers_views.sql

.PHONY: migrate seed all

migrate:
	@if [ -z "$(DATABASE_URL)" ]; then echo "DATABASE_URL required"; exit 1; fi
	@for f in $(MIGRATIONS); do echo "Applying $$f"; $(PSQL) -f $$f; done

seed:
	@if [ -z "$(DATABASE_URL)" ]; then echo "DATABASE_URL required"; exit 1; fi
	@$(PSQL) -f migrations/900_seed_dev.sql

all: migrate seed
