export type MasterOption = {
  id: number;
  code: string;
  name: string;
  branch_id?: number | null;
};

export type MasterOptionsResponse = {
  branches: MasterOption[];
  warehouses: MasterOption[];
  products: Array<{ id: number; sku: string | null; name: string }>;
};

export type WarehouseRow = {
  id: number;
  company_id: number;
  branch_id: number | null;
  code: string;
  name: string;
  address: string | null;
  status: number;
};

export type CashRegisterRow = {
  id: number;
  company_id: number;
  branch_id: number | null;
  code: string;
  name: string;
  status: number;
};

export type PaymentMethodRow = {
  id: number;
  code: string;
  name: string;
  status: number;
};

export type SeriesRow = {
  id: number;
  company_id: number;
  branch_id: number | null;
  warehouse_id: number | null;
  document_kind: string;
  series: string;
  current_number: number;
  number_padding: number;
  reset_policy: 'NONE' | 'YEARLY' | 'MONTHLY';
  is_enabled: boolean;
};

export type LotRow = {
  id: number;
  product_id: number;
  product_name: string;
  warehouse_id: number;
  warehouse_name: string;
  lot_code: string;
  manufacture_at: string | null;
  expires_at: string | null;
  unit_cost: string | null;
  status: number;
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

export type DocumentKindRow = {
  code: 'QUOTATION' | 'SALES_ORDER' | 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  label: string;
  feature_code: string;
  is_enabled: boolean;
};

export type UnitRow = {
  id: number;
  code: string;
  sunat_uom_code: string | null;
  name: string;
  is_enabled: boolean;
};

export type MastersDashboardResponse = {
  options: MasterOptionsResponse;
  warehouses: WarehouseRow[];
  cash_registers: CashRegisterRow[];
  payment_methods: PaymentMethodRow[];
  series: SeriesRow[];
  lots: LotRow[];
  units: UnitRow[];
  inventory_settings: InventorySettings;
  document_kinds: DocumentKindRow[];
  stats: {
    warehouses_total: number;
    cash_registers_total: number;
    payment_methods_total: number;
    series_total: number;
    lots_total: number;
    units_enabled_total: number;
  };
};

export type CommerceFeatureRow = {
  feature_code:
    | 'PRODUCT_MULTI_UOM'
    | 'PRODUCT_UOM_CONVERSIONS'
    | 'PRODUCT_WHOLESALE_PRICING'
    | 'SALES_SELLER_TO_CASHIER';
  is_enabled: boolean;
  config: Record<string, unknown> | null;
};

export type CommerceSettingsResponse = {
  company_id: number;
  features: CommerceFeatureRow[];
};

export type AccessModuleRow = {
  id: number;
  code: string;
  name: string;
};

export type RolePermissionRow = {
  module_code: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_approve: boolean;
};

export type AccessRoleRow = {
  id: number;
  code: string;
  name: string;
  status: number;
  functional_profile: 'SELLER' | 'CASHIER' | 'GENERAL' | null;
  permissions: RolePermissionRow[];
};

export type AccessUserRow = {
  id: number;
  branch_id: number | null;
  username: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: number;
  role_id: number | null;
  role_code: string | null;
};

export type AccessControlResponse = {
  modules: AccessModuleRow[];
  roles: AccessRoleRow[];
  users: AccessUserRow[];
};
