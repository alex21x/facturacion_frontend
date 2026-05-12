# Normalizar estilos Rally (baseline Retail)

Usa el agente `frontend-style-governance` y el skill `frontend-style-retail-baseline`.

Objetivo:
- Mapear todos los estilos de botones, inputs/selects y tipografía del módulo Rally.
- Tomar RETAIL como baseline visual.
- Aplicar mejoras incrementales sin tocar lógica de negocio.
- Eliminar hardcode de textos visibles y resolverlos desde backend/BD.
- Evitar cualquier texto de módulo/control en inglés en runtime.

Alcance inicial:
- `src/modules/racing/components/RacingOperationsView.tsx`
- Estilos asociados en `src/modules/racing/**` y capas compartidas necesarias.

Entregables:
1. Matriz de mapeo (elemento, selector actual, baseline, delta, acción, prioridad).
2. Matriz de textos (literal actual, ubicación, idioma, origen backend/BD, acción, prioridad).
3. Patch mínimo de normalización (clases/tokens + textos desde backend/BD, no rediseño).
4. Validación en desktop y móvil, incluyendo hover/focus/disabled/error y consistencia de idioma.

Restricciones:
1. Reuse-first de selectores/tokens de RETAIL.
2. Evitar estilos inline repetidos.
3. No introducir paleta nueva aislada en Rally.
4. No dejar textos hardcodeados en componentes de UI.
5. Ningún módulo o texto visible debe mostrarse en inglés.
