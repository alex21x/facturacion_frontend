---
name: responsive-standard-devices
description: "Use when: fixing responsive issues, layout deformation across devices, mobile/tablet/desktop UI breakpoints, overflow bugs, and applying project-wide responsive standards."
---

# Responsive Standard Devices

## Objetivo
- Evitar deformaciones visuales en dispositivos estandar.
- Mantener consistencia en desktop, laptop, tablet y movil.
- Corregir responsive por capas sin mezclar logica funcional.

## Dispositivos estandar objetivo
1. Mobile S: 360x640
2. Mobile M: 390x844
3. Mobile L: 430x932
4. Tablet: 768x1024
5. Laptop: 1366x768
6. Desktop: 1920x1080

## Breakpoints oficiales del proyecto
1. <= 480px: micro ajustes de lectura y espacios.
2. <= 768px: layout movil (1 columna en formularios densos).
3. <= 900px: tablet compacta para modulos de ventas/compras.
4. <= 1024px: tablet horizontal y laptops pequenas.
5. <= 1366px: laptop estandar (ajuste de paddings/anchos).

## Reglas base obligatorias
1. Nunca usar anchos fijos para contenedores principales.
2. Tablas anchas deben ir siempre dentro de wrappers con overflow horizontal.
3. Inputs, selects, textareas y botones deben respetar max-width: 100%.
4. En formularios densos, pasar a una columna en <= 900px.
5. Evitar textos auxiliares debajo de inputs si rompen la fila.
6. Priorizar minmax(0, 1fr) y auto-fit/auto-fill sobre columnas fijas.

## Flujo de correccion (todo modulo)
1. Detectar el bloque deformado (layout, tabla, formulario o toolbar).
2. Revisar su grilla base en desktop.
3. Agregar ajustes escalonados en <= 1366, <= 1024, <= 900, <= 768, <= 480.
4. Validar que no aparezca scroll horizontal no intencional.
5. Verificar foco, hover y disabled en controles luego del ajuste.

## Checklist rapido por pantalla
1. No hay recorte de botones primarios.
2. No hay inputs montados ni saltos verticales inesperados.
3. No hay texto truncado sin contexto.
4. No hay overflow horizontal del body.
5. Tablas siguen accesibles mediante scroll interno.

## Convenciones de implementacion
1. Cambios pequenos por modulo (no mega-refactor).
2. CSS por modulo en src/styles/modules/*.css cuando aplique.
3. Reglas transversales solo en src/styles/global.css.
4. Evitar !important salvo en overrides responsive inevitables de grids legacy.

## Entregable esperado al usar este skill
1. Lista de archivos tocados.
2. Breakpoints aplicados por cada archivo.
3. Evidencia de que se evita deformacion en 360, 768, 1366 y 1920.
4. Riesgos residuales si quedan modulos pendientes.
