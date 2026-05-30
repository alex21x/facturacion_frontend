---
name: layered-clean-architecture
description: "Use when: doing functional development or refactors in backend/frontend APIs and you must enforce Controller -> Service -> Repository plus external Gateway clients, with no DB/HTTP direct calls in controllers/services, including autonomous general sweep mode."
---

# Layered Clean Architecture (Controller -> Service -> Repository)

## Purpose
Keep functional code decoupled, predictable, and scalable.

## Mandatory layering
1. Controller: only orchestration, request/response mapping, auth context extraction.
2. Request classes: all validation rules/messages/normalization input contracts.
3. Service: business rules and use-case flow only.
4. Repository: all DB queries and persistence concerns.
5. Gateway/Client: all external HTTP integrations (SUNAT, TaxBridge, third-party APIs).

## Hard rules
1. No DB queries in controllers.
2. No DB queries in services.
3. No external HTTP calls in controllers.
4. No validation rules inline in controllers/services if a Request class exists for that endpoint.
5. Keep response shape stable when refactoring.

## Allowed responsibilities by layer

### Controllers
1. Resolve auth/company/branch context.
2. Delegate to service with typed payload.
3. Return HTTP status and response envelope.

### Request classes
1. rules(), messages(), attributes().
2. Optional input normalization for contract safety.

### Services
1. Business invariants and domain decisions.
2. Cross-repository orchestration.
3. Transaction boundaries through repository abstractions.

### Repositories
1. Query builder/SQL/Eloquent reads and writes.
2. Efficient filters, joins, indexes-aware access paths.
3. Return DTOs or stable arrays expected by services.

### Gateways
1. Build and send external payloads.
2. Retry/error mapping.
3. Keep transport concerns outside service business rules.

## Refactor flow (safe)
1. Move inline validation to Request class.
2. Move business decision branches from Controller to Service.
3. Move DB access from Service to Repository.
4. Keep endpoint contract unchanged unless explicitly required.
5. Run syntax + targeted smoke checks.

## Review checklist
1. Any `DB::` in Controller/Service? must be removed.
2. Any `Validator::make` inline in Controller/Service? move to Request.
3. Any HTTP client call in Controller/Service? move to Gateway.
4. Any duplicated query in multiple services? centralize in Repository.
5. Any repeated controller branching? push business branch to Service.

## Autonomous sweep mode
Use when codebase drift is high and architecture boundaries were mixed.
1. Audit controllers/services for boundary violations.
2. Prioritize high-traffic modules first (Sales, Inventory, Purchases, Auth, AppConfig).
3. Refactor in small behavior-preserving chunks.
4. Validate each chunk with lint/smoke checks before next chunk.

## Branch propagation policy for functional changes
Apply functional changes first on source branch and propagate in order:
1. feature/cambios-generales
2. feature/docker-multientorno
3. deploy/railway-2026-04-10
