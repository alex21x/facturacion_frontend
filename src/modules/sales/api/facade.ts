import { fetchInventoryLots, fetchInventoryProducts } from '../../inventory/api';
export type { InventoryLotRow, InventoryProduct } from '../../inventory/types';

export async function fetchSalesInventoryProducts(
  accessToken: string,
  params?: { search?: string; warehouseId?: number | null; status?: number | null }
) {
  return fetchInventoryProducts(accessToken, params);
}

export async function fetchSalesInventoryLots(
  accessToken: string,
  context?: { warehouseId?: number | null }
) {
  return fetchInventoryLots(accessToken, context);
}
