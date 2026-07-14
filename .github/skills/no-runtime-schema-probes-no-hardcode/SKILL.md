---
name: no-runtime-schema-probes-no-hardcode
description: "Use when: implementing or refactoring backend/frontend features and you must avoid runtime schema probes like tableExists/hasTable and avoid hardcoded business, tenant, environment, route, email, schedule, or deployment values."
---

# No Runtime Schema Probes, No Hardcode

## Objective
Prevent latency, deployment fragility, and tenant drift by forbidding runtime schema existence checks and hardcoded operational/business values in feature code.

## Mandatory rules
1. Do not add `tableExists`, `hasTable`, `Schema::hasTable`, `information_schema`, or equivalent runtime schema probes in hot paths, controllers, services, repositories, commands, or scheduled jobs.
2. Treat required tables/columns as migration contracts. If a feature depends on a table, create or update the migration instead of probing for it on each request/job.
3. Do not hardcode system company IDs, branch IDs, alert recipients, schedule times, feature owners, URLs, credentials, tenant slugs, file paths, or similar environment/business values.
4. Resolve variable operational values from config, env, persisted settings, or explicit inputs.
5. Keep defaults centralized in config files or documented seeds, never scattered inside feature logic.

## Allowed alternatives
1. Use migrations to guarantee schema presence before runtime.
2. Use config keys for environment-level defaults.
3. Use DB settings tables for tenant/business configuration.
4. Use DTO/FormRequest inputs for per-request decisions.
5. Use repository queries that assume the migrated schema exists.

## Hard prohibitions
1. No `information_schema` queries from request or job execution flows.
2. No guard code like "if table exists then behave differently" for new features.
3. No `env()` calls spread through domain/service logic when config indirection is appropriate.
4. No magic numbers/strings for operational rules when they can change by environment or tenant.

## Review checklist
1. Does the change introduce any runtime schema check? Remove it.
2. Does the change contain any new hardcoded company ID, email, schedule, URL, or operational threshold? Move it to config or persisted settings.
3. Does the feature rely on optional schema drift? Replace that with a migration path.
4. Are defaults centralized and named clearly? If not, centralize them.

## Definition of done
1. Feature runs without schema-probing latency.
2. Business/environment values are configurable or persisted.
3. Migrations, config, and runtime logic are aligned.