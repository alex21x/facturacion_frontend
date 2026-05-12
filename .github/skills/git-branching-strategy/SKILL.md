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

## Typical propagation workflow
1. Develop and validate the change on `cambios-generales`.
2. Merge or cherry-pick into `docker-multi-entorno` → rebuild and test local docker.
3. Merge or cherry-pick into `railway` → trigger Railway deploy and verify cloud.

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
