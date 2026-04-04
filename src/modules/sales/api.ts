import { apiClient } from '../../shared/api/client';
import type {
  CommercialDocumentListItem,
  ConvertCommercialDocumentPayload,
  CreateDocumentForm,
  PaginatedCommercialDocuments,
  SalesCustomerSuggestion,
  SalesLookups,
  SalesReferenceDocument,
  SeriesNumber,
  UpdateCommercialDocumentPayload,
  VoidCommercialDocumentPayload,
} from './types';
import type { PrintableSalesDocument } from './print';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchSeriesNumbers(
  accessToken: string,
  context?: {
    documentKind?: string;
    branchId?: number | null;
    warehouseId?: number | null;
  }
): Promise<SeriesNumber[]> {
  const query = new URLSearchParams();
  query.set('document_kind', context?.documentKind ?? 'INVOICE');

  if (context?.branchId) {
    query.set('branch_id', String(context.branchId));
  }
  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }

  const response = await apiClient.request<{ data: SeriesNumber[] }>(`/api/sales/series-numbers?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function fetchSalesLookups(
  accessToken: string,
  context?: {
    branchId?: number | null;
  }
): Promise<SalesLookups> {
  const query = new URLSearchParams();
  if (context?.branchId) {
    query.set('branch_id', String(context.branchId));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/sales/lookups?${suffix}` : '/api/sales/lookups';

  return apiClient.request<SalesLookups>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCustomerAutocomplete(
  accessToken: string,
  queryText: string
): Promise<SalesCustomerSuggestion[]> {
  const query = new URLSearchParams();
  query.set('q', queryText);
  query.set('limit', '12');

  const response = await apiClient.request<{ data: SalesCustomerSuggestion[] }>(
    `/api/sales/customers/autocomplete?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );

  return response.data;
}

export async function fetchCommercialDocuments(
  accessToken: string,
  context?: {
    branchId?: number | null;
    warehouseId?: number | null;
    cashRegisterId?: number | null;
    documentKind?: string;
    status?: string;
    conversionState?: 'PENDING' | 'CONVERTED' | null;
    customer?: string;
    issueDateFrom?: string;
    issueDateTo?: string;
    series?: string;
    number?: string;
    page?: number;
    perPage?: number;
  }
): Promise<PaginatedCommercialDocuments> {
  const query = new URLSearchParams();
  query.set('page', String(context?.page ?? 1));
  query.set('per_page', String(context?.perPage ?? 10));

  if (context?.branchId) {
    query.set('branch_id', String(context.branchId));
  }
  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }
  if (context?.cashRegisterId) {
    query.set('cash_register_id', String(context.cashRegisterId));
  }
  if (context?.documentKind) {
    query.set('document_kind', context.documentKind);
  }
  if (context?.status) {
    query.set('status', context.status);
  }
  if (context?.conversionState) {
    query.set('conversion_state', context.conversionState);
  }
  if (context?.customer && context.customer.trim() !== '') {
    query.set('customer', context.customer.trim());
  }
  if (context?.issueDateFrom) {
    query.set('issue_date_from', context.issueDateFrom);
  }
  if (context?.issueDateTo) {
    query.set('issue_date_to', context.issueDateTo);
  }
  if (context?.series && context.series.trim() !== '') {
    query.set('series', context.series.trim());
  }
  if (context?.number && context.number.trim() !== '') {
    query.set('number', context.number.trim());
  }

  return apiClient.request<PaginatedCommercialDocuments>(`/api/sales/commercial-documents?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchReferenceDocuments(
  accessToken: string,
  context: {
    customerId: number;
    branchId?: number | null;
    noteKind?: 'CREDIT_NOTE' | 'DEBIT_NOTE' | null;
    limit?: number;
  }
): Promise<SalesReferenceDocument[]> {
  const query = new URLSearchParams();
  query.set('customer_id', String(context.customerId));

  if (context.branchId) {
    query.set('branch_id', String(context.branchId));
  }
  if (context.noteKind) {
    query.set('note_kind', context.noteKind);
  }
  if (context.limit && context.limit > 0) {
    query.set('limit', String(context.limit));
  }

  const response = await apiClient.request<{ data: SalesReferenceDocument[] }>(
    `/api/sales/reference-documents?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );

  return response.data;
}

export async function convertCommercialDocument(
  accessToken: string,
  sourceDocumentId: number,
  payload: ConvertCommercialDocumentPayload
) {
  return apiClient.request(`/api/sales/commercial-documents/${sourceDocumentId}/convert`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCommercialDocument(
  accessToken: string,
  documentId: number,
  payload: UpdateCommercialDocumentPayload
) {
  return apiClient.request(`/api/sales/commercial-documents/${documentId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function voidCommercialDocument(
  accessToken: string,
  documentId: number,
  payload: VoidCommercialDocumentPayload
) {
  return apiClient.request(`/api/sales/commercial-documents/${documentId}/void`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function createCommercialDocument(accessToken: string, form: CreateDocumentForm) {
  const items = (form.items && form.items.length > 0
    ? form.items
    : [
        {
          productId: Number(form.productId),
          unitId: form.unitId ? Number(form.unitId) : null,
          lotId: form.lotId ? Number(form.lotId) : null,
          taxCategoryId: form.taxCategoryId ?? null,
          taxRate: 0,
          taxLabel: '',
          isManual: Boolean(form.isManualItem),
          description: form.manualDescription?.trim() || 'Producto demo desde frontend',
          qty: Number(form.qty),
          unitPrice: Number(form.unitPrice),
        },
      ]
  ).map((item) => {
    const qty = Number(item.qty);
    const unitPrice = Number(item.unitPrice);
    const taxRate = Number(item.taxRate ?? 0);
    const includesTax = Boolean(item.priceIncludesTax) && taxRate > 0;
    const divisor = 1 + (taxRate / 100);
    const grossLine = qty * unitPrice;
    const subtotal = includesTax ? +(grossLine / divisor).toFixed(2) : +(grossLine).toFixed(2);
    const taxTotal = includesTax ? +(grossLine - subtotal).toFixed(2) : +(subtotal * (taxRate / 100)).toFixed(2);
    const total = includesTax ? +(grossLine).toFixed(2) : +(subtotal + taxTotal).toFixed(2);

    return {
      description: item.description,
      product_id: item.productId ? Number(item.productId) : null,
      unit_id: item.unitId ? Number(item.unitId) : null,
      price_tier_id: item.priceTierId ? Number(item.priceTierId) : undefined,
      wholesale_discount_percent: item.wholesaleDiscountPercent != null ? Number(item.wholesaleDiscountPercent) : undefined,
      price_source: item.priceSource ?? undefined,
      tax_category_id: item.taxCategoryId ? Number(item.taxCategoryId) : null,
      qty,
      qty_base: item.qtyBase != null ? Number(item.qtyBase) : undefined,
      conversion_factor: item.conversionFactor != null ? Number(item.conversionFactor) : undefined,
      base_unit_price: item.baseUnitPrice != null ? Number(item.baseUnitPrice) : undefined,
      unit_price: unitPrice,
      subtotal,
      tax_total: taxTotal,
      total,
      metadata: {
        price_includes_tax: includesTax,
      },
      lots: item.lotId ? [
        {
          lot_id: Number(item.lotId),
          qty,
        },
      ] : undefined,
    };
  });

  const total = items.reduce((acc, item) => acc + Number(item.total), 0);
  const isPreDocument = form.documentKind === 'SALES_ORDER' || form.documentKind === 'QUOTATION';
  const advanceAmount = Math.max(0, Number(form.advanceAmount ?? 0));
  const hasAdvance = advanceAmount > 0;
  const pendingCreditTotal = Math.max(0, Number((total - advanceAmount).toFixed(2)));

  const normalizedInstallments = (form.creditInstallments ?? [])
    .map((row) => ({
      amount: Number(row.amount ?? 0),
      dueDate: String(row.dueDate ?? '').trim(),
      observation: String(row.observation ?? '').trim(),
    }))
    .filter((row) => row.amount > 0 && row.dueDate !== '');

  const payments = isPreDocument
    ? []
    : form.isCreditSale
      ? [
          ...(hasAdvance
            ? [{
                payment_method_id: Number(form.paymentMethodId),
                amount: Number(advanceAmount.toFixed(2)),
                status: 'PAID',
                paid_at: new Date().toISOString(),
                notes: 'Anticipo aplicado en emisión',
              }]
            : []),
          ...normalizedInstallments.map((row) => ({
            payment_method_id: Number(form.paymentMethodId),
            amount: Number(row.amount.toFixed(2)),
            due_at: row.dueDate,
            status: 'PENDING',
            notes: row.observation || null,
          })),
        ]
      : [
          {
            payment_method_id: Number(form.paymentMethodId),
            amount: total,
            status: 'PAID',
            paid_at: new Date().toISOString(),
          },
        ];

  return apiClient.request('/api/sales/commercial-documents', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      document_kind: form.documentKind,
      branch_id: form.branchId ?? undefined,
      warehouse_id: form.warehouseId ?? undefined,
      cash_register_id: form.cashRegisterId ?? undefined,
      series: form.series,
      issue_at: form.issueDate,
      due_at: form.dueDate || null,
      customer_id: Number(form.customerId),
      currency_id: Number(form.currencyId),
      payment_method_id: Number(form.paymentMethodId),
      metadata: {
        customer_address: form.customerAddress?.trim() || null,
        source_document_id: form.noteAffectedDocumentId ?? null,
        note_reason_code: form.noteReasonCode?.trim() || null,
        has_detraccion: form.hasDetraccion ?? false,
        detraccion_service_code: form.hasDetraccion ? (form.detraccionServiceCode ?? null) : null,
        has_retencion: form.hasRetencion ?? false,
        retencion_type_code: form.hasRetencion ? (form.retencionTypeCode ?? null) : null,
        has_percepcion: form.hasPercepcion ?? false,
        percepcion_type_code: form.hasPercepcion ? (form.percepcionTypeCode ?? null) : null,
        sunat_operation_type_code: (form.hasDetraccion || form.hasRetencion || form.hasPercepcion) ? (form.sunatOperationTypeCode ?? null) : null,
        payment_condition: form.isCreditSale ? 'CREDITO' : 'CONTADO',
        credit_installments: form.isCreditSale
          ? normalizedInstallments.map((row, index) => ({
              installment_no: index + 1,
              amount: Number(row.amount.toFixed(2)),
              due_at: row.dueDate,
              notes: row.observation || null,
            }))
          : [],
        credit_total: form.isCreditSale ? Number(pendingCreditTotal.toFixed(2)) : 0,
        has_advance: hasAdvance,
        advance_amount: hasAdvance ? Number(advanceAmount.toFixed(2)) : 0,
      },
      status: isPreDocument ? 'DRAFT' : 'ISSUED',
      items,
      payments,
    }),
  });
}

export async function fetchProductCommercialConfig(accessToken: string, productId: number) {
  return apiClient.request(`/api/inventory/products/${productId}/commercial-config`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCommercialDocumentDetails(
  accessToken: string,
  documentId: number
): Promise<PrintableSalesDocument> {
  const response = await apiClient.request<{ data?: PrintableSalesDocument } | PrintableSalesDocument>(
    `/api/sales/commercial-documents/${documentId}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );

  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data?: PrintableSalesDocument }).data as PrintableSalesDocument;
  }

  return response as PrintableSalesDocument;
}

export async function exportCommercialDocumentsExcel(
  accessToken: string,
  context?: {
    branchId?: number | null;
    warehouseId?: number | null;
    cashRegisterId?: number | null;
    documentKind?: string;
    status?: string;
    conversionState?: 'PENDING' | 'CONVERTED' | null;
    customer?: string;
    issueDateFrom?: string;
    issueDateTo?: string;
    series?: string;
    number?: string;
    max?: number;
  }
): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams();

  if (context?.branchId) {
    query.set('branch_id', String(context.branchId));
  }
  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }
  if (context?.cashRegisterId) {
    query.set('cash_register_id', String(context.cashRegisterId));
  }
  if (context?.documentKind) {
    query.set('document_kind', context.documentKind);
  }
  if (context?.status) {
    query.set('status', context.status);
  }
  if (context?.conversionState) {
    query.set('conversion_state', context.conversionState);
  }
  if (context?.customer && context.customer.trim() !== '') {
    query.set('customer', context.customer.trim());
  }
  if (context?.issueDateFrom) {
    query.set('issue_date_from', context.issueDateFrom);
  }
  if (context?.issueDateTo) {
    query.set('issue_date_to', context.issueDateTo);
  }
  if (context?.series && context.series.trim() !== '') {
    query.set('series', context.series.trim());
  }
  if (context?.number && context.number.trim() !== '') {
    query.set('number', context.number.trim());
  }
  if (context?.max && context.max > 0) {
    query.set('max', String(context.max));
  }

  const response = await fetch(`${apiClient.baseUrl}/api/sales/commercial-documents/export?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = (match?.[1] ?? 'reporte_ventas.csv').trim();

  return { blob, fileName };
}

export async function exportCommercialDocumentsJson(
  accessToken: string,
  context?: {
    branchId?: number | null;
    warehouseId?: number | null;
    cashRegisterId?: number | null;
    documentKind?: string;
    status?: string;
    conversionState?: 'PENDING' | 'CONVERTED' | null;
    customer?: string;
    issueDateFrom?: string;
    issueDateTo?: string;
    series?: string;
    number?: string;
    max?: number;
  }
): Promise<CommercialDocumentListItem[]> {
  const query = new URLSearchParams();
  query.set('format', 'json');

  if (context?.branchId) {
    query.set('branch_id', String(context.branchId));
  }
  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }
  if (context?.cashRegisterId) {
    query.set('cash_register_id', String(context.cashRegisterId));
  }
  if (context?.documentKind) {
    query.set('document_kind', context.documentKind);
  }
  if (context?.status) {
    query.set('status', context.status);
  }
  if (context?.conversionState) {
    query.set('conversion_state', context.conversionState);
  }
  if (context?.customer && context.customer.trim() !== '') {
    query.set('customer', context.customer.trim());
  }
  if (context?.issueDateFrom) {
    query.set('issue_date_from', context.issueDateFrom);
  }
  if (context?.issueDateTo) {
    query.set('issue_date_to', context.issueDateTo);
  }
  if (context?.series && context.series.trim() !== '') {
    query.set('series', context.series.trim());
  }
  if (context?.number && context.number.trim() !== '') {
    query.set('number', context.number.trim());
  }
  if (context?.max && context.max > 0) {
    query.set('max', String(context.max));
  }

  const response = await apiClient.request<{ data: CommercialDocumentListItem[] }>(
    `/api/sales/commercial-documents/export?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );

  return response.data;
}

export async function retryTaxBridgeSend(
  accessToken: string,
  documentId: number,
  companyId?: number
): Promise<{
  message: string;
  document_id: number;
  sunat_status: string;
  sunat_status_label: string;
  bridge_http_code?: number | null;
  bridge_response?: unknown;
  payload?: unknown;
  debug?: {
    bridge_mode?: string;
    endpoint?: string;
    method?: string;
    content_type?: string;
    form_key?: string;
    payload?: unknown;
    request_json?: unknown;
    payload_length?: number | null;
    payload_sha1?: string | null;
  } | null;
}> {
  const query = new URLSearchParams();
  if (companyId) {
    query.set('company_id', String(companyId));
  }

  const response = await apiClient.request<{
    message: string;
    document_id: number;
    sunat_status: string;
    sunat_status_label: string;
    bridge_http_code?: number | null;
    bridge_response?: unknown;
    payload?: unknown;
    debug?: {
      bridge_mode?: string;
      endpoint?: string;
      method?: string;
      content_type?: string;
      form_key?: string;
      payload?: unknown;
      request_json?: unknown;
      payload_length?: number | null;
      payload_sha1?: string | null;
    } | null;
  }>(
    `/api/sales/commercial-documents/${documentId}/retry-tax-bridge?${query.toString()}`,
    {
      method: 'PUT',
      headers: authHeaders(accessToken),
    }
  );

  return response;
}

export async function fetchTaxBridgePreview(accessToken: string, documentId: number, companyId?: number) {
  const query = new URLSearchParams();
  if (companyId) {
    query.set('company_id', String(companyId));
  }

  const suffix = query.toString();

  return apiClient.request<{
    message: string;
    document_id: number;
    bridge_mode: string;
    endpoint: string;
    method: string;
    content_type: string;
    form_key: string;
    payload: unknown;
    debug: {
      bridge_mode?: string;
      endpoint?: string;
      method?: string;
      content_type?: string;
      form_key?: string;
      payload?: unknown;
      request_json?: unknown;
      payload_length?: number | null;
      payload_sha1?: string | null;
    };
  }>(
    suffix
      ? `/api/sales/commercial-documents/${documentId}/tax-bridge-preview?${suffix}`
      : `/api/sales/commercial-documents/${documentId}/tax-bridge-preview`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );
}

export async function sendSunatVoidCommunication(
  accessToken: string,
  documentId: number,
  payload?: {
    reason?: string;
    notes?: string;
  },
  companyId?: number
): Promise<{
  message: string;
  document_id: number;
  sunat_void_status: string;
  sunat_void_label: string;
  bridge_http_code?: number | null;
  bridge_response?: unknown;
  void_number?: number | null;
  debug?: {
    bridge_mode?: string;
    endpoint?: string;
    method?: string;
    content_type?: string;
    form_key?: string;
    payload?: unknown;
    payload_length?: number | null;
    payload_sha1?: string | null;
  } | null;
}> {
  const query = new URLSearchParams();
  if (companyId) {
    query.set('company_id', String(companyId));
  }

  return apiClient.request(
    `/api/sales/commercial-documents/${documentId}/sunat-void?${query.toString()}`,
    {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload ?? {}),
    }
  );
}

export async function downloadSunatXml(
  accessToken: string,
  documentId: number
): Promise<{
  blob: Blob;
  filename: string;
  endpoint: string;
  httpStatus: number;
  method: 'GET';
  contentType: string;
  responseHeaders: Record<string, string>;
}> {
  const requestPath = `/api/sales/commercial-documents/${documentId}/download-xml`;
  const requestUrl = `${apiClient.baseUrl}${requestPath}`;
  const response = await apiClient.requestRaw(requestPath, {
    method: 'GET',
    headers: authHeaders(accessToken) as Record<string, string>,
  });

  const endpoint = response.headers.get('X-Bridge-Endpoint') ?? '';
  const httpStatus = response.status;
  const contentType = response.headers.get('content-type') ?? '';
  const responseHeaders = Object.fromEntries(response.headers.entries());

  if (!response.ok) {
    const text = await response.text();
    let msg = `HTTP ${response.status}`;
    try { msg = (JSON.parse(text) as { message?: string }).message ?? msg; } catch { /* noop */ }
    throw Object.assign(new Error(msg), {
      endpoint,
      httpStatus,
      method: 'GET',
      contentType,
      requestUrl,
      responseHeaders,
    });
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const nameMatch = /filename="([^"]+)"/.exec(disposition);
  const filename = nameMatch ? nameMatch[1] : `document_${documentId}.xml`;
  return {
    blob,
    filename,
    endpoint,
    httpStatus,
    method: 'GET',
    contentType,
    responseHeaders,
  };
}

export async function downloadSunatCdr(
  accessToken: string,
  documentId: number
): Promise<{
  blob: Blob;
  filename: string;
  endpoint: string;
  httpStatus: number;
  method: 'GET';
  contentType: string;
  responseHeaders: Record<string, string>;
}> {
  const requestPath = `/api/sales/commercial-documents/${documentId}/download-cdr`;
  const requestUrl = `${apiClient.baseUrl}${requestPath}`;
  const response = await apiClient.requestRaw(requestPath, {
    method: 'GET',
    headers: authHeaders(accessToken) as Record<string, string>,
  });

  const endpoint = response.headers.get('X-Bridge-Endpoint') ?? '';
  const httpStatus = response.status;
  const contentType = response.headers.get('content-type') ?? '';
  const responseHeaders = Object.fromEntries(response.headers.entries());

  if (!response.ok) {
    const text = await response.text();
    let msg = `HTTP ${response.status}`;
    try { msg = (JSON.parse(text) as { message?: string }).message ?? msg; } catch { /* noop */ }
    throw Object.assign(new Error(msg), {
      endpoint,
      httpStatus,
      method: 'GET',
      contentType,
      requestUrl,
      responseHeaders,
    });
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const nameMatch = /filename="([^"]+)"/.exec(disposition);
  const filename = nameMatch ? nameMatch[1] : `cdr_${documentId}.zip`;
  return {
    blob,
    filename,
    endpoint,
    httpStatus,
    method: 'GET',
    contentType,
    responseHeaders,
  };
}
