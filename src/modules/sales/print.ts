import { fmtDateLima, fmtDateTimeFullLima } from '../../shared/utils/lima';
import { apiClient } from '../../shared/api/client';

export type PrintableSalesItem = {
  lineNo: number;
  productId?: number | null;
  unitId?: number | null;
  priceTierId?: number | null;
  wholesaleDiscountPercent?: number | null;
  priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
  taxCategoryId?: number | null;
  taxLabel?: string;
  taxRate?: number;
  qtyBase?: number | null;
  conversionFactor?: number | null;
  baseUnitPrice?: number | null;
  metadata?: Record<string, unknown> | null;
  lots?: Array<{ lot_id: number; qty: number }>;
  qty: number;
  unitLabel: string;
  description: string;
  unitPrice: number;
  discountTotal?: number;
  lineTotal: number;
};

export type PrintableSalesDocument = {
  id: number;
  documentKind: string;
  series: string;
  number: number;
  issueDate: string;
  dueDate: string | null;
  status: string;
  currencyCode: string;
  currencySymbol: string;
  paymentMethodName: string;
  customerName: string;
  customerDocNumber: string;
  customerAddress: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  gravadaTotal: number;
  inafectaTotal: number;
  exoneradaTotal: number;
  company?: PrintableCompanyProfile | null;
  metadata?: Record<string, unknown> | null;
  items: PrintableSalesItem[];
};

export type PrintableCompanyProfile = {
  taxId?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string | null | undefined): string {
  return fmtDateLima(value);
}

function formatDateTime(value: string | null | undefined): string {
  return fmtDateTimeFullLima(value);
}

function formatMoney(amount: number): string {
  return Number(amount || 0).toFixed(2);
}

function normalizePrintAssetUrl(rawUrl: string | null | undefined): string | null {
  const candidate = String(rawUrl ?? '').trim();
  if (!candidate) {
    return null;
  }

  if (/^https?:\/\//i.test(candidate) || candidate.startsWith('data:')) {
    return candidate;
  }

  const base = apiClient.baseUrl.replace(/\/+$/, '');
  if (candidate.startsWith('//')) {
    return `http:${candidate}`;
  }

  if (candidate.startsWith('/')) {
    return `${base}${candidate}`;
  }

  return `${base}/${candidate.replace(/^\/+/, '')}`;
}

function resolvePrintableCompanyProfile(source: PrintableSalesDocument | CashReportPrintData): PrintableCompanyProfile {
  const metadata = ((source as PrintableSalesDocument).metadata ?? {}) as Record<string, unknown>;
  const inputCompany = (source.company ?? {}) as Record<string, unknown>;

  const taxId = (
    inputCompany.taxId
    ?? inputCompany.tax_id
    ?? metadata.company_tax_id
    ?? metadata.tax_id
    ?? null
  ) as string | null;
  const legalName = (
    inputCompany.legalName
    ?? inputCompany.legal_name
    ?? metadata.company_legal_name
    ?? metadata.legal_name
    ?? null
  ) as string | null;
  const tradeName = (
    inputCompany.tradeName
    ?? inputCompany.trade_name
    ?? metadata.company_trade_name
    ?? metadata.trade_name
    ?? null
  ) as string | null;
  const address = (
    inputCompany.address
    ?? inputCompany.company_address
    ?? metadata.company_address
    ?? metadata.address
    ?? null
  ) as string | null;
  const phone = (
    inputCompany.phone
    ?? inputCompany.company_phone
    ?? metadata.company_phone
    ?? metadata.phone
    ?? null
  ) as string | null;
  const email = (
    inputCompany.email
    ?? inputCompany.company_email
    ?? metadata.company_email
    ?? metadata.email
    ?? null
  ) as string | null;
  const logoCandidate = (
    inputCompany.logoUrl
    ?? inputCompany.logo_url
    ?? metadata.company_logo_url
    ?? metadata.logo_url
    ?? null
  ) as string | null;

  return {
    taxId,
    legalName,
    tradeName,
    address,
    phone,
    email,
    logoUrl: normalizePrintAssetUrl(logoCandidate),
  };
}

function resolveVehiclePrintData(metadata: Record<string, unknown>): { plate: string; brand: string; model: string } {
  const plate = String(metadata.vehicle_plate ?? metadata.vehiclePlateSnapshot ?? '').trim();
  const brand = String(metadata.vehicle_brand ?? metadata.vehicleBrand ?? '').trim();
  const model = String(metadata.vehicle_model ?? metadata.vehicleModel ?? '').trim();

  return { plate, brand, model };
}

function paymentBrandsFooterHtml(size: 'A4' | '80mm'): string {
  const baseClass = size === 'A4' ? 'paybrands paybrands-a4' : 'paybrands paybrands-80';
  const yapeLogo = '/assets/payment-logos/yape-official.png';
  const plinLogo = '/assets/payment-logos/plin-official.png';
  const culqiLogo = '/assets/payment-logos/culqi-official.png';
  return `<div class="${baseClass}">
    <div class="paybrand"><img src="${escapeHtml(yapeLogo)}" alt="Yape" /></div>
    <div class="paybrand"><img src="${escapeHtml(plinLogo)}" alt="Plin" /></div>
    <div class="paybrand"><img src="${escapeHtml(culqiLogo)}" alt="Culqi" /></div>
  </div>`;
}

function baseDocumentKind(kind: string): string {
  const normalized = String(kind || '').trim().toUpperCase();
  if (normalized === 'CREDIT_NOTE' || normalized.startsWith('CREDIT_NOTE_')) {
    return 'CREDIT_NOTE';
  }
  if (normalized === 'DEBIT_NOTE' || normalized.startsWith('DEBIT_NOTE_')) {
    return 'DEBIT_NOTE';
  }
  return normalized;
}

function kindMeta(kind: PrintableSalesDocument['documentKind']): { shortCode: string; title: string } {
  const baseKind = baseDocumentKind(kind);
  if (baseKind === 'INVOICE') {
    return { shortCode: 'F', title: 'FACTURA ELECTRONICA' };
  }
  if (baseKind === 'RECEIPT') {
    return { shortCode: 'B', title: 'BOLETA DE VENTA ELECTRONICA' };
  }
  if (baseKind === 'SALES_ORDER') {
    return { shortCode: 'P', title: 'PEDIDO DE VENTA' };
  }
  if (baseKind === 'QUOTATION') {
    return { shortCode: 'C', title: 'COTIZACION' };
  }
  if (baseKind === 'CREDIT_NOTE') {
    return { shortCode: 'NC', title: 'NOTA DE CREDITO' };
  }

  return { shortCode: 'ND', title: 'NOTA DE DEBITO' };
}

function isTributaryKind(kind: PrintableSalesDocument['documentKind']): boolean {
  const baseKind = baseDocumentKind(kind);
  return baseKind === 'INVOICE' || baseKind === 'RECEIPT' || baseKind === 'CREDIT_NOTE' || baseKind === 'DEBIT_NOTE';
}

function isNoteKind(kind: PrintableSalesDocument['documentKind']): boolean {
  const baseKind = baseDocumentKind(kind);
  return baseKind === 'CREDIT_NOTE' || baseKind === 'DEBIT_NOTE';
}

function findMetaStringValue(
  source: unknown,
  keys: string[]
): string | null {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      const nested = findMetaStringValue(value, keys);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function resolveSunatPrintData(metadata: Record<string, unknown>, docKind: PrintableSalesDocument['documentKind']) {
  if (!isTributaryKind(docKind)) {
    return { signature: '' };
  }

  const signature = findMetaStringValue(metadata, [
    'sunat_electronic_signature',
    'sunat_signature',
    'firma_electronica',
    'firma',
    'signature',
    'hash_cpe',
    'codigo_hash',
    'digest_value',
    'digestValue',
  ]) ?? '';

  return { signature };
}

function cashDocumentKindLabel(kind: string): string {
  const normalized = baseDocumentKind(kind);
  if (normalized === 'INVOICE') return 'Factura';
  if (normalized === 'RECEIPT') return 'Boleta';
  if (normalized === 'SALES_ORDER') return 'Pedido';
  if (normalized === 'QUOTATION') return 'Cotizacion';
  if (normalized === 'CREDIT_NOTE') return 'N. Credito';
  if (normalized === 'DEBIT_NOTE') return 'N. Debito';
  return normalized || '-';
}

function resolveNotePrintDetails(doc: PrintableSalesDocument): {
  sourceDocumentKind: string;
  sourceDocumentNumber: string;
  sourceDocumentLabel: string;
  noteReasonCode: string;
  noteReasonDescription: string;
} {
  const metadata = (doc.metadata ?? {}) as Record<string, unknown>;
  const sourceDocumentKind = String(metadata.source_document_kind ?? '').trim();
  const sourceDocumentNumber = String(metadata.source_document_number ?? '').trim();
  const sourceDocumentLabel = sourceDocumentKind ? cashDocumentKindLabel(sourceDocumentKind) : '-';
  const noteReasonCode = String(metadata.note_reason_code ?? '').trim();
  const noteReasonDescription = String(metadata.note_reason_description ?? '').trim();

  return {
    sourceDocumentKind,
    sourceDocumentNumber,
    sourceDocumentLabel,
    noteReasonCode,
    noteReasonDescription,
  };
}

export function buildCommercialDocumentA4Html(
  doc: PrintableSalesDocument,
  options?: { embedded?: boolean; showItemDiscount?: boolean },
): string {
  const meta = kindMeta(doc.documentKind);
  const showTributaryBreakdown = isTributaryKind(doc.documentKind);
  const isNoteDocument = isNoteKind(doc.documentKind);
  const isEmbedded = options?.embedded === true;
  const showItemDiscount = options?.showItemDiscount !== false;
  const notePrint = resolveNotePrintDetails(doc);
  const company = resolvePrintableCompanyProfile(doc);
  const companyTitle = String(company.tradeName || company.legalName || 'SISTEMA FACTURACION').trim() || 'SISTEMA FACTURACION';
  const companyLegalName = String(company.legalName || companyTitle).trim();
  const companyTaxId = String(company.taxId || '00000000000').trim() || '00000000000';
  const companyAddress = String(company.address || '').trim();
  const companyPhone = String(company.phone || '').trim();
  const companyEmail = String(company.email || '').trim();
  const logoHtml = company.logoUrl
    ? `<img src="${escapeHtml(company.logoUrl)}" alt="Logo empresa" class="brand-logo" />`
    : `<div class="brand-logo brand-logo--placeholder">LOGO</div>`;

  const rows = doc.items
    .map((item) => {
      return `
        <tr>
          <td class="ta-c">${item.lineNo}</td>
          <td class="ta-r">${Number(item.qty).toFixed(3)}</td>
          <td class="ta-c">${escapeHtml(item.unitLabel)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="ta-r">${doc.currencySymbol} ${formatMoney(item.unitPrice)}</td>
          ${showItemDiscount ? `<td class="ta-r">${doc.currencySymbol} ${formatMoney(Number(item.discountTotal ?? 0))}</td>` : ''}
          <td class="ta-r">${doc.currencySymbol} ${formatMoney(item.lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const metaData = (doc.metadata ?? {}) as Record<string, unknown>;
  const vehiclePrint = resolveVehiclePrintData(metaData);
  const itemDiscountTotal = doc.items.reduce((acc, item) => acc + Number(item.discountTotal ?? 0), 0);
  const globalDiscountTotal = Number(metaData.discount_total ?? metaData.global_discount_total ?? 0);
  const sunatOpCode = String(metaData.sunat_operation_type_code ?? '').trim();
  const sunatOpName = String(metaData.sunat_operation_type_name ?? '').trim();
  const detraccionAmount = Number(metaData.detraccion_amount ?? 0);
  const detraccionRate = Number(metaData.detraccion_rate_percent ?? 0);
  const detraccionType = String(metaData.detraccion_service_name ?? '').trim();
  const retencionAmount = Number(metaData.retencion_amount ?? 0);
  const retencionRate = Number(metaData.retencion_rate_percent ?? 0);
  const retencionType = String(metaData.retencion_type_name ?? '').trim();
  const percepcionAmount = Number(metaData.percepcion_amount ?? 0);
  const percepcionRate = Number(metaData.percepcion_rate_percent ?? 0);
  const percepcionType = String(metaData.percepcion_type_name ?? '').trim();
  const sunatPrint = resolveSunatPrintData(metaData, doc.documentKind);

  const tributaryRows = showTributaryBreakdown ? [
    sunatOpCode
      ? `<tr><td class="label">Tipo Op. SUNAT:</td><td class="value">${escapeHtml(sunatOpCode)}${sunatOpName ? ` - ${escapeHtml(sunatOpName)}` : ''}</td></tr>`
      : '',
    detraccionAmount > 0
      ? `<tr><td class="label">Detraccion${detraccionType ? ` (${escapeHtml(detraccionType)})` : ''}:</td><td class="value">${doc.currencySymbol} ${formatMoney(detraccionAmount)} (${formatMoney(detraccionRate)}%)</td></tr>`
      : '',
    retencionAmount > 0
      ? `<tr><td class="label">Retencion${retencionType ? ` (${escapeHtml(retencionType)})` : ''}:</td><td class="value">${doc.currencySymbol} ${formatMoney(retencionAmount)} (${formatMoney(retencionRate)}%)</td></tr>`
      : '',
    percepcionAmount > 0
      ? `<tr><td class="label">Percepcion${percepcionType ? ` (${escapeHtml(percepcionType)})` : ''}:</td><td class="value">${doc.currencySymbol} ${formatMoney(percepcionAmount)} (${formatMoney(percepcionRate)}%)</td></tr>`
      : '',
  ].filter((row) => row !== '').join('') : '';

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(meta.title)} ${escapeHtml(doc.series)}-${doc.number}</title>
        <style>
          @page { size: A4 portrait; margin: 9mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #1f2937; }
          .print-bar {
            background: linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%);
            color: #fff;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
          }
          .print-bar button {
            background: #ffffff;
            color: #0f172a;
            border: 1px solid #cbd5e1;
            padding: 7px 12px;
            font-size: 12px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            margin-left: 8px;
          }
          .sheet { width: 100%; border: 1.5px solid #1f2937; min-height: 277mm; padding: 8mm; }
          .head { display: grid; grid-template-columns: 1.1fr 1fr; gap: 10px; align-items: stretch; }
          .brand { border: 1px solid #9ca3af; border-radius: 8px; padding: 10px; }
          .brand-head { display: flex; gap: 10px; align-items: flex-start; }
          .brand-logo { width: 116px; height: 116px; object-fit: contain; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; flex-shrink: 0; }
          .brand-logo--placeholder { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: #64748b; font-weight: 700; letter-spacing: 0.4px; }
          .brand h1 { margin: 0; font-size: 20px; letter-spacing: 0.4px; line-height: 1.15; }
          .brand p { margin: 2px 0; font-size: 11px; color: #4b5563; }
          .voucher { border: 1px solid #9ca3af; border-radius: 8px; padding: 10px; text-align: center; }
          .voucher .ruc { font-size: 34px; font-weight: 700; letter-spacing: 1px; }
          .voucher .title { font-size: 18px; margin-top: 4px; letter-spacing: 2px; }
          .voucher .docno { margin-top: 10px; font-size: 22px; font-weight: 700; }
          .party { margin-top: 10px; border: 1px solid #9ca3af; border-radius: 8px; padding: 8px 10px; font-size: 12px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 12px; }
          .note-box { margin-top: 10px; border: 1px solid #9ca3af; border-radius: 8px; padding: 8px 10px; font-size: 12px; background: #f8fafc; }
          .note-box h4 { margin: 0 0 6px 0; font-size: 13px; }
          .kv { margin: 2px 0; }
          .kv b { display: inline-block; min-width: 118px; }
          .table-wrap { margin-top: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #60a5fa; color: #0f172a; font-size: 11px; text-transform: uppercase; letter-spacing: 0.2px; padding: 5px 6px; border-bottom: 1px solid #1f2937; }
          td { border-bottom: 1px solid #d1d5db; font-size: 11px; padding: 5px 6px; vertical-align: top; }
          .ta-r { text-align: right; }
          .ta-c { text-align: center; }
          .summary { margin-top: 8px; display: grid; grid-template-columns: 1fr 280px; gap: 10px; }
          .amounts table td { border-bottom: 1px solid #d1d5db; }
          .amounts .label { text-align: right; color: #4b5563; width: 65%; }
          .amounts .value { text-align: right; width: 35%; }
          .total-row td { font-weight: 700; border-top: 1px solid #1f2937; }
          .payment { margin-top: 8px; font-size: 12px; font-weight: 600; }
          .obs { margin-top: 12px; border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 11px; color: #4b5563; }
          .sunat-proof { margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
          .sunat-proof h5 { margin: 0 0 4px 0; font-size: 12px; }
          .sunat-proof p { margin: 0 0 4px 0; font-size: 11px; color: #334155; word-break: break-all; }
          .paybrands { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 10px; }
          .paybrand { border-radius: 8px; border: 1px solid #d1d5db; background: #fff; padding: 5px 10px; height: 40px; display: inline-flex; align-items: center; }
          .paybrand img { height: 28px; width: auto; display: block; }
        </style>
      </head>
      <body>
        ${isEmbedded
          ? ''
          : `<div class="print-bar no-print">
          <span>Vista Previa - Documento A4</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        <section class="sheet">
          <section class="head">
            <article class="brand">
              <div class="brand-head">
                ${logoHtml}
                <div>
                  <h1>${escapeHtml(companyTitle)}</h1>
                  ${companyLegalName !== companyTitle ? `<p>${escapeHtml(companyLegalName)}</p>` : ''}
                  ${companyAddress ? `<p>${escapeHtml(companyAddress)}</p>` : ''}
                  ${companyPhone ? `<p>Tel: ${escapeHtml(companyPhone)}</p>` : ''}
                  ${companyEmail ? `<p>Email: ${escapeHtml(companyEmail)}</p>` : ''}
                </div>
              </div>
              <p>Fecha emision: ${formatDateTime(doc.issueDate)}</p>
            </article>
            <article class="voucher">
              <div class="ruc">R.U.C.: ${escapeHtml(companyTaxId)}</div>
              <div class="title">${escapeHtml(meta.title)}</div>
              <div class="docno">No.: ${escapeHtml(doc.series)}-${doc.number}</div>
            </article>
          </section>

          <section class="party">
            <article>
              <p class="kv"><b>Razon Social:</b> ${escapeHtml(doc.customerName || '-')}</p>
              <p class="kv"><b>Direccion:</b> ${escapeHtml(doc.customerAddress || '-')}</p>
              ${vehiclePrint.plate ? `<p class="kv"><b>Vehiculo:</b> ${escapeHtml(vehiclePrint.plate)}${vehiclePrint.brand || vehiclePrint.model ? ` (${escapeHtml([vehiclePrint.brand, vehiclePrint.model].filter((x) => x !== '').join(' '))})` : ''}</p>` : ''}
              <p class="kv"><b>Fecha Emision:</b> ${formatDateTime(doc.issueDate)}</p>
              <p class="kv"><b>Tipo Moneda:</b> ${escapeHtml(doc.currencyCode)}</p>
            </article>
            <article>
              <p class="kv"><b>Documento:</b> ${escapeHtml(doc.customerDocNumber || '-')}</p>
              <p class="kv"><b>Fecha Venc.:</b> ${formatDate(doc.dueDate)}</p>
              <p class="kv"><b>Metodo Pago:</b> ${escapeHtml(doc.paymentMethodName || '-')}</p>
              <p class="kv"><b>Ref:</b> ${doc.id}</p>
            </article>
          </section>

          ${isNoteDocument
            ? `<section class="note-box">
                <h4>Datos de la nota</h4>
                <p class="kv"><b>Documento afectado:</b> ${escapeHtml(notePrint.sourceDocumentLabel)} ${escapeHtml(notePrint.sourceDocumentNumber || '-')}</p>
                <p class="kv"><b>Tipo de nota:</b> ${escapeHtml(notePrint.noteReasonCode || '-')} ${notePrint.noteReasonDescription ? `- ${escapeHtml(notePrint.noteReasonDescription)}` : ''}</p>
                <p class="kv"><b>Detalle:</b> La presente nota modifica el comprobante afectado y detalla los productos/items involucrados a continuación.</p>
              </section>`
            : ''}

          <section class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:44px">#</th>
                  <th style="width:76px">Cantidad</th>
                  <th style="width:86px">Unid. Med.</th>
                  <th>${isNoteDocument ? 'Productos / conceptos afectados' : 'Descripcion'}</th>
                  <th style="width:92px">Valor U.</th>
                  ${showItemDiscount ? '<th style="width:96px">Descuento</th>' : ''}
                  <th style="width:96px">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="${showItemDiscount ? '7' : '6'}" class="ta-c">Sin items</td></tr>`}
              </tbody>
            </table>
          </section>

          <section class="summary">
            <article>
              <p class="payment">FORMA PAGO: ${escapeHtml(doc.paymentMethodName || '-')}</p>
            </article>
            <article class="amounts">
              <table>
                <tbody>
                  ${showTributaryBreakdown ? `<tr><td class="label">Op. Gravadas:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.gravadaTotal)}</td></tr>` : ''}
                  ${showTributaryBreakdown ? `<tr><td class="label">Op. Inafectas:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.inafectaTotal)}</td></tr>` : ''}
                  ${showTributaryBreakdown ? `<tr><td class="label">Op. Exoneradas:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.exoneradaTotal)}</td></tr>` : ''}
                  ${showTributaryBreakdown ? `<tr><td class="label">IGV:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.taxTotal)}</td></tr>` : ''}
                  ${showItemDiscount && itemDiscountTotal > 0 ? `<tr><td class="label">Descuento por item:</td><td class="value">-${doc.currencySymbol} ${formatMoney(itemDiscountTotal)}</td></tr>` : ''}
                  ${globalDiscountTotal > 0 ? `<tr><td class="label">Descuento global:</td><td class="value">-${doc.currencySymbol} ${formatMoney(globalDiscountTotal)}</td></tr>` : ''}
                  ${tributaryRows}
                  <tr class="total-row"><td class="label">Total a Pagar:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.grandTotal)}</td></tr>
                </tbody>
              </table>
            </article>
          </section>

          ${sunatPrint.signature
            ? `<section class="sunat-proof">
                <div>
                  <h5>Datos SUNAT</h5>
                  ${sunatPrint.signature ? `<p><strong>Firma electronica:</strong> ${escapeHtml(sunatPrint.signature)}</p>` : ''}
                </div>
              </section>`
            : ''}

          <section class="obs">
            Observaciones: Documento impreso en formato A4 adaptable por tipo de comprobante.
            ${paymentBrandsFooterHtml('A4')}
          </section>
        </section>
      </body>
    </html>
  `;
}

export function buildCommercialDocument80mmHtml(
  doc: PrintableSalesDocument,
  options?: { embedded?: boolean; showItemDiscount?: boolean },
): string {
  const meta = kindMeta(doc.documentKind);
  const showTributaryBreakdown = isTributaryKind(doc.documentKind);
  const isNoteDocument = isNoteKind(doc.documentKind);
  const isEmbedded = options?.embedded === true;
  const showItemDiscount = options?.showItemDiscount !== false;
  const notePrint = resolveNotePrintDetails(doc);
  const company = resolvePrintableCompanyProfile(doc);
  const companyTitle = String(company.tradeName || company.legalName || 'SISTEMA FACTURACION').trim() || 'SISTEMA FACTURACION';
  const companyTaxId = String(company.taxId || '').trim();
  const companyAddress = String(company.address || '').trim();
  const companyPhone = String(company.phone || '').trim();
  const companyEmail = String(company.email || '').trim();

  const itemsRows = doc.items
    .map((item) => {
      const qtyStr = Number(item.qty).toFixed(2);
      const priceStr = formatMoney(item.unitPrice);
      const totalStr = formatMoney(item.lineTotal);
      
      // Ajustar descripción para 80mm (aprox. 32 caracteres por línea)
      const maxDescLength = 32;
      const desc = escapeHtml(item.description).substring(0, maxDescLength);
      
      return `<tr>
        <td style="font-size:8px;font-weight:700">${desc}</td>
      </tr>
      <tr>
        <td style="font-size:7px">
          <div style="display:flex;justify-content:space-between">
            <span>${qtyStr} x ${doc.currencySymbol} ${priceStr}</span>
            <span style="font-weight:700">${doc.currencySymbol} ${totalStr}</span>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const itemDiscountTotal = doc.items.reduce((acc, item) => acc + Number(item.discountTotal ?? 0), 0);
  const metaData = (doc.metadata ?? {}) as Record<string, unknown>;
  const vehiclePrint = resolveVehiclePrintData(metaData);
  const globalDiscountTotal = Number(metaData.discount_total ?? metaData.global_discount_total ?? 0);
  const sunatOpCode = String(metaData.sunat_operation_type_code ?? '').trim();
  const sunatOpName = String(metaData.sunat_operation_type_name ?? '').trim();
  const detraccionAmount = Number(metaData.detraccion_amount ?? 0);
  const detraccionRate = Number(metaData.detraccion_rate_percent ?? 0);
  const retencionAmount = Number(metaData.retencion_amount ?? 0);
  const retencionRate = Number(metaData.retencion_rate_percent ?? 0);
  const percepcionAmount = Number(metaData.percepcion_amount ?? 0);
  const percepcionRate = Number(metaData.percepcion_rate_percent ?? 0);
  const sunatPrint = resolveSunatPrintData(metaData, doc.documentKind);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(meta.title)} ${escapeHtml(doc.series)}-${doc.number}</title>
        <style>
          @media print { 
            @page { 
              size: 80mm auto; 
              margin: 0; 
              padding: 0;
            } 
            .no-print { 
              display: none !important; 
            }
            body {
              margin: 0;
              padding: 0;
            }
          }
          * { 
            box-sizing: border-box; 
            margin: 0;
            padding: 0;
          }
          body { 
            font-family: 'Courier New', Courier, monospace; 
            color: #000; 
            font-size: 10px; 
            line-height: 1.35;
            background: #fff;
            width: 80mm;
            margin: 0 auto;
          }
          .sheet { 
            width: 80mm;
            margin: 0;
            padding: 2mm 3mm;
            min-height: 100%;
          }
          .print-bar { 
            background: linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%);
            color: #fff; 
            padding: 6px 8px;
            text-align: center; 
            font-family: sans-serif; 
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
            border-radius: 8px;
            white-space: nowrap;
          }
          .print-bar-title { font-weight: 700; letter-spacing: 0.2px; font-size: 11px; }
          .print-bar button { 
            background: #fff;
            color: #0f172a;
            border: 1px solid #cbd5e1;
            padding: 4px 10px; 
            font-size: 10px;
            font-weight: 700; 
            border-radius: 8px; 
            cursor: pointer;
          }
          .divider {
            border-top: 1px dashed #000;
            margin: 2mm 0;
            opacity: 0.6;
          }
          .header { 
            text-align: center;
            margin-bottom: 2mm;
          }
          .header-logo {
            width: 30mm;
            height: 30mm;
            object-fit: contain;
            border: 1px solid #000;
            margin: 0 auto 1mm;
            display: block;
            background: #fff;
          }
          .title { 
            font-size: 10px; 
            font-weight: 700; 
            text-transform: uppercase; 
            letter-spacing: 0.5px;
            margin-bottom: 1mm;
          }
          .docno { 
            font-size: 11px; 
            font-weight: 700; 
            margin-bottom: 0.5mm;
            letter-spacing: 1px;
          }
          .date { 
            font-size: 8px;
            color: #333;
          }
          .section { 
            margin-bottom: 2mm;
          }
          .section-title { 
            font-weight: 700; 
            text-transform: uppercase; 
            font-size: 8px;
            margin-bottom: 1mm;
            border-bottom: 1px solid #000;
            padding-bottom: 0.5mm;
          }
          .info-row { 
            display: flex; 
            justify-content: space-between; 
            font-size: 8px; 
            margin: 0.3mm 0; 
            word-break: break-word;
          }
          .info-label { 
            font-weight: 600;
            flex: 0 0 auto;
            margin-right: 2mm;
          }
          .info-value { 
            flex: 1;
            text-align: right;
          }
          .items { 
            margin-bottom: 2mm;
            border-top: 1px solid #000;
            border-bottom: 1px solid #000;
            padding: 1mm 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          td {
            padding: 0.5mm 0;
            font-size: 8px;
          }
          .summary { 
            border-top: 1px solid #000;
            padding-top: 1mm;
            margin-top: 1mm;
          }
          .summary-row { 
            display: flex; 
            justify-content: space-between; 
            font-size: 8px; 
            margin: 0.5mm 0;
          }
          .summary-label { 
            flex: 1; 
          }
          .summary-value { 
            text-align: right;
            font-weight: 600;
            flex: 0 0 auto;
            width: 30mm;
          }
          .total-row { 
            font-size: 10px; 
            font-weight: 700;
            border-top: 2px solid #000;
            padding-top: 1mm;
            margin-top: 1mm;
            display: flex;
            justify-content: space-between;
          }
          .footer { 
            text-align: center; 
            font-size: 7px; 
            color: #555; 
            margin-top: 2mm;
            border-top: 1px dashed #000;
            padding-top: 1mm;
            line-height: 1.2;
          }
          .paybrands { display: flex; gap: 3px; align-items: center; justify-content: center; margin: 1mm 0; }
          .paybrand { border-radius: 6px; border: 1px solid #d1d5db; background: #fff; padding: 2px 5px; height: 24px; display: inline-flex; align-items: center; }
          .paybrand img { height: 16px; width: auto; display: block; }
          .footer-item {
            margin: 0.3mm 0;
          }
          .sunat-ticket {
            margin-top: 1.5mm;
            border-top: 1px dashed #000;
            padding-top: 1.2mm;
            text-align: left;
          }
          .sunat-ticket img {
            width: 26mm;
            height: 26mm;
            border: 1px solid #000;
            display: block;
            margin: 0 auto 1mm;
            background: #fff;
          }
          .sunat-ticket .line {
            font-size: 7px;
            margin: 0.3mm 0;
            word-break: break-all;
          }
        </style>
      </head>
      <body>
        ${isEmbedded
          ? ''
          : `<div class="print-bar no-print">
          <span class="print-bar-title">Vista Ticket 80mm</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        
        <div class="sheet">
          <div class="header">
            ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="Logo" class="header-logo" />` : ''}
            <div class="title">${escapeHtml(companyTitle)}</div>
            ${companyTaxId ? `<div class="date">RUC: ${escapeHtml(companyTaxId)}</div>` : ''}
            ${companyAddress ? `<div class="date">${escapeHtml(companyAddress)}</div>` : ''}
            ${companyPhone ? `<div class="date">Tel: ${escapeHtml(companyPhone)}</div>` : ''}
            ${companyEmail ? `<div class="date">Email: ${escapeHtml(companyEmail)}</div>` : ''}
            <div class="title">${escapeHtml(meta.title)}</div>
            <div class="docno">${escapeHtml(doc.series)}-${String(doc.number).padStart(6, '0')}</div>
            <div class="date">${formatDateTime(doc.issueDate)}</div>
          </div>

          <div class="divider"></div>

          <div class="section">
            <div class="info-row">
              <div class="info-label">CLIENTE:</div>
              <div class="info-value">${escapeHtml(doc.customerName || '-')}</div>
            </div>
            ${doc.customerDocNumber ? `<div class="info-row">
              <div class="info-label">Doc:</div>
              <div class="info-value">${escapeHtml(doc.customerDocNumber)}</div>
            </div>` : ''}
            ${vehiclePrint.plate ? `<div class="info-row">
              <div class="info-label">Vehículo:</div>
              <div class="info-value">${escapeHtml(vehiclePrint.plate)}${vehiclePrint.brand || vehiclePrint.model ? ` (${escapeHtml([vehiclePrint.brand, vehiclePrint.model].filter((x) => x !== '').join(' '))})` : ''}</div>
            </div>` : ''}
          </div>

          ${isNoteDocument ? `<div class="divider"></div>
          <div class="section">
            <div class="section-title">DATOS DE LA NOTA</div>
            <div class="info-row">
              <div class="info-label">Afecta:</div>
              <div class="info-value">${escapeHtml(notePrint.sourceDocumentLabel)} ${escapeHtml(notePrint.sourceDocumentNumber || '-')}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Motivo:</div>
              <div class="info-value">${escapeHtml(notePrint.noteReasonCode || '-')} ${notePrint.noteReasonDescription ? `- ${escapeHtml(notePrint.noteReasonDescription)}` : ''}</div>
            </div>
          </div>` : ''}

          <div class="divider"></div>

          <div class="items">
            ${isNoteDocument ? `<div class="section-title" style="margin-bottom:1mm">DETALLE AFECTADO</div>` : ''}
            <table>
              <tbody>
                ${itemsRows || '<tr><td style="text-align:center">Sin items</td></tr>'}
              </tbody>
            </table>
          </div>

          <div class="summary">
            ${showTributaryBreakdown && doc.gravadaTotal > 0 ? `<div class="summary-row">
              <div class="summary-label">Op. Gravada:</div>
              <div class="summary-value">${doc.currencySymbol} ${formatMoney(doc.gravadaTotal)}</div>
            </div>` : ''}
            ${showTributaryBreakdown && doc.inafectaTotal > 0 ? `<div class="summary-row">
              <div class="summary-label">Op. Inafecta:</div>
              <div class="summary-value">${doc.currencySymbol} ${formatMoney(doc.inafectaTotal)}</div>
            </div>` : ''}
            ${showTributaryBreakdown && doc.exoneradaTotal > 0 ? `<div class="summary-row">
              <div class="summary-label">Op. Exonerada:</div>
              <div class="summary-value">${doc.currencySymbol} ${formatMoney(doc.exoneradaTotal)}</div>
            </div>` : ''}
            ${showTributaryBreakdown && doc.taxTotal > 0 ? `<div class="summary-row">
              <div class="summary-label">IGV:</div>
              <div class="summary-value">${doc.currencySymbol} ${formatMoney(doc.taxTotal)}</div>
            </div>` : ''}
            ${showItemDiscount && itemDiscountTotal > 0 ? `<div class="summary-row"><div class="summary-label">Dscto. item:</div><div class="summary-value">-${doc.currencySymbol} ${formatMoney(itemDiscountTotal)}</div></div>` : ''}
            ${globalDiscountTotal > 0 ? `<div class="summary-row"><div class="summary-label">Dscto. global:</div><div class="summary-value">-${doc.currencySymbol} ${formatMoney(globalDiscountTotal)}</div></div>` : ''}
            ${showTributaryBreakdown && sunatOpCode ? `<div class="summary-row"><div class="summary-label">Op. SUNAT:</div><div class="summary-value">${escapeHtml(sunatOpCode)}${sunatOpName ? ` - ${escapeHtml(sunatOpName)}` : ''}</div></div>` : ''}
            ${showTributaryBreakdown && detraccionAmount > 0 ? `<div class="summary-row"><div class="summary-label">Detraccion:</div><div class="summary-value">${doc.currencySymbol} ${formatMoney(detraccionAmount)} (${formatMoney(detraccionRate)}%)</div></div>` : ''}
            ${showTributaryBreakdown && retencionAmount > 0 ? `<div class="summary-row"><div class="summary-label">Retencion:</div><div class="summary-value">${doc.currencySymbol} ${formatMoney(retencionAmount)} (${formatMoney(retencionRate)}%)</div></div>` : ''}
            ${showTributaryBreakdown && percepcionAmount > 0 ? `<div class="summary-row"><div class="summary-label">Percepcion:</div><div class="summary-value">${doc.currencySymbol} ${formatMoney(percepcionAmount)} (${formatMoney(percepcionRate)}%)</div></div>` : ''}
            <div class="total-row">
              <span>TOTAL</span>
              <span>${doc.currencySymbol} ${formatMoney(doc.grandTotal)}</span>
            </div>
          </div>

          <div class="footer">
            <div class="footer-item">Forma Pago: ${escapeHtml(doc.paymentMethodName || '-')}</div>
            ${sunatPrint.signature
              ? `<div class="sunat-ticket">
                  ${sunatPrint.signature ? `<div class="line"><strong>Firma:</strong> ${escapeHtml(sunatPrint.signature)}</div>` : ''}
                </div>`
              : ''}
            <div class="divider" style="margin: 1mm 0"></div>
            ${paymentBrandsFooterHtml('80mm')}
            <div class="footer-item">Gracias por su compra</div>
            <div class="footer-item">ID: ${doc.id}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function openCommercialDocumentPrintA4(doc: PrintableSalesDocument): void {
  const printWindow = window.open('', '_blank', 'width=1024,height=920');
  if (!printWindow) {
    return;
  }

  const html = buildCommercialDocumentA4Html(doc);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const trigger = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (printWindow.document.readyState === 'complete') {
    trigger();
  } else {
    printWindow.onload = trigger;
  }
}

export function openCommercialDocumentPreview80mm(doc: PrintableSalesDocument): void {
  const previewWindow = window.open('', '_blank', 'width=420,height=800');
  if (!previewWindow) {
    return;
  }

  const html = buildCommercialDocument80mmHtml(doc);
  previewWindow.document.open();
  previewWindow.document.write(html);
  previewWindow.document.close();

  if (previewWindow.document.readyState === 'complete') {
    previewWindow.focus();
  } else {
    previewWindow.onload = () => {
      previewWindow.focus();
    };
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cash Report Print Functions
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type PaymentMethodBreakdown = {
  payment_method_id: number;
  payment_method_code: string;
  payment_method_name: string;
  document_count: number;
  total_amount: number;
};

export type CashReportDocumentItem = {
  product_id?: number | null;
  description: string;
  quantity: number;
  unit_code: string;
  unit_price: number;
  unit_cost?: number;
  cost_total?: number;
  margin_total?: number;
  margin_percent?: number;
  margin_source?: 'REAL' | 'ESTIMATED';
  line_total: number;
};

export type CashReportDocument = {
  id: number;
  document_number: string;
  document_kind: string;
  customer_name: string;
  customer_vehicle_id?: number | null;
  vehicle_plate_snapshot?: string | null;
  vehicle_brand_snapshot?: string | null;
  vehicle_model_snapshot?: string | null;
  payment_method_name: string | null;
  total: number;
  created_at: string;
  user_name: string | null;
  items: CashReportDocumentItem[];
};

export type CashReportMovement = {
  id: number;
  movement_type: 'IN' | 'OUT';
  amount: number;
  description: string | null;
  ref_type: string | null;
  movement_at: string;
};

export type CashReportPrintData = {
  cashRegisterCode: string;
  cashRegisterName: string;
  userName: string;
  openedAt: string;
  closedAt: string;
  openingBalance: number;
  closingBalance: number;
  expectedBalance: number;
  totalIn: number;
  totalOut: number;
  difference: number;
  paymentMethodBreakdown: PaymentMethodBreakdown[];
  movements?: CashReportMovement[];
  documents?: CashReportDocument[];
  showVehicleInfo?: boolean;
  company?: PrintableCompanyProfile | null;
};

function resolveCashItemMargin(item: CashReportDocumentItem): { costTotal: number; marginTotal: number; marginPercent: number } {
  const lineTotal = Number(item.line_total || 0);
  if (lineTotal <= 0) {
    return { costTotal: 0, marginTotal: 0, marginPercent: 0 };
  }

  const providedMargin = Number(item.margin_total ?? NaN);
  const providedCost = Number(item.cost_total ?? NaN);

  if (Number.isFinite(providedMargin)) {
    const marginTotal = providedMargin;
    const costTotal = Number.isFinite(providedCost) ? providedCost : lineTotal - marginTotal;
    return {
      costTotal,
      marginTotal,
      marginPercent: lineTotal > 0 ? (marginTotal / lineTotal) * 100 : 0,
    };
  }

  const estimatedMargin = lineTotal * 0.22;
  const marginTotal = Math.min(Math.max(estimatedMargin, 0), lineTotal * 0.35);
  const costTotal = Math.max(0, lineTotal - marginTotal);
  return {
    costTotal,
    marginTotal,
    marginPercent: lineTotal > 0 ? (marginTotal / lineTotal) * 100 : 0,
  };
}

function resolveCashVehicleSnapshot(doc: CashReportDocument): { plate: string; brand: string; model: string } {
  const plate = String(doc.vehicle_plate_snapshot ?? '').trim() || '-';
  const brand = String(doc.vehicle_brand_snapshot ?? '').trim() || '-';
  const model = String(doc.vehicle_model_snapshot ?? '').trim() || '-';
  return { plate, brand, model };
}

export function buildCashReportHtml80mm(
  data: CashReportPrintData,
  options?: { embedded?: boolean },
): string {
  const isEmbedded = options?.embedded === true;
  const company = resolvePrintableCompanyProfile(data);
  const companyTitle = String(company.tradeName || company.legalName || 'SISTEMA FACTURACION').trim() || 'SISTEMA FACTURACION';
  const companyTaxId = String(company.taxId || '').trim();
  const paymentRows = data.paymentMethodBreakdown
    .map((pm) => `
      <tr>
        <td>${escapeHtml(pm.payment_method_name)}</td>
        <td class="ta-r">${pm.document_count}</td>
        <td class="ta-r">${formatMoney(pm.total_amount)}</td>
      </tr>`)
    .join('');

  const productMap = new Map<string, {
    documentKind: string;
    documentNumber: string;
    vehiclePlate: string;
    vehicleBrand: string;
    vehicleModel: string;
    description: string;
    unitCode: string;
    paymentMethod: string;
    quantity: number;
    amount: number;
    marginAmount: number;
  }>();
  for (const doc of data.documents ?? []) {
    const documentKind = cashDocumentKindLabel(doc.document_kind);
    const documentNumber = (doc.document_number || '').trim() || '-';
    const vehicleSnapshot = resolveCashVehicleSnapshot(doc);
    const vehiclePlate = vehicleSnapshot.plate;
    const vehicleBrand = vehicleSnapshot.brand;
    const vehicleModel = vehicleSnapshot.model;
    const paymentMethod = (doc.payment_method_name || '').trim() || '-';
    for (const item of doc.items ?? []) {
      const description = (item.description || '').trim() || 'Producto sin descripcion';
      const unitCode = (item.unit_code || '').trim() || '-';
      const key = `${documentKind.toLowerCase()}__${documentNumber.toLowerCase()}__${description.toLowerCase()}__${unitCode.toLowerCase()}__${paymentMethod.toLowerCase()}__${(data.showVehicleInfo ? `${vehiclePlate.toLowerCase()}__${vehicleBrand.toLowerCase()}__${vehicleModel.toLowerCase()}` : '')}`;
      const current = productMap.get(key);

      if (current) {
        current.quantity += Number(item.quantity || 0);
        current.amount += Number(item.line_total || 0);
        current.marginAmount += resolveCashItemMargin(item).marginTotal;
      } else {
        const marginMeta = resolveCashItemMargin(item);
        productMap.set(key, {
          documentKind,
          documentNumber,
          vehiclePlate,
          vehicleBrand,
          vehicleModel,
          description,
          unitCode,
          paymentMethod,
          quantity: Number(item.quantity || 0),
          amount: Number(item.line_total || 0),
          marginAmount: marginMeta.marginTotal,
        });
      }
    }
  }

  const productRowsData = Array.from(productMap.values()).sort((a, b) => b.amount - a.amount);
  const productRows = productRowsData
    .map(
      (row) => `
        <tr>
          <td style="font-size:8px">${escapeHtml(row.description)}</td>
          <td style="font-size:8px">${escapeHtml(row.paymentMethod)}</td>
          <td class="ta-r" style="font-size:8px">${row.quantity.toFixed(2)}</td>
          <td style="font-size:8px">${escapeHtml(row.documentKind)}</td>
          <td style="font-size:8px">${escapeHtml(row.documentNumber)}</td>
          ${data.showVehicleInfo ? `<td style="font-size:8px" class="vehicle-cell">
            <div><b>Placa:</b> ${escapeHtml(row.vehiclePlate)}</div>
            <div><b>Marca:</b> ${escapeHtml(row.vehicleBrand)}</div>
            <div><b>Modelo:</b> ${escapeHtml(row.vehicleModel)}</div>
          </td>` : ''}
          <td class="ta-r" style="font-size:8px;font-weight:700">${formatMoney(row.amount)}</td>
          <td class="ta-r" style="font-size:8px;color:${row.marginAmount >= 0 ? '#0f766e' : '#dc2626'};font-weight:700">${formatMoney(row.marginAmount)}</td>
        </tr>`,
    )
    .join('');

  const totalProductQty = productRowsData.reduce((sum, row) => sum + row.quantity, 0);
  const totalProductAmount = productRowsData.reduce((sum, row) => sum + row.amount, 0);
  const totalProductMargin = productRowsData.reduce((sum, row) => sum + row.marginAmount, 0);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>REPORTE DE CAJA - ${escapeHtml(data.cashRegisterCode)}</title>
        <style>
          @media print { @page { size: 80mm auto; margin: 0; } .no-print { display: none !important; } }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Courier, monospace; color: #000; font-size: 10px; line-height: 1.3; background: #fff; }
          .sheet { width: 80mm; min-width: 300px; margin: 0 auto; padding: 6mm; }
          .print-bar { background: linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%); color: #fff; padding: 8px 12px; text-align: center; font-family: sans-serif; font-size: 13px; }
          .print-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-radius: 8px; white-space: nowrap; }
          .print-bar button { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 11px; font-weight: 700; border-radius: 8px; cursor: pointer; margin: 0 2px; }
          .print-bar-title { font-size: 11px; font-weight: 700; letter-spacing: 0.2px; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4mm; margin-bottom: 4mm; }
          .header-logo { width: 22mm; height: 22mm; object-fit: contain; border: 1px solid #000; border-radius: 4px; margin: 0 auto 1mm; display: block; background: #fff; }
          .header h1 { margin: 0; font-size: 12px; font-weight: 700; }
          .header p { margin: 1px 0; font-size: 9px; }
          .section { margin-bottom: 5mm; border-bottom: 1px dashed #000; padding-bottom: 4mm; }
          .section-title { font-weight: 700; text-transform: uppercase; font-size: 9px; margin-bottom: 2mm; }
          .row { display: flex; justify-content: space-between; margin: 1mm 0; font-size: 9px; }
          .label { flex: 1.5; }
          .value { text-align: right; flex: 1; }
          table { width: 100%; border-collapse: collapse; margin: 1mm 0; }
          .product-table { table-layout: fixed; }
          th { text-align: left; font-weight: 700; font-size: 8px; border-bottom: 1px solid #000; padding: 1mm 0; }
          td { padding: 0.8mm 1mm; font-size: 9px; vertical-align: top; }
          .ta-r { text-align: right; }
          .ta-c { text-align: center; }
          .total-row { font-weight: 700; border-top: 1px solid #000; }
          .vehicle-cell b { font-weight: 700; }
          .vehicle-cell div { line-height: 1.25; }
          .footer { text-align: center; font-size: 8px; color: #444; margin-top: 4mm; }
        </style>
      </head>
      <body>
        ${isEmbedded
          ? ''
          : `<div class="print-bar no-print">
          <span class="print-bar-title">Vista Ticket 80mm</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        <div class="sheet">
          <div class="header">
            ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="Logo" class="header-logo" />` : ''}
            <p style="font-weight:700">${escapeHtml(companyTitle)}</p>
            ${companyTaxId ? `<p>RUC: ${escapeHtml(companyTaxId)}</p>` : ''}
            <h1>*** REPORTE DE CAJA ***</h1>
            <p>${escapeHtml(data.cashRegisterName)}</p>
            <p>Fecha: ${formatDateTime(data.closedAt || data.openedAt)}</p>
          </div>

          <div class="section">
            <div class="section-title">INFO GENERAL</div>
            <div class="row"><div class="label">Caja:</div><div class="value">${escapeHtml(data.cashRegisterCode)}</div></div>
            <div class="row"><div class="label">Usuario:</div><div class="value">${escapeHtml(data.userName)}</div></div>
            <div class="row"><div class="label">Apertura:</div><div class="value">${formatDateTime(data.openedAt)}</div></div>
            ${data.closedAt ? `<div class="row"><div class="label">Cierre:</div><div class="value">${formatDateTime(data.closedAt)}</div></div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">SALDOS</div>
            <div class="row"><div class="label">Saldo Inicial:</div><div class="value">S/ ${formatMoney(data.openingBalance)}</div></div>
            <div class="row"><div class="label">Entradas (+):</div><div class="value">S/ ${formatMoney(data.totalIn)}</div></div>
            <div class="row"><div class="label">Salidas (-):</div><div class="value">S/ ${formatMoney(data.totalOut)}</div></div>
            <div class="row"><div class="label">Esperado:</div><div class="value">S/ ${formatMoney(data.expectedBalance)}</div></div>
            <div class="row" style="font-weight:700;border-top:1px solid #000;padding-top:1mm"><div class="label">Real:</div><div class="value">S/ ${formatMoney(data.closingBalance)}</div></div>
            ${data.difference !== 0 ? `<div class="row" style="color:${data.difference >= 0 ? '#008000' : '#cc0000'}"><div class="label">Diferencia:</div><div class="value">${data.difference > 0 ? '+' : ''}S/ ${formatMoney(data.difference)}</div></div>` : ''}
          </div>

          <div class="section">
            <div class="section-title">VENTAS POR TIPO DE PAGO</div>
            <table>
              <thead><tr><th>Tipo de Pago</th><th class="ta-c">Can.</th><th class="ta-r">Monto</th></tr></thead>
              <tbody>
                ${paymentRows || '<tr><td colspan="3" class="ta-c">Sin ventas</td></tr>'}
                <tr class="total-row"><td>TOTAL</td><td class="ta-c">${data.paymentMethodBreakdown.reduce((s, p) => s + p.document_count, 0)}</td><td class="ta-r">${formatMoney(data.paymentMethodBreakdown.reduce((s, p) => s + p.total_amount, 0))}</td></tr>
              </tbody>
            </table>
          </div>

          ${productRows ? `
          <div class="section">
            <div class="section-title">PRODUCTOS VENDIDOS</div>
            <table class="product-table">
              <thead><tr><th>Producto</th><th>Pago</th><th class="ta-r">Cant.</th><th>Comp.</th><th>Serie</th>${data.showVehicleInfo ? '<th>Vehículo</th>' : ''}<th class="ta-r">Total</th><th class="ta-r">Margen</th></tr></thead>
              <tbody>
                ${productRows}
                <tr class="total-row"><td colspan="2">TOTAL</td><td class="ta-r">${totalProductQty.toFixed(2)}</td><td colspan="${data.showVehicleInfo ? '3' : '2'}"></td><td class="ta-r">${formatMoney(totalProductAmount)}</td><td class="ta-r">${formatMoney(totalProductMargin)}</td></tr>
              </tbody>
            </table>
          </div>` : ''}

          <div class="footer">Emitido: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}</div>
        </div>
      </body>
    </html>`;
}

export function buildCashReportHtmlA4(
  data: CashReportPrintData,
  options?: { embedded?: boolean },
): string {
  const isEmbedded = options?.embedded === true;
  const company = resolvePrintableCompanyProfile(data);
  const companyTitle = String(company.tradeName || company.legalName || 'SISTEMA FACTURACION').trim() || 'SISTEMA FACTURACION';
  const companyTaxId = String(company.taxId || '').trim();
  const paymentRows = data.paymentMethodBreakdown
    .map((pm) => `
      <tr>
        <td>${escapeHtml(pm.payment_method_name)}</td>
        <td class="ta-c">${pm.document_count}</td>
        <td class="ta-r">S/ ${formatMoney(pm.total_amount)}</td>
      </tr>`)
    .join('');

  const productMap = new Map<string, {
    documentKind: string;
    documentNumber: string;
    vehiclePlate: string;
    vehicleBrand: string;
    vehicleModel: string;
    description: string;
    unitCode: string;
    paymentMethod: string;
    quantity: number;
    amount: number;
    marginAmount: number;
  }>();
  for (const doc of data.documents ?? []) {
    const documentKind = cashDocumentKindLabel(doc.document_kind);
    const documentNumber = (doc.document_number || '').trim() || '-';
    const vehicleSnapshot = resolveCashVehicleSnapshot(doc);
    const vehiclePlate = vehicleSnapshot.plate;
    const vehicleBrand = vehicleSnapshot.brand;
    const vehicleModel = vehicleSnapshot.model;
    const paymentMethod = (doc.payment_method_name || '').trim() || '-';
    for (const item of doc.items ?? []) {
      const description = (item.description || '').trim() || 'Producto sin descripcion';
      const unitCode = (item.unit_code || '').trim() || '-';
      const key = `${documentKind.toLowerCase()}__${documentNumber.toLowerCase()}__${description.toLowerCase()}__${unitCode.toLowerCase()}__${paymentMethod.toLowerCase()}__${(data.showVehicleInfo ? `${vehiclePlate.toLowerCase()}__${vehicleBrand.toLowerCase()}__${vehicleModel.toLowerCase()}` : '')}`;
      const current = productMap.get(key);

      if (current) {
        current.quantity += Number(item.quantity || 0);
        current.amount += Number(item.line_total || 0);
        current.marginAmount += resolveCashItemMargin(item).marginTotal;
      } else {
        const marginMeta = resolveCashItemMargin(item);
        productMap.set(key, {
          documentKind,
          documentNumber,
          vehiclePlate,
          vehicleBrand,
          vehicleModel,
          description,
          unitCode,
          paymentMethod,
          quantity: Number(item.quantity || 0),
          amount: Number(item.line_total || 0),
          marginAmount: marginMeta.marginTotal,
        });
      }
    }
  }

  const productRowsData = Array.from(productMap.values()).sort((a, b) => b.amount - a.amount);
  const productRows = productRowsData
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.description)}</td>
        <td>${escapeHtml(row.paymentMethod)}</td>
        <td class="ta-c">${escapeHtml(row.unitCode)}</td>
        <td class="ta-r">${row.quantity.toFixed(3)}</td>
        <td>${escapeHtml(row.documentKind)}</td>
        <td>${escapeHtml(row.documentNumber)}</td>
        ${data.showVehicleInfo ? `<td class="cash-vehicle-cell"><div><b>Placa:</b> ${escapeHtml(row.vehiclePlate)}</div><div><b>Marca:</b> ${escapeHtml(row.vehicleBrand)}</div><div><b>Modelo:</b> ${escapeHtml(row.vehicleModel)}</div></td>` : ''}
        <td class="ta-r">S/ ${formatMoney(row.amount)}</td>
        <td class="ta-r" style="color:${row.marginAmount >= 0 ? '#0f766e' : '#dc2626'}">S/ ${formatMoney(row.marginAmount)}</td>
      </tr>`,
    )
    .join('');

  const totalProductQty = productRowsData.reduce((sum, row) => sum + row.quantity, 0);
  const totalProductAmount = productRowsData.reduce((sum, row) => sum + row.amount, 0);
  const totalProductMargin = productRowsData.reduce((sum, row) => sum + row.marginAmount, 0);

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>REPORTE DE CAJA - ${escapeHtml(data.cashRegisterCode)}</title>
        <style>
          @media print { @page { size: A4 portrait; margin: 12mm; } .no-print { display: none !important; } }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #1f2937; background: #fff; }
          .print-bar { background: linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%); color: #fff; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
          .print-bar button { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; padding: 7px 16px; font-size: 13px; font-weight: 700; border-radius: 8px; cursor: pointer; margin-left: 8px; }
          .page { max-width: 210mm; margin: 0 auto; padding: 14px; }
          .header { text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 10px; }
          .header-logo { width: 88px; height: 88px; object-fit: contain; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; display: block; margin: 0 auto 6px; }
          .header h1 { margin: 0; font-size: 18px; font-weight: 700; }
          .header p { margin: 1px 0; font-size: 11px; color: #64748b; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
          .metric { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
          .metric span { display: block; font-size: 10px; color: #64748b; }
          .metric strong { display: block; margin-top: 2px; font-size: 14px; }
          .kv { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
          .kv .k { font-weight: 600; color: #374151; }
          .kv .v { text-align: right; color: #1f2937; }
          .section { border: 1px solid #d1d5db; border-radius: 6px; padding: 10px; margin-bottom: 12px; }
          .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1e40af; border-bottom: 1px solid #dbeafe; padding-bottom: 4px; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; }
          .cash-products-table { table-layout: fixed; }
          thead th { background: #1e40af; color: #fff; font-size: 10px; text-align: left; padding: 6px 7px; }
          tbody td { border-bottom: 1px solid #e5e7eb; padding: 5px 7px; font-size: 11px; vertical-align: top; }
          .ta-r { text-align: right; }
          .ta-c { text-align: center; }
          .total-row { background: #f0f4ff; font-weight: 700; }
          .cash-vehicle-cell b { font-weight: 700; }
          .cash-vehicle-cell div { line-height: 1.25; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        ${isEmbedded
          ? ''
          : `<div class="print-bar no-print">
          <span>Vista Previa - Reporte A4</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        <div class="page">
          <div class="header">
            ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="Logo" class="header-logo" />` : ''}
            <p style="font-weight:700;color:#0f172a">${escapeHtml(companyTitle)}</p>
            ${companyTaxId ? `<p>RUC: ${escapeHtml(companyTaxId)}</p>` : ''}
            <h1>REPORTE DE CIERRE DE CAJA</h1>
            <p>${escapeHtml(data.cashRegisterName)}</p>
            <p>Rango: ${formatDateTime(data.openedAt)} ${data.closedAt ? `a ${formatDateTime(data.closedAt)}` : 'a la fecha'}</p>
            <p>Usuario: ${escapeHtml(data.userName)} | Caja: ${escapeHtml(data.cashRegisterCode)}</p>
          </div>

          <div class="summary-grid">
            <article class="metric"><span>Saldo inicial</span><strong>S/ ${formatMoney(data.openingBalance)}</strong></article>
            <article class="metric"><span>Saldo esperado</span><strong>S/ ${formatMoney(data.expectedBalance)}</strong></article>
            <article class="metric"><span>Saldo real</span><strong>S/ ${formatMoney(data.closingBalance)}</strong></article>
            <article class="metric"><span>Diferencia</span><strong style="color:${data.difference >= 0 ? '#059669' : '#dc2626'}">${data.difference > 0 ? '+' : ''}S/ ${formatMoney(data.difference)}</strong></article>
          </div>

          <div class="section">
            <div class="section-title">Totales por tipo de pago</div>
            <table>
              <thead><tr><th>Forma de pago</th><th class="ta-c" style="width:90px">Cantidad</th><th class="ta-r" style="width:130px">Monto</th></tr></thead>
              <tbody>
                ${paymentRows || '<tr><td colspan="3" class="ta-c">Sin ventas registradas</td></tr>'}
                <tr class="total-row"><td>TOTAL</td><td class="ta-c">${data.paymentMethodBreakdown.reduce((s, p) => s + p.document_count, 0)}</td><td class="ta-r">S/ ${formatMoney(data.paymentMethodBreakdown.reduce((s, p) => s + p.total_amount, 0))}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Productos vendidos en la sesion</div>
            <table class="cash-products-table">
              <thead><tr><th style="width:${data.showVehicleInfo ? '24%' : '30%'}">Producto</th><th style="width:${data.showVehicleInfo ? '10%' : '11%'}">Tipo de pago</th><th class="ta-c" style="width:6%">Unidad</th><th class="ta-r" style="width:${data.showVehicleInfo ? '7%' : '8%'}">Cantidad</th><th style="width:${data.showVehicleInfo ? '10%' : '10%'}">Tipo comprobante</th><th style="width:${data.showVehicleInfo ? '10%' : '11%'}">Serie-correlativo</th>${data.showVehicleInfo ? '<th style="width:18%">Vehículo</th>' : ''}<th class="ta-r" style="width:${data.showVehicleInfo ? '8%' : '10%'}">Total</th><th class="ta-r" style="width:${data.showVehicleInfo ? '7%' : '10%'}">Margen</th></tr></thead>
              <tbody>
                ${productRows || `<tr><td colspan="${data.showVehicleInfo ? '9' : '8'}" class="ta-c">Sin productos vendidos en la sesion</td></tr>`}
                <tr class="total-row"><td colspan="3">Total general</td><td class="ta-r">${totalProductQty.toFixed(3)}</td><td colspan="${data.showVehicleInfo ? '3' : '2'}"></td><td class="ta-r">S/ ${formatMoney(totalProductAmount)}</td><td class="ta-r">S/ ${formatMoney(totalProductMargin)}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="footer">Reporte generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}</div>
        </div>
      </body>
    </html>`;
}

export function openCashReportPrint80mm(data: CashReportPrintData): void {
  const printWindow = window.open('', '_blank', 'width=460,height=780');
  if (!printWindow) {
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildCashReportHtml80mm(data));
  printWindow.document.close();
  printWindow.focus();
}

export function openCashReportPrintA4(data: CashReportPrintData): void {
  const printWindow = window.open('', '_blank', 'width=980,height=820');
  if (!printWindow) {
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildCashReportHtmlA4(data));
  printWindow.document.close();
  printWindow.focus();
}


