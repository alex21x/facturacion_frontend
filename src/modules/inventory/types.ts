export type InventoryProduct = {
  id: number;
  unit_id: number | null;
  sku: string | null;
  barcode: string | null;
  name: string;
  sale_price: string;
  cost_price: string;
  is_stockable: boolean;
  lot_tracking: boolean;
  has_expiration: boolean;
  status: number;
  category_name: string | null;
  unit_code: string | null;
  unit_name: string | null;
};

export type InventoryStockRow = {
  company_id: number;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  product_id: number;
  sku: string | null;
  product_name: string;
  stock: string;
};

export type InventoryLotRow = {
  id: number;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  product_id: number;
  sku: string | null;
  product_name: string;
  lot_code: string;
  manufacture_at: string | null;
  expires_at: string | null;
  received_at: string;
  status: number;
  stock: string;
};

export type KardexRow = {
  id: number;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  product_id: number;
  product_sku: string | null;
  product_name: string;
  lot_id: number | null;
  lot_code: string | null;
  movement_type: string;
  quantity: string;
  unit_cost: string;
  line_total: string;
  ref_type: string | null;
  ref_id: number | null;
  notes: string | null;
  moved_at: string;
};
