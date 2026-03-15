import { apiClient } from '../../shared/api/client';
import type { InventoryLotRow, InventoryProduct, InventoryStockRow, KardexRow } from './types';

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
