# Matriz QA / E2E - Sistema Rally

Fecha: 2026-05-08
Ambiente objetivo: local (Laravel + Vite + Admin Vite)
Objetivo: validar de extremo a extremo la vertical `RACING_OPERATIONS`, incluyendo flujo funcional, textos visibles, estilos base Retail, alertas, trazabilidad y contrato UI desde base de datos.

## Alcance

Esta matriz cubre lo implementado en esta iteración para:

1. Vertical `RACING_OPERATIONS`.
2. Módulo Rally en frontend.
3. Bootstrap backend de Rally.
4. Textos UI entregados desde BD (`appcfg.module_ui_texts`) para Rally.
5. Alineación visual base con el lenguaje de RETAIL en botones, inputs, selects, paneles y tabla principal.
6. Flujos funcionales de autos, eventos, checklist, costos, alertas y asignaciones.

## Fuera de alcance de esta matriz

1. Barrido completo de todos los módulos históricos del sistema fuera de Rally.
2. Traducción total del shell global si no pertenece al área tocada en esta iteración.
3. Pruebas de carga o stress profundas.

## Convenciones

- Resultado: `PASS` | `FAIL` | `N/A`
- Severidad: `P1` | `P2` | `P3`
- Evidencia sugerida:
  - captura de pantalla,
  - video corto,
  - payload de red,
  - query de BD,
  - ID generado (vehículo, evento, costo, checklist item).

## URLs y servicios

1. Backend local: `http://127.0.0.1:8000`
2. Frontend principal: `http://localhost:5173`
3. Admin portal: `http://localhost:5174`

Nota:
El frontend principal debe abrirse con la URL/tenant real de la empresa. Si abres solo la raíz y aparece el mensaje de URL de empresa faltante, eso no invalida la prueba; debes entrar por la ruta real del tenant.

## Precondiciones técnicas

1. Backend levantado con:

```powershell
php C:/xampp/htdocs/facturacion_backend/artisan serve --host=0.0.0.0 --port=8000
```

2. Frontend levantado con:

```powershell
npm run dev -- --host=0.0.0.0 --port=5173 --force
```

3. Admin opcional levantado con:

```powershell
npm run dev:admin -- --host=0.0.0.0 --port=5174 --force
```

4. Migraciones de Rally aplicadas:
  - `2026_05_08_000101_seed_racing_operations_vertical`
  - `2026_05_08_000201_create_racing_operations_core_tables`
  - `2026_05_08_000301_create_racing_event_costs_table`
  - `2026_05_08_000401_create_module_ui_texts_and_seed_racing`

5. Existe al menos una empresa con vertical activa `RACING_OPERATIONS`.
6. Existe al menos un usuario con permisos para ver/crear/editar en los módulos requeridos.
7. Si se probará alerta de stock, deben existir:
  - almacén activo,
  - productos activos,
  - stock en `inventory.current_stock`,
  - threshold en `inventory.inventory_settings` o fallback por defecto.

## Verificación técnica previa

### 1) Confirmar vertical activa

Desde la UI:
1. Entrar con empresa configurada para Rally.
2. Confirmar que aparece el módulo Rally en el menú.

O por backend/tinker:

```powershell
php C:/xampp/htdocs/facturacion_backend/artisan tinker --execute="dump(DB::table('appcfg.verticals')->where('code','RACING_OPERATIONS')->exists());"
```

Resultado esperado:
- `true`

### 2) Confirmar textos UI en BD

```powershell
php C:/xampp/htdocs/facturacion_backend/artisan tinker --execute="dump(DB::table('appcfg.module_ui_texts')->where('module_code','RACING_OPERATIONS')->where('locale','es-PE')->count());"
```

Resultado esperado:
- Conteo mayor que `0`

### 3) Confirmar bootstrap de Rally

Ver en red del navegador o usar token válido y revisar `GET /api/racing/bootstrap`.

Resultado esperado:
1. Responde `200`.
2. Devuelve `vehicles`.
3. Devuelve `events`.
4. Devuelve `ui_texts`.

## Datos de prueba recomendados

Preparar o crear durante la prueba:

1. Vehículo de prueba:
  - código: `RLY-001`
  - nombre: `Auto Test QA`

2. Evento de prueba:
  - código: `EVT-QA-01`
  - nombre: `Rally QA Local`

3. Mantenimiento de prueba:
  - componente: `LLANTA_FL`
  - acción: `REPLACE`
  - fecha de servicio: hoy
  - próxima fecha: hoy + 5 días o vencida según caso

4. Producto de prueba para asignación:
  - SKU activo,
  - categoría cargada,
  - stock visible.

5. Costos de prueba:
  - `PRE` / `LOGISTICA`
  - `DURING` / `COMBUSTIBLE`
  - `POST` / `SERVICIO`

## Matriz de escenarios

| ID | Escenario | Tipo | Pasos clave | Resultado esperado | Resultado |
|---|---|---|---|---|---|
| RLY-SYS-01 | Acceso a vertical Rally | Sistema | Entrar con empresa Rally | El menú muestra Rally y permite abrir el módulo | |
| RLY-SYS-02 | Carga bootstrap sin pantalla en blanco | Sistema | Abrir módulo Rally | La vista carga sin error fatal ni pantalla vacía | |
| RLY-SYS-03 | Textos visibles desde BD | Gobernanza UI | Abrir Rally y revisar títulos/placeholders principales | Los textos principales vienen del contrato `ui_texts` | |
| RLY-SYS-04 | Sin inglés visible en área tocada | Gobernanza UI | Recorrer pantalla Rally | No aparecen labels/buttons/títulos en inglés | |
| RLY-SYS-05 | Baseline visual Retail aplicado | Estilo | Revisar botones, inputs, selects, tabla, paneles | No se ven controles nativos; se ve borde, radio, gradiente y hover del baseline | |
| RLY-SYS-06 | Registro de vehículo | Funcional | Crear vehículo | Se agrega a la lista y queda seleccionable | |
| RLY-SYS-07 | Registro de evento | Funcional | Crear evento | Se agrega a la lista y queda seleccionable | |
| RLY-SYS-08 | Historial por auto vacío | Funcional | Seleccionar auto nuevo | Se muestran estados vacíos correctos | |
| RLY-SYS-09 | Crear mantenimiento | Funcional | Registrar mantenimiento sobre auto | Aparece en historial del auto | |
| RLY-SYS-10 | Crear checklist item | Funcional | Seleccionar evento y agregar item | Item aparece en checklist | |
| RLY-SYS-11 | Marcar checklist cargado | Funcional | Pulsar acción de cargar | Status cambia a `LOADED` o equivalente esperado | |
| RLY-SYS-12 | Crear costo de evento | Funcional | Registrar costo | Costo aparece en la lista del evento | |
| RLY-SYS-13 | Resumen de costos por rally | Funcional | Revisar tabla resumen | Tabla muestra presupuesto, real y varianza | |
| RLY-SYS-14 | Alertas vacías | Funcional | Empresa sin datos críticos | Se muestran empty states correctos | |
| RLY-SYS-15 | Alerta de stock bajo | Funcional | Preparar stock <= threshold | Producto aparece en `Stock bajo` | |
| RLY-SYS-16 | Alerta de mantenimiento vencido | Funcional | Próxima fecha <= hoy | Registro aparece en `Mantenimiento pendiente` | |
| RLY-SYS-17 | Alerta de mantenimiento próximo | Funcional | Próxima fecha dentro de ventana | Registro aparece en `Mantenimiento próximo` | |
| RLY-SYS-18 | Autocomplete de producto | Funcional | Escribir 2+ caracteres | Aparecen sugerencias de producto | |
| RLY-SYS-19 | Filtro por categoría | Funcional | Seleccionar categoría y buscar | Resultado se restringe por categoría | |
| RLY-SYS-20 | Asignación a evento | Funcional | Seleccionar producto y asignar cantidad | Se registra asignación correctamente | |
| RLY-SYS-21 | Trazabilidad hacia ledger | Trazabilidad | Registrar asignación con producto/warehouse compatibles | Backend resuelve o conserva `inventory_ledger_id` | |
| RLY-SYS-22 | Persistencia de mensajes de éxito/error | UX | Ejecutar operación válida e inválida | Se muestran notices coherentes | |
| RLY-SYS-23 | Responsive tablet/móvil | UX | Reducir viewport | Layout usable, sin solapes críticos ni controles truncados | |
| RLY-SYS-24 | Integridad de rutas backend | API | Probar `/api/racing/bootstrap`, `/alerts`, `/events/...` | Todas responden sin error 500 | |

## Casos detallados

### RLY-SYS-01 - Acceso a vertical Rally

1. Iniciar sesión en una empresa con vertical `RACING_OPERATIONS`.
2. Abrir el menú lateral.
3. Verificar que aparece la opción Rally.
4. Abrir el módulo.

Resultado esperado:
1. El módulo Rally se muestra solo para esta vertical.
2. No se muestra texto del módulo en inglés.

### RLY-SYS-03 - Textos visibles desde BD

1. Abrir DevTools en Network.
2. Recargar el módulo Rally.
3. Inspeccionar `GET /api/racing/bootstrap`.
4. Confirmar que el response incluye `ui_texts`.
5. Verificar en la pantalla que títulos/placeholders coinciden con esos valores.

Resultado esperado:
1. `ui_texts` está presente en la respuesta.
2. Los títulos principales visibles usan esos textos.

### RLY-SYS-05 - Baseline visual Retail aplicado

Revisar visualmente:

1. Botones de `Registrar`, `Crear`, `Asignar`, `Agregar`, `Registrar costo`.
2. Inputs de código, nombre, búsqueda, cantidad.
3. Select de categoría y select de tipo de mantenimiento/costo.
4. Tabla de resumen de costos.
5. Paneles de bloques.

Resultado esperado:
1. Botones con radio alto tipo píldora, borde suave y fondo degradado.
2. Inputs con borde cálido, radio medio y altura consistente.
3. Tabla con encabezado beige/claro y filas consistentes.
4. No se percibe control nativo sin tematizar.

### RLY-SYS-06 - Registro de vehículo

1. Ir al bloque `Autos de Competencia`.
2. Ingresar código y nombre.
3. Pulsar `Registrar`.

Resultado esperado:
1. El vehículo se agrega a la lista.
2. No aparece error 422 ni 500.
3. Aparece mensaje de éxito.

### RLY-SYS-09 - Crear mantenimiento

1. Seleccionar un auto.
2. Completar componente, tipo y fecha.
3. Pulsar `Agregar`.

Resultado esperado:
1. El mantenimiento aparece en el historial.
2. Si la fecha próxima aplica, impactará luego en alertas.

### RLY-SYS-10 / RLY-SYS-11 - Checklist

1. Seleccionar evento.
2. Agregar un nuevo item.
3. Pulsar `Marcar cargado`.

Resultado esperado:
1. El item queda listado.
2. El estado cambia correctamente al cargarlo.

### RLY-SYS-12 / RLY-SYS-13 - Costos

1. Seleccionar un evento.
2. Registrar un costo `PRE`.
3. Registrar otro `DURING`.
4. Ir al resumen.

Resultado esperado:
1. Los costos aparecen en la lista del evento.
2. El resumen refleja importes reales y varianza.

### RLY-SYS-15 - Stock bajo

Preparación sugerida:
1. Ajustar producto/stock para que quede igual o debajo del threshold.
2. Recargar Rally.

Resultado esperado:
1. El producto aparece en alertas de stock bajo.
2. Se muestra almacén y stock.

### RLY-SYS-16 / RLY-SYS-17 - Mantenimiento vencido y próximo

1. Crear un registro con `next_service_date <= hoy`.
2. Crear otro con `next_service_date` dentro de los próximos 7 días.
3. Recargar Rally.

Resultado esperado:
1. El primero aparece en `Mantenimiento pendiente`.
2. El segundo aparece en `Mantenimiento próximo`.

### RLY-SYS-18 / RLY-SYS-19 - Autocomplete por categoría

1. Seleccionar una categoría.
2. Escribir al menos 2 caracteres.
3. Revisar sugerencias.
4. Repetir con otra categoría.

Resultado esperado:
1. Las sugerencias cambian según categoría.
2. Se puede elegir un producto y asignarlo.

### RLY-SYS-21 - Trazabilidad hacia ledger

1. Registrar asignación con producto existente y almacén compatible.
2. Validar respuesta exitosa.
3. Verificar por BD que `racing.inventory_assignments.inventory_ledger_id` quedó resuelto cuando correspondía.

Query sugerida:

```sql
select id, product_id, inventory_ledger_id, quantity, assigned_at
from racing.inventory_assignments
order by id desc
limit 10;
```

Resultado esperado:
1. La asignación queda registrada.
2. Si el flujo encontró movimiento `IN` compatible, el ledger queda vinculado.

## Checklist de red / API

Durante la prueba funcional, validar que no fallen estas llamadas:

1. `GET /api/racing/bootstrap`
2. `GET /api/racing/alerts`
3. `GET /api/racing/reports/event-cost-summary`
4. `GET /api/racing/events/{id}/checklist`
5. `GET /api/racing/events/{id}/costs`
6. `GET /api/racing/vehicles/{id}/history`
7. `GET /api/inventory/product-lookups`
8. `GET /api/inventory/products?autocomplete=1...`
9. `POST /api/racing/vehicles`
10. `POST /api/racing/events`
11. `POST /api/racing/vehicles/{id}/maintenance`
12. `POST /api/racing/events/{id}/checklist`
13. `PUT /api/racing/events/{id}/checklist/{itemId}`
14. `POST /api/racing/events/{id}/costs`
15. `POST /api/racing/inventory-assignments`

Resultado esperado:
1. Sin `500`.
2. Sin errores de transform de Vite.
3. Sin pantalla en blanco.

## Checklist de gobernanza UI

Marcar `PASS` solo si se cumple todo en el área tocada:

1. No hay títulos principales en inglés.
2. No hay botones principales en inglés.
3. No hay placeholders principales en inglés.
4. Los textos principales provienen de `ui_texts` del backend.
5. Los controles no se ven nativos; respetan baseline visual Retail.
6. Los empty states son coherentes y legibles.

## Registro de incidencias

| Bug ID | Caso | Severidad | Descripción | Evidencia | Estado |
|---|---|---|---|---|---|
| RLY-BUG-001 |  |  |  |  |  |
| RLY-BUG-002 |  |  |  |  |  |
| RLY-BUG-003 |  |  |  |  |  |

## Criterio de cierre

Se considera aprobado si:

1. Todos los casos críticos `RLY-SYS-01` a `RLY-SYS-21` están en `PASS`, o
2. Los `FAIL` restantes son `P3`, están documentados y no bloquean operación real.

## Observaciones para próximas fases

1. Extender el patrón `module_ui_texts` al shell global del sistema.
2. Eliminar literales remanentes fuera de Rally.
3. Consolidar tokens visuales compartidos para nuevos rubros además de Rally.
