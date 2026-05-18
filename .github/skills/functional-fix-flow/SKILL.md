---
name: functional-fix-flow
description: "Use when: applying any functional bugfix/feature to enforce branch order cambios-generales -> docker-multientorno -> railway and avoid branch drift."
---

# Functional Fix Flow (Mandatory)

## Purpose
Guarantee that all functional changes are applied first in `feature/cambios-generales` and only then propagated to environment branches.

## Single approval gate (speed mode)
When user intent is clear ("propaga", "continua", "hazlo"), request one generic approval and then execute the full propagation until push.

### One-time approval template
- "Aplicar propagacion funcional completa (commit/cherry-pick/push en cambios-generales, docker-multientorno y railway). Aceptar/Rechazar"

### After approval = no repeated confirmations
- Do not ask per-commit, per-cherry-pick, or per-push confirmations.
- Continue end-to-end unless blocked by a true critical condition.

### Only re-ask approval on critical events
- Destructive operations (`reset --hard`, deleting history, dropping DB/volumes).
- Secret handling/credential rotation.
- Ambiguous or conflicting branch target that can cause data loss.

### Rejection behavior
- If user rejects, stop immediately and report pending steps not executed.

## Mandatory order
1. Checkout `feature/cambios-generales`.
2. Implement functional fix there.
3. Validate (lint/tests/smoke as applicable).
4. Commit and push to `origin/feature/cambios-generales`.
5. Propagate to `feature/docker-multientorno` (merge or cherry-pick).
6. Propagate to `railway` branch (merge or cherry-pick).
7. Push each target branch and verify commit presence.

## Branch policy
- Functional logic: only authored first on `feature/cambios-generales`.
- Installer/docker specifics: `feature/docker-multientorno`.
- Railway/cloud specifics: `railway`.
- Never skip step 4 before propagating.

## Emergency rule
If a hotfix is mistakenly committed first to `feature/docker-multientorno`:
1. Immediately cherry-pick that commit into `feature/cambios-generales`.
2. Push `feature/cambios-generales`.
3. Keep both branches aligned and document the incident in PR/commit notes.

## Verification checklist
- `git log --oneline -n 5` on all branches contains the functional fix.
- No unintended file changes leaked from installer/runtime artifacts.
- Remote heads updated: `origin/feature/cambios-generales`, `origin/feature/docker-multientorno`, `origin/railway`.
- In speed mode, confirm that one-time approval was used and no extra approvals were requested.

## Commit message convention
Use semantic prefix and context, e.g.:
- `fix(sunat): ...`
- `feat(sales): ...`
- `refactor(tax-bridge): ...`
