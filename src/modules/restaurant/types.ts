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
  table_label?: string;
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
