export type RacingVehicle = {
  id: number;
  company_id: number;
  code: string;
  plate: string | null;
  name: string;
  model: string | null;
  status: number;
};

export type RacingEvent = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  budget_amount: number | null;
  notes: string | null;
};

export type RacingChecklistItem = {
  id: number;
  company_id: number;
  event_id: number;
  item_type: string;
  item_label: string;
  planned_qty: number;
  loaded_qty: number;
  returned_qty: number;
  status: string;
  notes: string | null;
};

export type RacingMaintenanceRecord = {
  id: number;
  company_id: number;
  vehicle_id: number;
  component_code: string;
  action_type: string;
  service_date: string;
  next_service_date: string | null;
  odometer_km: number | null;
  estimated_life_km: number | null;
  notes: string | null;
};

export type RacingAssignment = {
  id: number;
  company_id: number;
  assignment_type: string;
  vehicle_id: number | null;
  event_id: number | null;
  product_id: number | null;
  inventory_ledger_id: number | null;
  quantity: number;
  assigned_at: string;
  notes: string | null;
  event_code?: string | null;
  event_name?: string | null;
};

export type RacingBootstrapResponse = {
  vehicles: RacingVehicle[];
  events: RacingEvent[];
  ui_texts?: Record<string, string>;
  locale?: string;
};

export type RacingVehicleHistoryResponse = {
  vehicle: RacingVehicle;
  maintenance: RacingMaintenanceRecord[];
  assignments: RacingAssignment[];
};

export type RacingChecklistResponse = {
  items: RacingChecklistItem[];
};

export type RacingEventCost = {
  id: number;
  company_id: number;
  event_id: number;
  cost_stage: 'PRE' | 'DURING' | 'POST' | string;
  cost_category: string;
  concept: string;
  amount: number;
  cost_date: string;
  supplier_name: string | null;
  notes: string | null;
};

export type RacingEventCostsResponse = {
  costs: RacingEventCost[];
};

export type RacingEventCostSummaryRow = {
  event_id: number;
  event_code: string;
  event_name: string;
  starts_at: string;
  status: string;
  budget_amount: number | null;
  actual_amount: number;
  variance_amount: number | null;
  stages: {
    PRE: number;
    DURING: number;
    POST: number;
  };
};

export type RacingEventCostSummaryResponse = {
  events: RacingEventCostSummaryRow[];
};

export type RacingAlertLowStockRow = {
  product_id: number;
  sku: string | null;
  product_name: string;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string;
  stock: number;
};

export type RacingAlertMaintenanceRow = {
  id: number;
  vehicle_id: number;
  vehicle_code: string;
  vehicle_name: string;
  component_code: string;
  action_type: string;
  service_date: string;
  next_service_date: string;
  odometer_km: number | null;
};

export type RacingAlertsResponse = {
  stock_threshold: number;
  low_stock: RacingAlertLowStockRow[];
  maintenance_pending: RacingAlertMaintenanceRow[];
  maintenance_upcoming: RacingAlertMaintenanceRow[];
  maintenance_window_days: number;
};

export type InventoryProductAutocompleteRow = {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  category_name?: string | null;
};

export type InventoryProductsResponse = {
  data: InventoryProductAutocompleteRow[];
};

export type InventoryLookupCategoryRow = {
  id: number;
  name: string;
};

export type InventoryProductLookupsResponse = {
  categories: InventoryLookupCategoryRow[];
};
