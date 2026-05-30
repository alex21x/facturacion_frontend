import { fmtDateTimeFullLima, todayLima } from '../../../shared/utils/lima';
import type { PurchasesLookups, StockEntryRow, StockEntryType } from '../types';
import type { CompanyProfile } from '../../company/types';

export type PurchasePriceTaxMode = 'EXCLUSIVE' | 'INCLUSIVE';

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
  price_tax_mode: PurchasePriceTaxMode;
};

export function normalizePurchasePriceTaxMode(
  value: unknown,
  fallback: PurchasePriceTaxMode = 'EXCLUSIVE'
): PurchasePriceTaxMode {
  if (String(value ?? '').trim().toUpperCase() === 'INCLUSIVE') {
    return 'INCLUSIVE';
  }

  return fallback;
}

export function resolvePurchaseUnitCostNet(
  unitCostInput: number,
  taxRate: number,
  priceTaxMode: PurchasePriceTaxMode
): number {
  if (priceTaxMode !== 'INCLUSIVE' || taxRate <= 0) {
    return unitCostInput;
  }

  const divisor = 1 + taxRate / 100;
  if (divisor <= 0) {
    return unitCostInput;
  }

  return unitCostInput / divisor;
}

export function resolvePurchaseUnitCostGross(unitCostNet: number, taxRate: number): number {
  if (!Number.isFinite(unitCostNet) || unitCostNet <= 0 || taxRate <= 0) {
    return Math.max(unitCostNet, 0);
  }

  return unitCostNet * (1 + taxRate / 100);
}

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
  const escapeHtml = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const company = options?.company ?? null;
  const companyName = String(company?.trade_name || company?.legal_name || 'SISTEMA FACTURACION').trim() || 'SISTEMA FACTURACION';
  const companyTaxId = String(company?.tax_id || '').trim();
  const companyAddress = String(company?.address || '').trim();
  const companyPhone = String(company?.phone || '').trim();
  const companyEmail = String((company as CompanyProfile | null)?.email || '').trim();
  const companyDescription = String((company as CompanyProfile | null)?.company_description || '').trim();
  const logoUrl = String(company?.logo_url || '').trim();
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="company-logo" />`
    : `<div class="company-logo company-logo--placeholder">LOGO</div>`;

  const details = entry.items ?? [];
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const supplierReference = String(entry.supplier_reference ?? '').trim();
  const entryReference = String(entry.reference_no ?? '').trim();
  const observations = String(entry.notes ?? '').trim();
  const paymentMethod = String(entry.payment_method ?? '-').trim() || '-';

  const summary = details.reduce((acc, item) => {
    const subtotal = Number(item.subtotal ?? 0);
    const taxAmount = Number(item.tax_amount ?? 0);
    const taxRate = Number(item.tax_rate ?? 0);
    const taxLabel = String(item.tax_label ?? '').toUpperCase();
    const discountTotal = Number(item.discount_total ?? 0);

    acc.subtotal += subtotal;
    acc.taxTotal += taxAmount;
    acc.discountTotal += discountTotal;

    if (taxRate > 0) {
      acc.gravadaTotal += subtotal;
    } else if (taxLabel.includes('EXONER')) {
      acc.exoneradaTotal += subtotal;
    } else if (taxLabel.includes('INAFECT')) {
      acc.inafectaTotal += subtotal;
    } else {
      acc.noTributariaTotal += subtotal;
    }

    return acc;
  }, {
    subtotal: 0,
    taxTotal: 0,
    discountTotal: 0,
    gravadaTotal: 0,
    exoneradaTotal: 0,
    inafectaTotal: 0,
    noTributariaTotal: 0,
  });

  const computedGrandTotal = Math.max(summary.subtotal + summary.taxTotal - summary.discountTotal, 0);
  const reportedGrandTotal = Number(entry.total_amount ?? 0);
  const finalGrandTotal = Number.isFinite(reportedGrandTotal) && reportedGrandTotal > 0 ? reportedGrandTotal : computedGrandTotal;
  const hasTributarySummary = summary.taxTotal > 0 || summary.gravadaTotal > 0 || summary.exoneradaTotal > 0 || summary.inafectaTotal > 0;
  const itemCount = details.length;

  const tributaryRows: string[] = [];
  const pushTributaryRow = (label: string, value: string) => {
    if (value.trim() !== '') {
      tributaryRows.push(`<div class="summary-row"><span class="summary-label">${label}</span><span class="summary-value">${escapeHtml(value)}</span></div>`);
    }
  };

  pushTributaryRow('Operacion SUNAT', String(metadata.sunat_operation_type_code ?? '') + (String(metadata.sunat_operation_type_name ?? '').trim() !== '' ? ` - ${String(metadata.sunat_operation_type_name ?? '')}` : ''));
  pushTributaryRow('Detraccion', String(metadata.detraccion_service_code ?? '') + (String(metadata.detraccion_service_name ?? '').trim() !== '' ? ` - ${String(metadata.detraccion_service_name ?? '')}` : ''));
  if (Number(metadata.detraccion_rate_percent ?? 0) > 0 || Number(metadata.detraccion_amount ?? 0) > 0) {
    pushTributaryRow('Monto detraccion', `${Number(metadata.detraccion_rate_percent ?? 0).toFixed(2)}% / ${Number(metadata.detraccion_amount ?? 0).toFixed(2)}`);
  }
  pushTributaryRow('Retencion', String(metadata.retencion_type_code ?? '') + (String(metadata.retencion_type_name ?? '').trim() !== '' ? ` - ${String(metadata.retencion_type_name ?? '')}` : ''));
  if (Number(metadata.retencion_rate_percent ?? 0) > 0 || Number(metadata.retencion_amount ?? 0) > 0) {
    pushTributaryRow('Monto retencion', `${Number(metadata.retencion_rate_percent ?? 0).toFixed(2)}% / ${Number(metadata.retencion_amount ?? 0).toFixed(2)}`);
  }
  pushTributaryRow('Percepcion', String(metadata.percepcion_type_code ?? '') + (String(metadata.percepcion_type_name ?? '').trim() !== '' ? ` - ${String(metadata.percepcion_type_name ?? '')}` : ''));
  if (Number(metadata.percepcion_rate_percent ?? 0) > 0 || Number(metadata.percepcion_amount ?? 0) > 0) {
    pushTributaryRow('Monto percepcion', `${Number(metadata.percepcion_rate_percent ?? 0).toFixed(2)}% / ${Number(metadata.percepcion_amount ?? 0).toFixed(2)}`);
  }

  const bankAccounts = Array.isArray((company as CompanyProfile | null)?.bank_accounts)
    ? ((company as CompanyProfile | null)?.bank_accounts ?? [])
    : [];
  const bankRows = bankAccounts
    .map((bank) => {
      const bankName = String(bank.bank_name || '').trim();
      const accountNumber = String(bank.account_number || '').trim();
      const cci = String(bank.cci || '').trim();
      const accountHolder = String(bank.account_holder || '').trim();

      if (bankName === '' && accountNumber === '' && cci === '' && accountHolder === '') {
        return '';
      }

      return `
        <div class="company-footer-bank">
          ${bankName ? `<div><strong>${escapeHtml(bankName)}</strong></div>` : ''}
          ${accountNumber ? `<div>Cuenta: ${escapeHtml(accountNumber)}</div>` : ''}
          ${cci ? `<div>CCI: ${escapeHtml(cci)}</div>` : ''}
          ${accountHolder ? `<div>Titular: ${escapeHtml(accountHolder)}</div>` : ''}
        </div>
      `;
    })
    .filter((row) => row !== '')
    .join('');

  const showPaymentBrands = (company as CompanyProfile | null)?.show_payment_brand_icons !== false;
  const paymentBrandsSection = showPaymentBrands
    ? `<div class="company-footer-logos">
        <div class="paybrand"><img src="/assets/payment-logos/yape-official.png" alt="Yape" /></div>
        <div class="paybrand"><img src="/assets/payment-logos/plin-official.png" alt="Plin" /></div>
        <div class="paybrand"><img src="/assets/payment-logos/culqi-official.png" alt="Culqi" /></div>
      </div>`
    : '';

  const rows = details.length > 0
    ? details.map((item) => {
        const taxLabel = String(item.tax_label ?? 'Sin IGV');
        return `
          <tr>
            <td class="ta-c">${item.entry_id ?? entry.id}</td>
            <td>${escapeHtml(String(item.product_name ?? '-'))}</td>
            <td>${escapeHtml(String(item.lot_code ?? '-'))}</td>
            <td class="ta-r">${Number(item.qty ?? 0).toFixed(3)}</td>
            <td class="ta-r">${Number(item.unit_cost ?? 0).toFixed(4)}</td>
            <td class="ta-r">${Number(item.subtotal ?? 0).toFixed(2)}</td>
            <td>${escapeHtml(taxLabel)}</td>
            <td class="ta-r">${Number(item.tax_rate ?? 0).toFixed(2)}%</td>
            <td class="ta-r">${Number(item.tax_amount ?? 0).toFixed(2)}</td>
            <td class="ta-r">${Number(item.discount_total ?? 0).toFixed(2)}</td>
            <td class="ta-r">${Number(item.line_total ?? 0).toFixed(2)}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="11" class="ta-c">Sin items</td></tr>';

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Compra #${entry.id}</title>
    <style>
      @page { size: A4 portrait; margin: 9mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; }
      .sheet { width: 100%; min-height: 277mm; padding: 6mm; border: 1px solid #1f2937; }
      .header { display: grid; grid-template-columns: auto 1fr 58mm; gap: 4mm; align-items: stretch; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 2px solid #1e3a8a; }
      .logo-col { display: flex; align-items: center; justify-content: center; padding-right: 2mm; border-right: 1px solid #e5e7eb; }
      .brand-col { display: flex; flex-direction: column; justify-content: center; gap: 0.4mm; }
      .company-logo { display: block; max-width: 140px; max-height: 90px; height: auto; object-fit: contain; }
      .company-logo--placeholder { width: 140px; height: 90px; display: inline-flex; align-items: center; justify-content: center; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: 700; letter-spacing: 0.4px; background: #fff; }
      .brand-name { font-size: 13pt; font-weight: 900; text-transform: uppercase; color: #1e3a8a; margin-bottom: 0.3mm; }
      .brand-legal { font-size: 8pt; font-weight: 700; color: #374151; text-transform: uppercase; margin-bottom: 0.8mm; }
      .brand-desc { font-size: 8.5pt; font-weight: 700; color: #374151; }
      .brand-meta { font-size: 8.5pt; line-height: 1.25; color: #374151; }
      .voucher-box { border: 2px solid #1e3a8a; border-radius: 4px; overflow: hidden; text-align: center; }
      .voucher-ruc { padding: 2.5mm 3mm; font-size: 9.5pt; font-weight: 900; color: #1e3a8a; background: #fff; }
      .voucher-type { padding: 3mm; background: #1e3a8a; color: #fff; font-size: 9pt; font-weight: 900; text-transform: uppercase; line-height: 1.3; }
      .voucher-number { padding: 3mm; font-size: 15pt; font-weight: 900; color: #dc2626; letter-spacing: 0.5px; background: #fff; }
      .voucher-date { font-size: 8pt; color: #374151; padding: 1.5mm 3mm; background: #f8fafc; border-top: 1px solid #bfdbfe; }
      .info-box { border: 1px solid #1f2937; border-radius: 4px; padding: 3mm 4mm; margin-bottom: 4mm; }
      .info-grid { width: 100%; border-collapse: collapse; }
      .info-grid td { width: 50%; vertical-align: top; padding: 0 2mm; }
      .line { margin: 2px 0; font-size: 9pt; }
      .k { display: inline-block; width: 128px; font-weight: 900; letter-spacing: 0.2px; }
      .v { display: inline-block; font-weight: 700; }
      .items-a4 { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; overflow: hidden; }
      .items-a4 thead th { background: #1e3a8a; color: #fff; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.2px; padding: 1.5mm 2mm; border-bottom: 1px solid #1e3a8a; font-weight: 700; }
      .items-a4 tbody td { border-bottom: 1px solid #e2e8f0; font-size: 8.5pt; padding: 1.5mm 2mm; vertical-align: top; }
      .items-a4-row:last-child td { border-bottom: none; }
      .ta-r { text-align: right; }
      .ta-c { text-align: center; }
      .summary { margin-top: 4mm; border-top: 2px solid #1e3a8a; padding-top: 2mm; display: grid; grid-template-columns: 1fr 300px; gap: 10px; }
      .summary-words { font-size: 9pt; font-weight: 900; line-height: 1.35; word-break: break-word; }
      .summary-box table { width: 100%; border-collapse: collapse; }
      .summary-row { display: flex; justify-content: space-between; font-size: 9pt; margin: 0.6mm 0; }
      .summary-label, .summary-value { font-weight: 900; }
      .summary-total { display: flex; justify-content: space-between; border-top: 2px solid #1e3a8a; margin-top: 1mm; padding: 1mm 2mm; font-size: 12pt; font-weight: 900; background: #f0f4ff; border-radius: 4px; }
      .footer { margin-top: 3mm; border-top: 1px dashed #111827; padding-top: 2mm; }
      .footer-title { text-transform: uppercase; margin-bottom: 0.8mm; font-size: 9pt; font-weight: 900; }
      .footer-note { font-size: 9pt; line-height: 1.35; margin-bottom: 1.5mm; }
      .company-footer-banks { font-size: 9pt; line-height: 1.35; margin-bottom: 2mm; }
      .company-footer-bank { margin: 0.5mm 0; }
      .company-footer-logos { display: flex; align-items: center; justify-content: flex-start; gap: 1.4mm; margin-top: 1mm; flex-wrap: wrap; }
      .paybrand { border: 1px solid #d1d5db; border-radius: 8px; background: #fff; padding: 1mm 2mm; height: 10mm; display: inline-flex; align-items: center; justify-content: center; }
      .paybrand img { height: 7mm; width: auto; display: block; }
      .summary-trib { margin-top: 2mm; }
    </style>
  </head>
  <body>
    <section class="sheet">
      <header class="header">
        <div class="logo-col">${logoHtml}</div>
        <div class="brand-col">
          <div class="brand-name">${escapeHtml(companyName)}</div>
          ${company?.legal_name && company?.legal_name !== companyName ? `<div class="brand-legal">${escapeHtml(String(company.legal_name))}</div>` : ''}
          ${companyDescription ? `<div class="brand-desc">${escapeHtml(companyDescription)}</div>` : ''}
          ${companyAddress ? `<div class="brand-meta">${escapeHtml(companyAddress)}</div>` : ''}
          ${companyPhone ? `<div class="brand-meta">Tel: ${escapeHtml(companyPhone)}</div>` : ''}
          ${companyEmail ? `<div class="brand-meta">Email: ${escapeHtml(companyEmail)}</div>` : ''}
        </div>
        <div class="voucher-box">
          <div class="voucher-ruc">R.U.C. ${escapeHtml(companyTaxId || '-')}</div>
          <div class="voucher-type">${escapeHtml(entryTypeLabel(entry.entry_type)).toUpperCase()}</div>
          <div class="voucher-number">${escapeHtml(entryReference !== '' ? entryReference : `#${String(entry.id)}`)}</div>
          <div class="voucher-date">${escapeHtml(formatDateTime(entry.issue_at))}</div>
        </div>
      </header>

      <section class="info-box">
        <table class="info-grid">
          <tr>
            <td>
              <div class="line"><span class="k">ESTADO:</span><span class="v">${escapeHtml(purchaseStatusLabel(entry.status, entry.status_label))}</span></div>
              <div class="line"><span class="k">REFERENCIA PROV.:</span><span class="v">${escapeHtml(supplierReference || '-')}</span></div>
              <div class="line"><span class="k">ALMACEN:</span><span class="v">${escapeHtml(String(entry.warehouse_name || entry.warehouse_code || '-'))}</span></div>
              <div class="line"><span class="k">METODO PAGO:</span><span class="v">${escapeHtml(paymentMethod)}</span></div>
            </td>
            <td>
              <div class="line"><span class="k">TIPO INGRESO:</span><span class="v">${escapeHtml(entryTypeLabel(entry.entry_type))}</span></div>
              <div class="line"><span class="k">FECHA EMISION:</span><span class="v">${escapeHtml(formatDateTime(entry.issue_at))}</span></div>
              <div class="line"><span class="k">TOTAL ITEMS:</span><span class="v">${itemCount}</span></div>
              <div class="line"><span class="k">NOTAS:</span><span class="v">${escapeHtml(observations || '-')}</span></div>
            </td>
          </tr>
        </table>
      </section>

      <table class="items-a4">
        <thead>
          <tr>
            <th style="width: 7mm">#</th>
            <th>Producto</th>
            <th style="width: 18mm">Lote</th>
            <th style="width: 16mm">Cant.</th>
            <th style="width: 22mm">Costo U.</th>
            <th style="width: 22mm">Subtotal</th>
            <th style="width: 18mm">IGV</th>
            <th style="width: 18mm">Tasa</th>
            <th style="width: 22mm">Monto IGV</th>
            <th style="width: 22mm">Dscto.</th>
            <th style="width: 24mm">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <section class="summary">
        <div class="summary-words">${escapeHtml(`SON: ${Number(finalGrandTotal || 0).toFixed(2)} SOLES`)}</div>
        <div class="summary-box">
          <div class="summary-row"><span class="summary-label">Subtotal</span><span class="summary-value">${Number(summary.subtotal).toFixed(2)}</span></div>
          ${hasTributarySummary ? `<div class="summary-row"><span class="summary-label">IGV</span><span class="summary-value">${Number(summary.taxTotal).toFixed(2)}</span></div>` : ''}
          ${summary.discountTotal > 0 ? `<div class="summary-row"><span class="summary-label">Descuentos</span><span class="summary-value">-${Number(summary.discountTotal).toFixed(2)}</span></div>` : ''}
          <div class="summary-total"><span>Total ingreso</span><span>${Number(finalGrandTotal).toFixed(2)}</span></div>
          ${tributaryRows.length > 0 ? `<div class="summary-trib">${tributaryRows.join('')}</div>` : ''}
        </div>
      </section>

      <footer class="footer">
        <div class="footer-title">Observaciones</div>
        <div class="footer-note">${escapeHtml(observations || 'Documento generado en formato A4 con la misma estructura visual que ventas.')}</div>
        ${bankRows ? `<div class="company-footer-banks"><div class="footer-title">Datos bancarios</div>${bankRows}</div>` : ''}
        ${paymentBrandsSection}
      </footer>
    </section>
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
  const unitCostInput = Number(row.unit_cost) || 0;
  const taxRate = Number(row.tax_rate) || 0;
  const priceTaxMode = normalizePurchasePriceTaxMode(row.price_tax_mode, 'EXCLUSIVE');
  const unitCostNet = resolvePurchaseUnitCostNet(unitCostInput, taxRate, priceTaxMode);
  const unitCostGross = resolvePurchaseUnitCostGross(unitCostNet, taxRate);
  const subtotal = qty * unitCostNet;
  const taxAmount = subtotal * (taxRate / 100);
  const grossTotal = subtotal + taxAmount;
  const isFreeOperation = Boolean(row.is_free_operation);
  const discountTotal = isFreeOperation
    ? grossTotal
    : clampPurchaseDiscount(Number(row.discount_total) || 0, grossTotal);

  return {
    unitCostInput,
    unitCostNet,
    unitCostGross,
    priceTaxMode,
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