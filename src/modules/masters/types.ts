import type { InventorySettings, PaymentMethodRow } from '../../shared/types/common';
export type { InventorySettings, PaymentMethodRow } from '../../shared/types/common';

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

export type PriceTierRow = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  min_qty: number;
  max_qty: number | null;
  priority: number;
  status: number;
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

export type DocumentKindRow = {
  id: number;
  code: string;
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
  price_tiers: PriceTierRow[];
  lots: LotRow[];
  units: UnitRow[];
  inventory_settings: InventorySettings;
  document_kinds: DocumentKindRow[];
  stats: {
    warehouses_total: number;
    cash_registers_total: number;
    payment_methods_total: number;
    series_total: number;
    price_tiers_total: number;
    lots_total: number;
    units_enabled_total: number;
  };
};

export type CommerceFeatureRow = {
  feature_code:
    | 'PRODUCT_MULTI_UOM'
    | 'PRODUCT_UOM_CONVERSIONS'
    | 'PRODUCT_WHOLESALE_PRICING'
    | 'INVENTORY_PRODUCTS_BY_PROFILE'
    | 'INVENTORY_PRODUCT_MASTERS_BY_PROFILE'
    | 'SALES_CUSTOMER_PRICE_PROFILE'
    | 'SALES_SELLER_TO_CASHIER'
    | 'SALES_ANTICIPO_ENABLED'
    | 'SALES_DETRACCION_ENABLED'
    | 'SALES_RETENCION_ENABLED'
    | 'SALES_PERCEPCION_ENABLED'
    | 'PURCHASES_DETRACCION_ENABLED'
    | 'PURCHASES_RETENCION_COMPRADOR_ENABLED'
    | 'PURCHASES_RETENCION_PROVEEDOR_ENABLED'
    | 'PURCHASES_PERCEPCION_ENABLED';
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
