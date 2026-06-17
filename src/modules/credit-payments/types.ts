export type CreditDocumentRow = {
  id: number;
  document_kind: string;
  document_kind_label?: string;
  series: string;
  number: number;
  issue_at: string;
  document_status: string;
  counterpart_name: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'PENDING' | 'CANCELED';
};

export type CreditDocumentPayment = {
  id: number;
  payment_method_id: number | null;
  payment_method_name: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'CANCELED' | string;
  paid_at: string | null;
  due_at: string | null;
  notes: string | null;
  created_at: string | null;
};

export type CreditDocumentSummary = {
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_status: 'PENDING' | 'CANCELED';
};

export type CreditPaymentsPaginated = {
  data: CreditDocumentRow[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
};

export type CreditPaymentsDetail = {
  document: CreditDocumentRow;
  summary: CreditDocumentSummary;
  payments: CreditDocumentPayment[];
  payments_module_enabled?: boolean;
  payments_module_message?: string | null;
};

export type PaymentMethodOption = {
  id: number;
  code: string;
  name: string;
};
