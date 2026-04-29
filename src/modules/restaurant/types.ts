export type ComandaKitchenStatus = 'PENDING' | 'IN_PREP' | 'READY' | 'SERVED' | 'CANCELLED';

export type ComandaRow = {
  id: number;
  branch_id: number | null;
  series: string;
  number: number;
  issue_at: string;
  status: string;
  total: string;
  customer_name: string;
  kitchen_status: ComandaKitchenStatus;
  table_label: string;
  items_preview?: Array<{
    description: string;
    qty: number;
  }>;
};

export type PaginatedComandasResponse = {
  data: ComandaRow[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
  allowed_statuses: ComandaKitchenStatus[];
};

export type RestaurantTableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DISABLED';

export type RestaurantTableRow = {
  id: number;
  company_id: number;
  branch_id: number;
  code: string;
  name: string;
  capacity: number;
  status: RestaurantTableStatus;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RestaurantTablesResponse = {
  data: RestaurantTableRow[];
  allowed_statuses: RestaurantTableStatus[];
};

export type RestaurantCurrency = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_default: boolean;
};

export type RestaurantPaymentMethod = {
  id: number;
  code: string;
  name: string;
};

export type RestaurantSeriesNumber = {
  id: number;
  document_kind: string;
  series: string;
  current_number: number;
  is_enabled: boolean;
};

export type RestaurantBootstrapResponse = {
  currencies: RestaurantCurrency[];
  payment_methods: RestaurantPaymentMethod[];
  active_igv_rate_percent: number;
  restaurant_price_includes_igv: boolean;
  series_numbers: RestaurantSeriesNumber[];
};

// ---------------------------------------------------------------------------
// Restaurant orders  (the neutral nucleus behind every vertical's sales flow)
// ---------------------------------------------------------------------------

export type RestaurantOrderRow = {
  id: number;
  branch_id: number | null;
  series: string;
  number: number;
  issue_at: string;
  status: string;
  total: string;
  notes: string;
  customer_id: number | null;
  customer_name: string;
  kitchen_status: ComandaKitchenStatus;
  table_label: string;
  table_id: string | null;
  line_count: number;
  total_qty: number;
  items?: RestaurantOrderEditItem[];
};

export type RestaurantOrderEditItem = {
  line_no: number;
  product_id: number | null;
  unit_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  tax_total: number;
  subtotal: number;
  total: number;
};

export type PaginatedRestaurantOrdersResponse = {
  data: RestaurantOrderRow[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
};

export type RestaurantOrderItem = {
  product_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_id?: number | null;
  tax_type?: string;
  tax_rate?: number;
};

export type CreateRestaurantOrderPayload = {
  branch_id: number;
  warehouse_id?: number | null;
  table_id?: number | null;
  series: string;
  currency_id: number;
  payment_method_id: number;
  customer_id: number;
  notes?: string;
  items: RestaurantOrderItem[];
};

export type CheckoutRestaurantOrderPayload = {
  /** 'INVOICE' (Factura) or 'RECEIPT' (Boleta) */
  target_document_kind: 'INVOICE' | 'RECEIPT';
  /** Series to use; backend auto-resolves when omitted */
  series?: string | null;
  cash_register_id?: number | null;
  payment_method_id?: number | null;
  notes?: string | null;
};

export type CheckoutResult = {
  id: number;
  document_kind: string;
  series: string;
  number: number;
  total: number;
  status: string;
};

export type RestaurantCustomerSuggestion = {
  id: number;
  name: string;
  doc_number: string | null;
  doc_type: string | null;
  trade_name: string | null;
  plate: string | null;
  address: string | null;
  default_tier_id: number | null;
};

export type ResolveRestaurantCustomerByDocumentResponse = {
  data: RestaurantCustomerSuggestion;
  source: 'local' | 'reniec' | 'sunat';
  created: boolean;
  message: string;
};

// ---------------------------------------------------------------------------
// Recipe management
// ---------------------------------------------------------------------------

export type RecipeLine = {
  ingredient_product_id: number;
  ingredient_name?: string;
  qty_required_base: number;
  unit_label: string;
  wastage_percent: number;
};

export type RecipeHeader = {
  menu_product_id: number;
  notes: string | null;
  is_active: boolean;
  lines: RecipeLine[];
};

export type PreparationShortage = {
  ingredient_product_id: number;
  name: string;
  required: number;
  available: number;
  unit: string;
};

export type PreparationIngredientSummary = {
  ingredient_product_id: number;
  ingredient_code: string;
  ingredient_name: string;
  required_base: number;
  available_base: number;
  shortfall_base: number;
};

export type PreparationRequirementsResponse = {
  order_id: number;
  warehouse_id: number;
  can_prepare: boolean;
  ingredients_summary: PreparationIngredientSummary[];
};
