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
