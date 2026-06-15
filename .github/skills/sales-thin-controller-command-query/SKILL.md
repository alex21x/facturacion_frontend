---
name: sales-thin-controller-command-query
description: "Use when: refactoring or implementing Sales endpoints to enforce thin controllers, command/query separation, repository interfaces, and DTO/FormRequest boundaries without changing API contracts."
---

# Sales Alignment Standard (Thin Controller + Command/Query)

## Purpose
Apply a strict, stable architecture in Sales without altering endpoint contracts.

## Hexagonal architecture anchor
1. Controller is only an inbound adapter.
2. Application services/use cases orchestrate domain behavior.
3. Domain owns business rules and repository contracts.
4. Infrastructure implements contracts (DB, Eloquent, external gateways).
5. Flow must stay: Adapter (Controller/Middleware) -> Application (Service/Command/Query) -> Domain Contracts -> Infrastructure.

## Non-negotiable rules
1. Thin Controllers: controllers only adapt HTTP (request parsing, auth/company context extraction, response mapping). No business logic in controllers.
2. Middleware-first context: auth, company scope, and permissions must be prepared by middleware; controller should consume pre-resolved context.
3. Controllers must never call other controllers.
4. Command/Query split:
5. Use Cases are only for writes/transactions (create, update, state transitions, voids, posting).
6. Query Services are only for reads (lists, search, detail, previews, exports, PDFs, lookups).
7. Cohesion first: reuse existing domain services/classes. Do not create new files if behavior fits an existing class.
8. Inyección por contratos: inject dependencies through interfaces/contracts whenever available.

## Boundaries
1. Domain layer: repository interfaces + business rules only. No framework/infra imports.
2. Infrastructure layer: Eloquent models + repository implementations + persistence details.
3. Communication rule: services depend on repository interfaces/contracts, never on Eloquent models directly.

## Data and validation
1. Use FormRequest for endpoint validation and normalization.
2. Use DTOs (or stable arrays where legacy requires) between layers.
3. Keep response contract unchanged unless explicitly requested.

## Query technology policy
1. Eloquent for simple CRUD.
2. Query Builder for complex reporting/multi-join/high-filter reads.
3. Stored Procedures only for massive/critical operations where measured performance justifies it.

## Anti-patterns to block
1. Controller -> Controller calls.
2. Business branching/loops/decision trees inside controllers.
3. DB:: calls inside controllers.
4. HTTP/gateway calls inside controllers.
5. Read wrappers implemented as Use Cases that only proxy services.
6. Creating parallel service files when an existing class can own the behavior.
7. Forcing factories where constructor DI is enough.
8. Decoupling one controller by coupling another controller (forbidden trade-off).

## Anti-regression rule (mandatory)
1. Never solve a controller coupling by moving routes/delegation to another controller.
2. If endpoint A is being decoupled, endpoint A must finish delegating to services/use-cases/contracts, not to endpoint B controller.
3. Any refactor that removes one controller dependency but introduces another controller dependency is invalid and must be reverted.
4. Before closing a Sales refactor, verify there is zero new controller-to-controller dependency in touched modules.

## Hard-fail gate (release blocker)
1. If any touched Sales controller injects another controller, the refactor is rejected.
2. If any touched Sales controller returns `$this-><otherController>->...`, the refactor is rejected.
3. If routes were changed only to bypass a coupling (A -> B controller), the refactor is rejected.
4. Do not mark task as complete until these checks are clean.

## Mandatory verification commands
1. Search constructor/controller injection patterns in touched Sales controllers.
2. Search delegation calls to other controllers in touched Sales controllers.
3. Search Sales routes for accidental cross-controller rerouting used only as a wrapper workaround.
4. If any hit appears, continue refactor; do not close task.

## Sales implementation checklist
1. Every Sales endpoint maps to exactly one controller method that delegates to service/use case.
2. Read endpoints use Query Services only.
3. Write endpoints use Use Cases/Command services only.
4. Controller contains no business branching beyond HTTP status mapping.
5. Existing FormRequests are reused before creating any new request class.
6. If an endpoint still has controller logic, move it to an existing service before creating new classes.
7. Confirm no constructor in touched controllers injects another controller.
8. Confirm no touched controller method returns `$this->otherController->...`.

## Safe refactor flow
1. Move controller business logic into existing service first.
2. Replace controller-to-controller calls with direct service/use-case delegation.
3. Keep routes and payload/response structure stable.
4. Validate with php -l and project diagnostics after each chunk.

## Mandatory completion policy
1. Do not close the task with architectural drift pending in Sales.
2. Propagate functional architecture fixes through required branch flow:
3. feature/cambios-generales -> feature/docker-multientorno -> deploy/railway-2026-04-10.
