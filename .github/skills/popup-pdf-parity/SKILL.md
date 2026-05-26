---
name: popup-pdf-parity
description: "Use when: a popup or HTML preview has a downloadable PDF and both must stay visually in sync."
---

# Popup / PDF Parity

## Purpose
Keep the popup preview and the downloaded PDF derived from the same source of truth.

## Mandatory rule
If you change the design, spacing, typography, labels, or structure of an HTML popup preview, you must update the PDF output in the same change.

## Implementation rule
1. Prefer one shared template or one shared render function for preview and PDF.
2. Avoid maintaining a separate PDF-only copy of the layout unless there is a hard rendering limitation.
3. If PDF-specific wrappers are required, keep them minimal and non-visual when possible.
4. When preview HTML changes, re-check the PDF export path before finishing the task.

## Typical cases
- `HtmlPreviewDialog` previews with print/download actions.
- Sales, purchases, cash, and guide documents that render HTML for preview and then export PDF.

## Validation
- Compare preview and PDF after any layout change.
- Confirm A4, ticket, or wide formats still match the popup composition.
- If the PDF is backend-generated, verify the backend template is the same one the popup uses or is fed by the same data and markup path.