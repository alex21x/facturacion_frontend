const DOC_KIND_LABELS: Record<string, string> = {
  QUOTATION: 'Cotizacion',
  SALES_ORDER: 'Nota de Pedido',
  INVOICE: 'Factura',
  RECEIPT: 'Boleta',
  CREDIT_NOTE: 'Nota de Credito',
  DEBIT_NOTE: 'Nota de Debito',
};

/**
 * Translates a document kind code (INVOICE, RECEIPT, etc.) to its Spanish label.
 * Falls back to the code itself if unknown.
 */
export function docKindLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return DOC_KIND_LABELS[code.trim().toUpperCase()] ?? code;
}
