import { apiClient } from '../../shared/api/client';
import type {
  CommercialDocumentListItem,
  ConvertCommercialDocumentPayload,
  CreateDocumentForm,
  PaginatedCommercialDocuments,
  SalesCustomerSuggestion,
  SalesLookups,
  SeriesNumber,
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

export async function fetchSalesLookups(accessToken: string): Promise<SalesLookups> {
  return apiClient.request<SalesLookups>('/api/sales/lookups', {
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
      },
      status: isPreDocument ? 'DRAFT' : 'ISSUED',
      items,
      payments: isPreDocument
        ? []
        : [
            {
              payment_method_id: Number(form.paymentMethodId),
              amount: total,
              status: 'PAID',
              paid_at: new Date().toISOString(),
            },
          ],
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
