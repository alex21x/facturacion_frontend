export type PrintableSalesItem = {
  lineNo: number;
  qty: number;
  unitLabel: string;
  description: string;
  unitPrice: number;
  lineTotal: number;
};

export type PrintableSalesDocument = {
  id: number;
  documentKind: 'QUOTATION' | 'SALES_ORDER' | 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
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
  items: PrintableSalesItem[];
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
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatMoney(amount: number): string {
  return Number(amount || 0).toFixed(2);
}

function kindMeta(kind: PrintableSalesDocument['documentKind']): { shortCode: string; title: string } {
  if (kind === 'INVOICE') {
    return { shortCode: 'F', title: 'FACTURA ELECTRONICA' };
  }
  if (kind === 'RECEIPT') {
    return { shortCode: 'B', title: 'BOLETA DE VENTA ELECTRONICA' };
  }
  if (kind === 'SALES_ORDER') {
    return { shortCode: 'P', title: 'PEDIDO DE VENTA' };
  }
  if (kind === 'QUOTATION') {
    return { shortCode: 'C', title: 'COTIZACION' };
  }
  if (kind === 'CREDIT_NOTE') {
    return { shortCode: 'NC', title: 'NOTA DE CREDITO' };
  }

  return { shortCode: 'ND', title: 'NOTA DE DEBITO' };
}

function buildHtml(doc: PrintableSalesDocument): string {
  const meta = kindMeta(doc.documentKind);

  const rows = doc.items
    .map((item) => {
      return `
        <tr>
          <td class="ta-c">${item.lineNo}</td>
          <td class="ta-r">${Number(item.qty).toFixed(3)}</td>
          <td class="ta-c">${escapeHtml(item.unitLabel)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="ta-r">${doc.currencySymbol} ${formatMoney(item.unitPrice)}</td>
          <td class="ta-r">${doc.currencySymbol} ${formatMoney(item.lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(meta.title)} ${escapeHtml(doc.series)}-${doc.number}</title>
        <style>
          @page { size: A4 portrait; margin: 9mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; color: #1f2937; }
          .sheet { width: 100%; border: 1.5px solid #1f2937; min-height: 277mm; padding: 8mm; }
          .head { display: grid; grid-template-columns: 1.1fr 1fr; gap: 10px; align-items: stretch; }
          .brand { border: 1px solid #9ca3af; border-radius: 8px; padding: 10px; }
          .brand h1 { margin: 0; font-size: 24px; letter-spacing: 0.6px; }
          .brand p { margin: 2px 0; font-size: 11px; color: #4b5563; }
          .voucher { border: 1px solid #9ca3af; border-radius: 8px; padding: 10px; text-align: center; }
          .voucher .ruc { font-size: 34px; font-weight: 700; letter-spacing: 1px; }
          .voucher .title { font-size: 18px; margin-top: 4px; letter-spacing: 2px; }
          .voucher .docno { margin-top: 10px; font-size: 22px; font-weight: 700; }
          .party { margin-top: 10px; border: 1px solid #9ca3af; border-radius: 8px; padding: 8px 10px; font-size: 12px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 12px; }
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
        </style>
      </head>
      <body>
        <section class="sheet">
          <section class="head">
            <article class="brand">
              <h1>SISTEMA FACTURACION</h1>
              <p>Comprobante generado desde modulo de ventas</p>
              <p>Fecha emision: ${formatDate(doc.issueDate)}</p>
              <p>Estado: ${escapeHtml(doc.status)}</p>
            </article>
            <article class="voucher">
              <div class="ruc">R.U.C.: 00000000000</div>
              <div class="title">${escapeHtml(meta.title)}</div>
              <div class="docno">No.: ${escapeHtml(doc.series)}-${doc.number}</div>
              <div>Tipo: ${escapeHtml(meta.shortCode)}</div>
            </article>
          </section>

          <section class="party">
            <article>
              <p class="kv"><b>Razon Social:</b> ${escapeHtml(doc.customerName || '-')}</p>
              <p class="kv"><b>Direccion:</b> ${escapeHtml(doc.customerAddress || '-')}</p>
              <p class="kv"><b>Fecha Emision:</b> ${formatDate(doc.issueDate)}</p>
              <p class="kv"><b>Tipo Moneda:</b> ${escapeHtml(doc.currencyCode)}</p>
            </article>
            <article>
              <p class="kv"><b>Documento:</b> ${escapeHtml(doc.customerDocNumber || '-')}</p>
              <p class="kv"><b>Fecha Venc.:</b> ${formatDate(doc.dueDate)}</p>
              <p class="kv"><b>Metodo Pago:</b> ${escapeHtml(doc.paymentMethodName || '-')}</p>
              <p class="kv"><b>Ref:</b> ${doc.id}</p>
            </article>
          </section>

          <section class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:44px">#</th>
                  <th style="width:76px">Cantidad</th>
                  <th style="width:86px">Unid. Med.</th>
                  <th>Descripcion</th>
                  <th style="width:92px">Valor U.</th>
                  <th style="width:96px">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6" class="ta-c">Sin items</td></tr>'}
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
                  <tr><td class="label">Op. Gravadas:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.gravadaTotal)}</td></tr>
                  <tr><td class="label">Op. Inafectas:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.inafectaTotal)}</td></tr>
                  <tr><td class="label">Op. Exoneradas:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.exoneradaTotal)}</td></tr>
                  <tr><td class="label">IGV:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.taxTotal)}</td></tr>
                  <tr class="total-row"><td class="label">Total a Pagar:</td><td class="value">${doc.currencySymbol} ${formatMoney(doc.grandTotal)}</td></tr>
                </tbody>
              </table>
            </article>
          </section>

          <section class="obs">
            Observaciones: Documento impreso en formato A4 adaptable por tipo de comprobante.
          </section>
        </section>
      </body>
    </html>
  `;
}

export function openCommercialDocumentPrintA4(doc: PrintableSalesDocument): void {
  const printWindow = window.open('', '_blank', 'width=1024,height=920');
  if (!printWindow) {
    return;
  }

  const html = buildHtml(doc);
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
