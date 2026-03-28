import type { InventorySettings } from '../masters/types';

export type StockEntryType = 'PURCHASE' | 'ADJUSTMENT';

export type PaymentMethodRow = {
  id: number;
  code: string;
  name: string;
};

export type TaxCategoryRow = {
  id: number;
  code: string;
  label: string;
  rate_percent: number;
};

export type PurchasesLookups = {
  payment_methods: PaymentMethodRow[];
  tax_categories: TaxCategoryRow[];
  inventory_settings: InventorySettings;
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
  items: CreateStockEntryItemPayload[];
};
