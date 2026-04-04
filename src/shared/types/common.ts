export type PaymentMethodRow = {
  id: number;
  code: string;
  name: string;
  status?: number;
};

export type TaxCategoryRow = {
  id: number;
  code: string;
  label: string;
  rate_percent: number;
};

export type InventorySettings = {
  company_id?: number;
  complexity_mode: 'BASIC' | 'ADVANCED';
  inventory_mode: 'KARDEX_SIMPLE' | 'LOT_TRACKING';
  lot_outflow_strategy: 'MANUAL' | 'FIFO' | 'FEFO';
  enable_inventory_pro: boolean;
  enable_lot_tracking: boolean;
  enable_expiry_tracking: boolean;
  enable_advanced_reporting: boolean;
  enable_graphical_dashboard: boolean;
  enable_location_control: boolean;
  allow_negative_stock: boolean;
  enforce_lot_for_tracked: boolean;
};
