---
name: sunat-asynchronous-ticket-flow
description: "Use when: implementing or debugging asynchronous SUNAT flows that return ticket numbers and require later consultation for summaries, voids, GRE, retentions, or perceptions."
---

# SUNAT Asynchronous Ticket Flow

## Purpose
Use this workflow when a SUNAT or bridge response returns a ticket and the operation is not final yet.

This skill covers:
- Resumen diario de boletas and their cancellations.
- Comunicacion de baja for invoices, credit notes, and debit notes.
- GRE tickets for remitente and transportista flows.
- Retentions and perceptions sent in batch or asynchronous mode.

## Core rule
A ticket is not a final approval.

If the bridge returns a ticket, the system must:
1. Persist the request as a transitory state.
2. Store ticket, HTTP code, raw response, and endpoint.
3. Schedule or trigger later ticket consultation.
4. Update the commercial/tributary state only after a final response is obtained.

## Required workflow
1. Identify the ticket-bearing send method.
2. Determine whether the flow is RC, RA, GRE, retencion, percepcion, or another batch process.
3. Persist the initial response as `SENT`, `SENDING`, or `PENDING_CONFIRMATION`.
4. Consult the ticket using `ConsultCdrService::getStatus($ticket)` or the project equivalent.
5. Interpret the final code and update the document state atomically.
6. Apply inventory and cash effects only if the final state requires it.

## Ticket consultation contract
Use the bridge's async consultation method as the source of truth.

Expected behavior:
- `getStatus($ticket)` returns a success flag.
- A successful call with code `0` means the processing finished successfully.
- Codes such as `98` and `99` should keep the document in a pending/retry state until a final code arrives.

## State mapping
Use one consistent state model for UI and persistence.

### Suggested technical states
- `SENDING`
- `SENT`
- `PENDING_CONFIRMATION`
- `ACCEPTED`
- `REJECTED`
- `ERROR`
- `EXPIRED_WINDOW`
- `CONFIG_INCOMPLETE`

### UI guidance
- Show `Enviado / pendiente de confirmacion` while the ticket is still unresolved.
- Show `Anulado` or `Aceptado` only after the final response is confirmed.
- Do not let the UI infer final acceptance from ticket presence alone.

## Persistence guidance
Store the following in the document or guide record:
- `status` as the commercial or operational state.
- `metadata.sunat_status` for the tributary send/consult flow.
- `metadata.sunat_void_status` for cancellation flows.
- `metadata.sunat_ticket` or equivalent.
- `metadata.sunat_bridge_response` or equivalent raw response.
- `metadata.sunat_last_sync_at`.

Prefer a single service that updates status and metadata together.

## Side effects
### Inventory
Apply or reverse inventory only on final acceptance.
- Sales accepted: stock impact allowed.
- Void accepted: reverse stock if the document had affected inventory.
- Pending ticket: no final reversal yet.

### Cash
Treat financial impact separately from transport or ticket state.
- Pending ticket should not be presented as final reversal in cash.
- Final acceptance of voids or corrections should update the cash-facing state.

## Implementation notes
- Centralize state transitions in one service.
- Reuse the same state updater for sales, summaries, voids, and GRE.
- Log every ticket request and every final consultation result.
- Keep retry/backoff behavior explicit and deterministic.

## Validation checklist
- The initial bridge response stored a ticket.
- The async consultation endpoint was invoked.
- The final state is reflected in the commercial document.
- Inventory and cash side effects happened only on final acceptance.
- The user-facing status is not ambiguous.

## When to apply the functional flow
If this skill leads to code changes, apply them first in `feature/cambios-generales`, then propagate to `feature/docker-multientorno`, and finally to the deployment branch.
