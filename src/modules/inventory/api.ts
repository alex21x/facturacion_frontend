import { apiClient } from '../../shared/api/client';
import type {
  InventoryLotRow,
  InventoryProduct,
  InventoryStockRow,
  KardexRow,
  InventoryProDashboardResponse,
  InventoryProDailySnapshotResponse,
  InventoryProLotExpiryResponse,
  InventoryProReportType,
  InventoryProReportRequestsResponse,
  InventoryProReportRequestCreateResponse,
  InventoryProReportRequestDetailResponse,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchInventoryProducts(
  accessToken: string,
  params?: { search?: string; warehouseId?: number | null; status?: number | null }
): Promise<InventoryProduct[]> {
  const query = new URLSearchParams();
  query.set('limit', '50');

  if (params?.search) {
    query.set('search', params.search);
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.status === 0 || params?.status === 1) {
    query.set('status', String(params.status));
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
    limit?: number;
  }
): Promise<KardexRow[]> {
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
  if (params?.limit) {
    query.set('limit', String(params.limit));
  }

  const path = query.toString() ? `/api/inventory/kardex?${query.toString()}` : '/api/inventory/kardex';

  const response = await apiClient.request<{ data: KardexRow[] }>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
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
    reportType?: InventoryProReportType;
    limit?: number;
  }
): Promise<InventoryProReportRequestsResponse> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set('status', params.status);
  }
  if (params?.reportType) {
    query.set('report_type', params.reportType);
  }
  if (params?.limit && params.limit > 0) {
    query.set('limit', String(params.limit));
  }

  const path = query.toString() ? `/api/inventory-pro/report-requests?${query.toString()}` : '/api/inventory-pro/report-requests';
  return apiClient.request<InventoryProReportRequestsResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createInventoryProReportRequest(
  accessToken: string,
  payload: {
    reportType: InventoryProReportType;
    filters?: Record<string, unknown>;
    runAsync?: boolean;
  }
): Promise<InventoryProReportRequestCreateResponse> {
  return apiClient.request<InventoryProReportRequestCreateResponse>('/api/inventory-pro/report-requests', {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report_type: payload.reportType,
      filters: payload.filters ?? {},
      run_async: payload.runAsync ?? true,
    }),
  });
}

export async function fetchInventoryProReportRequest(
  accessToken: string,
  requestId: number
): Promise<InventoryProReportRequestDetailResponse> {
  return apiClient.request<InventoryProReportRequestDetailResponse>(`/api/inventory-pro/report-requests/${requestId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}
