import type { InventorySettings, PaymentMethodRow, TaxCategoryRow } from '../../shared/types/common';

export type StockEntryType = 'PURCHASE' | 'ADJUSTMENT';

export type PurchasesLookups = {
  payment_methods: PaymentMethodRow[];
  tax_categories: TaxCategoryRow[];
  active_igv_rate_percent?: number;
  inventory_settings: InventorySettings;
  detraccion_service_codes?: Array<{
    id: number;
    code: string;
    name: string;
    rate_percent: number;
  }>;
  detraccion_min_amount?: number | null;
  detraccion_account?: {
    bank_name?: string;
    account_number?: string;
    account_holder?: string;
  } | null;
  retencion_comprador_enabled?: boolean;
  retencion_proveedor_enabled?: boolean;
  retencion_types?: Array<{
    code: string;
    name: string;
    rate_percent: number;
  }>;
  retencion_account?: {
    bank_name?: string;
    account_number?: string;
    account_holder?: string;
  } | null;
  retencion_percentage?: number;
  percepcion_enabled?: boolean;
  percepcion_types?: Array<{
    code: string;
    name: string;
    rate_percent: number;
  }>;
  percepcion_account?: {
    bank_name?: string;
    account_number?: string;
    account_holder?: string;
  } | null;
  sunat_operation_types?: Array<{
    code: string;
    name: string;
    regime?: 'NONE' | 'DETRACCION' | 'RETENCION' | 'PERCEPCION';
  }>;
};

export type StockEntryItemRow = {
  entry_id: number;
  product_id: number;
  product_name: string;
  qty: number;
  unit_cost: number;
  subtotal: number;
  tax_category_id: number | null;
  tax_label: string;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  lot_code: string | null;
  notes: string | null;
};

export type StockEntryRow = {
  id: number;
  company_id: number;
  branch_id: number | null;
  warehouse_id: number;
  warehouse_code: string | null;
  warehouse_name: string | null;
  entry_type: StockEntryType;
  reference_no: string | null;
  supplier_reference: string | null;
  issue_at: string;
  status: string;
  notes: string | null;
  total_items: string;
  total_qty: string;
  total_amount: string;
  created_at: string | null;
  payment_method?: string;
  metadata?: Record<string, unknown> | null;
  items?: StockEntryItemRow[];
};

export type PurchasesPagination = {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

export type PaginatedStockEntries = {
  data: StockEntryRow[];
  pagination: PurchasesPagination;
};

export type CreateStockEntryItemPayload = {
  product_id: number;
  qty: number;
  unit_cost?: number;
  lot_id?: number;
  lot_code?: string;
  manufacture_at?: string;
  expires_at?: string;
  tax_category_id?: number;
  tax_rate?: number;
  notes?: string;
};

export type CreateStockEntryPayload = {
  warehouse_id: number;
  entry_type: StockEntryType;
  reference_no?: string;
  supplier_reference?: string;
  payment_method_id?: number;
  issue_at?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  items: CreateStockEntryItemPayload[];
};
