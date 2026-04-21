import { apiClient } from '../../shared/api/client';
import type { CreateStockEntryPayload, UpdateStockEntryPayload, StockEntryRow, PurchasesLookups, PaginatedStockEntries } from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchStockEntries(
  accessToken: string,
  params?: { warehouseId?: number | null; entryType?: 'PURCHASE' | 'ADJUSTMENT' | 'PURCHASE_ORDER' | null; limit?: number }
): Promise<StockEntryRow[]> {
  const query = new URLSearchParams();

  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }

  if (params?.entryType) {
    query.set('entry_type', params.entryType);
  }

  if (params?.limit) {
    query.set('limit', String(params.limit));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/inventory/stock-entries?${suffix}` : '/api/inventory/stock-entries';

  const response = await apiClient.request<{ data: StockEntryRow[] }>(path, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

export async function createStockEntry(
  accessToken: string,
  payload: CreateStockEntryPayload
): Promise<{ message: string; data: { id: number } }> {
  return apiClient.request<{ message: string; data: { id: number } }>('/api/inventory/stock-entries', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateStockEntry(
  accessToken: string,
  entryId: number,
  payload: UpdateStockEntryPayload
): Promise<{ message: string; data: { id: number } }> {
  return apiClient.request<{ message: string; data: { id: number } }>(`/api/purchases/stock-entries/${entryId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function receivePurchaseOrder(
  accessToken: string,
  orderId: number,
  payload?: {
    issue_at?: string;
    reference_no?: string;
    supplier_reference?: string;
    payment_method_id?: number | null;
    notes?: string;
    items?: Array<{
      product_id: number;
      qty: number;
    }>;
  }
): Promise<{ message: string; data: { purchase_order_id: number; received_entry_id: number; status?: string } }> {
  return apiClient.request<{ message: string; data: { purchase_order_id: number; received_entry_id: number; status?: string } }>(`/api/purchases/orders/${orderId}/receive`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload ?? {}),
  });
}

export async function fetchPurchasesLookups(accessToken: string): Promise<PurchasesLookups> {
  const response = await apiClient.request<PurchasesLookups>('/api/purchases/lookups', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response;
}

export async function fetchPurchasesReport(
  accessToken: string,
  params?: {
    warehouseId?: number | null;
    entryType?: 'PURCHASE' | 'ADJUSTMENT' | 'PURCHASE_ORDER' | null;
    reference?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    perPage?: number;
  }
): Promise<PaginatedStockEntries> {
  const query = new URLSearchParams();

  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.entryType) {
    query.set('entry_type', params.entryType);
  }
  if (params?.reference && params.reference.trim() !== '') {
    query.set('reference', params.reference.trim());
  }
  if (params?.dateFrom) {
    query.set('date_from', params.dateFrom);
  }
  if (params?.dateTo) {
    query.set('date_to', params.dateTo);
  }
  if (params?.page && params.page > 0) {
    query.set('page', String(params.page));
  }
  if (params?.perPage && params.perPage > 0) {
    query.set('per_page', String(params.perPage));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/purchases/list?${suffix}` : '/api/purchases/list';

  return apiClient.request<PaginatedStockEntries>(path, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function exportPurchasesFile(
  accessToken: string,
  format: 'csv' | 'xlsx',
  params?: {
    warehouseId?: number | null;
    entryType?: 'PURCHASE' | 'ADJUSTMENT' | 'PURCHASE_ORDER' | null;
    reference?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams();
  query.set('format', format);

  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.entryType) {
    query.set('entry_type', params.entryType);
  }
  if (params?.reference && params.reference.trim() !== '') {
    query.set('reference', params.reference.trim());
  }
  if (params?.dateFrom) {
    query.set('date_from', params.dateFrom);
  }
  if (params?.dateTo) {
    query.set('date_to', params.dateTo);
  }

  const response = await fetch(`${apiClient.baseUrl}/api/purchases/export?${query.toString()}`, {
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
  const fallback = format === 'xlsx' ? 'reporte_compras.xlsx' : 'reporte_compras.csv';
  const fileName = (match?.[1] ?? fallback).trim();

  return { blob, fileName };
}

export async function exportPurchasesExcel(
  accessToken: string,
  params?: {
    warehouseId?: number | null;
    entryType?: 'PURCHASE' | 'ADJUSTMENT' | 'PURCHASE_ORDER' | null;
    reference?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<{ blob: Blob; fileName: string }> {
  return exportPurchasesFile(accessToken, 'xlsx', params);
}

export async function exportPurchasesCsv(
  accessToken: string,
  params?: {
    warehouseId?: number | null;
    entryType?: 'PURCHASE' | 'ADJUSTMENT' | 'PURCHASE_ORDER' | null;
    reference?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<{ blob: Blob; fileName: string }> {
  return exportPurchasesFile(accessToken, 'csv', params);
}

export async function exportPurchasesJson(
  accessToken: string,
  params?: {
    warehouseId?: number | null;
    entryType?: 'PURCHASE' | 'ADJUSTMENT' | 'PURCHASE_ORDER' | null;
    reference?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<StockEntryRow[]> {
  const query = new URLSearchParams();
  query.set('format', 'json');

  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.entryType) {
    query.set('entry_type', params.entryType);
  }
  if (params?.reference && params.reference.trim() !== '') {
    query.set('reference', params.reference.trim());
  }
  if (params?.dateFrom) {
    query.set('date_from', params.dateFrom);
  }
  if (params?.dateTo) {
    query.set('date_to', params.dateTo);
  }

  const response = await apiClient.request<{ data: StockEntryRow[] }>(`/api/purchases/export?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
}

export type ResolveSupplierByDocumentResponse = {
  id: number;
  doc_number: string;
  doc_type: 'DNI' | 'RUC' | string | null;
  name: string;
  address: string | null;
  source: 'local' | 'reniec' | 'sunat';
  message: string;
};

export type SupplierAutocompleteItem = {
  id: number;
  doc_type: string | null;
  doc_number: string;
  name: string;
  address: string | null;
  source: string;
};

export async function fetchSupplierAutocomplete(
  accessToken: string,
  queryText: string
): Promise<SupplierAutocompleteItem[]> {
  const query = new URLSearchParams();
  query.set('q', queryText);
  query.set('limit', '12');

  const response = await apiClient.request<{ data: SupplierAutocompleteItem[] }>(
    `/api/purchases/suppliers/autocomplete?${query.toString()}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return response.data;
}

export async function resolveSupplierByDocument(
  accessToken: string,
  document: string
): Promise<ResolveSupplierByDocumentResponse> {
  const query = new URLSearchParams();
  query.set('document', document);

  return apiClient.request<ResolveSupplierByDocumentResponse>(
    `/api/purchases/suppliers/resolve-document?${query.toString()}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
}
