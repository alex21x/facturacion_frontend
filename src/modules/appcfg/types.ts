export type ModuleRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_core: boolean;
  status: number;
  company_enabled: boolean | null;
  branch_enabled: boolean | null;
  is_enabled: boolean;
};

export type FeatureToggleRow = {
  feature_code: string;
  feature_label?: string | null;
  feature_category_key?: string | null;
  feature_category_label?: string | null;
  is_enabled: boolean;
  company_enabled: boolean | null;
  branch_enabled: boolean | null;
  company_config: unknown;
  branch_config: unknown;
  vertical_source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null;
};

export type OperationalCompany = {
  id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  status: number;
};

export type OperationalBranch = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  is_main: boolean;
  status: number;
};

export type OperationalWarehouse = {
  id: number;
  company_id: number;
  branch_id: number | null;
  code: string;
  name: string;
  status: number;
};

export type OperationalCashRegister = {
  id: number;
  company_id: number;
  branch_id: number | null;
  warehouse_id: number | null;
  code: string;
  name: string;
  status: number;
};

export type PlatformLimits = {
  max_companies_enabled: number;
};

export type CompanyOperationalLimits = {
  max_branches_enabled: number;
  max_warehouses_enabled: number;
  max_cash_registers_enabled: number;
  max_cash_registers_per_warehouse: number;
};

export type CompanyOperationalUsage = {
  enabled_companies: number;
  enabled_branches: number;
  enabled_warehouses: number;
  enabled_cash_registers: number;
};

export type OperationalContextResponse = {
  company: OperationalCompany;
  active_vertical?: {
    id: number;
    code: string;
    name: string;
  } | null;
  branches: OperationalBranch[];
  warehouses: OperationalWarehouse[];
  cash_registers: OperationalCashRegister[];
  selected: {
    company_id: number;
    branch_id: number | null;
    warehouse_id: number | null;
    cash_register_id: number | null;
  };
  limits: {
    platform: PlatformLimits;
    company: CompanyOperationalLimits;
    usage: CompanyOperationalUsage;
  };
};

export type HomeMetricsSummaryPoint = {
  key: string;
  label: string;
  sales: number;
  purchases: number;
};

export type HomeMetricsSummaryResponse = {
  range: 'DAY' | 'MONTH' | 'YEAR';
  from: string;
  to: string;
  points: HomeMetricsSummaryPoint[];
  totals: {
    sales: number;
    purchases: number;
  };
};

export type OperationalLimitsResponse = {
  company_id: number;
  platform_limits: PlatformLimits;
  company_limits: CompanyOperationalLimits;
  usage: CompanyOperationalUsage;
  is_over_limit?: {
    branches: boolean;
    warehouses: boolean;
    cash_registers: boolean;
    companies: boolean;
  };
};

export type UpdateOperationalLimitsPayload = {
  max_companies_enabled?: number;
  max_branches_enabled?: number;
  max_warehouses_enabled?: number;
  max_cash_registers_enabled?: number;
  max_cash_registers_per_warehouse?: number;
};

export type CompanyOperationalLimitMatrixCompany = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  company_status: number;
  max_branches_enabled: number;
  max_warehouses_enabled: number;
  max_cash_registers_enabled: number;
  max_cash_registers_per_warehouse: number;
  usage_branches: number;
  usage_warehouses: number;
  usage_cash_registers: number;
  updated_at: string | null;
};

export type CompanyOperationalLimitMatrixResponse = {
  defaults: {
    max_branches_enabled: number;
    max_warehouses_enabled: number;
    max_cash_registers_enabled: number;
    max_cash_registers_per_warehouse: number;
  };
  companies: CompanyOperationalLimitMatrixCompany[];
};

export type CommerceSettingsFeature = {
  feature_code: string;
  feature_label?: string | null;
  feature_category_key?: string | null;
  feature_category_label?: string | null;
  is_enabled: boolean;
  config: unknown;
  vertical_source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null;
};

export type SalesTaxBridgeConfig = {
  bridge_mode?: 'PRODUCTION' | 'BETA';
  production_url?: string;
  beta_url?: string;
  timeout_seconds?: number;
  auth_scheme?: 'none' | 'bearer';
  token?: string;
  auto_send_on_issue?: boolean;
  force_async_on_issue?: boolean;
  auto_reconcile_enabled?: boolean;
  reconcile_batch_size?: number;
  sol_user?: string;
  sol_pass?: string;
  sunat_secondary_user?: string;
  sunat_secondary_pass?: string;
  codigolocal?: string;
  envio_pse?: string;
};

export type ReconcileStatsResponse = {
  auto_reconcile_enabled: boolean;
  reconcile_batch_size: number;
  pending_reconcile_count: number;
  unsent_count: number;
  next_reconcile_at: string | null;
};

export type CommerceSettingsResponse = {
  company_id: number;
  branch_id?: number | null;
  features: CommerceSettingsFeature[];
};

export type UpdateCommerceSettingsPayload = {
  features: Array<{ feature_code: string; is_enabled: boolean; config?: unknown }>;
};

export type IgvSettingsResponse = {
  company_id: number;
  active_rate: {
    id: number | null;
    name: string;
    rate_percent: number;
    is_active: boolean;
  };
};

export type CompanyVerticalRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: number;
  is_assigned: boolean;
  is_primary: boolean;
  effective_from: string | null;
  effective_to: string | null;
};

export type CompanyVerticalSettingsResponse = {
  company_id: number;
  active_vertical: {
    id: number;
    code: string;
    name: string;
    description: string | null;
    effective_from: string | null;
    effective_to: string | null;
  } | null;
  verticals: CompanyVerticalRow[];
};

export type CompanyVerticalAdminAssignment = {
  vertical_id: number;
  vertical_code: string;
  vertical_name: string;
  is_enabled: boolean;
  is_primary: boolean;
  effective_from: string | null;
  effective_to: string | null;
};

export type CompanyVerticalAdminCompany = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  company_status: number;
  active_vertical_code: string | null;
  active_vertical_name: string | null;
  access_slug: string | null;
  access_url: string | null;
  access_link_active: boolean;
  assignments: CompanyVerticalAdminAssignment[];
  admin_username: string | null;
  admin_email: string | null;
};

export type CompanyVerticalAdminMatrixResponse = {
  verticals: Array<{ id: number; code: string; name: string; description: string | null }>;
  companies: CompanyVerticalAdminCompany[];
};

export type CompanyRateLimitMatrixCompany = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  company_status: number;
  is_enabled: boolean;
  requests_per_minute: number;
  requests_per_minute_read: number;
  requests_per_minute_write: number;
  requests_per_minute_reports: number;
  plan_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
  last_preset_code: 'BASIC' | 'PRO' | 'ENTERPRISE' | null;
  updated_at: string | null;
};

export type CompanyRateLimitMatrixResponse = {
  defaults: {
    requests_per_minute_read: number;
    requests_per_minute_write: number;
    requests_per_minute_reports: number;
  };
  presets: Array<{
    code: 'BASIC' | 'PRO' | 'ENTERPRISE';
    name: string;
    requests_per_minute_read: number;
    requests_per_minute_write: number;
    requests_per_minute_reports: number;
  }>;
  companies: CompanyRateLimitMatrixCompany[];
};

export type CreateAdminCompanyPayload = {
  tax_id: string;
  legal_name: string;
  trade_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  vertical_code?: string;
  main_branch_code?: string;
  main_branch_name?: string;
  create_default_warehouse?: boolean;
  default_warehouse_code?: string;
  default_warehouse_name?: string;
  create_default_cash_register?: boolean;
  default_cash_register_code?: string;
  default_cash_register_name?: string;
  admin_username: string;
  admin_password: string;
  admin_first_name: string;
  admin_last_name?: string;
  admin_email?: string;
  admin_phone?: string;
  plan_code?: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
  preset_code?: 'BASIC' | 'PRO' | 'ENTERPRISE';
  requests_per_minute_read?: number;
  requests_per_minute_write?: number;
  requests_per_minute_reports?: number;
};

export type CreateAdminCompanyResponse = {
  message: string;
  company_id: number;
  branch_id: number;
  admin_user_id: number;
  admin_role_id: number;
};

export type ResetAdminPasswordResponse = {
  username: string;
  email: string | null;
  new_password: string;
  message: string;
};

// ---- Admin commerce features matrix ----

export type CompanyCommerceAdminMatrixCompany = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  company_status: number;
  features: Record<string, boolean>;
};

export type CompanyCommerceAdminMatrixResponse = {
  feature_codes: string[];
  feature_labels?: Record<string, string>;
  feature_categories?: Record<string, { key: string; label: string }>;
  companies: CompanyCommerceAdminMatrixCompany[];
};

// ---- Admin inventory settings matrix ----

export type InventorySettingsRecord = {
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

export type CompanyInventorySettingsAdminMatrixCompany = {
  company_id: number;
  tax_id: string | null;
  legal_name: string;
  trade_name: string | null;
  company_status: number;
  inventory_settings: InventorySettingsRecord;
};

export type CompanyInventorySettingsAdminMatrixResponse = {
  companies: CompanyInventorySettingsAdminMatrixCompany[];
};
