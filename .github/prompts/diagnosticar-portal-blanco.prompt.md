---
mode: ask
model: GPT-5.3-Codex
description: "Diagnosticar portal admin en blanco (containers arriba pero login no renderiza)."
---

Usa el agente docker-runtime-troubleshoot para diagnosticar pantalla en blanco del portal admin.

Objetivo:
1. Verificar estado real de frontend/admin/backend/postgres.
2. Confirmar carga de assets Vite y reachability de backend.
3. Corregir fallas de runtime con parches minimos.

Checklist obligatorio:
1. docker compose ps
2. docker compose logs --tail=120 admin frontend backend postgres
3. HTTP checks a /, /@vite/client, entrada TSX, health backend
4. Confirmar render de login (no solo status 200)

Salida requerida:
1. Componente que falla.
2. Causa raiz.
3. Patch minimo por archivo.
4. Validacion final (UI + HTTP + logs).
