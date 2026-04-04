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
  is_enabled: boolean;
  company_enabled: boolean | null;
  branch_enabled: boolean | null;
  company_config: unknown;
  branch_config: unknown;
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
};

export type CompanyOperationalUsage = {
  enabled_companies: number;
  enabled_branches: number;
  enabled_warehouses: number;
  enabled_cash_registers: number;
};

export type OperationalContextResponse = {
  company: OperationalCompany;
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
};

export type CommerceSettingsFeature = {
  feature_code: string;
  is_enabled: boolean;
  config: unknown;
};

export type SalesTaxBridgeConfig = {
  bridge_mode?: 'PRODUCTION' | 'BETA';
  production_url?: string;
  beta_url?: string;
  timeout_seconds?: number;
  auth_scheme?: 'none' | 'bearer';
  token?: string;
  auto_send_on_issue?: boolean;
  sol_user?: string;
  sol_pass?: string;
  sunat_secondary_user?: string;
  sunat_secondary_pass?: string;
  codigolocal?: string;
  envio_pse?: string;
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
