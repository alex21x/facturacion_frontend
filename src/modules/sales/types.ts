import type { InventorySettings } from '../../shared/types/common';

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
  sunat_status?: string | null;
  sunat_void_status?: string | null;
  sunat_summary_id?: number | string | null;
  sunat_void_summary_id?: number | string | null;
  declaration_summary_status?: string | null;
  cancellation_summary_status?: string | null;
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

export type SunatExceptionItem = {
  id: number;
  branch_id?: number | null;
  document_kind: string;
  series: string;
  number: number;
  issue_at: string;
  document_status: string;
  customer_name: string;
  sunat_status: string;
  sunat_label: string;
  pending_hours: number;
  reconcile_attempts: number;
  needs_manual_confirmation: boolean;
  inventory_pending_sunat: boolean;
  inventory_sunat_settled: boolean;
  inventory_mismatch: boolean;
  sunat_reconcile_next_at?: string | null;
  sunat_bridge_http_code?: number | null;
  sunat_bridge_note?: string | null;
  sunat_error_code?: string | null;
  sunat_error_message?: string | null;
};

export type PaginatedSunatExceptions = {
  data: SunatExceptionItem[];
  meta: PaginationMeta;
};

export type SunatExceptionsAuditSummary = {
  total_issued: number;
  pending_sunat: number;
  inventory_settled: number;
  mismatch_count: number;
};

export type SunatExceptionsAuditRow = {
  id: number;
  branch_id?: number | null;
  document_kind: string;
  series: string;
  number: number;
  issue_at: string;
  updated_at: string;
  sunat_status: string;
  inventory_sunat_settled: boolean;
  inventory_pending_sunat: boolean;
  mismatch_reason: string;
};

export type SunatExceptionsAuditResponse = {
  summary: SunatExceptionsAuditSummary;
  data: SunatExceptionsAuditRow[];
};

export type ManualSunatConfirmPayload = {
  resolution: 'ACCEPTED' | 'REJECTED';
  evidence_type: 'TICKET' | 'CDR' | 'OBSERVATION' | 'WHATSAPP' | 'EMAIL' | 'OTHER';
  evidence_ref?: string;
  evidence_note?: string;
};

export type ConvertCommercialDocumentPayload = {
  target_document_kind: 'INVOICE' | 'RECEIPT' | 'SALES_ORDER';
  series?: string;
  issue_at?: string;
  due_at?: string;
  cash_register_id?: number | null;
  payment_method_id?: number | null;
};

export type UpdateCommercialDocumentPayload = {
  branch_id?: number | null;
  warehouse_id?: number | null;
  cash_register_id?: number | null;
  due_at?: string | null;
  customer_id?: number;
  currency_id?: number;
  payment_method_id?: number | null;
  notes?: string;
  metadata?: Record<string, unknown>;
  items?: Array<{
    line_no?: number;
    product_id?: number | null;
    unit_id?: number | null;
    price_tier_id?: number | null;
    tax_category_id?: number | null;
    description: string;
    qty: number;
    qty_base?: number;
    conversion_factor?: number;
    base_unit_price?: number;
    unit_price: number;
    unit_cost?: number;
    wholesale_discount_percent?: number;
    price_source?: 'MANUAL' | 'TIER' | 'PROFILE';
    discount_total?: number;
    tax_total?: number;
    subtotal?: number;
    total?: number;
    metadata?: Record<string, unknown>;
    lots?: Array<{
      lot_id: number;
      qty: number;
    }>;
  }>;
};

export type VoidCommercialDocumentPayload = {
  reason?: string;
  notes?: string;
  void_at?: string;
  sunat_void_status?: string;
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

export type SalesNoteReason = {
  id: number;
  code: string;
  description: string;
};

export type SalesDetractionServiceCode = {
  id: number;
  code: string;
  name: string;
  rate_percent: number;
};

export type SalesRetentionType = {
  code: string;
  name: string;
  rate_percent: number;
};

export type SalesPerceptionType = {
  code: string;
  name: string;
  rate_percent: number;
};

export type SalesSunatOperationType = {
  code: string;
  name: string;
  regime?: 'NONE' | 'DETRACCION' | 'RETENCION' | 'PERCEPCION';
};

export type SalesAccountInfo = {
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
};

export type SalesReferenceDocument = {
  id: number;
  customer_id: number;
  document_kind: 'INVOICE' | 'RECEIPT';
  series: string;
  number: number;
  issue_at: string;
  total: string;
  balance_due: string;
  status: string;
  applied_credit_total?: string | number;
  applied_debit_total?: string | number;
  has_credit_note?: boolean | string | number;
  has_debit_note?: boolean | string | number;
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
  customer_type_id?: number | null;
  customer_type_name?: string | null;
  customer_type_sunat_code?: number | null;
  doc_number: string | null;
  name: string;
  trade_name: string | null;
  plate: string | null;
  address: string | null;
  default_tier_id: number | null;
  default_tier_code?: string | null;
  default_tier_name?: string | null;
  discount_percent?: number;
  price_profile_status?: number;
};

export type SalesLookups = {
  document_kinds: SalesDocumentKind[];
  currencies: SalesCurrency[];
  payment_methods: SalesPaymentMethod[];
  tax_categories: SalesTaxCategory[];
  active_igv_rate_percent?: number;
  credit_note_reasons?: SalesNoteReason[];
  debit_note_reasons?: SalesNoteReason[];
  detraccion_service_codes?: SalesDetractionServiceCode[];
  detraccion_min_amount?: number | null;
  detraccion_account?: SalesAccountInfo | null;
  retencion_types?: SalesRetentionType[];
  retencion_account?: SalesAccountInfo | null;
  retencion_percentage?: number;
  percepcion_types?: SalesPerceptionType[];
  percepcion_account?: SalesAccountInfo | null;
  sunat_operation_types?: SalesSunatOperationType[];
  units: SalesUnit[];
  inventory_settings: InventorySettings;
  commerce_features?: Array<{
    feature_code: string;
    is_enabled: boolean;
    company_enabled?: boolean | null;
    branch_enabled?: boolean | null;
    vertical_source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null;
  }>;
};

export type SalesDraftItem = {
  productId: number | null;
  unitId: number | null;
  lotId: number | null;
  priceTierId?: number | null;
  wholesaleDiscountPercent?: number | null;
  priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
  taxCategoryId: number | null;
  priceIncludesTax?: boolean;
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
  restaurantTableId?: number | null;
  restaurantTableLabel?: string;
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
  receiptSendMode?: 'DIRECT' | 'SUMMARY';
  series: string;
  noteAffectedDocumentId?: number | null;
  noteReasonCode?: string;
  hasDetraccion?: boolean;
  detraccionServiceCode?: string;
  hasRetencion?: boolean;
  retencionTypeCode?: string;
  hasPercepcion?: boolean;
  percepcionTypeCode?: string;
  sunatOperationTypeCode?: string;
  isCreditSale?: boolean;
  creditInstallments?: Array<{
    amount: number;
    dueDate: string;
    observation?: string;
  }>;
  advanceAmount?: number;
  qty: number;
  unitPrice: number;
  status?: 'DRAFT' | 'APPROVED' | 'ISSUED' | 'VOID' | 'CANCELED';
  items?: SalesDraftItem[];
};
