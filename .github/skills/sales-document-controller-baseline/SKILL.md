---
name: sales-document-controller-baseline
description: "Use when: documenting or implementing controller decoupling using SalesDocument as the canonical baseline for current and new controllers, preserving contracts and enforcing thin-controller architecture."
---

# SalesDocument Baseline (Canonical Controller Decoupling)

## Objetivo
Usar el modulo `SalesDocument` como plantilla oficial para desacoplar controladores en todo el sistema sin romper contratos HTTP.

## Cobertura obligatoria del desacople
1. Logica de negocio.
2. Persistencia.
3. Ejecucion (orquestacion del caso de uso).
4. Render (HTML/CSS/PDF preview).

## Referencia canonica ya aplicada
1. `SalesDocumentController` actua como adaptador HTTP (sin logica de negocio).
2. Validacion/normalizacion en FormRequests (ejemplo: `PrintableCommercialDocumentRequest`).
3. Orquestacion en servicio de aplicacion (`SalesDocumentApplicationServiceInterface` + `SalesDocumentApplicationService`).
4. Mapeo de respuestas en clases de respuesta cuando aplica (ejemplo: `PrintableCommercialDocumentResponse`).
5. Excepciones de dominio (`SalesDocumentException`) convertidas a HTTP en controller.
6. Sin delegacion controller->controller.

## Principios obligatorios
1. Controlador delgado: solo request context, llamada al servicio y response mapping.
2. Cero logica de negocio en controller.
3. Cero consultas DB directas en controller.
4. Cero llamadas HTTP externas en controller.
5. Cero dependencias entre controladores.
6. Mantener contratos de ruta, payload y codigos HTTP salvo requerimiento explicito.

## Arquitectura objetivo
1. Controller (inbound adapter): lee `resolved_company_id`, auth/contexto y parametros.
2. FormRequest: valida y normaliza entrada.
3. Application Service/UseCase (contrato + implementacion): encapsula caso de uso/consulta.
4. Repository: concentra toda persistencia y queries.
5. Gateway client: concentra integraciones externas.
6. Domain Exception: comunica error funcional con estado HTTP esperado.
7. Response/Render mapper (opcional): estandariza JSON/HTML/PDF/headers.
8. Provider binding: interfaz -> implementacion.

## Flujo operativo por partes (sin saltos)
1. Congelar contrato actual de endpoint (request/response/status).
2. Mover validacion y normalizacion al FormRequest.
3. Extraer logica de negocio al Application Service/UseCase.
4. Extraer DB a Repository (cero persistencia fuera de repositorio).
5. Extraer HTTP externo a Gateway.
6. Dejar builder de render como funcion pura (sin fetch/DB).
7. Conectar controller delgado a la nueva orquestacion.
8. Verificar contrato y comportamiento final.

## Plantilla minima de controlador
```php
public function endpoint(SomeRequest $request, int $id)
{
    $companyId = (int) $request->attributes->get('resolved_company_id');

    try {
        $result = $this->applicationService->execute($companyId, $id, $request->validated());
    } catch (DomainExceptionType $e) {
        return SomeResponse::error($e->getMessage(), $e->httpStatus());
    } catch (\Throwable $e) {
        return SomeResponse::error('No se pudo procesar la solicitud', 500);
    }

    return SomeResponse::ok($result);
}
```

## Flujo de migracion recomendado (controladores actuales)
1. Detectar metodo con acoplamiento controller->controller o logica de negocio incrustada.
2. Crear/reusar FormRequest para entrada.
3. Definir metodo en interfaz de servicio de aplicacion.
4. Mover logica de negocio/orquestacion al servicio.
5. Mantener respuesta mediante clase response si ya existe contrato especial.
6. Reemplazar cuerpo del controller por llamada al servicio + manejo de excepciones.
7. Validar que no cambia contrato externo.

## Reglas anti-patron (bloqueantes)
1. Prohibido resolver acoplamiento moviendo la delegacion a otro controller.
2. Prohibido cerrar refactor con `return $this->otherController->...`.
3. Prohibido dejar validacion inline si ya existe FormRequest.
4. Prohibido introducir drift de contratos en endpoints productivos.
5. Prohibido persistir datos desde Controller o Application Service.
6. Prohibido renderizar HTML/CSS leyendo DB o llamando APIs dentro del builder.

## Regla especifica para render HTML/CSS
1. El controller/use case prepara un DTO de impresion.
2. El builder HTML/CSS solo recibe DTO y devuelve string HTML.
3. Assets criticos (logo) deben llegar resueltos, con fallback robusto (ejemplo: data URI).
4. Popup preview y PDF deben compartir el mismo builder base para paridad visual.

## Checklist de verificacion obligatoria
1. Buscar inyeccion de controladores en constructores tocados: no debe existir.
2. Buscar llamadas `->otherController->`: no debe existir.
3. Ejecutar `php -l` en archivos tocados.
4. Verificar que no haya `DB::`/query directa en controller/service.
5. Verificar que no haya clientes HTTP en controller/service.
6. Ejecutar smoke test del endpoint y verificar mismo contrato.
7. Confirmar mapeo de errores funcionales a HTTP esperado.
8. Verificar preview HTML y PDF con mismo resultado visual.

## Criterio de cierre
1. Controller delgado y sin reglas de negocio.
2. Business flow en service/use case.
3. Persistencia en repositories.
4. Integraciones externas en gateways.
5. Render HTML/CSS desacoplado y puro.
6. Contrato HTTP intacto.

## Convencion para controladores nuevos
1. Nacen desacoplados desde el dia uno (no wrappers a otros controllers).
2. Exponen endpoint estable y delegan siempre a servicio de aplicacion.
3. Reutilizan servicios existentes antes de crear nuevas clases.
4. Si se requiere formateo especial, encapsular en response class.

## Politica de propagacion (cambios funcionales)
1. `feature/cambios-generales`
2. `feature/docker-multientorno`
3. `deploy/railway-2026-04-10`
