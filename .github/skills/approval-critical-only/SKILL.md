---
name: approval-critical-only
description: "Use when: deciding whether to ask the user for approval before executing an action. Prioritize speed and ask only for truly critical/delicate actions."
---

# Approval Policy: Critical Only

## Objective
Minimize friction and avoid unnecessary confirmations.

## Core Rule
Ask for user approval only when an action is **critical or delicate**.
Execute routine, low-risk, reversible work directly.

## Require approval (critical/delicate)
- Destructive operations: delete/reset/overwrite large data, force actions, irreversible cleanup.
- Security-sensitive actions: secrets, credentials, tokens, key/cert handling, permission elevation.
- External impact: production deploys, customer-facing outages, DNS/domain/cert changes, billing-impacting ops.
- High-risk infra changes: firewall/network policies, database schema changes with data-loss risk.
- Ambiguous intent with potential damage: when requirements are unclear and blast radius is high.

## Do not ask approval (execute directly)
- Code edits, bugfixes, refactors, style cleanup, local script fixes.
- Local build/test/lint, logs inspection, diagnostics, non-destructive checks.
- Safe config updates that are local/reversible and within confirmed task scope.
- Branch propagation steps already requested by the user.

## Decision Heuristic
If action risk is low and reversible in minutes, execute.
If action risk is high, irreversible, security-sensitive, or externally impactful, ask first.

## Response Style
- Keep approvals short and specific when needed.
- Avoid chained confirmations for routine sub-steps.
- If user already said "proceed", continue until blocked by a truly critical decision.

## Examples
- "Run local tests and patch component" -> execute directly.
- "Drop database volume and recreate from scratch" -> ask approval.
- "Rotate API key / modify secrets" -> ask approval.
- "Push Railway production deploy" -> ask approval if not explicitly requested for this step.
