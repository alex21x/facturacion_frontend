---
name: layered-clean-architecture
description: "Use when: doing functional development or refactors in backend/frontend APIs and you must enforce Controller -> Service -> Repository plus external Gateway clients, with no DB/HTTP direct calls in controllers/services, including autonomous general sweep mode."
---

# Layered Clean Architecture (Hexagonal End-to-End Playbook)

## Objective
Decouple features by parts without behavior drift, covering:
1. Business logic.
2. Persistence.
3. Execution orchestration.
4. Render generation (HTML/CSS/PDF preview).

## Scope
Use this skill for backend + frontend refactors in modules like Sales/Cash/Purchases where a single endpoint may include validation, orchestration, persistence and printable rendering.

## Mandatory architecture
1. Inbound adapters: Controllers and FormRequests.
2. Application layer: UseCases/ApplicationServices.
3. Domain layer: business rules, exceptions, contracts.
4. Outbound adapters: Repositories (DB) and Gateways (external HTTP).
5. Presentation builders: frontend HTML/CSS render functions or backend response mappers.

## Hard prohibitions
1. No DB queries in Controllers.
2. No DB queries in Application Services.
3. No external HTTP calls in Controllers.
4. No Controller -> Controller delegation.
5. No inline validation in Controllers/Services when FormRequest exists.
6. No contract drift unless explicitly requested.
7. No mixing render business rules with data retrieval side effects.

## Responsibility matrix

### Controller (Inbound Adapter)
1. Read auth/tenant context.
2. Receive validated payload from FormRequest.
3. Call a single application entrypoint.
4. Map domain/application exceptions to HTTP status.

### FormRequest / DTO
1. Input schema, messages, normalization.
2. Type-safe payload handoff to application layer.

### Application Service / UseCase
1. Orchestrate flow steps.
2. Apply business decisions.
3. Compose data for output contract.
4. Start/close transactions via repository abstractions where needed.

### Repository (Persistence Adapter)
1. All reads/writes and query optimization.
2. No business branching beyond query filtering.
3. Return stable DTO/array shapes expected by use case.

### Gateway/Client (External Adapter)
1. Third-party API calls and retries.
2. Transport headers and error translation.

### Render Builder (Frontend/Presentation)
1. Pure function: input -> HTML/CSS string (or UI model).
2. No fetch, no persistence, no side effects.
3. Receive resolved assets (logo/data URI) and printable metadata as input.

## Phased decoupling flow (mandatory order)

### Phase 1 - Contract baseline
1. Freeze current route, payload, response, status codes.
2. Capture existing side effects and error messages.

### Phase 2 - Validation boundary
1. Move validation and normalization to FormRequest/DTO.
2. Keep controller free of rule definitions.

### Phase 3 - Logic extraction
1. Move branching/business rules to Application Service or UseCase.
2. Keep controller as thin adapter only.

### Phase 4 - Persistence extraction
1. Move every DB operation from service/controller to repository.
2. Keep service speaking through interfaces/contracts.

### Phase 5 - Execution orchestration
1. Consolidate end-to-end execution in UseCase (command/query split when useful).
2. Keep transaction boundaries explicit.

### Phase 6 - Render decoupling (HTML/CSS/PDF)
1. Build print/preview HTML in dedicated builder functions.
2. Prepare all render inputs before builder call.
3. Never resolve DB/HTTP inside builder.
4. Prefer data URI fallback for critical logos/assets in popup/iframe previews.

### Phase 7 - Compatibility and smoke checks
1. Verify endpoint contracts unchanged.
2. Verify preview popup and PDF stay visually aligned.
3. Verify errors map to same HTTP semantics.

## Implementation templates

### Thin controller template
```php
public function action(SomeRequest $request, int $id)
{
	$companyId = (int) $request->attributes->get('resolved_company_id');

	try {
		$result = $this->useCase->execute($companyId, $id, $request->validated());
		return response()->json($result, 200);
	} catch (DomainException $e) {
		return response()->json(['message' => $e->getMessage()], $e->httpStatus());
	} catch (\Throwable $e) {
		return response()->json(['message' => 'No se pudo procesar la solicitud'], 500);
	}
}
```

### Application service contract example
```php
interface FeatureApplicationServiceInterface
{
	public function execute(int $companyId, int $resourceId, array $payload): array;
}
```

### Frontend render builder template
```ts
type PrintableInput = {
  company: { legalName: string | null; logoUrl: string | null } | null;
  summary: { total: number };
};

export function buildPrintableHtml(input: PrintableInput): string {
  const logo = input.company?.logoUrl ?? '';
  return `\n    <html><body>${logo ? `<img src="${logo}" alt="Logo" />` : ''}</body></html>\n  `;
}
```

## Review checklist (must pass)
1. Any DB facade/query in controller/service? remove.
2. Any HTTP client in controller/service? move to gateway.
3. Any controller calling another controller? remove.
4. Any render builder doing fetch/update? remove.
5. Any contract field/status changed unintentionally? restore.
6. Any duplicated query logic across services? centralize in repository.
7. Any logo/asset path brittle in popup preview? normalize and provide fallback.

## Definition of done
1. Controller is thin.
2. Logic in use case/application service.
3. Persistence isolated in repository.
4. External calls isolated in gateway.
5. Render generation isolated in pure builder.
6. Contracts and business behavior preserved.
7. Lint/syntax/smoke checks pass.

## Autonomous execution protocol
When this skill is invoked, execute by phases without asking for each micro-step.
Only ask the user if one of these blockers exists:
1. Ambiguous business rule with multiple valid outcomes.
2. Destructive operation risk (data loss/security/deploy impact).
3. Missing environment access that blocks verification.

## Branch propagation policy for functional changes
Apply functional changes first on source branch and propagate in order:
1. feature/cambios-generales
2. feature/docker-multientorno
3. deploy/railway-2026-04-10
