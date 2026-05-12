---
name: installer-wsl2-lightweight
description: "Use when: building/updating the portable installer with lightweight Docker (WSL2 + Ubuntu), trimming payload size, and validating no regressions in install/update/uninstall/cleanup batch flows."
---

# Installer WSL2 Lightweight Skill

## Purpose
Provide a repeatable workflow to keep the Windows installer as light as possible while preserving full install/update/uninstall/cleanup behavior.

## Scope
1. Portable package generation.
2. Docker bootstrap strategy on low-resource PCs.
3. Payload trimming without breaking batch entrypoints.
4. Regression checks for install/update/uninstall/cleanup scripts.

## Required policy
1. Default Docker path is lightweight: WSL2 + Ubuntu + docker.io.
2. Docker Desktop is optional only (explicit opt-in).
3. In non-interactive mode, do not auto-install/start Docker Desktop.
4. Keep all top-level batch launchers functional:
- INSTALAR-FACTURACION.bat
- ACTUALIZAR-FACTURACION.bat
- DESINSTALAR-FACTURACION.bat
- LIMPIAR-TRANSACCIONALES.bat

## Minimal payload contract
Only include files required by installer overrides and cleanup fallback:
1. payload/facturacion_frontend/docker-compose.local.yml
2. payload/facturacion_frontend/docker-entrypoint.frontend.sh
3. payload/facturacion_frontend/docker-entrypoint.admin.sh
4. payload/facturacion_backend/Dockerfile.local
5. payload/facturacion_backend/docker/entrypoint.local.sh
6. payload/facturacion_backend/database/sql/clean_transactional_operational.sql

Do not include logs, SQL dumps, backups, dist artifacts, or full repository mirrors inside payload.

## End-to-end workflow
1. Build portable package:
- Run scripts/build-portable-installer-package.ps1

2. Validate payload size and content:
- Confirm payload has only minimal contract files.
- Confirm no storage/log/backups are inside payload.

3. Validate script integrity:
- Parse scripts/setup-local.ps1 with PowerShell parser.
- Verify installer scripts present in portable/scripts.

4. Validate batch compatibility:
- Install batch still calls scripts/instalar-local.bat.
- Update batch still calls scripts/actualizar-local.bat.
- Uninstall batch still calls scripts/desinstalar-local.bat.
- Cleanup batch still calls scripts/limpiar-transaccionales-local.bat.

5. Validate Docker flow behavior:
- Ensure-DockerAvailable prioritizes WSL2 Docker path.
- Docker Desktop prompts remain opt-in only.

6. Package output:
- Compress folder as INSTALADOR_FACTURACION_LIGERO_YYYYMMDD_HHMMSS.zip.

## Regression checklist
1. Install flow succeeds on clean machine.
2. Update flow preserves existing data and config.
3. Uninstall flow still removes local stack correctly.
4. Cleanup flow still finds and executes clean_transactional_operational.sql.
5. LAN access option behavior remains unchanged.

## Safe changes
1. Remove transient files (logs, backups, temp scripts) from portable output.
2. Keep payload contract files untouched.
3. Keep batch entrypoint names and target script paths unchanged.

## Unsafe changes (avoid)
1. Renaming top-level batch files.
2. Removing scripts/preparar-entorno.ps1 or scripts/setup-local.ps1.
3. Removing clean_transactional_operational.sql from both database/sql and payload fallback.
4. Auto-enabling Docker Desktop install/start in silent mode.
