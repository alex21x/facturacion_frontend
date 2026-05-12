---
mode: ask
model: GPT-5.3-Codex
description: "Construir el nuevo rubro RACING_OPERATIONS reutilizando Retail/Restaurant y cubriendo inventario, autos, rallys, costos y reportes."
---

Usa el agente `racing-operations-vertical-builder`.

Objetivo:
1. Definir y construir el rubro `RACING_OPERATIONS` con las capacidades operativas de rally.
2. Reutilizar al máximo módulos, rutas y tablas existentes de RETAIL y RESTAURANT.
3. Entregar implementación incremental con riesgo controlado.

Cobertura funcional obligatoria:
1. Inventario completo (repuestos, herramientas, insumos, EPP, combustibles, llantas).
2. Entradas/salidas con responsable y asignación a auto/rally.
3. Historial por auto y vida útil de componentes.
4. Compras, proveedores y servicios externos.
5. Control de gastos pre/durante/post rally.
6. Planificación de rally (checklist, personal, equipos, ida/vuelta).
7. Historial por evento e incidencias.
8. Reportes operativos y ejecutivos.
9. Alertas automáticas, búsqueda rápida, soporte móvil/tablet y registro visual.

Entregables:
1. Mapa de reutilización RETAIL/RESTAURANT.
2. Gaps y diseño del nuevo modelo de datos.
3. Plan P1/P2/P3 con archivos objetivo.
4. Parches mínimos por fases.
5. Checklist de validación funcional + despliegue en `docker-multi-entorno` y `railway`.
