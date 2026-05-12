---
mode: ask
model: GPT-5.3-Codex
description: "Auditar y optimizar desacoplamiento + velocidad + llamadas repetitivas con salida medible."
---

Usa el agente fullstack-optimization-expert.

Objetivo:
1. Encontrar por que el modulo sigue lento.
2. Identificar acoplamientos que fuerzan recargas o sobre-trabajo.
3. Detectar y eliminar llamadas API repetitivas.
4. Entregar parches minimos con metricas before/after.

Entregables obligatorios:
1. Mapa de llamadas duplicadas por modulo (causa raiz incluida).
2. Mapa de hotspots de desacoplamiento (frontend y backend).
3. Parches minimos priorizados (P1/P2/P3) con archivos objetivo.
4. Medicion before/after: request count, tiempo de carga, latencia endpoint.
5. Riesgos residuales y pasos siguientes.
