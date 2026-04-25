import{b as Y,a as X}from"./lima-BQBj48Ah.js";import{a as tt}from"./index-D4PTU4Kx.js";function a(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function et(t){return X(t)}function I(t){return Y(t)}function o(t){return Number(t||0).toFixed(2)}function at(t){const e=String(t??"").trim();if(!e)return null;if(/^https?:\/\//i.test(e)||e.startsWith("data:"))return e;const r=tt.baseUrl.replace(/\/+$/,"");return e.startsWith("//")?`http:${e}`:e.startsWith("/")?`${r}${e}`:`${r}/${e.replace(/^\/+/,"")}`}function L(t){const e=t.metadata??{},r=t.company??{},n=r.taxId??r.tax_id??e.company_tax_id??e.tax_id??null,m=r.legalName??r.legal_name??e.company_legal_name??e.legal_name??null,b=r.tradeName??r.trade_name??e.company_trade_name??e.trade_name??null,g=r.address??r.company_address??e.company_address??e.address??null,c=r.phone??r.company_phone??e.company_phone??e.phone??null,l=r.email??r.company_email??e.company_email??e.email??null,x=r.logoUrl??r.logo_url??e.company_logo_url??e.logo_url??null;return{taxId:n,legalName:m,tradeName:b,address:g,phone:c,email:l,logoUrl:at(x)}}function B(t){const e=String(t.vehicle_plate??t.vehiclePlateSnapshot??"").trim(),r=String(t.vehicle_brand??t.vehicleBrand??"").trim(),n=String(t.vehicle_model??t.vehicleModel??"").trim();return{plate:e,brand:r,model:n}}function q(t){return`<div class="${t==="A4"?"paybrands paybrands-a4":"paybrands paybrands-80"}">
    <div class="paybrand"><img src="${a("/assets/payment-logos/yape-official.png")}" alt="Yape" /></div>
    <div class="paybrand"><img src="${a("/assets/payment-logos/plin-official.png")}" alt="Plin" /></div>
    <div class="paybrand"><img src="${a("/assets/payment-logos/culqi-official.png")}" alt="Culqi" /></div>
  </div>`}function M(t){const e=String(t||"").trim().toUpperCase();return e==="CREDIT_NOTE"||e.startsWith("CREDIT_NOTE_")?"CREDIT_NOTE":e==="DEBIT_NOTE"||e.startsWith("DEBIT_NOTE_")?"DEBIT_NOTE":e}function K(t){const e=M(t);return e==="INVOICE"?{shortCode:"F",title:"FACTURA ELECTRONICA"}:e==="RECEIPT"?{shortCode:"B",title:"BOLETA DE VENTA ELECTRONICA"}:e==="SALES_ORDER"?{shortCode:"P",title:"PEDIDO DE VENTA"}:e==="QUOTATION"?{shortCode:"C",title:"COTIZACION"}:e==="CREDIT_NOTE"?{shortCode:"NC",title:"NOTA DE CREDITO"}:{shortCode:"ND",title:"NOTA DE DEBITO"}}function U(t){const e=M(t);return e==="INVOICE"||e==="RECEIPT"||e==="CREDIT_NOTE"||e==="DEBIT_NOTE"}function G(t){const e=M(t);return e==="CREDIT_NOTE"||e==="DEBIT_NOTE"}function H(t,e){if(!t||typeof t!="object")return null;const r=t;for(const n of e){const m=r[n];if(typeof m=="string"&&m.trim()!=="")return m.trim()}for(const n of Object.values(r))if(n&&typeof n=="object"){const m=H(n,e);if(m)return m}return null}function W(t,e){return U(e)?{signature:H(t,["sunat_electronic_signature","sunat_signature","firma_electronica","firma","signature","hash_cpe","codigo_hash","digest_value","digestValue"])??""}:{signature:""}}function F(t){const e=M(t);return e==="INVOICE"?"Factura":e==="RECEIPT"?"Boleta":e==="SALES_ORDER"?"Pedido":e==="QUOTATION"?"Cotizacion":e==="CREDIT_NOTE"?"N. Credito":e==="DEBIT_NOTE"?"N. Debito":e||"-"}function J(t){const e=t.metadata??{},r=String(e.source_document_kind??"").trim(),n=String(e.source_document_number??"").trim(),m=r?F(r):"-",b=String(e.note_reason_code??"").trim(),g=String(e.note_reason_description??"").trim();return{sourceDocumentKind:r,sourceDocumentNumber:n,sourceDocumentLabel:m,noteReasonCode:b,noteReasonDescription:g}}function nt(t,e){const r=K(t.documentKind),n=U(t.documentKind),m=G(t.documentKind),b=(e==null?void 0:e.embedded)===!0,g=(e==null?void 0:e.showItemDiscount)!==!1,c=J(t),l=L(t),x=String(l.tradeName||l.legalName||"SISTEMA FACTURACION").trim()||"SISTEMA FACTURACION",N=String(l.legalName||x).trim(),D=String(l.taxId||"00000000000").trim()||"00000000000",C=String(l.address||"").trim(),i=String(l.phone||"").trim(),s=String(l.email||"").trim(),T=l.logoUrl?`<img src="${a(l.logoUrl)}" alt="Logo empresa" class="brand-logo" />`:'<div class="brand-logo brand-logo--placeholder">LOGO</div>',u=t.items.map(h=>`
        <tr>
          <td class="ta-c">${h.lineNo}</td>
          <td class="ta-r">${Number(h.qty).toFixed(3)}</td>
          <td class="ta-c">${a(h.unitLabel)}</td>
          <td>${a(h.description)}</td>
          <td class="ta-r">${t.currencySymbol} ${o(h.unitPrice)}</td>
          ${g?`<td class="ta-r">${t.currencySymbol} ${o(Number(h.discountTotal??0))}</td>`:""}
          <td class="ta-r">${t.currencySymbol} ${o(h.lineTotal)}</td>
        </tr>
      `).join(""),d=t.metadata??{},f=B(d),y=t.items.reduce((h,Z)=>h+Number(Z.discountTotal??0),0),$=Number(d.discount_total??d.global_discount_total??0),p=String(d.sunat_operation_type_code??"").trim(),S=String(d.sunat_operation_type_name??"").trim(),w=Number(d.detraccion_amount??0),A=Number(d.detraccion_rate_percent??0),v=String(d.detraccion_service_name??"").trim(),E=Number(d.retencion_amount??0),R=Number(d.retencion_rate_percent??0),_=String(d.retencion_type_name??"").trim(),k=Number(d.percepcion_amount??0),V=Number(d.percepcion_rate_percent??0),O=String(d.percepcion_type_name??"").trim(),z=W(d,t.documentKind),j=n?[p?`<tr><td class="label">Tipo Op. SUNAT:</td><td class="value">${a(p)}${S?` - ${a(S)}`:""}</td></tr>`:"",w>0?`<tr><td class="label">Detraccion${v?` (${a(v)})`:""}:</td><td class="value">${t.currencySymbol} ${o(w)} (${o(A)}%)</td></tr>`:"",E>0?`<tr><td class="label">Retencion${_?` (${a(_)})`:""}:</td><td class="value">${t.currencySymbol} ${o(E)} (${o(R)}%)</td></tr>`:"",k>0?`<tr><td class="label">Percepcion${O?` (${a(O)})`:""}:</td><td class="value">${t.currencySymbol} ${o(k)} (${o(V)}%)</td></tr>`:""].filter(h=>h!=="").join(""):"";return`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${a(r.title)} ${a(t.series)}-${t.number}</title>
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
        ${b?"":`<div class="print-bar no-print">
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
                ${T}
                <div>
                  <h1>${a(x)}</h1>
                  ${N!==x?`<p>${a(N)}</p>`:""}
                  ${C?`<p>${a(C)}</p>`:""}
                  ${i?`<p>Tel: ${a(i)}</p>`:""}
                  ${s?`<p>Email: ${a(s)}</p>`:""}
                </div>
              </div>
              <p>Fecha emision: ${I(t.issueDate)}</p>
            </article>
            <article class="voucher">
              <div class="ruc">R.U.C.: ${a(D)}</div>
              <div class="title">${a(r.title)}</div>
              <div class="docno">No.: ${a(t.series)}-${t.number}</div>
            </article>
          </section>

          <section class="party">
            <article>
              <p class="kv"><b>Razon Social:</b> ${a(t.customerName||"-")}</p>
              <p class="kv"><b>Direccion:</b> ${a(t.customerAddress||"-")}</p>
              ${f.plate?`<p class="kv"><b>Vehiculo:</b> ${a(f.plate)}${f.brand||f.model?` (${a([f.brand,f.model].filter(h=>h!=="").join(" "))})`:""}</p>`:""}
              <p class="kv"><b>Fecha Emision:</b> ${I(t.issueDate)}</p>
              <p class="kv"><b>Tipo Moneda:</b> ${a(t.currencyCode)}</p>
            </article>
            <article>
              <p class="kv"><b>Documento:</b> ${a(t.customerDocNumber||"-")}</p>
              <p class="kv"><b>Fecha Venc.:</b> ${et(t.dueDate)}</p>
              <p class="kv"><b>Metodo Pago:</b> ${a(t.paymentMethodName||"-")}</p>
              <p class="kv"><b>Ref:</b> ${t.id}</p>
            </article>
          </section>

          ${m?`<section class="note-box">
                <h4>Datos de la nota</h4>
                <p class="kv"><b>Documento afectado:</b> ${a(c.sourceDocumentLabel)} ${a(c.sourceDocumentNumber||"-")}</p>
                <p class="kv"><b>Tipo de nota:</b> ${a(c.noteReasonCode||"-")} ${c.noteReasonDescription?`- ${a(c.noteReasonDescription)}`:""}</p>
                <p class="kv"><b>Detalle:</b> La presente nota modifica el comprobante afectado y detalla los productos/items involucrados a continuación.</p>
              </section>`:""}

          <section class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style="width:44px">#</th>
                  <th style="width:76px">Cantidad</th>
                  <th style="width:86px">Unid. Med.</th>
                  <th>${m?"Productos / conceptos afectados":"Descripcion"}</th>
                  <th style="width:92px">Valor U.</th>
                  ${g?'<th style="width:96px">Descuento</th>':""}
                  <th style="width:96px">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                ${u||`<tr><td colspan="${g?"7":"6"}" class="ta-c">Sin items</td></tr>`}
              </tbody>
            </table>
          </section>

          <section class="summary">
            <article>
              <p class="payment">FORMA PAGO: ${a(t.paymentMethodName||"-")}</p>
            </article>
            <article class="amounts">
              <table>
                <tbody>
                  ${n?`<tr><td class="label">Op. Gravadas:</td><td class="value">${t.currencySymbol} ${o(t.gravadaTotal)}</td></tr>`:""}
                  ${n?`<tr><td class="label">Op. Inafectas:</td><td class="value">${t.currencySymbol} ${o(t.inafectaTotal)}</td></tr>`:""}
                  ${n?`<tr><td class="label">Op. Exoneradas:</td><td class="value">${t.currencySymbol} ${o(t.exoneradaTotal)}</td></tr>`:""}
                  ${n?`<tr><td class="label">IGV:</td><td class="value">${t.currencySymbol} ${o(t.taxTotal)}</td></tr>`:""}
                  ${g&&y>0?`<tr><td class="label">Descuento por item:</td><td class="value">-${t.currencySymbol} ${o(y)}</td></tr>`:""}
                  ${$>0?`<tr><td class="label">Descuento global:</td><td class="value">-${t.currencySymbol} ${o($)}</td></tr>`:""}
                  ${j}
                  <tr class="total-row"><td class="label">Total a Pagar:</td><td class="value">${t.currencySymbol} ${o(t.grandTotal)}</td></tr>
                </tbody>
              </table>
            </article>
          </section>

          ${z.signature?`<section class="sunat-proof">
                <div>
                  <h5>Datos SUNAT</h5>
                  ${z.signature?`<p><strong>Firma electronica:</strong> ${a(z.signature)}</p>`:""}
                </div>
              </section>`:""}

          <section class="obs">
            Observaciones: Documento impreso en formato A4 adaptable por tipo de comprobante.
            ${q("A4")}
          </section>
        </section>
      </body>
    </html>
  `}function rt(t,e){const r=K(t.documentKind),n=U(t.documentKind),m=G(t.documentKind),b=(e==null?void 0:e.embedded)===!0,g=(e==null?void 0:e.showItemDiscount)!==!1,c=J(t),l=L(t),x=String(l.tradeName||l.legalName||"SISTEMA FACTURACION").trim()||"SISTEMA FACTURACION",N=String(l.taxId||"").trim(),D=String(l.address||"").trim(),C=String(l.phone||"").trim(),i=String(l.email||"").trim(),s=t.items.map(_=>{const k=Number(_.qty).toFixed(2),V=o(_.unitPrice),O=o(_.lineTotal);return`<tr>
        <td style="font-size:8px;font-weight:700">${a(_.description).substring(0,32)}</td>
      </tr>
      <tr>
        <td style="font-size:7px">
          <div style="display:flex;justify-content:space-between">
            <span>${k} x ${t.currencySymbol} ${V}</span>
            <span style="font-weight:700">${t.currencySymbol} ${O}</span>
          </div>
        </td>
      </tr>`}).join(""),T=t.items.reduce((_,k)=>_+Number(k.discountTotal??0),0),u=t.metadata??{},d=B(u),f=Number(u.discount_total??u.global_discount_total??0),y=String(u.sunat_operation_type_code??"").trim(),$=String(u.sunat_operation_type_name??"").trim(),p=Number(u.detraccion_amount??0),S=Number(u.detraccion_rate_percent??0),w=Number(u.retencion_amount??0),A=Number(u.retencion_rate_percent??0),v=Number(u.percepcion_amount??0),E=Number(u.percepcion_rate_percent??0),R=W(u,t.documentKind);return`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${a(r.title)} ${a(t.series)}-${t.number}</title>
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
        ${b?"":`<div class="print-bar no-print">
          <span class="print-bar-title">Vista Ticket 80mm</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        
        <div class="sheet">
          <div class="header">
            ${l.logoUrl?`<img src="${a(l.logoUrl)}" alt="Logo" class="header-logo" />`:""}
            <div class="title">${a(x)}</div>
            ${N?`<div class="date">RUC: ${a(N)}</div>`:""}
            ${D?`<div class="date">${a(D)}</div>`:""}
            ${C?`<div class="date">Tel: ${a(C)}</div>`:""}
            ${i?`<div class="date">Email: ${a(i)}</div>`:""}
            <div class="title">${a(r.title)}</div>
            <div class="docno">${a(t.series)}-${String(t.number).padStart(6,"0")}</div>
            <div class="date">${I(t.issueDate)}</div>
          </div>

          <div class="divider"></div>

          <div class="section">
            <div class="info-row">
              <div class="info-label">CLIENTE:</div>
              <div class="info-value">${a(t.customerName||"-")}</div>
            </div>
            ${t.customerDocNumber?`<div class="info-row">
              <div class="info-label">Doc:</div>
              <div class="info-value">${a(t.customerDocNumber)}</div>
            </div>`:""}
            ${d.plate?`<div class="info-row">
              <div class="info-label">Vehículo:</div>
              <div class="info-value">${a(d.plate)}${d.brand||d.model?` (${a([d.brand,d.model].filter(_=>_!=="").join(" "))})`:""}</div>
            </div>`:""}
          </div>

          ${m?`<div class="divider"></div>
          <div class="section">
            <div class="section-title">DATOS DE LA NOTA</div>
            <div class="info-row">
              <div class="info-label">Afecta:</div>
              <div class="info-value">${a(c.sourceDocumentLabel)} ${a(c.sourceDocumentNumber||"-")}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Motivo:</div>
              <div class="info-value">${a(c.noteReasonCode||"-")} ${c.noteReasonDescription?`- ${a(c.noteReasonDescription)}`:""}</div>
            </div>
          </div>`:""}

          <div class="divider"></div>

          <div class="items">
            ${m?'<div class="section-title" style="margin-bottom:1mm">DETALLE AFECTADO</div>':""}
            <table>
              <tbody>
                ${s||'<tr><td style="text-align:center">Sin items</td></tr>'}
              </tbody>
            </table>
          </div>

          <div class="summary">
            ${n&&t.gravadaTotal>0?`<div class="summary-row">
              <div class="summary-label">Op. Gravada:</div>
              <div class="summary-value">${t.currencySymbol} ${o(t.gravadaTotal)}</div>
            </div>`:""}
            ${n&&t.inafectaTotal>0?`<div class="summary-row">
              <div class="summary-label">Op. Inafecta:</div>
              <div class="summary-value">${t.currencySymbol} ${o(t.inafectaTotal)}</div>
            </div>`:""}
            ${n&&t.exoneradaTotal>0?`<div class="summary-row">
              <div class="summary-label">Op. Exonerada:</div>
              <div class="summary-value">${t.currencySymbol} ${o(t.exoneradaTotal)}</div>
            </div>`:""}
            ${n&&t.taxTotal>0?`<div class="summary-row">
              <div class="summary-label">IGV:</div>
              <div class="summary-value">${t.currencySymbol} ${o(t.taxTotal)}</div>
            </div>`:""}
            ${g&&T>0?`<div class="summary-row"><div class="summary-label">Dscto. item:</div><div class="summary-value">-${t.currencySymbol} ${o(T)}</div></div>`:""}
            ${f>0?`<div class="summary-row"><div class="summary-label">Dscto. global:</div><div class="summary-value">-${t.currencySymbol} ${o(f)}</div></div>`:""}
            ${n&&y?`<div class="summary-row"><div class="summary-label">Op. SUNAT:</div><div class="summary-value">${a(y)}${$?` - ${a($)}`:""}</div></div>`:""}
            ${n&&p>0?`<div class="summary-row"><div class="summary-label">Detraccion:</div><div class="summary-value">${t.currencySymbol} ${o(p)} (${o(S)}%)</div></div>`:""}
            ${n&&w>0?`<div class="summary-row"><div class="summary-label">Retencion:</div><div class="summary-value">${t.currencySymbol} ${o(w)} (${o(A)}%)</div></div>`:""}
            ${n&&v>0?`<div class="summary-row"><div class="summary-label">Percepcion:</div><div class="summary-value">${t.currencySymbol} ${o(v)} (${o(E)}%)</div></div>`:""}
            <div class="total-row">
              <span>TOTAL</span>
              <span>${t.currencySymbol} ${o(t.grandTotal)}</span>
            </div>
          </div>

          <div class="footer">
            <div class="footer-item">Forma Pago: ${a(t.paymentMethodName||"-")}</div>
            ${R.signature?`<div class="sunat-ticket">
                  ${R.signature?`<div class="line"><strong>Firma:</strong> ${a(R.signature)}</div>`:""}
                </div>`:""}
            <div class="divider" style="margin: 1mm 0"></div>
            ${q("80mm")}
            <div class="footer-item">Gracias por su compra</div>
            <div class="footer-item">ID: ${t.id}</div>
          </div>
        </div>
      </body>
    </html>
  `}function P(t){const e=Number(t.line_total||0);if(e<=0)return{costTotal:0,marginTotal:0,marginPercent:0};const r=Number(t.margin_total??NaN),n=Number(t.cost_total??NaN);if(Number.isFinite(r)){const c=r;return{costTotal:Number.isFinite(n)?n:e-c,marginTotal:c,marginPercent:e>0?c/e*100:0}}const m=e*.22,b=Math.min(Math.max(m,0),e*.35);return{costTotal:Math.max(0,e-b),marginTotal:b,marginPercent:e>0?b/e*100:0}}function Q(t){const e=String(t.vehicle_plate_snapshot??"").trim()||"-",r=String(t.vehicle_brand_snapshot??"").trim()||"-",n=String(t.vehicle_model_snapshot??"").trim()||"-";return{plate:e,brand:r,model:n}}function st(t,e){const r=(e==null?void 0:e.embedded)===!0,n=L(t),m=String(n.tradeName||n.legalName||"SISTEMA FACTURACION").trim()||"SISTEMA FACTURACION",b=String(n.taxId||"").trim(),g=t.paymentMethodBreakdown.map(i=>`
      <tr>
        <td>${a(i.payment_method_name)}</td>
        <td class="ta-r">${i.document_count}</td>
        <td class="ta-r">${o(i.total_amount)}</td>
      </tr>`).join(""),c=new Map;for(const i of t.documents??[]){const s=F(i.document_kind),T=(i.document_number||"").trim()||"-",u=Q(i),d=u.plate,f=u.brand,y=u.model,$=(i.payment_method_name||"").trim()||"-";for(const p of i.items??[]){const S=(p.description||"").trim()||"Producto sin descripcion",w=(p.unit_code||"").trim()||"-",A=`${s.toLowerCase()}__${T.toLowerCase()}__${S.toLowerCase()}__${w.toLowerCase()}__${$.toLowerCase()}__${t.showVehicleInfo?`${d.toLowerCase()}__${f.toLowerCase()}__${y.toLowerCase()}`:""}`,v=c.get(A);if(v)v.quantity+=Number(p.quantity||0),v.amount+=Number(p.line_total||0),v.marginAmount+=P(p).marginTotal;else{const E=P(p);c.set(A,{documentKind:s,documentNumber:T,vehiclePlate:d,vehicleBrand:f,vehicleModel:y,description:S,unitCode:w,paymentMethod:$,quantity:Number(p.quantity||0),amount:Number(p.line_total||0),marginAmount:E.marginTotal})}}}const l=Array.from(c.values()).sort((i,s)=>s.amount-i.amount),x=l.map(i=>`
        <tr>
          <td style="font-size:8px">${a(i.description)}</td>
          <td style="font-size:8px">${a(i.paymentMethod)}</td>
          <td class="ta-r" style="font-size:8px">${i.quantity.toFixed(2)}</td>
          <td style="font-size:8px">${a(i.documentKind)}</td>
          <td style="font-size:8px">${a(i.documentNumber)}</td>
          ${t.showVehicleInfo?`<td style="font-size:8px" class="vehicle-cell">
            <div><b>Placa:</b> ${a(i.vehiclePlate)}</div>
            <div><b>Marca:</b> ${a(i.vehicleBrand)}</div>
            <div><b>Modelo:</b> ${a(i.vehicleModel)}</div>
          </td>`:""}
          <td class="ta-r" style="font-size:8px;font-weight:700">${o(i.amount)}</td>
          <td class="ta-r" style="font-size:8px;color:${i.marginAmount>=0?"#0f766e":"#dc2626"};font-weight:700">${o(i.marginAmount)}</td>
        </tr>`).join(""),N=l.reduce((i,s)=>i+s.quantity,0),D=l.reduce((i,s)=>i+s.amount,0),C=l.reduce((i,s)=>i+s.marginAmount,0);return`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>REPORTE DE CAJA - ${a(t.cashRegisterCode)}</title>
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
        ${r?"":`<div class="print-bar no-print">
          <span class="print-bar-title">Vista Ticket 80mm</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        <div class="sheet">
          <div class="header">
            ${n.logoUrl?`<img src="${a(n.logoUrl)}" alt="Logo" class="header-logo" />`:""}
            <p style="font-weight:700">${a(m)}</p>
            ${b?`<p>RUC: ${a(b)}</p>`:""}
            <h1>*** REPORTE DE CAJA ***</h1>
            <p>${a(t.cashRegisterName)}</p>
            <p>Fecha: ${I(t.closedAt||t.openedAt)}</p>
          </div>

          <div class="section">
            <div class="section-title">INFO GENERAL</div>
            <div class="row"><div class="label">Caja:</div><div class="value">${a(t.cashRegisterCode)}</div></div>
            <div class="row"><div class="label">Usuario:</div><div class="value">${a(t.userName)}</div></div>
            <div class="row"><div class="label">Apertura:</div><div class="value">${I(t.openedAt)}</div></div>
            ${t.closedAt?`<div class="row"><div class="label">Cierre:</div><div class="value">${I(t.closedAt)}</div></div>`:""}
          </div>

          <div class="section">
            <div class="section-title">SALDOS</div>
            <div class="row"><div class="label">Saldo Inicial:</div><div class="value">S/ ${o(t.openingBalance)}</div></div>
            <div class="row"><div class="label">Entradas (+):</div><div class="value">S/ ${o(t.totalIn)}</div></div>
            <div class="row"><div class="label">Salidas (-):</div><div class="value">S/ ${o(t.totalOut)}</div></div>
            <div class="row"><div class="label">Esperado:</div><div class="value">S/ ${o(t.expectedBalance)}</div></div>
            <div class="row" style="font-weight:700;border-top:1px solid #000;padding-top:1mm"><div class="label">Real:</div><div class="value">S/ ${o(t.closingBalance)}</div></div>
            ${t.difference!==0?`<div class="row" style="color:${t.difference>=0?"#008000":"#cc0000"}"><div class="label">Diferencia:</div><div class="value">${t.difference>0?"+":""}S/ ${o(t.difference)}</div></div>`:""}
          </div>

          <div class="section">
            <div class="section-title">VENTAS POR TIPO DE PAGO</div>
            <table>
              <thead><tr><th>Tipo de Pago</th><th class="ta-c">Can.</th><th class="ta-r">Monto</th></tr></thead>
              <tbody>
                ${g||'<tr><td colspan="3" class="ta-c">Sin ventas</td></tr>'}
                <tr class="total-row"><td>TOTAL</td><td class="ta-c">${t.paymentMethodBreakdown.reduce((i,s)=>i+s.document_count,0)}</td><td class="ta-r">${o(t.paymentMethodBreakdown.reduce((i,s)=>i+s.total_amount,0))}</td></tr>
              </tbody>
            </table>
          </div>

          ${x?`
          <div class="section">
            <div class="section-title">PRODUCTOS VENDIDOS</div>
            <table class="product-table">
              <thead><tr><th>Producto</th><th>Pago</th><th class="ta-r">Cant.</th><th>Comp.</th><th>Serie</th>${t.showVehicleInfo?"<th>Vehículo</th>":""}<th class="ta-r">Total</th><th class="ta-r">Margen</th></tr></thead>
              <tbody>
                ${x}
                <tr class="total-row"><td colspan="2">TOTAL</td><td class="ta-r">${N.toFixed(2)}</td><td colspan="${t.showVehicleInfo?"3":"2"}"></td><td class="ta-r">${o(D)}</td><td class="ta-r">${o(C)}</td></tr>
              </tbody>
            </table>
          </div>`:""}

          <div class="footer">Emitido: ${new Date().toLocaleString("es-PE",{timeZone:"America/Lima"})}</div>
        </div>
      </body>
    </html>`}function lt(t,e){const r=(e==null?void 0:e.embedded)===!0,n=L(t),m=String(n.tradeName||n.legalName||"SISTEMA FACTURACION").trim()||"SISTEMA FACTURACION",b=String(n.taxId||"").trim(),g=t.paymentMethodBreakdown.map(i=>`
      <tr>
        <td>${a(i.payment_method_name)}</td>
        <td class="ta-c">${i.document_count}</td>
        <td class="ta-r">S/ ${o(i.total_amount)}</td>
      </tr>`).join(""),c=new Map;for(const i of t.documents??[]){const s=F(i.document_kind),T=(i.document_number||"").trim()||"-",u=Q(i),d=u.plate,f=u.brand,y=u.model,$=(i.payment_method_name||"").trim()||"-";for(const p of i.items??[]){const S=(p.description||"").trim()||"Producto sin descripcion",w=(p.unit_code||"").trim()||"-",A=`${s.toLowerCase()}__${T.toLowerCase()}__${S.toLowerCase()}__${w.toLowerCase()}__${$.toLowerCase()}__${t.showVehicleInfo?`${d.toLowerCase()}__${f.toLowerCase()}__${y.toLowerCase()}`:""}`,v=c.get(A);if(v)v.quantity+=Number(p.quantity||0),v.amount+=Number(p.line_total||0),v.marginAmount+=P(p).marginTotal;else{const E=P(p);c.set(A,{documentKind:s,documentNumber:T,vehiclePlate:d,vehicleBrand:f,vehicleModel:y,description:S,unitCode:w,paymentMethod:$,quantity:Number(p.quantity||0),amount:Number(p.line_total||0),marginAmount:E.marginTotal})}}}const l=Array.from(c.values()).sort((i,s)=>s.amount-i.amount),x=l.map(i=>`
      <tr>
        <td>${a(i.description)}</td>
        <td>${a(i.paymentMethod)}</td>
        <td class="ta-c">${a(i.unitCode)}</td>
        <td class="ta-r">${i.quantity.toFixed(3)}</td>
        <td>${a(i.documentKind)}</td>
        <td>${a(i.documentNumber)}</td>
        ${t.showVehicleInfo?`<td class="cash-vehicle-cell"><div><b>Placa:</b> ${a(i.vehiclePlate)}</div><div><b>Marca:</b> ${a(i.vehicleBrand)}</div><div><b>Modelo:</b> ${a(i.vehicleModel)}</div></td>`:""}
        <td class="ta-r">S/ ${o(i.amount)}</td>
        <td class="ta-r" style="color:${i.marginAmount>=0?"#0f766e":"#dc2626"}">S/ ${o(i.marginAmount)}</td>
      </tr>`).join(""),N=l.reduce((i,s)=>i+s.quantity,0),D=l.reduce((i,s)=>i+s.amount,0),C=l.reduce((i,s)=>i+s.marginAmount,0);return`
    <html>
      <head>
        <meta charset="utf-8" />
        <title>REPORTE DE CAJA - ${a(t.cashRegisterCode)}</title>
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
        ${r?"":`<div class="print-bar no-print">
          <span>Vista Previa - Reporte A4</span>
          <div>
            <button onclick="window.print()">Imprimir</button>
            <button onclick="window.close()">Cerrar</button>
          </div>
        </div>`}
        <div class="page">
          <div class="header">
            ${n.logoUrl?`<img src="${a(n.logoUrl)}" alt="Logo" class="header-logo" />`:""}
            <p style="font-weight:700;color:#0f172a">${a(m)}</p>
            ${b?`<p>RUC: ${a(b)}</p>`:""}
            <h1>REPORTE DE CIERRE DE CAJA</h1>
            <p>${a(t.cashRegisterName)}</p>
            <p>Rango: ${I(t.openedAt)} ${t.closedAt?`a ${I(t.closedAt)}`:"a la fecha"}</p>
            <p>Usuario: ${a(t.userName)} | Caja: ${a(t.cashRegisterCode)}</p>
          </div>

          <div class="summary-grid">
            <article class="metric"><span>Saldo inicial</span><strong>S/ ${o(t.openingBalance)}</strong></article>
            <article class="metric"><span>Saldo esperado</span><strong>S/ ${o(t.expectedBalance)}</strong></article>
            <article class="metric"><span>Saldo real</span><strong>S/ ${o(t.closingBalance)}</strong></article>
            <article class="metric"><span>Diferencia</span><strong style="color:${t.difference>=0?"#059669":"#dc2626"}">${t.difference>0?"+":""}S/ ${o(t.difference)}</strong></article>
          </div>

          <div class="section">
            <div class="section-title">Totales por tipo de pago</div>
            <table>
              <thead><tr><th>Forma de pago</th><th class="ta-c" style="width:90px">Cantidad</th><th class="ta-r" style="width:130px">Monto</th></tr></thead>
              <tbody>
                ${g||'<tr><td colspan="3" class="ta-c">Sin ventas registradas</td></tr>'}
                <tr class="total-row"><td>TOTAL</td><td class="ta-c">${t.paymentMethodBreakdown.reduce((i,s)=>i+s.document_count,0)}</td><td class="ta-r">S/ ${o(t.paymentMethodBreakdown.reduce((i,s)=>i+s.total_amount,0))}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">Productos vendidos en la sesion</div>
            <table class="cash-products-table">
              <thead><tr><th style="width:${t.showVehicleInfo?"24%":"30%"}">Producto</th><th style="width:${t.showVehicleInfo?"10%":"11%"}">Tipo de pago</th><th class="ta-c" style="width:6%">Unidad</th><th class="ta-r" style="width:${t.showVehicleInfo?"7%":"8%"}">Cantidad</th><th style="width:${t.showVehicleInfo,"10%"}">Tipo comprobante</th><th style="width:${t.showVehicleInfo?"10%":"11%"}">Serie-correlativo</th>${t.showVehicleInfo?'<th style="width:18%">Vehículo</th>':""}<th class="ta-r" style="width:${t.showVehicleInfo?"8%":"10%"}">Total</th><th class="ta-r" style="width:${t.showVehicleInfo?"7%":"10%"}">Margen</th></tr></thead>
              <tbody>
                ${x||`<tr><td colspan="${t.showVehicleInfo?"9":"8"}" class="ta-c">Sin productos vendidos en la sesion</td></tr>`}
                <tr class="total-row"><td colspan="3">Total general</td><td class="ta-r">${N.toFixed(3)}</td><td colspan="${t.showVehicleInfo?"3":"2"}"></td><td class="ta-r">S/ ${o(D)}</td><td class="ta-r">S/ ${o(C)}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="footer">Reporte generado: ${new Date().toLocaleString("es-PE",{timeZone:"America/Lima"})}</div>
        </div>
      </body>
    </html>`}export{st as a,lt as b,rt as c,nt as d};
