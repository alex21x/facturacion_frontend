# Matriz QA - Notas (NC/ND) y SUNAT

Fecha: 2026-04-15
Ambiente: local (Laravel + Vite)
Objetivo: validar envio SUNAT, visibilidad en reporte y comportamiento de UI para notas de credito/debito.

## Convenciones
- Resultado: `PASS` | `FAIL` | `N/A`
- Evidencia sugerida: captura de pantalla + ID de documento + serie-numero
- Modo envio SUNAT:
  - `Directo`
  - `No enviar ahora` (manual posterior)

## Precondiciones
1. Existen documentos base emitidos:
   - al menos 1 boleta emitida
   - al menos 1 factura emitida
2. El catalogo de tipos de comprobante tiene NC/ND habilitadas.
3. Usuario con permisos para emitir y ver reporte de ventas.

## Matriz de casos

| ID | Caso | Tipo Nota | Documento afectado | Modo SUNAT | Pasos clave | Resultado esperado | Resultado |
|---|---|---|---|---|---|---|---|
| QA-01 | NC de boleta con envio directo | Nota de credito | Boleta | Directo | Crear NC -> emitir | Se crea, aparece en Reporte de ventas, estado SUNAT no queda en pendiente manual por defecto | |
| QA-02 | ND de boleta con envio directo | Nota de debito | Boleta | Directo | Crear ND -> emitir | Se crea, aparece en Reporte de ventas, flujo SUNAT disponible/activo | |
| QA-03 | NC de factura con envio directo | Nota de credito | Factura | Directo | Crear NC -> emitir | Se crea, aparece en Reporte de ventas, estado SUNAT coherente con envio automatico | |
| QA-04 | ND de factura con envio directo | Nota de debito | Factura | Directo | Crear ND -> emitir | Se crea, aparece en Reporte de ventas, estado SUNAT coherente con envio automatico | |
| QA-05 | NC con no enviar ahora + envio manual | Nota de credito | Boleta o Factura | No enviar ahora | Crear NC -> emitir -> enviar SUNAT manual | Inicialmente queda pendiente manual y luego cambia tras envio manual | |
| QA-06 | ND con no enviar ahora + envio manual | Nota de debito | Boleta o Factura | No enviar ahora | Crear ND -> emitir -> enviar SUNAT manual | Inicialmente pendiente manual, luego cambia tras envio manual | |
| QA-07 | Visibilidad inmediata en reporte | NC/ND | Boleta o Factura | Cualquiera | Emitir -> ir a Reporte | El documento aparece sin requerir refrescos inconsistentes ni perderse por filtros de tipo | |
| QA-08 | Exportacion CSV/XLSX respeta filtros | NC/ND | Boleta o Factura | Cualquiera | Filtrar reporte -> exportar | Exportacion contiene las notas visibles segun filtro activo | |
| QA-09 | Reset total al volver a Venta rapida | N/A | N/A | N/A | Ir a Reporte -> volver a Venta rapida | Form limpio: cliente, tipo, doc afectado, items y campos de producto/manual reseteados | |
| QA-10 | UI compacta de "Afectando" | NC/ND | Boleta o Factura | N/A | Seleccionar documento afectado | Texto "Afectando" se ve compacto y no empuja excesivamente la seccion de items | |

## Checklist detallado por caso

### QA-01 a QA-04 (Directo)
1. Entrar a Venta rapida.
2. Seleccionar tipo de comprobante (NC o ND).
3. Seleccionar documento afectado correcto (boleta/factura segun caso).
4. Seleccionar motivo de nota.
5. En "Envio SUNAT" elegir `Directo`.
6. Emitir.
7. Verificar:
   - documento creado con serie-numero
   - aparece en Reporte de ventas
   - estado SUNAT consistente con intento de envio automatico

### QA-05 y QA-06 (No enviar ahora + manual)
1. Repetir emision de nota con `No enviar ahora`.
2. Confirmar estado inicial pendiente para envio manual.
3. Desde Reporte, usar accion `Enviar SUNAT`.
4. Verificar cambio de estado.

### QA-09 (Reset al volver a Venta rapida)
1. Dejar filtros y/o fila seleccionada en Reporte.
2. Pulsar "Venta rapida".
3. Confirmar que no se arrastran datos de cliente/documento afectado/items ni texto residual.

### QA-10 (Compactacion visual)
1. Crear flujo de nota con documento afectado seleccionado.
2. Confirmar que el aviso "Afectando: ..." ocupa poco alto y no baja demasiado la grilla de items.

## Registro de incidencias

| Bug ID | Caso QA | Severidad | Descripcion | Evidencia | Estado |
|---|---|---|---|---|---|
| BUG-001 |  |  |  |  |  |
| BUG-002 |  |  |  |  |  |

## Criterio de cierre
- Todos los casos QA-01 a QA-10 en `PASS`, o
- Bugs abiertos documentados con workaround y aprobacion funcional temporal.
