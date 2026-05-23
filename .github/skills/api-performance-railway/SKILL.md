---
name: api-performance-railway
description: "Use when: you need a concrete plan to make Laravel APIs fast, resource-efficient, cache-aware, and Railway-friendly without changing business behavior."
---

# API Performance on Laravel + Railway

## Purpose
Use this skill to design, audit, and implement a performance plan for Laravel APIs running on Railway or similar constrained platforms.

## Goals
1. Reduce request latency.
2. Lower CPU, memory, and DB pressure.
3. Eliminate duplicate work and expensive payloads.
4. Keep the API skinny and predictable.
5. Make deployments safe for Railway scale and limits.

## Workflow
1. Measure first.
- Capture p95 latency, SQL count per request, payload size, queue wait time, and cache hit rate.
- Identify the slowest endpoints before changing code.

2. Map the request path.
- Controller -> service -> query -> serializer -> response.
- Note where the API does duplicate queries, eager-load gaps, or N+1 patterns.

3. Fix the database bottleneck first.
- Add missing indexes on filter, join, order, and status columns.
- Prefer composite indexes that match real query patterns.
- Use partial indexes for hot subsets when PostgreSQL supports them.
- Avoid `select *`; fetch only the columns needed by the response.

4. Apply caching and memory controls.
- Cache stable lookups, feature flags, company settings, and reference catalogs.
- Use short TTLs for semi-dynamic data and explicit invalidation where possible.
- Keep cache keys scoped by company, branch, and vertical.
- Avoid caching raw bearer tokens or response shapes that change per user unless necessary.

5. Make the API skinny.
- Return compact DTO-style payloads instead of nested heavy blobs.
- Paginate all large collections.
- Move expensive aggregation behind dedicated endpoints or async jobs.
- Avoid computing derived data repeatedly inside list endpoints.

6. Keep Railway runtime lean.
- Tune PHP-FPM / web workers conservatively.
- Avoid memory-heavy startup tasks in the web container.
- Move long-running work to queues.
- Keep build artifacts small and deterministic.

7. Validate the gain.
- Compare baseline vs after on the same endpoint.
- Recheck SQL count, response time, memory use, and queue backlog.

## Database Strategy
1. Inspect query plans for the slow endpoint.
2. Add indexes for:
- company_id / branch_id scoped filters.
- status and date range filters.
- foreign keys used in joins.
- autocomplete/search columns.
3. If PostgreSQL is available:
- use trigram indexes for fuzzy text search.
- use partial indexes for active rows only.
- keep index names explicit and predictable.
4. Avoid over-indexing tables that receive heavy writes unless the read win is clear.

## Caching Strategy
1. Cache good candidates:
- lookups.
- settings.
- feature flags.
- document kinds.
- tax tables.
2. Never cache volatile transactional lists too aggressively.
3. Use per-company keys.
4. Add short TTLs for safety when invalidation hooks are not available.

## Deployment Strategy for Railway
1. Web process should stay stateless.
2. Background jobs should be separate from the web request path.
3. Build once, run minimal runtime image.
4. Do not run migrations or heavy warming logic on every boot unless required.
5. Prefer environment-driven config for queue, cache, log, and timeout settings.

## Recommended Railway Settings
1. Use production `APP_ENV` and `APP_DEBUG=false`.
2. Set a real cache driver.
3. Set a real queue driver and run workers separately.
4. Tune `DB_*` pool usage conservatively.
5. Set request timeouts and job retries explicitly.
6. Keep logs concise and structured.

## Checklist
1. Endpoint latency improved.
2. SQL count reduced.
3. Indexes exist for the hot queries.
4. Cache hits are visible on stable endpoints.
5. Worker/cron coverage is confirmed for async flows.
6. Railway memory and CPU remain within safe limits.

## Deliverables
1. Bottleneck summary.
2. Index plan.
3. Cache plan.
4. Runtime plan.
5. Validation notes.
