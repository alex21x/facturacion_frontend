import { apiClient } from '../../shared/api/client';
import type {
  CommercialDocumentListItem,
  CreateDocumentForm,
  SalesCustomerSuggestion,
  SalesLookups,
  SeriesNumber,
} from './types';

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
  context?: { branchId?: number | null; warehouseId?: number | null; cashRegisterId?: number | null }
): Promise<CommercialDocumentListItem[]> {
  const query = new URLSearchParams();
  query.set('limit', '20');

  if (context?.branchId) {
    query.set('branch_id', String(context.branchId));
  }
  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }
  if (context?.cashRegisterId) {
    query.set('cash_register_id', String(context.cashRegisterId));
  }

  const response = await apiClient.request<{ data: CommercialDocumentListItem[] }>(`/api/sales/commercial-documents?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
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
    const subtotal = +(qty * unitPrice).toFixed(2);
    const taxTotal = +(subtotal * (taxRate / 100)).toFixed(2);
    const total = +(subtotal + taxTotal).toFixed(2);

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
      lots: item.lotId ? [
        {
          lot_id: Number(item.lotId),
          qty,
        },
      ] : undefined,
    };
  });

  const total = items.reduce((acc, item) => acc + Number(item.total), 0);

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
      status: 'ISSUED',
      items,
      payments: [
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
