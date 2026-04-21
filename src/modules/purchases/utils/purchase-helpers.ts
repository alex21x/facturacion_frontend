import { fmtDateTimeFullLima, todayLima } from '../../../shared/utils/lima';
import type { PurchasesLookups, StockEntryRow, StockEntryType } from '../types';
import type { CompanyProfile } from '../../company/types';

export type PurchaseEntryDraft = {
  key: string;
  product_id: number | null;
  lot_id?: number | null;
  product_query: string;
  qty: string;
  unit_cost: string;
  discount_total: string;
  is_free_operation: boolean;
  lot_code: string;
  manufacture_at: string;
  expires_at: string;
  tax_category_id?: number;
  tax_rate?: number;
};

export function todayAsInputDate(): string {
  return todayLima();
}

export function asInputDate(value?: string | null): string {
  if (!value) {
    return todayAsInputDate();
  }

  const onlyDate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(onlyDate) ? onlyDate : todayAsInputDate();
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-';
  }

  return fmtDateTimeFullLima(value);
}

export function entryTypeLabel(entryType: StockEntryType): string {
  if (entryType === 'PURCHASE') {
    return 'Compra';
  }
  if (entryType === 'PURCHASE_ORDER') {
    return 'Orden de compra';
  }
  return 'Ajuste';
}

export function purchaseStatusLabel(status: string | null | undefined, statusLabel?: string | null): string {
  if (statusLabel && statusLabel.trim() !== '') {
    return statusLabel;
  }

  const normalized = String(status ?? '').trim().toUpperCase();
  if (normalized === 'APPLIED') return 'Aplicado';
  if (normalized === 'OPEN') return 'Abierto';
  if (normalized === 'PARTIAL') return 'Parcial';
  if (normalized === 'CLOSED') return 'Cerrado';
  if (normalized === 'VOID') return 'Anulado';
  if (normalized === 'CANCELED') return 'Cancelado';
  return status && status.trim() !== '' ? status : '-';
}

export function stockToneClass(stock: number): 'stock-chip--danger' | 'stock-chip--warn' | 'stock-chip--ok' {
  if (!Number.isFinite(stock) || stock <= 0) {
    return 'stock-chip--danger';
  }
  if (stock <= 5) {
    return 'stock-chip--warn';
  }
  return 'stock-chip--ok';
}

export function buildPurchaseDetailHtml(
  entry: StockEntryRow,
  options?: { company?: Pick<CompanyProfile, 'tax_id' | 'legal_name' | 'trade_name' | 'address' | 'phone' | 'logo_url'> | null }
): string {
  const company = options?.company ?? null;
  const companyName = String(company?.trade_name || company?.legal_name || 'SISTEMA FACTURACION').trim() || 'SISTEMA FACTURACION';
  const companyTaxId = String(company?.tax_id || '').trim();
  const companyAddress = String(company?.address || '').trim();
  const companyPhone = String(company?.phone || '').trim();
  const logoUrl = String(company?.logo_url || '').trim();
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="Logo" class="company-logo" />`
    : `<div class="company-logo company-logo--placeholder">LOGO</div>`;

  const details = entry.items ?? [];
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const itemDiscountTotal = details.reduce((acc, item) => acc + Number(item.discount_total ?? 0), 0);
  const globalDiscountTotal = Number(metadata.discount_total ?? 0);
  const hasDetraccion = Boolean(metadata.has_detraccion);
  const hasRetencion = Boolean(metadata.has_retencion);
  const hasPercepcion = Boolean(metadata.has_percepcion);
  const summary = details.reduce((acc, item) => {
    const subtotal = Number(item.subtotal ?? 0);
    const taxAmount = Number(item.tax_amount ?? 0);
    const taxRate = Number(item.tax_rate ?? 0);
    const taxLabel = String(item.tax_label ?? '').toUpperCase();

    acc.netTotal += subtotal;
    acc.taxTotal += taxAmount;

    if (taxRate > 0) {
      acc.gravadaTotal += subtotal;
      return acc;
    }

    if (taxLabel.includes('EXONER')) {
      acc.exoneradaTotal += subtotal;
      return acc;
    }

    if (taxLabel.includes('INAFECT')) {
      acc.inafectaTotal += subtotal;
      return acc;
    }

    acc.noTributariaTotal += subtotal;
    return acc;
  }, {
    netTotal: 0,
    taxTotal: 0,
    gravadaTotal: 0,
    exoneradaTotal: 0,
    inafectaTotal: 0,
    noTributariaTotal: 0,
  });
  const computedGrandTotal = summary.netTotal + summary.taxTotal;
  const hasTributarySummary = summary.taxTotal > 0 || summary.gravadaTotal > 0 || summary.exoneradaTotal > 0 || summary.inafectaTotal > 0;
  const tributaryRows: string[] = [];

  if (hasDetraccion) {
    tributaryRows.push(`<tr><td>Operacion SUNAT</td><td>${String(metadata.sunat_operation_type_code ?? '-')}: ${String(metadata.sunat_operation_type_name ?? '-')}</td></tr>`);
    tributaryRows.push(`<tr><td>Detraccion</td><td>${String(metadata.detraccion_service_code ?? '-')}: ${String(metadata.detraccion_service_name ?? '-')}</td></tr>`);
    tributaryRows.push(`<tr><td>Tasa/Monto</td><td>${Number(metadata.detraccion_rate_percent ?? 0).toFixed(2)}% / ${Number(metadata.detraccion_amount ?? 0).toFixed(2)}</td></tr>`);
  }
  if (hasRetencion) {
    tributaryRows.push(`<tr><td>Operacion SUNAT</td><td>${String(metadata.sunat_operation_type_code ?? '-')}: ${String(metadata.sunat_operation_type_name ?? '-')}</td></tr>`);
    tributaryRows.push(`<tr><td>Retencion</td><td>${String(metadata.retencion_type_code ?? '-')}: ${String(metadata.retencion_type_name ?? '-')}</td></tr>`);
    tributaryRows.push(`<tr><td>Tasa/Monto</td><td>${Number(metadata.retencion_rate_percent ?? 0).toFixed(2)}% / ${Number(metadata.retencion_amount ?? 0).toFixed(2)}</td></tr>`);
  }
  if (hasPercepcion) {
    tributaryRows.push(`<tr><td>Operacion SUNAT</td><td>${String(metadata.sunat_operation_type_code ?? '-')}: ${String(metadata.sunat_operation_type_name ?? '-')}</td></tr>`);
    tributaryRows.push(`<tr><td>Percepcion</td><td>${String(metadata.percepcion_type_code ?? '-')}: ${String(metadata.percepcion_type_name ?? '-')}</td></tr>`);
    tributaryRows.push(`<tr><td>Tasa/Monto</td><td>${Number(metadata.percepcion_rate_percent ?? 0).toFixed(2)}% / ${Number(metadata.percepcion_amount ?? 0).toFixed(2)}</td></tr>`);
  }

  const tributaryHtml = tributaryRows.length > 0
    ? `<h3 style="margin:16px 0 8px;">Condiciones tributarias</h3>
       <table>
         <tbody>${tributaryRows.join('')}</tbody>
       </table>`
    : '';
  const tributarySummaryHtml = hasTributarySummary
    ? `<h3 style="margin:16px 0 8px;">Resumen tributario</h3>
       <table>
         <tbody>
           <tr><td>Operacion gravada</td><td style="text-align:right">${summary.gravadaTotal.toFixed(2)}</td></tr>
           <tr><td>Operacion exonerada</td><td style="text-align:right">${summary.exoneradaTotal.toFixed(2)}</td></tr>
           <tr><td>Operacion inafecta</td><td style="text-align:right">${summary.inafectaTotal.toFixed(2)}</td></tr>
           <tr><td>No tributaria</td><td style="text-align:right">${summary.noTributariaTotal.toFixed(2)}</td></tr>
           <tr><td>Total IGV</td><td style="text-align:right">${summary.taxTotal.toFixed(2)}</td></tr>
           ${itemDiscountTotal > 0 ? `<tr><td>Descuento por item</td><td style="text-align:right">-${itemDiscountTotal.toFixed(2)}</td></tr>` : ''}
           ${globalDiscountTotal > 0 ? `<tr><td>Descuento global</td><td style="text-align:right">-${globalDiscountTotal.toFixed(2)}</td></tr>` : ''}
           <tr class="total-row"><td>Importe total</td><td style="text-align:right">${computedGrandTotal.toFixed(2)}</td></tr>
         </tbody>
       </table>`
    : '';
  const totalsRowsHtml = details.length > 0
    ? `
        <tr><td>Cantidad total</td><td>${Number(entry.total_qty).toFixed(3)}</td></tr>
        <tr><td>Subtotal</td><td>${summary.netTotal.toFixed(2)}</td></tr>
        ${hasTributarySummary ? `<tr><td>IGV</td><td>${summary.taxTotal.toFixed(2)}</td></tr>` : ''}
        ${itemDiscountTotal > 0 ? `<tr><td>Descuento por item</td><td>-${itemDiscountTotal.toFixed(2)}</td></tr>` : ''}
        ${globalDiscountTotal > 0 ? `<tr><td>Descuento global</td><td>-${globalDiscountTotal.toFixed(2)}</td></tr>` : ''}
        <tr class="total-row"><td>Total ingreso</td><td>${computedGrandTotal.toFixed(2)}</td></tr>
      `
    : `
        <tr><td>Cantidad total</td><td>${Number(entry.total_qty).toFixed(3)}</td></tr>
        <tr class="total-row"><td>Total ingreso</td><td>${Number(entry.total_amount).toFixed(2)}</td></tr>
      `;
  const rows = details.length > 0
    ? details.map((item) => {
        return `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.lot_code ?? '-'}</td>
            <td style="text-align:right">${Number(item.qty).toFixed(3)}</td>
            <td style="text-align:right">${Number(item.unit_cost).toFixed(4)}</td>
            <td style="text-align:right">${Number(item.subtotal).toFixed(2)}</td>
            <td>${item.tax_label || 'Sin IGV'}</td>
            <td style="text-align:right">${Number(item.tax_rate).toFixed(2)}%</td>
            <td style="text-align:right">${Number(item.tax_amount).toFixed(2)}</td>
            <td style="text-align:right">${Number(item.discount_total ?? 0).toFixed(2)}</td>
            <td style="text-align:right">${Number(item.line_total).toFixed(2)}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="10" style="text-align:center;color:#64748b">No hay detalle de items para este ingreso.</td></tr>';

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Detalle compra #${entry.id}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 16px; color: #0f172a; }
      h2 { margin: 0 0 6px; }
      .header { display: grid; grid-template-columns: 92px 1fr; gap: 12px; align-items: center; margin-bottom: 10px; }
      .company-logo { width: 92px; height: 92px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; display: block; }
      .company-logo--placeholder { display: inline-flex; align-items: center; justify-content: center; color: #64748b; font-weight: 700; letter-spacing: 0.4px; }
      .company-name { margin: 0; font-size: 20px; line-height: 1.1; }
      .company-kv { margin: 2px 0; font-size: 12px; color: #475569; }
      .meta { margin: 0 0 12px; color: #475569; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; }
      th { background: #e2e8f0; text-align: left; }
      .totals { margin-top: 10px; width: 360px; margin-left: auto; }
      .totals td { text-align: right; }
      .totals td:first-child { text-align: left; }
      .total-row { font-weight: 700; background: #f1f5f9; }
    </style>
  </head>
  <body>
    <section class="header">
      ${logoHtml}
      <article>
        <h3 class="company-name">${companyName}</h3>
        ${companyTaxId ? `<p class="company-kv">RUC: ${companyTaxId}</p>` : ''}
        ${companyAddress ? `<p class="company-kv">${companyAddress}</p>` : ''}
        ${companyPhone ? `<p class="company-kv">Tel: ${companyPhone}</p>` : ''}
      </article>
    </section>
    <h2>Detalle de compra #${entry.id}</h2>
    <p class="meta">
      Tipo: ${entryTypeLabel(entry.entry_type)} |
      Estado: ${purchaseStatusLabel(entry.status, entry.status_label)} |
      Fecha: ${formatDateTime(entry.issue_at)} |
      Referencia: ${entry.reference_no ?? entry.supplier_reference ?? '-'}
    </p>

    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Lote</th>
          <th>Cantidad</th>
          <th>Costo unitario</th>
          <th>Subtotal</th>
          <th>Tipo IGV</th>
          <th>Tasa IGV</th>
          <th>IGV</th>
          <th>Descuento</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <table class="totals">
      <tbody>
        ${totalsRowsHtml}
      </tbody>
    </table>
    ${tributarySummaryHtml}
    ${tributaryHtml}
  </body>
</html>`;
}

export function clampPurchaseDiscount(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(value, Math.max(maxValue, 0));
}

export function computePurchaseLineAmounts(row: PurchaseEntryDraft) {
  const qty = Number(row.qty) || 0;
  const unitCost = Number(row.unit_cost) || 0;
  const subtotal = qty * unitCost;
  const taxRate = Number(row.tax_rate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const grossTotal = subtotal + taxAmount;
  const isFreeOperation = Boolean(row.is_free_operation);
  const discountTotal = isFreeOperation
    ? grossTotal
    : clampPurchaseDiscount(Number(row.discount_total) || 0, grossTotal);

  return {
    subtotal,
    taxAmount,
    grossTotal,
    discountTotal,
    finalTotal: Math.max(grossTotal - discountTotal, 0),
    gratuitaTotal: isFreeOperation ? subtotal : 0,
    isFreeOperation,
  };
}

export function resolveDefaultPurchaseTaxCategory(lookups: PurchasesLookups | null): { id: number; rate_percent: number } | null {
  const categories = lookups?.tax_categories ?? [];
  if (categories.length === 0) {
    return null;
  }

  const gravado = categories.find((category) => {
    const code = String(category.code ?? '').toUpperCase();
    const label = String(category.label ?? '').toUpperCase();
    return code.includes('10') || label.includes('GRAV') || label.includes('ONER');
  });

  if (gravado) {
    return { id: gravado.id, rate_percent: Number(gravado.rate_percent ?? 0) };
  }

  const positiveRate = categories.find((category) => Number(category.rate_percent ?? 0) > 0);
  return positiveRate
    ? { id: positiveRate.id, rate_percent: Number(positiveRate.rate_percent ?? 0) }
    : null;
}

export function resolveDefaultCashPaymentMethodId(lookups: PurchasesLookups | null): number | null {
  const methods = lookups?.payment_methods ?? [];
  if (methods.length === 0) {
    return null;
  }

  const cashMethod = methods.find((row) => {
    const code = String(row.code ?? '').toUpperCase();
    const name = String(row.name ?? '').toUpperCase();
    return code.includes('EFECT') || code.includes('CASH') || name.includes('EFECTIVO') || name.includes('CONTADO');
  });

  return cashMethod?.id ?? null;
}