---
name: git-branching-strategy
description: "Use when: the user asks about branches, where to commit, how to deploy, which branch receives a change, or how to propagate functional changes to local docker or Railway cloud."
---

# Git Branching Strategy — Facturación

## Branches and their purpose

### `cambios-generales`
- **Primary working branch** for all functional changes.
- Any new feature, fix, or improvement is developed here first.
- This branch is the source of truth for functional logic.

### `docker-multi-entorno`
- Receives all functional changes from `cambios-generales`.
- Produces the **dockerized package for local installation** (XAMPP/Docker Compose on bare metal or LAN PC).
- Contains docker-compose, Dockerfile.local, installer scripts, and environment-specific config for local multi-tenant deploy.

### `railway` (also spelled "Railway")
- Receives all functional changes from `cambios-generales`.
- Produces the **Railway cloud deployment** (railway.json, Dockerfile.railway, cloud env vars).
- All Railway-specific config, secrets, and service wiring lives here.

## Core rule
Every functional change committed to `cambios-generales` must be propagated to **both** `docker-multi-entorno` and `railway` so that:
1. The local Docker installation stays current.
2. The Railway cloud deployment stays current.

After any functional fix or feature, the related branches must be left aligned with the same fix before closing the task. Do not consider the work complete until the target branches that should receive the change have the corresponding commit or cherry-pick.

## Typical propagation workflow
1. Develop and validate the change on `cambios-generales`.
2. Merge or cherry-pick into `docker-multi-entorno` → rebuild and test local docker.
3. Merge or cherry-pick into `railway` → trigger Railway deploy and verify cloud.

## Railway deploy rule (mandatory)
- For this repository, cloud deploys must be triggered only from the Railway deploy branch.
- Do not push release/deploy commits from `docker-multi-entorno` when the intention is Railway deployment.
- First propagate functional commits to Railway branch, then push that Railway branch to trigger CI/CD.
- If a commit was pushed from the wrong branch by mistake, cherry-pick it into Railway branch and redeploy from Railway.
- For the frontend Railway image, prefer the static server entrypoint (`node scripts/serve-static.mjs dist`) over `vite preview` so healthchecks stay stable in production.

## Change classification (must decide before committing)
Use this table to avoid ambiguity:

| Change type | Examples | Branch propagation |
|---|---|---|
| Functional (business/app logic) | `src/**`, controllers, API payloads, feature behavior, auth flow logic, UI behavior | `cambios-generales` first, then propagate to `docker-multi-entorno` and `railway` |
| Cloud deploy/infrastructure only | `Dockerfile.railway`, `railway.json`, Railway runtime env wiring, healthcheck tuning | Keep in `railway` deploy branch only |
| Local installer/infrastructure only | `docker-compose.local.yml`, installer scripts, local entrypoints | Keep in `docker-multi-entorno` (and local-focused branches) |

If a commit mixes functional + infrastructure changes, split it into separate commits by concern.

## Task closure checklist (mandatory)
Before saying a fix is complete:
1. Classify the change (functional vs deploy-only).
2. Apply propagation based on classification table.
3. Verify target branches contain the fix (or cherry-pick equivalent).
4. Push remote heads for the branches that should receive it.
5. Report branch hashes in the final update.
6. Do not leave the main user-reported issue pending. If blocked by missing access/config, explicitly ask the user and stop only after confirmation.

## What lives only on specific branches
| Concern | Branch |
|---|---|
| Functional code (controllers, models, frontend modules) | `cambios-generales` (then propagated) |
| docker-compose.local.yml, installer .bat/.ps1 scripts | `docker-multi-entorno` |
| railway.json, Dockerfile.railway, Railway env overrides | `railway` |

## Guardrails for the agent
- When the user asks "where do I commit X?": functional change → `cambios-generales`.
- When the user asks "how do I deploy locally?": guide toward `docker-multi-entorno`.
- When the user asks "how do I deploy to the cloud?": guide toward `railway`.
- Always remind: both `docker-multi-entorno` and `railway` must receive the same functional patches to avoid drift.
- Do not ask the user to re-state this policy; apply it automatically on every fix.
