---
name: infra-performance
description: "Use when: improve Docker speed, startup time, scalability, install/update reliability, container troubleshooting, WSL and resource tuning."
---

# Infra Performance Skill

## Purpose
Run a fast, repeatable workflow to improve infrastructure speed and scalability without breaking install/update behavior.

## Inputs
1. Target scope: install, update, startup, or runtime performance.
2. Environment: client machine or dev machine.
3. Error symptom: timeout, container crash, vite not found, db init failure, slow build.

## Workflow
1. Capture baseline metrics:
- Time to install.
- Time to first healthy stack.
- Time to update and run migrations.

2. Collect health signals:
- docker compose ps
- docker compose logs --tail=120
- WSL status and Docker engine status

3. Apply low-risk optimizations in order:
- Fix entrypoint/line ending issues.
- Ensure dependency bootstrap for frontend/admin containers.
- Trim heavy payload and build context.
- Validate postgres volume/mount compatibility.
- Keep update mode persistence-safe.

4. Validate behavior:
- Install from clean state.
- Update with data present.
- Transactional cleanup routine keeps masters.

## Guardrails
1. Never wipe transactional data in update flow.
2. Never remove required scripts for desktop shortcuts (levantar/apagar/limpiar).
3. Avoid one-off machine hacks; prefer package-level fixes.
4. Keep all fixes testable with a single rerun.
5. Portable ZIP installer must prioritize local payload (`payload/facturacion_frontend` and `payload/facturacion_backend`) and use Git branch sync only as fallback; this avoids recurrent "No se encontro una rama remota valida" failures on client machines.
6. Docker policy for low-resource PCs: default path must be lightweight (`Docker Engine + WSL2`) and must not auto-install Docker Desktop.
7. Docker Desktop is optional only: install/start it exclusively after explicit user confirmation (`opt-in`), never as implicit fallback.
8. In non-interactive mode, never trigger Docker Desktop install/start automatically; fail fast with clear guidance to enable Engine first.

## Quick command bundle (PowerShell)
```powershell
docker compose -p facturacion_local -f docker-compose.local.yml ps
docker compose -p facturacion_local -f docker-compose.local.yml logs --tail=120
wsl --status
docker info
```

## Expected outputs
1. Root-cause summary.
2. Small patch set.
3. Before/after timing notes.
4. Deployment-safe recommendation.
