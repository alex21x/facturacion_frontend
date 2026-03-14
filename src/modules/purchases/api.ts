import { apiClient } from '../../shared/api/client';
import type { CreateStockEntryPayload, StockEntryRow } from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchStockEntries(
  accessToken: string,
  params?: { warehouseId?: number | null; entryType?: 'PURCHASE' | 'ADJUSTMENT' | null; limit?: number }
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
