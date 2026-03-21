export type SeriesNumber = {
  id: number;
  document_kind: string;
  series: string;
  current_number: number;
  is_enabled: boolean;
};

export type CommercialDocumentListItem = {
  id: number;
  document_kind: string;
  series: string;
  number: number;
  source_document_id?: number | null;
  source_document_kind?: string | null;
  issue_at: string;
  created_at?: string | null;
  status: string;
  total: string;
  balance_due: string;
  customer_name: string;
  payment_method_name?: string | null;
  has_tributary_conversion?: boolean | string | number;
  has_order_conversion?: boolean | string | number;
  has_items?: boolean | string | number;
};

export type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  last_page: number;
};

export type PaginatedCommercialDocuments = {
  data: CommercialDocumentListItem[];
  meta: PaginationMeta;
};

export type ConvertCommercialDocumentPayload = {
  target_document_kind: 'INVOICE' | 'RECEIPT' | 'SALES_ORDER';
  series?: string;
  issue_at?: string;
  due_at?: string;
  cash_register_id?: number | null;
  payment_method_id?: number | null;
};

export type SalesDocumentKind = {
  code: 'QUOTATION' | 'SALES_ORDER' | 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  label: string;
};

export type SalesCurrency = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  is_default: boolean;
};

export type SalesPaymentMethod = {
  id: number;
  code: string;
  name: string;
};

export type SalesTaxCategory = {
  id: number;
  code: string;
  label: string;
  rate_percent: number;
};

export type SalesUnit = {
  id: number;
  code: string;
  sunat_uom_code: string | null;
  name: string;
};

export type SalesCustomerSuggestion = {
  id: number;
  doc_type: string | null;
  doc_number: string | null;
  name: string;
  trade_name: string | null;
  plate: string | null;
  address: string | null;
};

export type SalesLookups = {
  document_kinds: SalesDocumentKind[];
  currencies: SalesCurrency[];
  payment_methods: SalesPaymentMethod[];
  tax_categories: SalesTaxCategory[];
  units: SalesUnit[];
};

export type SalesDraftItem = {
  productId: number | null;
  unitId: number | null;
  lotId: number | null;
  taxCategoryId: number | null;
  qtyBase?: number | null;
  conversionFactor?: number | null;
  baseUnitPrice?: number | null;
  taxRate: number;
  taxLabel: string;
  isManual: boolean;
  description: string;
  qty: number;
  unitPrice: number;
};

export type CreateDocumentForm = {
  branchId?: number | null;
  warehouseId?: number | null;
  cashRegisterId?: number | null;
  documentKind: SalesDocumentKind['code'];
  customerId: number;
  currencyId: number;
  paymentMethodId: number;
  productId: number | null;
  unitId: number | null;
  lotId: number | null;
  taxCategoryId: number | null;
  customerQuery: string;
  customerAddress: string;
  productQuery: string;
  manualDescription: string;
  isManualItem: boolean;
  issueDate: string;
  dueDate: string;
  series: string;
  qty: number;
  unitPrice: number;
  items?: SalesDraftItem[];
};
