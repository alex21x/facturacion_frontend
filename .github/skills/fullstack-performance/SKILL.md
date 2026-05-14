---
name: fullstack-performance
description: "Use when: frontend and backend need coordinated speed optimization, duplicate API calls, slow module load, and scalability improvements."
---

# Fullstack Performance Skill (Frontend)

Purpose:
Run a coordinated optimization workflow across frontend and backend interaction points.

Workflow:
1. Map module boot sequence and API call graph.
2. Detect duplicate calls and waterfalls.
3. Identify payload bloat and backend hotspots.
4. Apply minimal patches in safe order.
5. Measure before/after with request count and timing.

Guardrails:
1. No breaking API changes without migration plan.
2. Keep user-facing behavior stable.
3. Prefer reversible patches.

Expected outputs:
1. Bottleneck map.
2. Patch list by file.
3. Measurable gains.
4. Rollback notes.
