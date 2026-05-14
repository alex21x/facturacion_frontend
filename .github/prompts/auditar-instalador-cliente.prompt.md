---
mode: ask
model: GPT-5.3-Codex
description: "Auditar instalador en cliente (Docker/WSL, install/update/desinstalar, tiempos y estabilidad)."
---

Usa el agente installer-reliability para auditar el instalador en entorno cliente.

Objetivo:
1. Detectar por que falla o se vuelve lento el flujo de instalacion.
2. Confirmar que update preserve data transaccional.
3. Proponer parches minimos, reversibles y medibles.

Entradas:
1. Ruta de paquete instalador usado por cliente.
2. Error exacto observado.
3. Si Docker Desktop muestra advertencias de WSL.

Salida requerida:
1. Hallazgos (severidad, causa, evidencia).
2. Fix minimo recomendado.
3. Comandos de validacion paso a paso.
4. Riesgo para datos y plan de rollback.
