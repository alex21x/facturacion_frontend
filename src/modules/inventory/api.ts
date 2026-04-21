import { apiClient } from '../../shared/api/client';
import type {
  InventoryLotRow,
  InventoryProduct,
  InventoryStockRow,
  KardexRow,
  KardexMeta,
  InventoryProDashboardResponse,
  InventoryProDailySnapshotResponse,
  InventoryProLotExpiryResponse,
  InventoryProReportRequestsResponse,
  InventoryProReportRequestCreateResponse,
  InventoryProReportRequestDetailResponse,
  ReportsApiReportCode,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchInventoryProducts(
  accessToken: string,
  params?: { search?: string; warehouseId?: number | null; status?: number | null; limit?: number; autocomplete?: boolean }
): Promise<InventoryProduct[]> {
  const query = new URLSearchParams();
  query.set('limit', String(params?.limit ?? 50));

  if (params?.search) {
    query.set('search', params.search);
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.status === 0 || params?.status === 1) {
    query.set('status', String(params.status));
  }
  if (params?.autocomplete) {
    query.set('autocomplete', 'true');
  }

  const response = await apiClient.request<{ data: InventoryProduct[] }>(`/api/inventory/products?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function fetchInventoryStock(
  accessToken: string,
  context?: { warehouseId?: number | null }
): Promise<InventoryStockRow[]> {
  const query = new URLSearchParams();

  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/inventory/current-stock?${suffix}` : '/api/inventory/current-stock';

  const response = await apiClient.request<{ data: InventoryStockRow[] }>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function fetchInventoryLots(
  accessToken: string,
  context?: { warehouseId?: number | null }
): Promise<InventoryLotRow[]> {
  const query = new URLSearchParams();
  query.set('only_with_stock', 'true');

  if (context?.warehouseId) {
    query.set('warehouse_id', String(context.warehouseId));
  }

  const response = await apiClient.request<{ data: InventoryLotRow[] }>(`/api/inventory/lots?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function fetchKardex(
  accessToken: string,
  params?: {
    productId?: number | null;
    warehouseId?: number | null;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    perPage?: number;
  }
): Promise<{ data: KardexRow[]; meta: KardexMeta }> {
  const query = new URLSearchParams();

  if (params?.productId) {
    query.set('product_id', String(params.productId));
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.dateFrom) {
    query.set('date_from', params.dateFrom);
  }
  if (params?.dateTo) {
    query.set('date_to', params.dateTo);
  }
  if (params?.page) {
    query.set('page', String(params.page));
  }
  if (params?.perPage) {
    query.set('per_page', String(params.perPage));
  }

  const path = query.toString() ? `/api/inventory/kardex?${query.toString()}` : '/api/inventory/kardex';

  return apiClient.request<{ data: KardexRow[]; meta: KardexMeta }>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchInventoryProDashboard(
  accessToken: string,
  params?: {
    days?: number;
    warehouseId?: number | null;
  }
): Promise<InventoryProDashboardResponse> {
  const query = new URLSearchParams();

  if (params?.days && params.days > 0) {
    query.set('days', String(params.days));
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }

  const path = query.toString() ? `/api/inventory-pro/dashboard?${query.toString()}` : '/api/inventory-pro/dashboard';
  return apiClient.request<InventoryProDashboardResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchInventoryProDailySnapshot(
  accessToken: string,
  params?: {
    dateFrom?: string;
    dateTo?: string;
    warehouseId?: number | null;
    productId?: number | null;
    limit?: number;
  }
): Promise<InventoryProDailySnapshotResponse> {
  const query = new URLSearchParams();

  if (params?.dateFrom) {
    query.set('date_from', params.dateFrom);
  }
  if (params?.dateTo) {
    query.set('date_to', params.dateTo);
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.productId) {
    query.set('product_id', String(params.productId));
  }
  if (params?.limit && params.limit > 0) {
    query.set('limit', String(params.limit));
  }

  const path = query.toString() ? `/api/inventory-pro/daily-snapshot?${query.toString()}` : '/api/inventory-pro/daily-snapshot';
  return apiClient.request<InventoryProDailySnapshotResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchInventoryProLotExpiry(
  accessToken: string,
  params?: {
    warehouseId?: number | null;
    productId?: number | null;
    bucket?: string;
    limit?: number;
  }
): Promise<InventoryProLotExpiryResponse> {
  const query = new URLSearchParams();

  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.productId) {
    query.set('product_id', String(params.productId));
  }
  if (params?.bucket) {
    query.set('bucket', params.bucket);
  }
  if (params?.limit && params.limit > 0) {
    query.set('limit', String(params.limit));
  }

  const path = query.toString() ? `/api/inventory-pro/lot-expiry?${query.toString()}` : '/api/inventory-pro/lot-expiry';
  return apiClient.request<InventoryProLotExpiryResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchInventoryProReportRequests(
  accessToken: string,
  params?: {
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    reportCode?: ReportsApiReportCode;
    limit?: number;
  }
): Promise<InventoryProReportRequestsResponse> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set('status', params.status);
  }
  if (params?.reportCode) {
    query.set('report_code', params.reportCode);
  }
  if (params?.limit && params.limit > 0) {
    query.set('per_page', String(params.limit));
  }

  const path = query.toString() ? `/api/reports/requests?${query.toString()}` : '/api/reports/requests';
  return apiClient.request<InventoryProReportRequestsResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createInventoryProReportRequest(
  accessToken: string,
  payload: {
    reportCode: ReportsApiReportCode;
    filters?: Record<string, unknown>;
  }
): Promise<InventoryProReportRequestCreateResponse> {
  return apiClient.request<InventoryProReportRequestCreateResponse>('/api/reports/requests', {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report_code: payload.reportCode,
      filters: payload.filters ?? {},
    }),
  });
}

export async function fetchInventoryProReportRequest(
  accessToken: string,
  requestId: number
): Promise<InventoryProReportRequestDetailResponse> {
  return apiClient.request<InventoryProReportRequestDetailResponse>(`/api/reports/requests/${requestId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export type InventoryBulkImportRow = {
  id?: number;
  sku?: string;
  barcode?: string;
  name?: string;
  product_nature?: string;
  sale_price?: number | string;
  cost_price?: number | string;
  unit_code?: string;
  sunat_code?: string;
  is_stockable?: boolean | number | string;
  lot_tracking?: boolean | number | string;
  has_expiration?: boolean | number | string;
  status?: boolean | number | string;
  initial_qty?: number | string;
  initial_cost?: number | string;
  warehouse_code?: string;
};

export type InventoryBulkImportResponse = {
  message: string;
  batch_id: number;
  summary: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    stock_applied?: number;
    stock_skipped?: number;
  };
  errors: Array<{ row: number; message: string }>;
};

export type InventoryProductImportBatch = {
  id: number;
  company_id: number;
  imported_by: number;
  imported_by_name: string | null;
  imported_by_username: string | null;
  filename: string | null;
  total_rows: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

export type InventoryProductImportBatchItem = {
  id: number;
  batch_id: number;
  row_number: number;
  action_status: 'CREATED' | 'UPDATED' | 'SKIPPED' | string;
  product_id: number | null;
  sku: string | null;
  barcode: string | null;
  name: string | null;
  message: string | null;
  created_at: string;
};

export type InventoryProductImportBatchDetail = {
  batch: InventoryProductImportBatch;
  items: InventoryProductImportBatchItem[];
  errors: Array<{ row: number; message: string }>;
};

export async function importInventoryProductsBulk(
  accessToken: string,
  rows: InventoryBulkImportRow[],
  filename?: string
): Promise<InventoryBulkImportResponse> {
  return apiClient.request<InventoryBulkImportResponse>('/api/inventory/products/bulk-import', {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rows, filename: filename ?? null }),
  });
}

export async function fetchInventoryProductImportBatches(
  accessToken: string,
  limit = 30
): Promise<InventoryProductImportBatch[]> {
  const query = new URLSearchParams();
  query.set('limit', String(limit));

  const response = await apiClient.request<{ data: InventoryProductImportBatch[] }>(
    `/api/inventory/products/import-batches?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );

  return response.data;
}

export async function fetchInventoryProductImportBatchDetail(
  accessToken: string,
  batchId: number,
  itemsLimit = 500
): Promise<InventoryProductImportBatchDetail> {
  const query = new URLSearchParams();
  query.set('items_limit', String(itemsLimit));

  return apiClient.request<InventoryProductImportBatchDetail>(
    `/api/inventory/products/import-batches/${batchId}?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );
}
