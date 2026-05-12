---
name: frontend-style-retail-baseline
description: "Use when: you need to map and normalize frontend styles (buttons, inputs, typography) taking RETAIL as baseline, and apply improvements first to RALLY."
---

# Frontend Style Baseline (RETAIL -> RALLY)

## Objetivo
- Estandarizar estilos de controles y tipografía sin rediseñar el producto.
- Tomar RETAIL como fuente visual principal.
- Aplicar primero en RALLY (`src/modules/racing/**`) para luego escalar a nuevos rubros.
- Garantizar gobernanza de idioma: sin hardcode y sin inglés en textos visibles al usuario.

## Baseline recomendado (fuentes actuales)

### Archivos de referencia RETAIL/global
- `src/modules/inventory/inventory.css`
- `src/modules/products/products.css`
- `src/styles/global.css`
- `src/styles/modules/sales.css`
- `src/styles/modules/purchases.css`

### Convenciones observables que deben conservarse
1. Botones con borde suave + gradiente sutil + estados hover/disabled legibles.
2. Inputs/select con alturas consistentes (>= 40px en formularios principales).
3. Tipografía de tablas compacta y headings legibles por jerarquía.
4. Cards/tablas con borde cálido, radio medio y contraste de fondo suave.

## Matriz de mapeo obligatoria

Para cada módulo objetivo, levantar esta tabla:

1. `elemento`: button/input/select/textarea/label/table-heading/body.
2. `ruta`: archivo y selector actual.
3. `baseline`: selector RETAIL equivalente.
4. `delta`: diferencias (color, tamaño, borde, spacing, estado).
5. `accion`: reutilizar clase / crear variante / migrar inline style a clase.
6. `prioridad`: P1 (bloqueante visual), P2 (consistencia), P3 (afinado).

## Matriz de textos obligatoria (nueva)

Para cada texto visible, levantar esta tabla:

1. `texto_actual`: literal actual encontrado en frontend.
2. `ubicacion`: archivo + componente.
3. `tipo`: modulo/menu/label/boton/placeholder/error/empty-state/title.
4. `idioma_actual`: ES/EN/mixto.
5. `origen_objetivo`: endpoint/campo de BD que provee traducción.
6. `llave_o_codigo`: key/código de traducción en backend.
7. `accion`: eliminar hardcode y resolver desde datos de backend.
8. `prioridad`: P1 (texto principal en inglés o hardcode crítico), P2, P3.

## Plan de ejecución para RALLY (primera fase)

### 1) Inventario en Rally
- Objetivo inicial: `src/modules/racing/components/RacingOperationsView.tsx`.
- Detectar:
  - botones de acción,
  - campos de formulario,
  - bloques de alertas y tablas,
  - estilos inline repetidos.
  - todo texto visible hardcodeado (incluyendo labels de módulos en inglés).

### 2) Normalización por capas
1. Crear/usar clases CSS en `src/modules/racing/racing.css` o capa compartida existente.
2. Reemplazar estilos inline repetidos por clases semánticas.
3. Alinear variantes con baseline RETAIL:
   - `btn-primary`, `btn-secondary`, `field-control`, `table-compact`, `section-title` (o equivalentes ya existentes en el repo).
4. Reemplazar todos los textos hardcodeados por textos provenientes de backend/BD (catálogo de traducciones o configuración por módulo).

### 3) Validación mínima
1. Desktop (>= 1280px) y tablet/móvil (<= 768px).
2. Estados: hover, focus-visible, disabled, error.
3. Lectura en tablas y formularios densos.
4. Sin cambios funcionales en handlers ni payloads.
5. Ningún texto visible en inglés en las áreas tocadas.
6. Ningún texto visible hardcodeado en las áreas tocadas.

## Reglas de implementación
1. Reusar primero, crear nuevo token/clase solo si no existe equivalente razonable.
2. No mezclar cambios de lógica con cambios de estilo en el mismo patch grande.
3. Cambios pequeños y verificables por pantalla/sección.
4. Evitar introducir una nueva paleta aislada en Rally.
5. Prohibido dejar texto de UI hardcodeado en componentes de módulo.
6. Todo texto de UI debe venir de backend/BD (catálogo de traducciones/configuración de módulo/rubro).
7. Si falta un texto en BD, registrar gap explícito y crear el contrato backend antes de fijar literal en frontend.

## Entregable esperado cada vez que se use este skill
1. Mapa de estilos actual (tabla breve con hallazgos).
2. Mapa de textos (hardcode + idioma + origen backend esperado).
3. Lista de divergencias Rally vs Retail (estilo + idioma).
4. Patch mínimo aplicado (o plan exacto de patch si está en modo análisis).
5. Checklist de validación visual/funcional/idioma completado.
