---
name: installer-validation-flow
description: "Use when: validating the portable installer ZIP, regenerating the package, and smoke-testing the WSL2 Ubuntu bootstrap flow before release."
---

# Installer Validation Flow

## Purpose
Provide a release gate for the portable installer so a new ZIP is not published until the package is rebuilt and the installer flow is checked against the current branch.

## Scope
1. Portable ZIP generation.
2. WSL2 + Ubuntu bootstrap checks.
3. Minimal payload verification.
4. Batch launcher and script integrity checks.
5. Release cleanup of obsolete archives and temp artifacts.

## Required release rule
Never ship an installer ZIP that was not generated from the current fix branch.

## Validation flow
1. Confirm branch:
- `feature/docker-multientorno`

2. Rebuild portable package:
- Run `scripts/build-portable-installer-package.ps1`

3. Sanity check the installer script:
- Parse `scripts/setup-local.ps1` with PowerShell syntax check.
- Confirm `Ensure-UbuntuInWSL2` accepts existing Ubuntu distros without failing on `ERROR_ALREADY_EXISTS`.

4. Inspect package contents:
- Verify `INSTALAR-FACTURACION.bat`, `ACTUALIZAR-FACTURACION.bat`, `DESINSTALAR-FACTURACION.bat`, and `LIMPIAR-TRANSACCIONALES.bat` exist.
- Verify `payload/facturacion_frontend` and `payload/facturacion_backend` only contain the minimal contract files.

5. Smoke-test the portable flow:
- Run the generated `INSTALAR-FACTURACION.bat` from the portable folder or ZIP extraction.
- If the machine already has Ubuntu, the installer must continue without forcing a manual restart.

6. Release cleanup:
- Keep only the latest ZIP.
- Remove older installer archives and temp validation files.

## Non-destructive test order
1. Syntax check.
2. Package rebuild.
3. Archive inspection.
4. Installer smoke test in a controlled machine.

## Failure policy
1. If the portable ZIP was built from an older commit, rebuild it.
2. If the flow still fails on an existing Ubuntu distro, fix `scripts/setup-local.ps1` before publishing.
3. If obsolete archives remain, delete them before handing the package to users.