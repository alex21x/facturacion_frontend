import { fetchInventoryLots, fetchInventoryProducts, fetchInventoryStock } from '../../inventory/api';
export type { InventoryLotRow, InventoryProduct, InventoryStockRow } from '../../inventory/types';

export async function fetchSalesInventoryProducts(
  accessToken: string,
  params?: { search?: string; warehouseId?: number | null; status?: number | null; limit?: number; autocomplete?: boolean }
) {
  return fetchInventoryProducts(accessToken, params);
}

export async function fetchSalesInventoryLots(
  accessToken: string,
  context?: { warehouseId?: number | null }
) {
  return fetchInventoryLots(accessToken, context);
}

export async function fetchSalesInventoryStock(
  accessToken: string,
  context?: { warehouseId?: number | null }
) {
  return fetchInventoryStock(accessToken, context);
}
