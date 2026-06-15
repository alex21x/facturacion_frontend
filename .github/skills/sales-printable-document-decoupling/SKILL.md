---
name: sales-printable-document-decoupling
description: "Use when: decoupling Sales endpoints that currently proxy to SalesController, using printableCommercialDocument as canonical example to migrate to thin-controller + application-service flow without changing API contracts."
---

# Sales Method Decoupling Template (Printable Commercial Document)

## Purpose
Use the `printableCommercialDocument` refactor as the standard pattern to decouple endpoints safely and consistently.

## Canonical example (already implemented)
1. Endpoint: `SalesDocumentController::printableCommercialDocument`.
2. Request contract moved to `PrintableCommercialDocumentRequest`.
3. Response mapping moved to `PrintableCommercialDocumentResponse`.
4. Business/render orchestration moved to `SalesDocumentApplicationServiceInterface::buildPrintableCommercialDocumentHtml`.
5. Implementation hosted in `SalesDocumentApplicationService`.
6. Controller-to-controller delegation removed for this method.

## Why this is the baseline
1. Keeps controller thin: HTTP adaptation only.
2. Keeps business logic in application service.
3. Preserves endpoint contract and route shape.
4. Makes behavior testable at service level.
5. Avoids the forbidden anti-pattern: fixing one coupling by introducing another controller coupling.

## Target architecture for any similar endpoint
1. Controller: resolve context (`resolved_company_id`, auth), call service, map exceptions to HTTP.
2. FormRequest: normalize and validate input.
3. Application Service (contract + implementation): execute use-case logic and return domain/output data.
4. Response class (optional but recommended): centralize response format/content-type.
5. Provider binding: interface -> implementation in `AppServiceProvider`.

## Mandatory refactor flow
1. Identify endpoint in `SalesDocumentController` (or similar) that delegates to `SalesController`.
2. Create/reuse FormRequest for all input validation/normalization.
3. Define method in an application service interface under `app/Contracts/...`.
4. Implement behavior in an application service under `app/Services/...` using existing read/use-case services.
5. Inject interface in target controller constructor.
6. Replace delegation call with direct service call + try/catch mapping.
7. If response shape is non-trivial, create `Responsable` response class.
8. Bind interface in `AppServiceProvider`.
9. Validate syntax and smoke endpoint.

## Controller template
```php
public function someEndpoint(SomeEndpointRequest $request, int $id)
{
    $companyId = (int) $request->attributes->get('resolved_company_id');

    try {
        $payload = $this->salesDocumentApplicationService->someUseCase($companyId, $id, $request->validated());
    } catch (SalesDocumentException $e) {
        return SomeEndpointResponse::error($e->getMessage(), $e->httpStatus());
    } catch (Throwable $e) {
        return SomeEndpointResponse::error('No se pudo procesar la solicitud', 500);
    }

    return SomeEndpointResponse::ok($payload);
}
```

## Printable method mapping (reference)
1. Input normalization: `PrintableCommercialDocumentRequest` normalizes `format` and enforces `ticket|a4`.
2. Application entrypoint: `buildPrintableCommercialDocumentHtml(int $companyId, int $documentId, string $format = 'ticket'): string`.
3. Domain failures: `SalesDocumentException` controls HTTP status.
4. Transport mapping: `PrintableCommercialDocumentResponse` returns HTML (`text/html`) or JSON error.

## Non-negotiable rules
1. No controller-to-controller calls in refactored methods.
2. No `DB::` or direct query logic in controller.
3. No inline validation when FormRequest exists.
4. Keep response contract unchanged unless explicitly requested.
5. Reuse existing services before creating new classes.

## Anti-patterns to reject
1. Moving the delegation from one controller to another controller.
2. Keeping `Request` instead of FormRequest for validated endpoints.
3. Returning mixed response shapes after refactor.
4. Coupling controller to Eloquent/query builder directly.

## Verification checklist (required)
1. Search touched controller: no constructor injection of another controller.
2. Search touched methods: no `return $this->otherController->...` remains.
3. `php -l` passes for all touched files.
4. Endpoint smoke test confirms same status codes and payload shape.
5. Error mapping still returns expected domain messages/status.

## Rollout strategy for current endpoints
1. Prioritize high-traffic wrappers still delegating to `SalesController`.
2. Migrate one endpoint at a time with contract-preserving changes.
3. Validate each endpoint before moving to next.
4. Reuse this skill template for new functionality from day one.

## Branch propagation policy (functional changes)
1. feature/cambios-generales
2. feature/docker-multientorno
3. deploy/railway-2026-04-10
