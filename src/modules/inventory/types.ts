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
  line_id: number | null;
  brand_id: number | null;
  location_id: number | null;
  warranty_id: number | null;
  product_nature: 'PRODUCT' | 'SUPPLY';
  sunat_code: string | null;
  image_url: string | null;
  seller_commission_percent: string;
  line_name: string | null;
  brand_name: string | null;
  location_name: string | null;
  warranty_name: string | null;
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

export type InventoryProProfile = {
  inventory_pro?: boolean;
  advanced_reporting?: boolean;
  graphical_dashboard?: boolean;
  expiry_tracking?: boolean;
  source?: 'projection' | 'ledger';
  mode?: 'basic' | 'advanced';
};

export type InventoryProDashboardSummary = {
  days: number;
  stock_rows: number;
  total_qty: number;
  total_value: number;
};

export type InventoryProDashboardExpiryBucket = {
  bucket: string;
  total_lots: number;
  total_stock: number;
  total_value: number;
};

export type InventoryProDashboardMovementTrend = {
  snapshot_date: string;
  qty_in: number;
  qty_out: number;
  value_in: number;
  value_out: number;
};

export type InventoryProDashboardTopProduct = {
  product_id: number;
  product_sku: string | null;
  product_name: string;
  qty_in: number;
  qty_out: number;
  movement_value: number;
};

export type InventoryProDashboardResponse = {
  profile: InventoryProProfile;
  summary: InventoryProDashboardSummary;
  expiry_buckets: InventoryProDashboardExpiryBucket[];
  movement_trend: InventoryProDashboardMovementTrend[];
  top_products: InventoryProDashboardTopProduct[];
};

export type InventoryProDailySnapshotRow = {
  snapshot_date: string;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  product_id: number;
  product_sku: string | null;
  product_name: string;
  lot_id: number | null;
  lot_code: string | null;
  qty_in: number;
  qty_out: number;
  qty_net: number;
  value_in: number;
  value_out: number;
  value_net: number;
  movement_count: number;
  first_moved_at: string | null;
  last_moved_at: string | null;
};

export type InventoryProDailySnapshotResponse = {
  data: InventoryProDailySnapshotRow[];
  profile: InventoryProProfile;
  summary: {
    rows: number;
    total_qty_in: number;
    total_qty_out: number;
    total_qty_net: number;
    total_value_in: number;
    total_value_out: number;
    total_value_net: number;
  };
};

export type InventoryProLotExpiryRow = {
  company_id: number;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  product_id: number;
  product_sku: string | null;
  product_name: string;
  lot_id: number;
  lot_code: string;
  manufacture_at: string | null;
  expires_at: string | null;
  days_to_expire: number | null;
  expiry_bucket: string | null;
  stock: number;
  unit_cost: number;
  stock_value: number;
};

export type InventoryProLotExpiryResponse = {
  data: InventoryProLotExpiryRow[];
  profile: InventoryProProfile;
  summary: {
    rows: number;
    total_stock: number;
    total_value: number;
  };
};

export type InventoryProReportType =
  | 'STOCK_SNAPSHOT'
  | 'KARDEX_PHYSICAL'
  | 'KARDEX_VALUED'
  | 'LOT_EXPIRY'
  | 'INVENTORY_CUT';

export type InventoryProReportRequestListItem = {
  id: number;
  company_id: number;
  branch_id: number | null;
  requested_by: number;
  report_type: InventoryProReportType;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error_message: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type InventoryProReportRequestsResponse = {
  data: InventoryProReportRequestListItem[];
  profile?: InventoryProProfile;
};

export type InventoryProReportRequestCreateResponse = {
  message: string;
  mode: 'async' | 'deferred' | 'inline';
  queue_connection: string;
  data: InventoryProReportRequestListItem;
};

export type InventoryProReportRequestDetail = {
  id: number;
  company_id: number;
  branch_id: number | null;
  requested_by: number;
  report_type: InventoryProReportType;
  filters: Record<string, unknown>;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result: {
    type?: string;
    generated_at?: string;
    rows?: unknown[];
    summary?: Record<string, unknown>;
  } | null;
  error_message: string | null;
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type InventoryProReportRequestDetailResponse = {
  data: InventoryProReportRequestDetail;
};
