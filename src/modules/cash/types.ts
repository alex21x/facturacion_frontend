export type CashSession = {
  id: number;
  cash_register_id: number;
  cash_register_code: string | null;
  cash_register_name: string | null;
  user_id: number;
  user_name: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_balance: string;
  closing_balance: string | null;
  expected_balance: string;
  status: 'OPEN' | 'CLOSED';
  notes: string | null;
};

export type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
};

export type PaginatedCashSessions = {
  data: CashSession[];
  meta: PaginationMeta;
};

export type CashMovement = {
  id: number;
  cash_register_id: number;
  cash_session_id: number | null;
  movement_type: 'IN' | 'OUT';
  amount: string;
  description: string | null;
  ref_type: string | null;
  ref_id: number | null;
  user_id: number;
  user_name: string | null;
  movement_at: string;
  payment_method_name: string | null;
};

export type OpenSessionPayload = {
  company_id?: number;
  cash_register_id: number;
  opening_balance: number;
  notes?: string;
};

export type CloseSessionPayload = {
  closing_balance: number;
  notes?: string;
};

export type CreateMovementPayload = {
  company_id?: number;
  cash_register_id: number;
  cash_session_id?: number;
  movement_type: 'IN' | 'OUT';
  amount: number;
  description: string;
};

export type PaymentMethodBreakdown = {
  payment_method_id: number;
  payment_method_code: string;
  payment_method_name: string;
  document_count: number;
  total_amount: number;
};

export type CashSessionSummary = {
  opening_balance: number;
  total_in: number;
  total_out: number;
  expected_balance: number;
  closing_balance: number;
  difference: number;
};

export type CloseSessionResponse = {
  message: string;
  session: CashSession;
  summary: CashSessionSummary;
  sales_by_payment_method: PaymentMethodBreakdown[];
};

export type DocumentItem = {
  product_id?: number | null;
  description: string;
  quantity: number;
  unit_code: string;
  unit_price: number;
  unit_cost?: number;
  cost_total?: number;
  margin_total?: number;
  margin_percent?: number;
  margin_source?: 'REAL' | 'ESTIMATED';
  line_total: number;
};

export type SessionDocument = {
  id: number;
  document_number: string;
  document_kind: 'INVOICE' | 'RECEIPT' | 'SALES_ORDER' | 'QUOTATION' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  document_kind_label?: string;
  customer_name: string;
  customer_vehicle_id?: number | null;
  vehicle_plate_snapshot?: string | null;
  vehicle_brand_snapshot?: string | null;
  vehicle_model_snapshot?: string | null;
  payment_method_name: string | null;
  total: number;
  status: string;
  created_at: string;
  user_name: string | null;
  items: DocumentItem[];
};

export type SessionDetailResponse = {
  session: {
    id: number;
    cash_register_code: string | null;
    cash_register_name: string | null;
    user_name: string | null;
    opened_at: string;
    closed_at: string | null;
    opening_balance: number;
    closing_balance: number | null;
    expected_balance: number;
    status: 'OPEN' | 'CLOSED';
    notes: string | null;
  };
  summary: {
    total_in: number;
    total_out: number;
    difference: number | null;
  };
  movements: {
    id: number;
    movement_type: 'IN' | 'OUT';
    amount: number;
    description: string | null;
    ref_type: string | null;
    ref_id: number | null;
    user_name: string | null;
    movement_at: string;
  }[];
  documents: SessionDocument[];
  payment_method_breakdown: PaymentMethodBreakdown[];
};
