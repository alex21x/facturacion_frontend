import { useEffect, useMemo, useRef, useState } from 'react';
import { docKindLabel } from '../../../shared/utils/docKind';
import { fmtDateLima, fmtDateTimeFullLima, nowLimaIso, todayLima } from '../../../shared/utils/lima';
import {
  computeLineTotals,
  computeSalesDraftAmounts,
  normalizePrintableTotals,
  unitLabelForPrint,
} from '../utils/draft-calculations';
import {
  fetchSalesInventoryLots,
  fetchSalesInventoryProducts,
  fetchSalesInventoryStock,
  type InventoryLotRow,
  type InventoryProduct,
  type InventoryStockRow,
} from '../api/facade';
import {
  convertCommercialDocument,
  createCommercialDocument,
  fetchCommercialDocuments,
  exportCommercialDocumentsExcel,
  exportCommercialDocumentsJson,
  fetchCommercialDocumentDetails,
  fetchCustomerAutocomplete,
  fetchCustomerVehicles,
  fetchReferenceDocuments,
  fetchProductCommercialConfig,
  fetchSalesBootstrap,
  resolveCustomerByDocument,
  fetchSeriesNumbers,
  retryTaxBridgeSend,
  fetchTaxBridgeAuditAttemptDetail,
  fetchTaxBridgeAuditDocumentHistory,
  type TaxBridgeAuditAttempt,
  type TaxBridgeAuditAttemptDetail,
  fetchTaxBridgeDebug,
  sendSunatVoidCommunication,
  downloadSunatXml,
  downloadSunatCdr,
  updateCommercialDocument,
  voidCommercialDocument,
} from '../api';
import { fetchRestaurantTables } from '../../restaurant/api';
import type { RestaurantTableRow } from '../../restaurant/types';
import {
  buildCommercialDocument80mmHtml,
  buildCommercialDocumentA4Html,
  type PrintableSalesDocument,
} from '../print';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
import type {
  CommercialDocumentListItem,
  CommercialDocumentProductDetailRow,
  CreateDocumentForm,
  PaginationMeta,
  SalesCustomerSuggestion,
  SalesCustomerVehicle,
  SalesDraftItem,
  SalesLookups,
  SalesNoteReason,
  SalesReferenceDocument,
  SeriesNumber,
} from '../types';

type SalesViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  cashRegisterId: number | null;
  activeVerticalCode?: string | null;
  currentUserRoleCode?: string | null;
  currentUserRoleProfile?: 'SELLER' | 'CASHIER' | 'GENERAL' | null;
};

type DocumentViewFilter =
  | 'ALL'
  | 'TRIBUTARY'
  | 'QUOTATION'
  | 'SALES_ORDER'
  | 'PENDING_CONVERSION'
  | 'CONVERTED';

type ProductCommercialFeatures = {
  PRODUCT_MULTI_UOM: boolean;
  PRODUCT_UOM_CONVERSIONS: boolean;
  PRODUCT_WHOLESALE_PRICING: boolean;
  SALES_CUSTOMER_PRICE_PROFILE?: boolean;
};

type ProductCommercialSaleUnit = {
  unit_id: number;
  is_base: boolean;
  status: number;
  code: string;
  name: string;
};

type ProductCommercialWholesalePrice = {
  price_tier_id: number;
  unit_id: number | null;
  min_qty: string;
  max_qty: string | null;
  unit_price: number;
  status: number;
};

type ProductCommercialConversion = {
  from_unit_id: number;
  to_unit_id: number;
  conversion_factor: number;
  status: number;
};

type ProductCommercialConfig = {
  product: {
    unit_id: number | null;
  };
  features: ProductCommercialFeatures;
  product_units: ProductCommercialSaleUnit[];
  conversions: ProductCommercialConversion[];
  wholesale_prices: ProductCommercialWholesalePrice[];
  profile_tier_prices?: Array<{
    tier_id: number;
    currency_id: number;
    unit_price: number;
    valid_from: string | null;
    valid_to: string | null;
    status: number;
  }>;
};

type AutoPriceDecision = {
  price: number;
  note: string;
  source: 'MANUAL' | 'TIER' | 'PROFILE';
  priceTierId: number | null;
  discountPercent: number;
};

type DocumentAdvancedFilters = {
  customer: string;
  customerId: string;
  customerVehicleId: string;
  sourceOrigin: '' | 'RESTAURANT';
  issueDateFrom: string;
  issueDateTo: string;
  series: string;
  number: string;
  status: string;
};

type SalesWorkspaceMode = 'SELL' | 'REPORT';
type SalesFlowMode = 'DIRECT_CASHIER' | 'SELLER_TO_CASHIER';
type CashierReportPanelMode = 'PENDING' | 'FULL';
type PriceTaxMode = 'EXCLUSIVE' | 'INCLUSIVE';

const SALES_REPORT_FILTERS_STORAGE_KEY = 'sales.report.filters.v1';
const PRODUCT_AUTOCOMPLETE_MIN_CHARS = 1;

const initialDocumentAdvancedFilters: DocumentAdvancedFilters = {
  customer: '',
  customerId: '',
  customerVehicleId: '',
  sourceOrigin: '',
  issueDateFrom: '',
  issueDateTo: '',
  series: '',
  number: '',
  status: '',
};

function resolveConversionFactor(config: ProductCommercialConfig | null, selectedUnitId: number | null): number {
  if (!selectedUnitId) {
    return 1;
  }

  const baseUnitId = config?.product?.unit_id ?? null;
  if (!baseUnitId || selectedUnitId === baseUnitId) {
    return 1;
  }

  const active = (config?.conversions ?? []).filter((row) => Number(row.status) === 1);
  const direct = active.find((row) => row.from_unit_id === selectedUnitId && row.to_unit_id === baseUnitId);
  if (direct && Number(direct.conversion_factor) > 0) {
    return Number(direct.conversion_factor);
  }

  const inverse = active.find((row) => row.from_unit_id === baseUnitId && row.to_unit_id === selectedUnitId);
  if (inverse && Number(inverse.conversion_factor) > 0) {
    return 1 / Number(inverse.conversion_factor);
  }

  return 1;
}

function resolveWholesalePrice(
  config: ProductCommercialConfig | null,
  qty: number,
  unitId: number | null,
  fallbackPrice: number
): AutoPriceDecision {
  if (!config?.features.PRODUCT_WHOLESALE_PRICING || qty <= 0) {
    return { price: fallbackPrice, note: '', source: 'MANUAL', priceTierId: null, discountPercent: 0 };
  }

  const activeRows = (config.wholesale_prices ?? []).filter((row) => Number(row.status) === 1);
  if (activeRows.length === 0) {
    return { price: fallbackPrice, note: '', source: 'MANUAL', priceTierId: null, discountPercent: 0 };
  }

  const inRange = activeRows.filter((row) => {
    const min = Number(row.min_qty ?? 0);
    const max = row.max_qty === null ? null : Number(row.max_qty);
    return qty >= min && (max === null || qty <= max);
  });

  if (inRange.length === 0) {
    return { price: fallbackPrice, note: '', source: 'MANUAL', priceTierId: null, discountPercent: 0 };
  }

  const sameUnit = inRange
    .filter((row) => row.unit_id !== null && row.unit_id === unitId)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));

  const generic = inRange
    .filter((row) => row.unit_id === null)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));

  const picked = sameUnit[0] ?? generic[0] ?? null;
  if (!picked) {
    return { price: fallbackPrice, note: '', source: 'MANUAL', priceTierId: null, discountPercent: 0 };
  }

  return {
    price: Number(picked.unit_price),
    note: `Precio por mayor aplicado desde cantidad ${picked.min_qty}${picked.max_qty ? ` hasta ${picked.max_qty}` : '+'}.`,
    source: 'TIER',
    priceTierId: Number(picked.price_tier_id),
    discountPercent: 0,
  };
}

function resolveCustomerProfilePrice(
  config: ProductCommercialConfig | null,
  customer: SalesCustomerSuggestion | null,
  qty: number,
  unitId: number | null,
  currencyId: number,
  fallbackPrice: number,
  customerProfileEnabled: boolean
): AutoPriceDecision {
  const wholesale = resolveWholesalePrice(config, qty, unitId, fallbackPrice);

  if (!customerProfileEnabled || !customer) {
    return wholesale;
  }

  const profileStatus = Number(customer.price_profile_status ?? 1);
  if (profileStatus !== 1) {
    return wholesale;
  }

  const customerTierId = customer.default_tier_id ? Number(customer.default_tier_id) : null;
  const rows = (config?.profile_tier_prices ?? []).filter((row) => Number(row.status) === 1);
  if (customerTierId && rows.length > 0) {
    const now = Date.now();
    const tierRows = rows
      .filter((row) => Number(row.tier_id) === customerTierId && Number(row.currency_id) === Number(currencyId))
      .filter((row) => {
        const from = row.valid_from ? new Date(row.valid_from).getTime() : null;
        const to = row.valid_to ? new Date(row.valid_to).getTime() : null;
        return (from === null || from <= now) && (to === null || to >= now);
      })
      .sort((a, b) => {
        const aFrom = a.valid_from ? new Date(a.valid_from).getTime() : 0;
        const bFrom = b.valid_from ? new Date(b.valid_from).getTime() : 0;
        return bFrom - aFrom;
      });

    if (tierRows.length > 0) {
      return {
        price: Number(tierRows[0].unit_price),
        note: 'Precio por perfil de cliente aplicado.',
        source: 'PROFILE',
        priceTierId: customerTierId,
        discountPercent: 0,
      };
    }
  }

  const discountPercent = Math.max(0, Number(customer.discount_percent ?? 0));
  if (discountPercent > 0) {
    const discounted = Number(wholesale.price) * (1 - (discountPercent / 100));
    return {
      price: Math.max(0, Number(discounted.toFixed(6))),
      note: `Descuento por perfil de cliente aplicado (${discountPercent.toFixed(2)}%).`,
      source: 'PROFILE',
      priceTierId: customerTierId,
      discountPercent,
    };
  }

  return wholesale;
}

const TODAY = todayLima();

function createCreditInstallmentRow(dueDate: string, amount = 0, observation = '') {
  return {
    amount: Number(amount.toFixed(2)),
    dueDate,
    observation,
  };
}

const initialForm: CreateDocumentForm = {
  restaurantTableId: null,
  restaurantTableLabel: '',
  documentKind: 'RECEIPT',
  customerId: 0,
  customerVehicleId: null,
  currencyId: 1,
  paymentMethodId: 0,
  productId: null,
  unitId: null,
  lotId: null,
  taxCategoryId: null,
  customerQuery: '',
  customerAddress: '',
  productQuery: '',
  manualDescription: '',
  isManualItem: false,
  issueDate: TODAY,
  dueDate: TODAY,
  receiptSendMode: 'DIRECT',
  series: '',
  noteAffectedDocumentId: null,
  noteReasonCode: '',
  hasDetraccion: false,
  detraccionServiceCode: '',
  hasRetencion: false,
  retencionTypeCode: '',
  hasPercepcion: false,
  percepcionTypeCode: '',
  sunatOperationTypeCode: '',
  isCreditSale: false,
  creditInstallments: [],
  advanceAmount: 0,
  globalDiscountAmount: 0,
  draftLineDiscount: 0,
  draftIsFreeOperation: false,
  qty: 1,
  unitPrice: 0,
};

const TRIBUTARY_DOCUMENTS: CreateDocumentForm['documentKind'][] = [
  'INVOICE',
  'RECEIPT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
];

const DEFAULT_CREDIT_NOTE_REASONS: SalesNoteReason[] = [
  { id: 1, code: '01', description: 'Anulacion de la operacion' },
  { id: 2, code: '02', description: 'Anulacion por error en el RUC' },
  { id: 3, code: '03', description: 'Correccion por error en la descripcion' },
  { id: 4, code: '04', description: 'Descuento global' },
  { id: 5, code: '05', description: 'Descuento por item' },
  { id: 6, code: '06', description: 'Devolucion total' },
  { id: 7, code: '07', description: 'Devolucion por item' },
  { id: 8, code: '08', description: 'Bonificacion' },
  { id: 9, code: '09', description: 'Disminucion en el valor' },
  { id: 10, code: '10', description: 'Otros conceptos' },
];

const DEFAULT_DEBIT_NOTE_REASONS: SalesNoteReason[] = [
  { id: 1, code: '01', description: 'Interes por mora' },
  { id: 2, code: '02', description: 'Aumento en el valor' },
  { id: 3, code: '03', description: 'Penalidades u otros conceptos' },
];

function toBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 't' || normalized === 'yes';
  }
  return false;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}


function isCreditNoteKindCode(kind: string | null | undefined): boolean {
  const normalized = String(kind ?? '').trim().toUpperCase();
  return normalized === 'CREDIT_NOTE' || normalized.startsWith('CREDIT_NOTE_');
}

function isDebitNoteKindCode(kind: string | null | undefined): boolean {
  const normalized = String(kind ?? '').trim().toUpperCase();
  return normalized === 'DEBIT_NOTE' || normalized.startsWith('DEBIT_NOTE_');
}

function resolveDocumentKindBase(kind: string | null | undefined): string {
  const normalized = String(kind ?? '').trim().toUpperCase();
  if (isCreditNoteKindCode(normalized)) {
    return 'CREDIT_NOTE';
  }
  if (isDebitNoteKindCode(normalized)) {
    return 'DEBIT_NOTE';
  }
  return normalized;
}

function resolveRowDocumentKindBase(row: Pick<CommercialDocumentListItem, 'document_kind' | 'document_kind_base'>): string {
  const baseFromCatalog = String(row.document_kind_base ?? '').trim().toUpperCase();
  if (baseFromCatalog !== '') {
    return resolveDocumentKindBase(baseFromCatalog);
  }

  return resolveDocumentKindBase(row.document_kind);
}

function buildDocumentFilterParams(
  filter: DocumentViewFilter,
  lookupsRows: SalesLookups['document_kinds']
): {
  documentKind?: string;
  documentKindId?: string;
  conversionState?: 'PENDING' | 'CONVERTED';
} {
  const resolveKindIds = (): string | undefined => {
    const selectedIds = lookupsRows
      .filter((row) => {
        const base = String(row.base_kind ?? '').toUpperCase();
        const group = String(row.kind_group ?? '').toUpperCase();

        if (filter === 'TRIBUTARY') {
          return group !== 'PRE_DOCUMENT';
        }

        if (filter === 'QUOTATION') {
          return base === 'QUOTATION';
        }

        if (filter === 'SALES_ORDER') {
          return base === 'SALES_ORDER';
        }

        if (filter === 'PENDING_CONVERSION' || filter === 'CONVERTED') {
          return group === 'PRE_DOCUMENT' || base === 'QUOTATION' || base === 'SALES_ORDER';
        }

        return false;
      })
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    return selectedIds.length > 0 ? selectedIds.join(',') : undefined;
  };

  const kindIds = resolveKindIds();

  if (kindIds) {
    if (filter === 'PENDING_CONVERSION') {
      return { documentKindId: kindIds, conversionState: 'PENDING' };
    }
    if (filter === 'CONVERTED') {
      return { documentKindId: kindIds, conversionState: 'CONVERTED' };
    }
    return { documentKindId: kindIds };
  }

  if (filter === 'TRIBUTARY') {
    return { documentKind: 'INVOICE,RECEIPT,CREDIT_NOTE,DEBIT_NOTE' };
  }

  if (filter === 'QUOTATION') {
    return { documentKind: 'QUOTATION' };
  }

  if (filter === 'SALES_ORDER') {
    return { documentKind: 'SALES_ORDER' };
  }

  if (filter === 'PENDING_CONVERSION') {
    return { documentKind: 'QUOTATION,SALES_ORDER', conversionState: 'PENDING' };
  }

  if (filter === 'CONVERTED') {
    return { documentKind: 'QUOTATION,SALES_ORDER', conversionState: 'CONVERTED' };
  }

  return {};
}

function shouldApplyCashRegisterFilter(): boolean {
  // Report views should not be scoped by metadata cash_register_id because
  // issued documents may not store this field and would disappear from results.
  return false;
}

function commercialStatusLabel(status: string): string {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'DRAFT') return 'Borrador';
  if (normalized === 'APPROVED') return 'Aprobado';
  if (normalized === 'ISSUED') return 'Emitido';
  if (normalized === 'VOID') return 'Anulado';
  if (normalized === 'CANCELED') return 'Cancelado';

  return status;
}

function sunatStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').toUpperCase();

  if (!normalized) return 'No enviado';
  if (normalized === 'ACCEPTED') return 'Aceptado';
  if (normalized === 'REJECTED') return 'Rechazado';
  if (normalized === 'PENDING_CONFIRMATION') return 'Pendiente confirmacion SUNAT';
  if (normalized === 'EXPIRED_WINDOW') return 'Fuera de plazo SUNAT';
  if (normalized === 'SENDING') return 'Enviando';
  if (normalized === 'PENDING_MANUAL') return 'Pendiente manual';
  if (normalized === 'PENDING_SUMMARY') return 'Pendiente por resumen';
  if (normalized === 'SENT_BY_SUMMARY') return 'Enviado por resumen';
  if (normalized === 'CONFIG_INCOMPLETE') return 'Config incompleta';
  if (normalized === 'HTTP_ERROR') return 'Error HTTP';
  if (normalized === 'NETWORK_ERROR') return 'Error red';
  if (normalized === 'ERROR') return 'Error';
  if (normalized === 'SENT') return 'Enviado';

  return normalized;
}

type SunatUiState = {
  statusKey: string;
  label: string;
  className: string;
  isFinal: boolean;
};

type SunatToastState = {
  tone: 'ok' | 'warn' | 'bad';
  title: string;
  detail: string;
};

function isCashOpeningRequiredError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized === '') {
    return false;
  }

  return normalized.includes('caja')
    && (normalized.includes('apertur') || normalized.includes('abrir'));
}

type SunatBridgeDebugState = {
  documentId: number;
  title: string;
  loading: boolean;
  error: string;
  attempts: TaxBridgeAuditAttempt[];
  selectedLogId: number | null;
  loadingDetailLogId: number | null;
  attemptDetails: Record<number, TaxBridgeAuditAttemptDetail | null | undefined>;
  debug: {
    bridge_mode?: string;
    sunat_status?: string;
    sunat_status_label?: string;
    endpoint?: string;
    method?: string;
    content_type?: string;
    form_key?: string;
    payload?: unknown;
    payload_length?: number | null;
    payload_sha1?: string | null;
    bridge_http_code?: number | null;
    bridge_response?: unknown;
    sunat_ticket?: string | null;
    bridge_note?: string;
    sunat_error_code?: string | null;
    sunat_error_message?: string | null;
  } | null;
};

type EditingDocumentContext = {
  id: number;
  documentKind: string;
  series: string;
  number: number;
};

function resolveViewFilterForDocumentKind(documentKind: string): DocumentViewFilter {
  const normalized = resolveDocumentKindBase(documentKind);

  if (['INVOICE', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(normalized)) {
    return 'TRIBUTARY';
  }

  if (normalized === 'QUOTATION') {
    return 'QUOTATION';
  }

  if (normalized === 'SALES_ORDER') {
    return 'SALES_ORDER';
  }

  return 'ALL';
}

function resolveSunatUiState(row: CommercialDocumentListItem): SunatUiState {
  const commercialStatus = String(row.status ?? '').toUpperCase();
  const voidStatus = String(row.sunat_void_status ?? '').trim().toUpperCase();

  if (commercialStatus === 'VOID' || commercialStatus === 'CANCELED' || voidStatus === 'ACCEPTED') {
    return {
      statusKey: 'VOIDED',
      label: 'Anulado',
      className: 'is-neutral',
      isFinal: true,
    };
  }

  if (voidStatus) {
    return {
      statusKey: voidStatus,
      label: voidStatus === 'PENDING_SUMMARY' ? 'Pend. anulacion RA' : sunatStatusLabel(voidStatus),
      className: sunatStatusClass(voidStatus),
      isFinal: false,
    };
  }

  const normalized = String(row.sunat_status ?? '').trim().toUpperCase();
  const label = sunatStatusLabel(normalized);
  const className = sunatStatusClass(normalized);

  return {
    statusKey: normalized || 'NO_ENVIADO',
    label,
    className,
    isFinal: normalized === 'ACCEPTED',
  };
}

function sunatStatusClass(status: string | null | undefined): string {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'ACCEPTED') return 'is-ok';
  if (normalized === 'REJECTED' || normalized === 'EXPIRED_WINDOW') return 'is-bad';
  if (normalized === 'SENDING' || normalized === 'SENT' || normalized === 'PENDING_SUMMARY' || normalized === 'SENT_BY_SUMMARY') return 'is-progress';
  if (normalized === 'PENDING_CONFIRMATION') return 'is-warn';
  if (normalized === 'HTTP_ERROR' || normalized === 'NETWORK_ERROR' || normalized === 'ERROR' || normalized === 'CONFIG_INCOMPLETE') return 'is-warn';

  return 'is-neutral';
}

function summaryFlowStatusLabel(status: string | null | undefined): string {
  const normalized = String(status || '').trim().toUpperCase();

  if (!normalized) return 'asignado';
  if (normalized === 'DRAFT') return 'borrador';
  if (normalized === 'SENDING') return 'en envio';
  if (normalized === 'SENT') return 'enviado';
  if (normalized === 'ACCEPTED') return 'aceptado';
  if (normalized === 'REJECTED') return 'rechazado';
  if (normalized === 'ERROR') return 'con error';

  return normalized.toLowerCase();
}

function summaryFlowBadgeStyle(status: string | null | undefined) {
  const normalized = String(status || '').trim().toUpperCase();

  if (normalized === 'ACCEPTED') {
    return { color: '#065f46', background: '#d1fae5', border: '1px solid #6ee7b7' };
  }
  if (normalized === 'REJECTED' || normalized === 'ERROR') {
    return { color: '#991b1b', background: '#fee2e2', border: '1px solid #fca5a5' };
  }
  if (normalized === 'SENDING' || normalized === 'SENT') {
    return { color: '#1e3a8a', background: '#dbeafe', border: '1px solid #93c5fd' };
  }

  return { color: '#0f766e', background: '#ccfbf1', border: '1px solid #99f6e4' };
}

function hasDeclarationSummaryAssigned(row: CommercialDocumentListItem): boolean {
  return toPositiveInt(row.sunat_summary_id) !== null;
}

function hasCancellationSummaryAssigned(row: CommercialDocumentListItem): boolean {
  return toPositiveInt(row.sunat_void_summary_id) !== null;
}

function canSendSunatManually(row: CommercialDocumentListItem, bridgeEnabled: boolean): boolean {
  if (!bridgeEnabled) {
    return false;
  }

  if (!isTributaryRow(row)) {
    return false;
  }

  if (String(row.status).toUpperCase() !== 'ISSUED') {
    return false;
  }

  if (isReceiptDocument(row) && hasDeclarationSummaryAssigned(row)) {
    return false;
  }

  const sunatUi = resolveSunatUiState(row);
  return !sunatUi.isFinal && !['SENDING', 'PENDING_CONFIRMATION', 'EXPIRED_WINDOW'].includes(sunatUi.statusKey);
}

function canVoidBeforeSunatSend(row: CommercialDocumentListItem, canVoidDocuments: boolean): boolean {
  if (!canVoidDocuments) {
    return false;
  }

  if (!isTributaryRow(row)) {
    return false;
  }

  if (String(row.status).toUpperCase() !== 'ISSUED') {
    return false;
  }

  if (isReceiptDocument(row) && (hasDeclarationSummaryAssigned(row) || hasCancellationSummaryAssigned(row))) {
    return false;
  }

  const status = String(row.sunat_status ?? '').trim().toUpperCase();
  return status === '' || status === 'PENDING_MANUAL' || status === 'CONFIG_INCOMPLETE';
}

function canRequestSunatVoidCommunication(
  row: CommercialDocumentListItem
): boolean {
  const baseKind = resolveRowDocumentKindBase(row);

  if (!['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(baseKind)) {
    return false;
  }

  if (String(row.status).toUpperCase() !== 'ISSUED') {
    return false;
  }

  const sunatStatus = String(row.sunat_status ?? '').trim().toUpperCase();
  return sunatStatus === 'ACCEPTED';
}

function isReceiptDocument(row: CommercialDocumentListItem): boolean {
  return resolveRowDocumentKindBase(row) === 'RECEIPT';
}

function canAddReceiptToDeclarationSummary(
  row: CommercialDocumentListItem
): boolean {
  if (!isReceiptDocument(row)) {
    return false;
  }

  if (String(row.status).toUpperCase() !== 'ISSUED') {
    return false;
  }

  if (hasDeclarationSummaryAssigned(row) || hasCancellationSummaryAssigned(row)) {
    return false;
  }

  const sunatStatus = String(row.sunat_status ?? '').trim().toUpperCase();
  return sunatStatus === ''
    || sunatStatus === 'PENDING_MANUAL'
    || sunatStatus === 'CONFIG_INCOMPLETE'
    || sunatStatus === 'HTTP_ERROR'
    || sunatStatus === 'NETWORK_ERROR'
    || sunatStatus === 'ERROR'
    || sunatStatus === 'REJECTED';
}

function canAnulateAcceptedReceipt(
  row: CommercialDocumentListItem
): boolean {
  if (!isReceiptDocument(row)) {
    return false;
  }

  if (String(row.status).toUpperCase() !== 'ISSUED') {
    return false;
  }

  if (hasCancellationSummaryAssigned(row)) {
    return false;
  }

  const sunatStatus = String(row.sunat_status ?? '').trim().toUpperCase();
  return sunatStatus === 'ACCEPTED';
}

function canOpenSunatActionsMenu(
  row: CommercialDocumentListItem,
  bridgeEnabled: boolean,
  canVoidDocuments: boolean
): boolean {
  // Any ISSUED tributary doc that is ACCEPTED should always open (XML/CDR/NC/ND options)
  if (isTributaryRow(row)
    && String(row.status).toUpperCase() === 'ISSUED'
    && String(row.sunat_status ?? '').toUpperCase() === 'ACCEPTED') {
    return true;
  }
  return canSendSunatManually(row, bridgeEnabled)
    || canVoidBeforeSunatSend(row, canVoidDocuments)
    || canRequestSunatVoidCommunication(row)
    || canAddReceiptToDeclarationSummary(row)
    || canAnulateAcceptedReceipt(row);
}

function isPendingManualSunat(row: CommercialDocumentListItem): boolean {
  return String(row.sunat_status ?? '').trim().toUpperCase() === 'PENDING_MANUAL';
}

function isTributaryDocumentKind(kind: string | null | undefined): boolean {
  const normalized = resolveDocumentKindBase(kind);
  return ['INVOICE', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(normalized);
}

function isTributaryRow(row: CommercialDocumentListItem): boolean {
  const normalized = resolveRowDocumentKindBase(row);
  if (['INVOICE', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(normalized)) {
    return true;
  }

  if (row.is_tributary_document !== undefined && row.is_tributary_document !== null) {
    return toBooleanFlag(row.is_tributary_document);
  }

  return String(row.sunat_status ?? '').trim() !== ''
    || String(row.sunat_void_status ?? '').trim() !== ''
    || toPositiveInt(row.sunat_summary_id) !== null
    || toPositiveInt(row.sunat_void_summary_id) !== null;
}

function documentKindRequiresRuc(
  kind: string | null | undefined,
  options?: {
    noteTargetKind?: string | null;
    referenceDocumentKind?: string | null;
  }
): boolean {
  const normalized = resolveDocumentKindBase(kind);

  if (normalized === 'INVOICE') {
    return true;
  }

  if (normalized === 'CREDIT_NOTE' || normalized === 'DEBIT_NOTE') {
    const referenceBaseKind = resolveDocumentKindBase(options?.referenceDocumentKind ?? options?.noteTargetKind ?? '');
    return referenceBaseKind === 'INVOICE';
  }

  return false;
}

function customerHasRuc(customer: SalesCustomerSuggestion | null): boolean {
  if (!customer) {
    return false;
  }

  const docType = String(customer.doc_type ?? '').trim().toUpperCase();
  const docDigits = String(customer.doc_number ?? '').replace(/\D+/g, '');
  const sunatType = Number(customer.customer_type_sunat_code ?? 0);
  const hasRucType = docType === '6' || docType === '06' || docType === 'RUC' || sunatType === 6;

  return hasRucType && docDigits.length === 11;
}

function canEditCommercialDocument(
  row: CommercialDocumentListItem,
  allowDraftEdit: boolean,
  allowIssuedBeforeFinalSunatEdit: boolean
): boolean {
  const status = String(row.status ?? '').toUpperCase();

  if (status === 'DRAFT') {
    return allowDraftEdit;
  }

  if (status === 'ISSUED' && isTributaryRow(row)) {
    return allowIssuedBeforeFinalSunatEdit && !resolveSunatUiState(row).isFinal;
  }

  // Allow editing QUOTATION and SALES_ORDER in ISSUED status if draft edit is allowed
  if (status === 'ISSUED' && ['QUOTATION', 'SALES_ORDER'].includes(resolveRowDocumentKindBase(row))) {
    return allowDraftEdit;
  }

  return false;
}

function hasActiveCommercialConversion(row: CommercialDocumentListItem): boolean {
  return toBooleanFlag(row.has_tributary_conversion) || toBooleanFlag(row.has_order_conversion);
}

function resolveEditControlState(
  row: CommercialDocumentListItem,
  allowDraftEdit: boolean,
  allowIssuedBeforeFinalSunatEdit: boolean
): { visible: boolean; enabled: boolean; reason: string } {
  const status = String(row.status ?? '').toUpperCase();

  if (status === 'DRAFT') {
    return {
      visible: true,
      enabled: allowDraftEdit,
      reason: allowDraftEdit ? 'Editar comprobante' : 'Edicion de borradores deshabilitada por configuracion',
    };
  }

  if (status === 'ISSUED' && isTributaryRow(row)) {
    const sunatUi = resolveSunatUiState(row);
    if (sunatUi.isFinal) {
      return {
        visible: true,
        enabled: false,
        reason: 'SUNAT en estado final: no se puede editar',
      };
    }

    return {
      visible: true,
      enabled: true,
      reason: 'Editar comprobante emitido (SUNAT no final)',
    };
  }

  const kind = String(row.document_kind ?? '').toUpperCase();
  if (['QUOTATION', 'SALES_ORDER'].includes(kind) && ['DRAFT', 'APPROVED', 'ISSUED'].includes(status)) {
    if (hasActiveCommercialConversion(row)) {
      return {
        visible: true,
        enabled: false,
        reason: 'Documento ya convertido: no se puede editar',
      };
    }

    return {
      visible: true,
      enabled: allowDraftEdit,
      reason: allowDraftEdit ? 'Editar pedido comercial' : 'Edicion de pedidos comerciales deshabilitada por configuracion',
    };
  }

  return {
    visible: false,
    enabled: false,
    reason: '',
  };
}

function manualSunatButtonLabel(status: string | null | undefined): string {
  const normalized = String(status ?? '').trim().toUpperCase();
  return normalized === 'PENDING_MANUAL' || normalized === '' ? 'Enviar SUNAT' : 'Reenviar SUNAT';
}

function summarizeBridgeResponse(response: unknown): string {
  if (typeof response === 'string') {
    const compact = response.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (compact !== '') {
      return compact.length > 240 ? `${compact.slice(0, 240)}...` : compact;
    }
    return '';
  }

  if (!response || typeof response !== 'object') {
    return '';
  }

  const data = response as Record<string, unknown>;
  const sunatCode = data.cod_sunat ?? data.codigo ?? data.error_code ?? null;
  const bridgeRes = data.res ?? data.status ?? null;
  const message = data.msj_sunat ?? data.msg ?? data.message ?? data.descripcion ?? null;

  const parts: string[] = [];
  if (bridgeRes !== null && bridgeRes !== undefined && String(bridgeRes).trim() !== '') {
    parts.push(`res=${String(bridgeRes).trim()}`);
  }
  if (sunatCode !== null && sunatCode !== undefined && String(sunatCode).trim() !== '') {
    parts.push(`cod_sunat=${String(sunatCode).trim()}`);
  }
  if (message !== null && message !== undefined && String(message).trim() !== '') {
    parts.push(String(message).trim());
  }

  if (parts.length === 0) {
    const raw = data.raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const compactRaw = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (compactRaw !== '') {
        return compactRaw.length > 240 ? `${compactRaw.slice(0, 240)}...` : compactRaw;
      }
    }

    const serialized = JSON.stringify(data);
    if (serialized && serialized !== '{}') {
      return serialized.length > 240 ? `${serialized.slice(0, 240)}...` : serialized;
    }
  }

  return parts.join(' | ');
}

function summarizeSunatDiagnostic(code: string | null | undefined, message: string | null | undefined, response: unknown): string {
  const parts: string[] = [];
  if (code && String(code).trim() !== '') {
    parts.push(`Codigo SUNAT: ${String(code).trim()}`);
  }
  if (message && String(message).trim() !== '') {
    parts.push(`Detalle: ${String(message).trim()}`);
  }

  if (parts.length > 0) {
    return parts.join(' | ');
  }

  return summarizeBridgeResponse(response);
}

function formatStoredDateTime(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  // Keep wall-clock when backend returns PostgreSQL style 'YYYY-MM-DD HH:mm:ss+00'.
  const pgMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?[+-]\d{2}(?::?\d{2})?$/);
  if (pgMatch) {
    const [, year, month, day, hour, minute] = pgMatch;
    return `${day}/${month}/${year}, ${hour}:${minute}`;
  }

  return fmtDateTimeFullLima(raw);
}

function stockToneClass(stock: number): 'stock-chip--danger' | 'stock-chip--warn' | 'stock-chip--ok' {
  if (!Number.isFinite(stock) || stock <= 0) {
    return 'stock-chip--danger';
  }
  if (stock <= 5) {
    return 'stock-chip--warn';
  }
  return 'stock-chip--ok';
}

function toOptionalNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function resolveSalesFlowMode(features: Array<{ feature_code: string; is_enabled: boolean }>): SalesFlowMode {
  const row = features.find((item) => item.feature_code === 'SALES_SELLER_TO_CASHIER');
  return row?.is_enabled ? 'SELLER_TO_CASHIER' : 'DIRECT_CASHIER';
}

function featureEnabled(features: Array<{ feature_code: string; is_enabled: boolean }> | undefined, code: string, defaultValue = false): boolean {
  const row = (features ?? []).find((item) => item.feature_code === code);
  return row ? Boolean(row.is_enabled) : defaultValue;
}

function featureConfig(features: Array<{ feature_code: string; config?: unknown }> | undefined, code: string): Record<string, unknown> | null {
  const row = (features ?? []).find((item) => item.feature_code === code);
  return row && row.config && typeof row.config === 'object' ? row.config as Record<string, unknown> : null;
}

function normalizeAllowedRoleCodes(rawValue: unknown): string[] {
  if (Array.isArray(rawValue)) {
    return Array.from(new Set(rawValue.map((value) => String(value).trim().toUpperCase()).filter((value) => value !== '')));
  }

  if (typeof rawValue === 'string') {
    return Array.from(new Set(rawValue
      .split(/[;,\n\r]+/)
      .map((value) => value.trim().toUpperCase())
      .filter((value) => value !== '')));
  }

  return [];
}

function resolveDefaultPaymentMethodId(paymentMethods: SalesLookups['payment_methods'] | undefined, fallbackId: number): number {
  const rows = paymentMethods ?? [];
  const preferred = rows.find((row) => {
    const code = String(row.code ?? '').trim().toUpperCase();
    const name = String(row.name ?? '').trim().toUpperCase();

    return code.includes('EFECT')
      || code.includes('CASH')
      || code.includes('CONTADO')
      || name.includes('EFECTIVO')
      || name.includes('CASH')
      || name.includes('CONTADO');
  });

  return preferred?.id ?? rows[0]?.id ?? fallbackId;
}

function featureSource(features: Array<{ feature_code: string; vertical_source?: string | null }> | undefined, code: string): 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | 'FALLBACK' {
  const row = (features ?? []).find((item) => item.feature_code === code);
  if (row?.vertical_source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'COMPANY_VERTICAL_OVERRIDE';
  }

  if (row?.vertical_source === 'VERTICAL_TEMPLATE') {
    return 'VERTICAL_TEMPLATE';
  }

  return 'FALLBACK';
}

function featureSourceLabel(source: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | 'FALLBACK'): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'Override empresa/rubro';
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return 'Template rubro';
  }

  return 'Fallback company/sucursal';
}

function featureSourceBadgeClass(source: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | 'FALLBACK'): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'appcfg-source-badge appcfg-source-badge--override';
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return 'appcfg-source-badge appcfg-source-badge--template';
  }

  return 'appcfg-source-badge appcfg-source-badge--fallback';
}

export function SalesView({ accessToken, branchId, warehouseId, cashRegisterId, activeVerticalCode, currentUserRoleCode, currentUserRoleProfile }: SalesViewProps) {
  const [lookups, setLookups] = useState<SalesLookups | null>(null);
  const [series, setSeries] = useState<SeriesNumber[]>([]);
  const [documents, setDocuments] = useState<CommercialDocumentListItem[]>([]);
  const [documentsMeta, setDocumentsMeta] = useState<PaginationMeta>({ page: 1, per_page: 10, total: 0, last_page: 1 });
  const [documentsPage, setDocumentsPage] = useState(1);
  const [documentViewFilter, setDocumentViewFilter] = useState<DocumentViewFilter>('ALL');
  const [customerSuggestions, setCustomerSuggestions] = useState<SalesCustomerSuggestion[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<InventoryProduct[]>([]);
  const [stockRows, setStockRows] = useState<InventoryStockRow[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [restaurantTables, setRestaurantTables] = useState<RestaurantTableRow[]>([]);
  const [referenceDocuments, setReferenceDocuments] = useState<SalesReferenceDocument[]>([]);
  const [loadingReferenceDocument, setLoadingReferenceDocument] = useState(false);
  const [form, setForm] = useState<CreateDocumentForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [sunatToast, setSunatToast] = useState<SunatToastState | null>(null);
  const [sunatSendingDocumentId, setSunatSendingDocumentId] = useState<number | null>(null);
  const [sunatBridgeDebugState, setSunatBridgeDebugState] = useState<SunatBridgeDebugState | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomerSuggestion | null>(null);
  const [customerVehicles, setCustomerVehicles] = useState<SalesCustomerVehicle[]>([]);
  const [loadingCustomerVehicles, setLoadingCustomerVehicles] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [selectedProductCommercialConfig, setSelectedProductCommercialConfig] = useState<ProductCommercialConfig | null>(null);
  const [selectedProductUnitOptions, setSelectedProductUnitOptions] = useState<SalesLookups['units']>([]);
  const [customerProfilePricingEnabled, setCustomerProfilePricingEnabled] = useState(false);
  const [autoPriceHint, setAutoPriceHint] = useState('');
  const [autoPriceSource, setAutoPriceSource] = useState<'MANUAL' | 'TIER' | 'PROFILE'>('MANUAL');
  const [autoPriceTierId, setAutoPriceTierId] = useState<number | null>(null);
  const [autoPriceDiscountPercent, setAutoPriceDiscountPercent] = useState(0);
  const [cart, setCart] = useState<SalesDraftItem[]>([]);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [customerInputFocused, setCustomerInputFocused] = useState(false);
  const [activeCustomerIndex, setActiveCustomerIndex] = useState(-1);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [resolvingCustomerDocument, setResolvingCustomerDocument] = useState(false);
  const [issuedPreview, setIssuedPreview] = useState<null | {
    id: number;
    document_kind: string;
    series: string;
    number: number;
    total: number;
    status: string;
    printable: PrintableSalesDocument;
  }>(null);
  const [previewDialog, setPreviewDialog] = useState<null | {
    title: string;
    subtitle: string;
    html: string;
    variant: 'compact' | 'wide';
  }>(null);
  const [creditPlanModalOpen, setCreditPlanModalOpen] = useState(false);
  const [convertPreviewModal, setConvertPreviewModal] = useState<null | {
    source: CommercialDocumentListItem;
    targetDocumentKind: 'INVOICE' | 'RECEIPT' | 'SALES_ORDER';
    details: PrintableSalesDocument | null;
    previewHtml: string;
    loading: boolean;
    error: string;
  }>(null);
  const [postConvertPrintModal, setPostConvertPrintModal] = useState<null | {
    title: string;
    subtitle: string;
    details: PrintableSalesDocument | null;
    loading: boolean;
    error: string;
  }>(null);
  const [documentFiltersDraft, setDocumentFiltersDraft] = useState<DocumentAdvancedFilters>(() => {
    if (typeof window === 'undefined') {
      return initialDocumentAdvancedFilters;
    }

    try {
      const raw = window.localStorage.getItem(SALES_REPORT_FILTERS_STORAGE_KEY);
      if (!raw) {
        return initialDocumentAdvancedFilters;
      }

      const parsed = JSON.parse(raw) as Partial<DocumentAdvancedFilters>;
      return {
        customer: typeof parsed.customer === 'string' ? parsed.customer : '',
        customerId: typeof parsed.customerId === 'string' ? parsed.customerId : '',
        customerVehicleId: typeof parsed.customerVehicleId === 'string' ? parsed.customerVehicleId : '',
        sourceOrigin: parsed.sourceOrigin === 'RESTAURANT' ? 'RESTAURANT' : '',
        issueDateFrom: typeof parsed.issueDateFrom === 'string' ? parsed.issueDateFrom : '',
        issueDateTo: typeof parsed.issueDateTo === 'string' ? parsed.issueDateTo : '',
        series: typeof parsed.series === 'string' ? parsed.series : '',
        number: typeof parsed.number === 'string' ? parsed.number : '',
        status: typeof parsed.status === 'string' ? parsed.status : '',
      };
    } catch {
      return initialDocumentAdvancedFilters;
    }
  });
  const [documentFiltersApplied, setDocumentFiltersApplied] = useState<DocumentAdvancedFilters>(initialDocumentAdvancedFilters);
  const [exportingDocuments, setExportingDocuments] = useState(false);
  const [reportCustomerInputFocused, setReportCustomerInputFocused] = useState(false);
  const [reportCustomerSuggestions, setReportCustomerSuggestions] = useState<SalesCustomerSuggestion[]>([]);
  const [reportCustomerVehicles, setReportCustomerVehicles] = useState<SalesCustomerVehicle[]>([]);
  const [loadingReportCustomerVehicles, setLoadingReportCustomerVehicles] = useState(false);

  const documentKindLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    (lookups?.document_kinds ?? []).forEach((row) => {
      const code = String(row.code ?? '').trim().toUpperCase();
      const label = String(row.label ?? '').trim();
      if (code !== '' && label !== '') {
        map.set(code, label);
      }
    });
    return map;
  }, [lookups?.document_kinds]);

  function docKindLabelResolved(code: string | null | undefined): string {
    if (!code) {
      return '-';
    }

    const normalized = code.trim().toUpperCase();
    return documentKindLabelMap.get(normalized) ?? docKindLabel(code);
  }

  const [salesWorkspaceMode, setSalesWorkspaceMode] = useState<SalesWorkspaceMode>('SELL');
  const [cashierReportPanelMode, setCashierReportPanelMode] = useState<CashierReportPanelMode>('FULL');
  const [salesFlowMode, setSalesFlowMode] = useState<SalesFlowMode>('DIRECT_CASHIER');
  const [seriesExpanded, setSeriesExpanded] = useState(false);
  const [cashierDefaultApplied, setCashierDefaultApplied] = useState(false);
  const [showModeSummaryDetails, setShowModeSummaryDetails] = useState(false);
  const [showRuntimeConfig, setShowRuntimeConfig] = useState(false);
  const [priceTaxMode, setPriceTaxMode] = useState<PriceTaxMode>('INCLUSIVE');
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [editingDocumentContext, setEditingDocumentContext] = useState<EditingDocumentContext | null>(null);
  const [focusDocumentId, setFocusDocumentId] = useState<number | null>(null);
  const [highlightedDocumentId, setHighlightedDocumentId] = useState<number | null>(null);
  const [pinnedDocumentId, setPinnedDocumentId] = useState<number | null>(null);

  const normalizedRoleCode = (currentUserRoleCode ?? '').toUpperCase();
  const normalizedRoleProfile = (currentUserRoleProfile ?? '').toUpperCase();
  const isSellerUser = normalizedRoleProfile === 'SELLER' || normalizedRoleCode.includes('VENDED') || normalizedRoleCode.includes('SELLER');
  const isAdminUser = normalizedRoleCode.includes('ADMIN');
  const isCashierUser = normalizedRoleProfile === 'CASHIER' || normalizedRoleCode.includes('CAJA') || normalizedRoleCode.includes('CAJER') || normalizedRoleCode.includes('CASHIER');
  const isTechnicalUser = isAdminUser
    || normalizedRoleCode.includes('SOPORTE')
    || normalizedRoleCode.includes('TECH')
    || normalizedRoleCode.includes('TECNIC')
    || normalizedRoleCode.includes('SISTEM')
    || normalizedRoleCode.includes('DEV');
  const isSeparatedMode = salesFlowMode === 'SELLER_TO_CASHIER';
  const isRestaurantVertical = (activeVerticalCode ?? '').toUpperCase() === 'RESTAURANT';
  const canUseSellWorkspace = true;
  const shouldPrioritizePendingOrders = isSeparatedMode && isCashierUser;
  const canConvertInCurrentMode = !isSeparatedMode || (isCashierUser && !isAdminUser);
  const canEditDraftInCurrentMode = featureEnabled(lookups?.commerce_features, 'SALES_ALLOW_DRAFT_EDIT', true);
  const canEditIssuedBeforeSunatFinalInCurrentMode = featureEnabled(
    lookups?.commerce_features,
    'SALES_ALLOW_ISSUED_EDIT_BEFORE_SUNAT_FINAL',
    true
  );
  const allowVoidForSeller = featureEnabled(lookups?.commerce_features, 'SALES_ALLOW_VOID_FOR_SELLER', true);
  const allowVoidForCashier = featureEnabled(lookups?.commerce_features, 'SALES_ALLOW_VOID_FOR_CASHIER', true);
  const allowVoidForAdmin = featureEnabled(lookups?.commerce_features, 'SALES_ALLOW_VOID_FOR_ADMIN', true);
  const canVoidByProfile = isAdminUser
    ? allowVoidForAdmin
    : isCashierUser
      ? allowVoidForCashier
      : isSellerUser
        ? allowVoidForSeller
        : false;
  const canVoidDocumentsInCurrentMode = featureEnabled(lookups?.commerce_features, 'SALES_ALLOW_DOCUMENT_VOID', true) && canVoidByProfile;
  const reverseStockOnVoidEnabled = featureEnabled(lookups?.commerce_features, 'SALES_VOID_REVERSE_STOCK', true);
  const stockByProductId = useMemo(() => {
    const stockMap = new Map<number, number>();
    stockRows.forEach((row) => {
      const current = stockMap.get(row.product_id) ?? 0;
      stockMap.set(row.product_id, current + Number(row.stock ?? 0));
    });
    return stockMap;
  }, [stockRows]);
  const advancesEnabled = featureEnabled(lookups?.commerce_features, 'SALES_ANTICIPO_ENABLED', false);
  const salesGlobalDiscountEnabled = featureEnabled(lookups?.commerce_features, 'SALES_GLOBAL_DISCOUNT_ENABLED', false);
  const salesItemDiscountEnabled = featureEnabled(lookups?.commerce_features, 'SALES_ITEM_DISCOUNT_ENABLED', false);
  const salesFreeItemsEnabled = featureEnabled(lookups?.commerce_features, 'SALES_FREE_ITEMS_ENABLED', false);
  const workshopMultiVehicleEnabled = featureEnabled(lookups?.commerce_features, 'SALES_WORKSHOP_MULTI_VEHICLE', false);
  const taxBridgeEnabled = featureEnabled(lookups?.commerce_features, 'SALES_TAX_BRIDGE', false);
  const taxBridgeDebugEnabled = featureEnabled(lookups?.commerce_features, 'SALES_TAX_BRIDGE_DEBUG_VIEW', false);
  const taxBridgeDebugConfig = featureConfig(lookups?.commerce_features, 'SALES_TAX_BRIDGE_DEBUG_VIEW');
  const taxBridgeDebugAllowedRoleCodes = normalizeAllowedRoleCodes(taxBridgeDebugConfig?.allowed_role_codes);
  const canViewTaxBridgeDebug = taxBridgeEnabled
    && taxBridgeDebugEnabled
    && (
      taxBridgeDebugAllowedRoleCodes.length > 0
        ? taxBridgeDebugAllowedRoleCodes.includes(normalizedRoleCode) || taxBridgeDebugAllowedRoleCodes.includes(normalizedRoleProfile)
        : isTechnicalUser
    );
  const sellerToCashierSource = featureSource(lookups?.commerce_features, 'SALES_SELLER_TO_CASHIER');
  const taxBridgeSource = featureSource(lookups?.commerce_features, 'SALES_TAX_BRIDGE');
  const documentVoidSource = featureSource(lookups?.commerce_features, 'SALES_ALLOW_DOCUMENT_VOID');
  const salesFlowModeLabel = salesFlowMode === 'SELLER_TO_CASHIER'
    ? 'Vendedor -> Caja independiente'
    : 'Venta directa en punto de venta';
  const activeProfileLabel = isSellerUser ? 'Vendedor' : isCashierUser ? 'Caja' : 'No identificado';
  const activeProfileHint = isSellerUser
    ? 'Genera pedido comercial; caja realiza la emision final.'
    : isCashierUser
      ? 'Inicia en pedidos pendientes para conversion y emision.'
      : 'Configura un perfil VENDEDOR/CAJERO para separar flujos.';

  useEffect(() => {
    if (!isRestaurantVertical) {
      setRestaurantTables([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchRestaurantTables(accessToken, { branchId });
        if (!cancelled) {
          setRestaurantTables(response.data ?? []);
        }
      } catch {
        if (!cancelled) {
          setRestaurantTables([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, branchId, isRestaurantVertical]);

  useEffect(() => {
    const currentDocumentKind = salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser ? 'QUOTATION' : form.documentKind;

    if (!isRestaurantVertical || currentDocumentKind !== 'SALES_ORDER') {
      if (!form.restaurantTableId && !form.restaurantTableLabel) {
        return;
      }

      setForm((prev) => ({
        ...prev,
        restaurantTableId: null,
        restaurantTableLabel: '',
      }));
      return;
    }

    if (!form.restaurantTableId) {
      return;
    }

    const selected = restaurantTables.find((row) => row.id === form.restaurantTableId);

    if (!selected) {
      setForm((prev) => ({
        ...prev,
        restaurantTableId: null,
        restaurantTableLabel: '',
      }));
      return;
    }

    if (form.restaurantTableLabel !== selected.name) {
      setForm((prev) => ({
        ...prev,
        restaurantTableLabel: selected.name,
      }));
    }
  }, [form.documentKind, form.restaurantTableId, form.restaurantTableLabel, isCashierUser, isRestaurantVertical, restaurantTables, salesFlowMode]);

  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusedReportRowRef = useRef<HTMLTableRowElement | null>(null);
  const suppressNextPinnedResetRef = useRef(false);
  const suppressNextCustomerAutocompleteRef = useRef(false);
  const suppressNextProductAutocompleteRef = useRef(false);
  const suppressNextReportCustomerAutocompleteRef = useRef(false);
  const productAutocompleteRequestSeqRef = useRef(0);
  const customerVehiclesRequestSeqRef = useRef(0);
  const reportCustomerVehiclesRequestSeqRef = useRef(0);
  const lastBootstrapScopeRef = useRef('');
  const documentsRequestSeqRef = useRef(0);
  const seriesCacheRef = useRef<Map<string, SeriesNumber[]>>(new Map());
  const stockLoadedScopeRef = useRef('');

  useEffect(() => {
    if (!sunatToast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSunatToast(null);
    }, 9000);

    return () => window.clearTimeout(timeoutId);
  }, [sunatToast]);

  useEffect(() => {
    if (salesWorkspaceMode !== 'REPORT' || focusDocumentId === null) {
      return;
    }

    const existsInCurrentPage = documents.some((row) => Number(row.id) === focusDocumentId);
    if (!existsInCurrentPage) {
      return;
    }

    const rowEl = focusedReportRowRef.current;
    if (!rowEl) {
      return;
    }

    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    setHighlightedDocumentId(focusDocumentId);
    setFocusDocumentId(null);
  }, [documents, focusDocumentId, salesWorkspaceMode]);

  useEffect(() => {
    if (highlightedDocumentId === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedDocumentId(null);
    }, 3400);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedDocumentId]);

  useEffect(() => {
    if (suppressNextPinnedResetRef.current) {
      suppressNextPinnedResetRef.current = false;
      return;
    }

    setPinnedDocumentId(null);
  }, [documentViewFilter, documentsPage]);

  const isTributaryDocument = useMemo(() => {
    const row = (lookups?.document_kinds ?? []).find((item) => item.code === form.documentKind);
    if (row) {
      return row.kind_group !== 'PRE_DOCUMENT';
    }
    return TRIBUTARY_DOCUMENTS.includes(form.documentKind);
  }, [form.documentKind, lookups?.document_kinds]);
  const effectiveDocumentKind = salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser ? 'QUOTATION' : form.documentKind;
  const selectedEffectiveDocumentKind = useMemo(() => {
    return (lookups?.document_kinds ?? []).find((row) => row.code === effectiveDocumentKind) ?? null;
  }, [effectiveDocumentKind, lookups?.document_kinds]);
  const effectiveDocumentKindBase = selectedEffectiveDocumentKind?.base_kind ?? resolveDocumentKindBase(effectiveDocumentKind);
  const effectiveDocumentKindGroup = selectedEffectiveDocumentKind?.kind_group
    ?? (effectiveDocumentKindBase === 'QUOTATION' || effectiveDocumentKindBase === 'SALES_ORDER' ? 'PRE_DOCUMENT' : 'TRIBUTARY');
  const noteTargetDocumentKind = selectedEffectiveDocumentKind?.note_target_kind ?? null;
  const isCreditNote = effectiveDocumentKindGroup === 'NOTE_CREDIT';
  const isDebitNote = effectiveDocumentKindGroup === 'NOTE_DEBIT';
  const isNoteDocument = isCreditNote || isDebitNote;
  const isCurrentPreDocument = effectiveDocumentKindGroup === 'PRE_DOCUMENT';
  const canCreateDocumentInCurrentMode = !isSeparatedMode || !isCashierUser || !isCurrentPreDocument;
  const activeNoteReasons = isCreditNote
    ? ((lookups?.credit_note_reasons ?? []).length > 0 ? (lookups?.credit_note_reasons ?? []) : DEFAULT_CREDIT_NOTE_REASONS)
    : isDebitNote
      ? ((lookups?.debit_note_reasons ?? []).length > 0 ? (lookups?.debit_note_reasons ?? []) : DEFAULT_DEBIT_NOTE_REASONS)
      : [];
  const selectedReferenceDocument = referenceDocuments.find((row) => row.id === Number(form.noteAffectedDocumentId ?? 0)) ?? null;

  const selectedTaxCategory = useMemo(() => {
    return lookups?.tax_categories.find((row) => row.id === form.taxCategoryId) ?? null;
  }, [lookups, form.taxCategoryId]);

  const draftTaxRate = useMemo(() => {
    if (!isTributaryDocument) {
      return 0;
    }

    return Number(selectedTaxCategory?.rate_percent ?? 0);
  }, [isTributaryDocument, selectedTaxCategory]);

  const inventorySettings = lookups?.inventory_settings ?? null;
  const inventoryProEnabled = Boolean(inventorySettings?.enable_inventory_pro);
  const lotTrackingEnabled = inventoryProEnabled && Boolean(inventorySettings?.enable_lot_tracking);
  const lotOutflowStrategy = inventorySettings?.lot_outflow_strategy ?? 'MANUAL';
  const manualLotSelectionEnabled = lotTrackingEnabled && lotOutflowStrategy === 'MANUAL';
  const resolvedDraftLotId = !manualLotSelectionEnabled || form.isManualItem ? null : form.lotId;

  const isDraftPriceTaxInclusive = isTributaryDocument && priceTaxMode === 'INCLUSIVE';
  const draftLineTotals = useMemo(() => {
    return computeLineTotals(Number(form.qty), Number(form.unitPrice), draftTaxRate, isDraftPriceTaxInclusive);
  }, [draftTaxRate, form.qty, form.unitPrice, isDraftPriceTaxInclusive]);
  const draftSubtotal = useMemo(() => draftLineTotals.subtotal, [draftLineTotals]);
  const draftTaxTotal = useMemo(() => draftLineTotals.tax, [draftLineTotals]);
  const draftLineDiscountTotal = useMemo(() => {
    if (!salesItemDiscountEnabled && !salesFreeItemsEnabled) {
      return 0;
    }

    return computeSalesDraftAmounts({
      productId: form.isManualItem ? null : form.productId,
      unitId: form.unitId,
      lotId: resolvedDraftLotId,
      taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
      priceIncludesTax: isDraftPriceTaxInclusive,
      taxRate: draftTaxRate,
      taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
      isManual: form.isManualItem,
      description: '',
      qty: Number(form.qty),
      unitPrice: Number(form.unitPrice),
      discountTotal: salesItemDiscountEnabled ? Number(form.draftLineDiscount ?? 0) : 0,
      isFreeOperation: salesFreeItemsEnabled ? Boolean(form.draftIsFreeOperation) : false,
    }).discountTotal;
  }, [draftTaxRate, form.draftIsFreeOperation, form.draftLineDiscount, form.isManualItem, form.productId, form.qty, form.taxCategoryId, form.unitId, form.unitPrice, isDraftPriceTaxInclusive, isTributaryDocument, resolvedDraftLotId, salesFreeItemsEnabled, salesItemDiscountEnabled, selectedTaxCategory]);
  const draftGrandTotal = useMemo(() => Math.max(draftLineTotals.total - draftLineDiscountTotal, 0), [draftLineDiscountTotal, draftLineTotals.total]);
  const draftConversionFactor = useMemo(() => {
    if (form.isManualItem) {
      return 1;
    }

    return resolveConversionFactor(selectedProductCommercialConfig, form.unitId);
  }, [form.isManualItem, form.unitId, selectedProductCommercialConfig]);
  const draftQtyBase = useMemo(() => Number(form.qty || 0) * Number(draftConversionFactor || 1), [form.qty, draftConversionFactor]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const line = computeSalesDraftAmounts(item);
      return acc + line.subtotal;
    }, 0);
  }, [cart]);
  const taxTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const line = computeSalesDraftAmounts(item);
      return acc + line.tax;
    }, 0);
  }, [cart]);
  const itemDiscountTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + computeSalesDraftAmounts(item).discountTotal, 0);
  }, [cart]);
  const globalDiscountAmount = useMemo(() => {
    if (!salesGlobalDiscountEnabled) {
      return 0;
    }

    return Math.min(
      Math.max(Number(form.globalDiscountAmount ?? 0), 0),
      Math.max(subtotal + taxTotal - itemDiscountTotal, 0)
    );
  }, [form.globalDiscountAmount, itemDiscountTotal, salesGlobalDiscountEnabled, subtotal, taxTotal]);
  const grandTotal = useMemo(() => Math.max(subtotal + taxTotal - itemDiscountTotal - globalDiscountAmount, 0), [globalDiscountAmount, itemDiscountTotal, subtotal, taxTotal]);
  const creditInstallments = form.creditInstallments ?? [];
  const normalizedAdvanceAmount = Math.max(0, Number(form.advanceAmount ?? 0));
  const cappedAdvanceAmount = Math.min(normalizedAdvanceAmount, grandTotal);
  const creditPendingTotal = Math.max(0, Number((grandTotal - cappedAdvanceAmount).toFixed(2)));
  const creditInstallmentsTotal = creditInstallments.reduce((acc, row) => acc + Number(row.amount ?? 0), 0);
  const creditObservationCount = creditInstallments.filter((row) => String(row.observation ?? '').trim() !== '').length;
  const isPaymentMethodCredit = useMemo(() => {
    const row = (lookups?.payment_methods ?? []).find((item) => item.id === form.paymentMethodId);
    const code = String(row?.code ?? '').toUpperCase();
    const name = String(row?.name ?? '').toUpperCase();
    return code.includes('CREDIT') || code.includes('CREDITO') || name.includes('CREDITO') || name.includes('CRÉDITO');
  }, [lookups?.payment_methods, form.paymentMethodId]);

  const isInvoiceDocument = effectiveDocumentKindBase === 'INVOICE';
  const selectedDetractionService = useMemo(() => {
    if (!isInvoiceDocument || !form.hasDetraccion || !form.detraccionServiceCode) {
      return null;
    }
    return (lookups?.detraccion_service_codes ?? []).find((row) => row.code === form.detraccionServiceCode) ?? null;
  }, [isInvoiceDocument, form.hasDetraccion, form.detraccionServiceCode, lookups?.detraccion_service_codes]);

  const detraccionRate = useMemo(() => selectedDetractionService?.rate_percent ?? 0, [selectedDetractionService]);
  const detraccionAmount = useMemo(() => {
    return form.hasDetraccion && detraccionRate > 0 ? Number((grandTotal * detraccionRate / 100).toFixed(2)) : 0;
  }, [form.hasDetraccion, detraccionRate, grandTotal]);

  const retencionTypes = lookups?.retencion_types ?? [];
  const percepcionTypes = lookups?.percepcion_types ?? [];
  const sunatOperationTypes = lookups?.sunat_operation_types ?? [];
  const pickOperationTypeCode = (regime: 'NONE' | 'DETRACCION' | 'RETENCION' | 'PERCEPCION'): string => {
    return (
      sunatOperationTypes.find((row) => (row.regime ?? 'NONE') === regime)?.code
      ?? sunatOperationTypes.find((row) => (row.regime ?? 'NONE') === 'NONE')?.code
      ?? sunatOperationTypes.find((row) => row.code === '0101')?.code
      ?? sunatOperationTypes[0]?.code
      ?? ''
    );
  };
  const selectedRetencionType = useMemo(() => {
    if (!form.hasRetencion) {
      return null;
    }

    if (!form.retencionTypeCode) {
      return retencionTypes[0] ?? null;
    }

    return retencionTypes.find((row) => row.code === form.retencionTypeCode) ?? retencionTypes[0] ?? null;
  }, [form.hasRetencion, form.retencionTypeCode, retencionTypes]);

  const retencionPercentage = selectedRetencionType?.rate_percent ?? lookups?.retencion_percentage ?? 3.00;
  const retencionAmount = useMemo(() => {
    return form.hasRetencion ? Number((grandTotal * retencionPercentage / 100).toFixed(2)) : 0;
  }, [form.hasRetencion, retencionPercentage, grandTotal]);

  const selectedPercepcionType = useMemo(() => {
    if (!form.hasPercepcion) {
      return null;
    }

    if (!form.percepcionTypeCode) {
      return percepcionTypes[0] ?? null;
    }

    return percepcionTypes.find((row) => row.code === form.percepcionTypeCode) ?? percepcionTypes[0] ?? null;
  }, [form.hasPercepcion, form.percepcionTypeCode, percepcionTypes]);

  const percepcionPercentage = selectedPercepcionType?.rate_percent ?? 2.00;
  const percepcionAmount = useMemo(() => {
    return form.hasPercepcion ? Number((grandTotal * percepcionPercentage / 100).toFixed(2)) : 0;
  }, [form.hasPercepcion, percepcionPercentage, grandTotal]);

  const selectedSunatOperationType = useMemo(() => {
    if (!(form.hasDetraccion || form.hasRetencion || form.hasPercepcion)) {
      return null;
    }

    if (!form.sunatOperationTypeCode) {
      if (form.hasDetraccion) {
        return sunatOperationTypes.find((row) => (row.regime ?? 'NONE') === 'DETRACCION') ?? null;
      }
      if (form.hasRetencion) {
        return sunatOperationTypes.find((row) => (row.regime ?? 'NONE') === 'RETENCION') ?? null;
      }
      if (form.hasPercepcion) {
        return sunatOperationTypes.find((row) => (row.regime ?? 'NONE') === 'PERCEPCION') ?? null;
      }
      return null;
    }

    return sunatOperationTypes.find((row) => row.code === form.sunatOperationTypeCode) ?? null;
  }, [form.hasDetraccion, form.hasRetencion, form.hasPercepcion, form.sunatOperationTypeCode, sunatOperationTypes]);

  useEffect(() => {
    if (!selectedSunatOperationType) {
      return;
    }

    const regime = selectedSunatOperationType.regime ?? 'NONE';
    if (regime !== 'DETRACCION' && regime !== 'RETENCION' && regime !== 'PERCEPCION') {
      return;
    }

    setForm((prev) => {
      const nextState = {
        ...prev,
        hasDetraccion: regime === 'DETRACCION',
        hasRetencion: regime === 'RETENCION',
        hasPercepcion: regime === 'PERCEPCION',
        detraccionServiceCode: regime === 'DETRACCION' ? prev.detraccionServiceCode : '',
        retencionTypeCode: regime === 'RETENCION' ? (prev.retencionTypeCode || (retencionTypes[0]?.code ?? '')) : '',
        percepcionTypeCode: regime === 'PERCEPCION' ? (prev.percepcionTypeCode || (percepcionTypes[0]?.code ?? '')) : '',
      };

      if (
        nextState.hasDetraccion === prev.hasDetraccion &&
        nextState.hasRetencion === prev.hasRetencion &&
        nextState.hasPercepcion === prev.hasPercepcion &&
        nextState.detraccionServiceCode === prev.detraccionServiceCode &&
        nextState.retencionTypeCode === prev.retencionTypeCode &&
        nextState.percepcionTypeCode === prev.percepcionTypeCode
      ) {
        return prev;
      }

      return nextState;
    });
  }, [selectedSunatOperationType, retencionTypes, percepcionTypes]);

  const detractionMinAmount = lookups?.detraccion_min_amount ?? 700;
  const detractionAutoEligible = isInvoiceDocument
    && (lookups?.detraccion_service_codes ?? []).length > 0
    && grandTotal >= detractionMinAmount;

  const selectedCurrency = useMemo(() => {
    return lookups?.currencies.find((row) => row.id === form.currencyId) ?? null;
  }, [lookups, form.currencyId]);

  const defaultEnabledUnit = useMemo(() => {
    return lookups?.units?.[0] ?? null;
  }, [lookups]);

  useEffect(() => {
    if (!detractionAutoEligible) {
      return;
    }

    setForm((prev) => {
      if (prev.hasDetraccion || prev.hasRetencion || prev.hasPercepcion) {
        return prev;
      }

      return {
        ...prev,
        hasDetraccion: true,
        sunatOperationTypeCode: prev.sunatOperationTypeCode || pickOperationTypeCode('DETRACCION'),
      };
    });
  }, [detractionAutoEligible, sunatOperationTypes]);

  useEffect(() => {
    setForm((prev) => {
      if (isPaymentMethodCredit) {
        if (prev.isCreditSale) {
          return prev;
        }

        return {
          ...prev,
          isCreditSale: true,
        };
      }

      if (!prev.isCreditSale && (prev.creditInstallments ?? []).length === 0) {
        return prev;
      }

      return {
        ...prev,
        isCreditSale: false,
        creditInstallments: [],
      };
    });
  }, [isPaymentMethodCredit]);

  useEffect(() => {
    if (advancesEnabled) {
      return;
    }

    setForm((prev) => {
      if (!prev.advanceAmount) {
        return prev;
      }
      return {
        ...prev,
        advanceAmount: 0,
      };
    });
  }, [advancesEnabled]);

  useEffect(() => {
    if (!form.isCreditSale) {
      return;
    }

    const current = form.creditInstallments ?? [];
    if (current.length > 0) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      creditInstallments: [createCreditInstallmentRow(
        prev.dueDate || prev.issueDate || TODAY,
        Math.max(0, grandTotal - Math.max(0, Number(prev.advanceAmount ?? 0)))
      )],
    }));
  }, [form.isCreditSale, form.creditInstallments, grandTotal]);

  useEffect(() => {
    if (form.isCreditSale) {
      return;
    }

    setCreditPlanModalOpen(false);
  }, [form.isCreditSale]);

  const canAddDraftItem = useMemo(() => {
    if (isNoteDocument) {
      return false;
    }

    const validTax = !isTributaryDocument || Boolean(form.taxCategoryId);

    if (!validTax || form.qty <= 0 || Number(form.unitPrice) < 0) {
      return false;
    }

    if (form.isManualItem) {
      return form.manualDescription.trim().length > 0;
    }

    const lotIsValid = !manualLotSelectionEnabled || lots.length === 0 || Boolean(form.lotId);

    return Boolean(selectedProduct && lotIsValid);
  }, [
    form.isManualItem,
    form.manualDescription,
    form.qty,
    form.taxCategoryId,
    form.unitPrice,
    isTributaryDocument,
    manualLotSelectionEnabled,
    lots.length,
    resolvedDraftLotId,
    selectedProduct,
    isNoteDocument,
  ]);

  const canSubmitDocument = useMemo(() => {
    if (!canCreateDocumentInCurrentMode) {
      return false;
    }

    if (!form.customerId || !form.series) {
      return false;
    }

    if (cart.length > 0) {
      return true;
    }

    return canAddDraftItem;
  }, [canAddDraftItem, canCreateDocumentInCurrentMode, cart.length, form.customerId, form.series]);

  const previewItems = useMemo(() => {
    if (cart.length > 0) {
      return cart;
    }

    if (!canAddDraftItem) {
      return [] as SalesDraftItem[];
    }

    const draftDescription = form.isManualItem
      ? form.manualDescription.trim()
      : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim();

    return [
      {
        productId: form.isManualItem ? null : form.productId,
        unitId: form.unitId,
        lotId: resolvedDraftLotId,
        priceTierId: form.isManualItem ? null : autoPriceTierId,
        wholesaleDiscountPercent: form.isManualItem ? null : autoPriceDiscountPercent,
        priceSource: form.isManualItem ? 'MANUAL' : autoPriceSource,
        taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
        priceIncludesTax: isDraftPriceTaxInclusive,
        qtyBase: form.isManualItem ? null : Number(draftQtyBase),
        conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
        baseUnitPrice:
          form.isManualItem
            ? null
            : Number(
                (isDraftPriceTaxInclusive && draftTaxRate > 0
                  ? Number(form.unitPrice || 0) / (1 + (draftTaxRate / 100))
                  : Number(form.unitPrice || 0))
              ) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
        taxRate: isTributaryDocument ? Number(selectedTaxCategory?.rate_percent ?? 0) : 0,
        taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
        isManual: form.isManualItem,
        description: draftDescription,
        qty: Number(form.qty),
        unitPrice: Number(form.unitPrice),
        discountTotal: salesItemDiscountEnabled ? Number(form.draftLineDiscount ?? 0) : 0,
        isFreeOperation: salesFreeItemsEnabled ? Boolean(form.draftIsFreeOperation) : false,
      },
    ];
  }, [
    canAddDraftItem,
    cart,
    draftConversionFactor,
    draftQtyBase,
    draftTaxRate,
    form.draftIsFreeOperation,
    form.draftLineDiscount,
    form.isManualItem,
    form.manualDescription,
    form.productId,
    form.qty,
    form.taxCategoryId,
    form.unitId,
    form.unitPrice,
    isDraftPriceTaxInclusive,
    isTributaryDocument,
    resolvedDraftLotId,
    salesFreeItemsEnabled,
    salesItemDiscountEnabled,
    selectedProduct,
    selectedTaxCategory,
  ]);

  const tributaryPreview = useMemo(() => {
    const activeIgvRate = Number(lookups?.active_igv_rate_percent ?? 18);
    const base = {
      discountTotal: 0,
      inafectaTotal: 0,
      exoneradaTotal: 0,
      gravadaTotal: 0,
      igvTotal: 0,
      igvRateLabel: activeIgvRate,
      icbperTotal: 0,
      gratuitaTotal: 0,
      otherChargesTotal: 0,
      grandTotal: 0,
    };

    if (!isTributaryDocument || previewItems.length === 0) {
      return base;
    }

    const categories = lookups?.tax_categories ?? [];
    let firstGravadaRate: number | null = null;

    for (const item of previewItems) {
      const category = categories.find((row) => row.id === item.taxCategoryId) ?? null;
      const code = String(category?.code ?? '').trim();
      const ratePercent = Number(item.taxRate ?? category?.rate_percent ?? 0);
      const line = computeSalesDraftAmounts({
        ...item,
        taxRate: ratePercent,
      });
      const subtotalValue = line.subtotal;
      const taxValue = line.tax;

      const isFreeTransfer = code === '21' || code === '37' || line.isFreeOperation;
      const isGravada = /^1\d$/.test(code);
      const isExonerada = /^2\d$/.test(code) && !isFreeTransfer;
      const isInafecta = /^3\d$/.test(code) && !isFreeTransfer;

      if (isFreeTransfer) {
        base.gratuitaTotal += line.gratuitaTotal || subtotalValue;
        base.discountTotal += line.discountTotal;
      } else if (isGravada) {
        base.gravadaTotal += subtotalValue;
        base.igvTotal += taxValue;
        base.discountTotal += line.discountTotal;

        if (firstGravadaRate === null && ratePercent > 0) {
          firstGravadaRate = ratePercent;
        }
      } else if (isExonerada) {
        base.exoneradaTotal += subtotalValue;
        base.discountTotal += line.discountTotal;
      } else if (isInafecta) {
        base.inafectaTotal += subtotalValue;
        base.discountTotal += line.discountTotal;
      } else {
        if (ratePercent > 0) {
          base.gravadaTotal += subtotalValue;
          base.igvTotal += taxValue;
        } else {
          base.inafectaTotal += subtotalValue;
        }
        base.discountTotal += line.discountTotal;
      }
    }

    base.igvRateLabel = firstGravadaRate !== null ? firstGravadaRate : activeIgvRate;
    base.grandTotal =
      base.gravadaTotal +
      base.exoneradaTotal +
      base.inafectaTotal +
      base.igvTotal +
      base.otherChargesTotal -
      globalDiscountAmount -
      base.discountTotal;

    if (base.grandTotal < 0) {
      base.grandTotal = 0;
    }

    return base;
  }, [globalDiscountAmount, isTributaryDocument, lookups, previewItems]);

  const previewSummaryTotals = useMemo(() => {
    return previewItems.reduce((acc, item) => {
      const line = computeSalesDraftAmounts(item);

      acc.subtotal += line.subtotal;
      acc.tax += line.tax;
      acc.discount += line.discountTotal;
      acc.total += line.finalTotal;
      return acc;
    }, { subtotal: 0, tax: 0, discount: globalDiscountAmount, total: -globalDiscountAmount });
  }, [globalDiscountAmount, previewItems]);

  async function loadData() {
    setMessage('');

    try {
      const resolvedCashRegisterId = shouldApplyCashRegisterFilter() ? cashRegisterId : null;
      const bootstrapScopeKey = `${branchId ?? 'null'}|${warehouseId ?? 'null'}|${resolvedCashRegisterId ?? 'null'}`;
      const shouldReloadLookups = !lookups || lastBootstrapScopeRef.current !== bootstrapScopeKey;

      const isCashierPendingQueue =
        shouldPrioritizePendingOrders
        && cashierReportPanelMode === 'PENDING'
        && documentViewFilter === 'PENDING_CONVERSION';

      let lookupRows: SalesLookups | null = lookups;

      if (shouldReloadLookups) {
        setLoadingBootstrap(true);
        const bootstrap = await fetchSalesBootstrap(accessToken, {
          branchId,
          warehouseId,
          cashRegisterId: resolvedCashRegisterId,
          includeDocuments: false,
        });

        lookupRows = bootstrap.lookups;
        lastBootstrapScopeRef.current = bootstrapScopeKey;

        setLookups(lookupRows);
        const commerceFeatures = lookupRows.commerce_features ?? [];
        const nextSalesFlowMode = resolveSalesFlowMode(commerceFeatures);
        setSalesFlowMode(nextSalesFlowMode);
        setCustomerProfilePricingEnabled(
          Boolean(commerceFeatures.find((row) => row.feature_code === 'SALES_CUSTOMER_PRICE_PROFILE')?.is_enabled)
        );

        const defaultCurrency = lookupRows.currencies.find((row) => row.is_default) ?? lookupRows.currencies[0];
        const defaultPaymentMethodId = resolveDefaultPaymentMethodId(lookupRows.payment_methods, initialForm.paymentMethodId || 1);
        const defaultTaxCategory = lookupRows.tax_categories.find((row) => Number(row.rate_percent) > 0)
          ?? lookupRows.tax_categories[0]
          ?? null;

        setForm((prev) => ({
          ...prev,
          currencyId: prev.currencyId || defaultCurrency?.id || 1,
          paymentMethodId: prev.paymentMethodId || defaultPaymentMethodId,
          unitId: prev.unitId || lookupRows?.units?.[0]?.id || null,
          taxCategoryId: prev.taxCategoryId || defaultTaxCategory?.id || null,
          documentKind: nextSalesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser ? 'QUOTATION' : prev.documentKind,
        }));
        setLoadingBootstrap(false);
      }

      if (salesWorkspaceMode === 'REPORT') {
        setLoadingDocuments(true);
        const documentKinds = lookupRows?.document_kinds ?? [];
        const requestSeq = documentsRequestSeqRef.current + 1;
        documentsRequestSeqRef.current = requestSeq;

        const docs = await fetchCommercialDocuments(accessToken, {
          branchId,
          warehouseId,
          cashRegisterId: resolvedCashRegisterId,
          ...buildDocumentFilterParams(
            isCashierPendingQueue ? 'PENDING_CONVERSION' : documentViewFilter,
            documentKinds
          ),
          sourceOrigin: documentFiltersApplied.sourceOrigin || undefined,
          status: documentFiltersApplied.status || undefined,
          customer: documentFiltersApplied.customer || undefined,
          customerId: documentFiltersApplied.customerId ? Number(documentFiltersApplied.customerId) : undefined,
          customerVehicleId: workshopMultiVehicleEnabled && documentFiltersApplied.customerVehicleId
            ? Number(documentFiltersApplied.customerVehicleId)
            : undefined,
          issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
          issueDateTo: documentFiltersApplied.issueDateTo || undefined,
          series: documentFiltersApplied.series || undefined,
          number: documentFiltersApplied.number || undefined,
          page: documentsPage,
          perPage: documentsMeta.per_page,
        });

        if (requestSeq === documentsRequestSeqRef.current) {
          setDocuments(docs.data ?? []);
          setDocumentsMeta(docs.meta ?? {
            page: documentsPage,
            per_page: documentsMeta.per_page,
            total: 0,
            last_page: 1,
          });
        }
        setLoadingDocuments(false);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar Sales';
      setMessage(text);
    } finally {
      setLoadingBootstrap(false);
      setLoadingDocuments(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, warehouseId, cashRegisterId, documentsPage, documentViewFilter, documentFiltersApplied, salesWorkspaceMode]);

  useEffect(() => {
    if (salesFlowMode !== 'SELLER_TO_CASHIER') {
      return;
    }

    setForm((prev) => ({
      ...prev,
      documentKind: isCashierUser ? prev.documentKind : 'QUOTATION',
    }));
  }, [isCashierUser, salesFlowMode]);

  useEffect(() => {
    if (!shouldPrioritizePendingOrders) {
      setCashierDefaultApplied(false);
      return;
    }

    if (!cashierDefaultApplied && salesWorkspaceMode !== 'REPORT') {
      setSalesWorkspaceMode('REPORT');
    }

    if (!cashierDefaultApplied && cashierReportPanelMode === 'PENDING' && documentViewFilter !== 'PENDING_CONVERSION') {
      setDocumentViewFilter('PENDING_CONVERSION');
    }

    if (!cashierDefaultApplied && documentsPage !== 1) {
      setDocumentsPage(1);
    }

    if (!cashierDefaultApplied) {
      setCashierDefaultApplied(true);
    }
  }, [cashierDefaultApplied, cashierReportPanelMode, documentViewFilter, documentsPage, salesWorkspaceMode, shouldPrioritizePendingOrders]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SALES_REPORT_FILTERS_STORAGE_KEY, JSON.stringify(documentFiltersApplied));
  }, [documentFiltersApplied]);

  useEffect(() => {
    if (salesWorkspaceMode !== 'REPORT') {
      setReportCustomerSuggestions([]);
      setReportCustomerInputFocused(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        if (suppressNextReportCustomerAutocompleteRef.current) {
          suppressNextReportCustomerAutocompleteRef.current = false;
          setReportCustomerSuggestions([]);
          return;
        }

        if (!reportCustomerInputFocused) {
          setReportCustomerSuggestions([]);
          return;
        }

        const queryText = documentFiltersDraft.customer.trim();
        if (queryText.length < 2) {
          setReportCustomerSuggestions([]);
          return;
        }

        const rows = await fetchCustomerAutocomplete(accessToken, queryText);
        setReportCustomerSuggestions(rows.slice(0, 12));
      } catch {
        setReportCustomerSuggestions([]);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [accessToken, documentFiltersDraft.customer, reportCustomerInputFocused, salesWorkspaceMode]);

  useEffect(() => {
    if (!workshopMultiVehicleEnabled || salesWorkspaceMode !== 'REPORT') {
      setReportCustomerVehicles([]);
      setLoadingReportCustomerVehicles(false);
      return;
    }

    const customerId = Number(documentFiltersDraft.customerId || 0);
    if (customerId <= 0) {
      setReportCustomerVehicles([]);
      setLoadingReportCustomerVehicles(false);
      return;
    }

    const requestSeq = reportCustomerVehiclesRequestSeqRef.current + 1;
    reportCustomerVehiclesRequestSeqRef.current = requestSeq;
    setLoadingReportCustomerVehicles(true);

    void fetchCustomerVehicles(accessToken, customerId)
      .then((rows) => {
        if (requestSeq !== reportCustomerVehiclesRequestSeqRef.current) {
          return;
        }

        const activeRows = rows.filter((row) => Number(row.status) === 1);
        setReportCustomerVehicles(activeRows);

        setDocumentFiltersDraft((prev) => {
          if (Number(prev.customerId || 0) !== customerId) {
            return prev;
          }

          if (!prev.customerVehicleId) {
            return prev;
          }

          const hasCurrent = activeRows.some((row) => String(row.id) === String(prev.customerVehicleId));
          return hasCurrent ? prev : { ...prev, customerVehicleId: '' };
        });
      })
      .catch(() => {
        if (requestSeq !== reportCustomerVehiclesRequestSeqRef.current) {
          return;
        }

        setReportCustomerVehicles([]);
      })
      .finally(() => {
        if (requestSeq === reportCustomerVehiclesRequestSeqRef.current) {
          setLoadingReportCustomerVehicles(false);
        }
      });
  }, [accessToken, documentFiltersDraft.customerId, salesWorkspaceMode, workshopMultiVehicleEnabled]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (suppressNextCustomerAutocompleteRef.current) {
          suppressNextCustomerAutocompleteRef.current = false;
          setCustomerSuggestions([]);
          setActiveCustomerIndex(-1);
          return;
        }

        if (!customerInputFocused) {
          setCustomerSuggestions([]);
          setActiveCustomerIndex(-1);
          return;
        }

        if (form.customerQuery.trim().length < 2) {
          setCustomerSuggestions([]);
          setActiveCustomerIndex(-1);
          return;
        }

        const rows = await fetchCustomerAutocomplete(accessToken, form.customerQuery.trim());
        const compactRows = rows.slice(0, 12);
        setCustomerSuggestions(compactRows);
        setActiveCustomerIndex(compactRows.length > 0 ? 0 : -1);
      } catch {
        setCustomerSuggestions([]);
        setActiveCustomerIndex(-1);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [accessToken, form.customerQuery, customerInputFocused]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (suppressNextProductAutocompleteRef.current) {
          suppressNextProductAutocompleteRef.current = false;
          return;
        }

        if (form.productQuery.trim().length < PRODUCT_AUTOCOMPLETE_MIN_CHARS) {
          setProductSuggestions([]);
          setActiveProductIndex(-1);
          return;
        }

        const requestSeq = productAutocompleteRequestSeqRef.current + 1;
        productAutocompleteRequestSeqRef.current = requestSeq;

        const rows = await fetchSalesInventoryProducts(accessToken, {
          search: form.productQuery.trim(),
          warehouseId,
          limit: 20,
          autocomplete: true,
        });
        if (requestSeq !== productAutocompleteRequestSeqRef.current) {
          return;
        }
        const compactRows = rows.slice(0, 20);
        setProductSuggestions(compactRows);
        setActiveProductIndex(compactRows.length > 0 ? 0 : -1);
      } catch {
        setProductSuggestions([]);
        setActiveProductIndex(-1);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [accessToken, form.productQuery, warehouseId]);

  useEffect(() => {
    let cancelled = false;

    const stockScopeKey = `${warehouseId ?? 'null'}`;
    const shouldLoadStockRows =
      salesWorkspaceMode === 'SELL'
      && (form.productQuery.trim().length >= PRODUCT_AUTOCOMPLETE_MIN_CHARS || cart.length > 0);

    if (!shouldLoadStockRows) {
      return () => {
        cancelled = true;
      };
    }

    if (stockLoadedScopeRef.current === stockScopeKey && stockRows.length > 0) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const rows = await fetchSalesInventoryStock(accessToken, { warehouseId });
        if (!cancelled) {
          setStockRows(rows);
          stockLoadedScopeRef.current = stockScopeKey;
        }
      } catch {
        if (!cancelled) {
          setStockRows([]);
          stockLoadedScopeRef.current = '';
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, warehouseId, salesWorkspaceMode, form.productQuery, cart.length, stockRows.length]);

  useEffect(() => {
    if (!isNoteDocument || !form.customerId) {
      setReferenceDocuments([]);
      setLoadingReferenceDocument(false);
      setForm((prev) => ({
        ...prev,
        noteAffectedDocumentId: null,
        noteReasonCode: '',
      }));
      return;
    }

    let cancelled = false;

    setLoadingReferenceDocument(true);
    void (async () => {
      try {
        const rows = await fetchReferenceDocuments(accessToken, {
          customerId: Number(form.customerId),
          branchId,
          documentKindId: selectedEffectiveDocumentKind?.id ?? null,
          noteKind: isCreditNote ? 'CREDIT_NOTE' : isDebitNote ? 'DEBIT_NOTE' : null,
          limit: 120,
        });

        const fallbackRows = (rows.length === 0 && branchId)
          ? await fetchReferenceDocuments(accessToken, {
              customerId: Number(form.customerId),
              documentKindId: selectedEffectiveDocumentKind?.id ?? null,
              noteKind: isCreditNote ? 'CREDIT_NOTE' : isDebitNote ? 'DEBIT_NOTE' : null,
              limit: 120,
            })
          : rows;

        if (cancelled) {
          return;
        }

        const expectedTargetKind = noteTargetDocumentKind ?? 'RECEIPT';
        const allowedRows = fallbackRows.filter((row) => String(row.document_kind ?? '').toUpperCase() === expectedTargetKind);
        setReferenceDocuments(allowedRows);
        if (allowedRows.length === 0) {
          setMessage(`No hay comprobantes ${expectedTargetKind === 'RECEIPT' ? 'boleta' : 'factura'} disponibles para afectar con este cliente.`);
        }
        const hasCurrent = allowedRows.some((row) => row.id === Number(form.noteAffectedDocumentId ?? 0));
        const autoId = hasCurrent ? Number(form.noteAffectedDocumentId ?? 0) : (allowedRows[0]?.id ?? 0);

        setForm((prev) => ({
          ...prev,
          noteAffectedDocumentId: autoId > 0 ? autoId : null,
        }));

        if (autoId > 0) {
          void chooseReferenceDocument(autoId);
        } else {
          setCart([]);
        }
      } catch {
        if (!cancelled) {
          setReferenceDocuments([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingReferenceDocument(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, branchId, form.customerId, isCreditNote, isDebitNote, isNoteDocument, noteTargetDocumentKind, selectedEffectiveDocumentKind?.id]);

  useEffect(() => {
    if (!isNoteDocument) {
      return;
    }

    setForm((prev) => {
      if (prev.noteReasonCode && activeNoteReasons.some((row) => row.code === prev.noteReasonCode)) {
        return prev;
      }

      return {
        ...prev,
        noteReasonCode: activeNoteReasons[0]?.code ?? '',
      };
    });
  }, [activeNoteReasons, isNoteDocument]);

  useEffect(() => {
    if (!manualLotSelectionEnabled || form.isManualItem) {
      setLots([]);
      setForm((prev) => ({ ...prev, lotId: null }));
      return;
    }

    if (!form.productId) {
      setLots([]);
      return;
    }

    void (async () => {
      try {
        const rows = await fetchSalesInventoryLots(accessToken, { warehouseId });
        const byProduct = rows.filter((row) => row.product_id === form.productId);
        setLots(byProduct);

        if (byProduct.length > 0) {
          setForm((prev) => ({ ...prev, lotId: prev.lotId || byProduct[0].id }));
        }
      } catch {
        setLots([]);
      }
    })();
  }, [accessToken, form.isManualItem, form.productId, manualLotSelectionEnabled, warehouseId]);

  useEffect(() => {
    let cancelled = false;
    const requestedDocumentKind = effectiveDocumentKind;
    const seriesScopeKey = `${branchId ?? 'null'}|${warehouseId ?? 'null'}|${requestedDocumentKind}`;

    const cachedRows = seriesCacheRef.current.get(seriesScopeKey);
    if (cachedRows) {
      setSeries(cachedRows);
      setForm((prev) => ({
        ...prev,
        series: cachedRows.find((row) => row.series === prev.series)?.series ?? cachedRows[0]?.series ?? '',
      }));

      if (cachedRows.length === 0) {
        setMessage(`No hay series activas para ${requestedDocumentKind} en la sucursal/almacen seleccionados. Configura la serie en Maestros > Series.`);
      } else {
        setMessage('');
      }
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const rows = await fetchSeriesNumbers(accessToken, {
          documentKind: requestedDocumentKind,
          branchId,
          warehouseId,
        });

        if (cancelled) {
          return;
        }

        const filteredRows = rows.filter((row) => row.document_kind === requestedDocumentKind);
  seriesCacheRef.current.set(seriesScopeKey, filteredRows);
        setSeries(filteredRows);

        setForm((prev) => ({
          ...prev,
          series: filteredRows.find((row) => row.series === prev.series)?.series ?? filteredRows[0]?.series ?? '',
        }));

        if (filteredRows.length === 0) {
          setMessage(`No hay series activas para ${requestedDocumentKind} en la sucursal/almacen seleccionados. Configura la serie en Maestros > Series.`);
        } else {
          setMessage('');
        }
      } catch {
        if (cancelled) {
          return;
        }
        setSeries([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, effectiveDocumentKind, branchId, warehouseId]);

  useEffect(() => {
    if (!isTributaryDocument) {
      setForm((prev) => ({ ...prev, taxCategoryId: null }));
      return;
    }

    if (!form.taxCategoryId && (lookups?.tax_categories?.length ?? 0) > 0) {
      const defaultTaxCategory = lookups?.tax_categories.find((row) => Number(row.rate_percent) > 0)
        ?? lookups?.tax_categories[0]
        ?? null;

      if (defaultTaxCategory) {
        setForm((prev) => ({ ...prev, taxCategoryId: defaultTaxCategory.id }));
      }
    }
  }, [isTributaryDocument, form.taxCategoryId, lookups]);

  useEffect(() => {
    if (!workshopMultiVehicleEnabled || Number(form.customerId) <= 0) {
      setCustomerVehicles([]);
      setLoadingCustomerVehicles(false);
      return;
    }

    const scopedCustomerId = Number(form.customerId);
    const requestSeq = customerVehiclesRequestSeqRef.current + 1;
    customerVehiclesRequestSeqRef.current = requestSeq;
    setLoadingCustomerVehicles(true);

    void fetchCustomerVehicles(accessToken, scopedCustomerId)
      .then((rows) => {
        if (requestSeq !== customerVehiclesRequestSeqRef.current) {
          return;
        }

        const activeRows = rows.filter((row) => Number(row.status) === 1);
        setCustomerVehicles(activeRows);

        setForm((prev) => {
          if (Number(prev.customerId) !== scopedCustomerId) {
            return prev;
          }

          const currentVehicleId = toOptionalNumber(prev.customerVehicleId);
          const existsCurrent = currentVehicleId !== null && activeRows.some((row) => row.id === currentVehicleId);
          if (existsCurrent) {
            return prev;
          }

          const defaultVehicle = activeRows.find((row) => row.is_default) ?? activeRows[0] ?? null;
          return {
            ...prev,
            customerVehicleId: defaultVehicle ? defaultVehicle.id : null,
          };
        });
      })
      .catch(() => {
        if (requestSeq !== customerVehiclesRequestSeqRef.current) {
          return;
        }

        setCustomerVehicles([]);
        setForm((prev) => (Number(prev.customerId) === scopedCustomerId
          ? { ...prev, customerVehicleId: null }
          : prev));
      })
      .finally(() => {
        if (requestSeq === customerVehiclesRequestSeqRef.current) {
          setLoadingCustomerVehicles(false);
        }
      });
  }, [accessToken, form.customerId, workshopMultiVehicleEnabled]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === 'F2') {
        event.preventDefault();
        customerInputRef.current?.focus();
        customerInputRef.current?.select();
        return;
      }

      if (event.key === 'F3') {
        event.preventDefault();
        productInputRef.current?.focus();
        productInputRef.current?.select();
        return;
      }

      if (event.key === 'F9') {
        event.preventDefault();
        submitButtonRef.current?.click();
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  function chooseCustomer(customer: SalesCustomerSuggestion) {
    suppressNextCustomerAutocompleteRef.current = true;
    setSelectedCustomer(customer);
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerVehicleId: null,
      customerQuery: `${customer.doc_number ?? 'SIN-DOC'} - ${customer.name}`,
      customerAddress: customer.address ?? '',
      noteAffectedDocumentId: null,
      noteReasonCode: '',
      hasDetraccion: false,
      detraccionServiceCode: '',
      hasRetencion: false,
      retencionTypeCode: '',
      hasPercepcion: false,
      percepcionTypeCode: '',
      sunatOperationTypeCode: '',
      isCreditSale: false,
      creditInstallments: [],
      advanceAmount: 0,
    }));
    if (isNoteDocument) {
      setCart([]);
    }
    setCustomerSuggestions([]);
    setActiveCustomerIndex(-1);

    if (selectedProduct && !form.isManualItem) {
      const basePrice = Number(selectedProduct.sale_price || 0);
      const auto = resolveCustomerProfilePrice(
        selectedProductCommercialConfig,
        customer,
        Number(form.qty || 1),
        form.unitId,
        Number(form.currencyId || 1),
        basePrice,
        customerProfilePricingEnabled
      );

      setAutoPriceHint(auto.note);
      setAutoPriceSource(auto.source);
      setAutoPriceTierId(auto.priceTierId);
      setAutoPriceDiscountPercent(auto.discountPercent);
      setForm((prev) => ({ ...prev, unitPrice: auto.price }));
    }
  }

  async function resolveCustomerFromPadron() {
    const document = (form.customerQuery ?? '').replace(/\D+/g, '').trim();

    if (document.length !== 8 && document.length !== 11) {
      setMessage('Ingrese un DNI (8) o RUC (11) para consultar.');
      return;
    }

    try {
      setResolvingCustomerDocument(true);
      setMessage('Consultando padron...');
      const resolved = await resolveCustomerByDocument(accessToken, document);
      chooseCustomer(resolved.data);
      setMessage(resolved.message);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo consultar el documento';
      setMessage(text);
    } finally {
      setResolvingCustomerDocument(false);
    }
  }

  async function chooseProduct(product: InventoryProduct) {
    const basePrice = Number(product.sale_price || 0);
    const fallbackUnitId = product.unit_id ?? defaultEnabledUnit?.id ?? null;

    suppressNextProductAutocompleteRef.current = true;
    productAutocompleteRequestSeqRef.current += 1;
    setSelectedProduct(product);
    setForm((prev) => ({
      ...prev,
      isManualItem: false,
      manualDescription: '',
      productId: product.id,
      unitId: fallbackUnitId,
      unitPrice: basePrice || prev.unitPrice,
      productQuery: `${product.sku ?? 'SIN-SKU'} - ${product.name}`,
    }));
    setProductSuggestions([]);
    setActiveProductIndex(-1);

    try {
      const config = await fetchProductCommercialConfig(accessToken, product.id) as ProductCommercialConfig;
      setSelectedProductCommercialConfig(config);

      const productUnitsActive = (config.product_units ?? []).filter((row) => Number(row.status) === 1);
      const shouldUseProductUnits = config.features.PRODUCT_MULTI_UOM && productUnitsActive.length > 0;

      if (shouldUseProductUnits) {
        const mappedUnits = productUnitsActive.map((row) => ({
          id: row.unit_id,
          code: row.code,
          name: row.name,
          sunat_uom_code: null,
        }));

        setSelectedProductUnitOptions(mappedUnits);

        const baseUnitId = productUnitsActive.find((row) => row.is_base)?.unit_id ?? mappedUnits[0]?.id ?? fallbackUnitId;
        const auto = resolveCustomerProfilePrice(
          config,
          selectedCustomer,
          Number(form.qty || 1),
          baseUnitId,
          Number(form.currencyId || 1),
          basePrice,
          customerProfilePricingEnabled
        );
        setAutoPriceHint(auto.note);
        setAutoPriceSource(auto.source);
        setAutoPriceTierId(auto.priceTierId);
        setAutoPriceDiscountPercent(auto.discountPercent);

        setForm((prev) => ({
          ...prev,
          unitId: baseUnitId,
          unitPrice: auto.price,
        }));
      } else {
        setSelectedProductUnitOptions(lookups?.units ?? []);
        const auto = resolveCustomerProfilePrice(
          config,
          selectedCustomer,
          Number(form.qty || 1),
          fallbackUnitId,
          Number(form.currencyId || 1),
          basePrice,
          customerProfilePricingEnabled
        );
        setAutoPriceHint(auto.note);
        setAutoPriceSource(auto.source);
        setAutoPriceTierId(auto.priceTierId);
        setAutoPriceDiscountPercent(auto.discountPercent);
        setForm((prev) => ({
          ...prev,
          unitPrice: auto.price,
        }));
      }
    } catch {
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setAutoPriceHint('');
      setAutoPriceSource('MANUAL');
      setAutoPriceTierId(null);
      setAutoPriceDiscountPercent(0);
    }
  }

  function toggleManualItem(enabled: boolean) {
    setForm((prev) => ({
      ...prev,
      isManualItem: enabled,
      productId: enabled ? null : prev.productId,
      productQuery: enabled ? '' : prev.productQuery,
      lotId: enabled ? null : prev.lotId,
      manualDescription: enabled ? prev.manualDescription : '',
      unitId: prev.unitId ?? defaultEnabledUnit?.id ?? null,
    }));

    if (enabled) {
      setSelectedProduct(null);
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setAutoPriceHint('');
      setAutoPriceSource('MANUAL');
      setAutoPriceTierId(null);
      setAutoPriceDiscountPercent(0);
      setProductSuggestions([]);
      setActiveProductIndex(-1);
      setLots([]);
    }
  }

  function handleCustomerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (customerSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveCustomerIndex((prev) => Math.min(prev + 1, customerSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveCustomerIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter' && activeCustomerIndex >= 0) {
      event.preventDefault();
      chooseCustomer(customerSuggestions[activeCustomerIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setCustomerSuggestions([]);
      setActiveCustomerIndex(-1);
    }
  }

  function handleCustomerSuggestBlur(event: React.FocusEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setCustomerInputFocused(false);
    setCustomerSuggestions([]);
    setActiveCustomerIndex(-1);
  }

  function handleProductKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (productSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveProductIndex((prev) => Math.min(prev + 1, productSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveProductIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter' && activeProductIndex >= 0) {
      event.preventDefault();
      void chooseProduct(productSuggestions[activeProductIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setProductSuggestions([]);
      setActiveProductIndex(-1);
    }
  }

  function addDraftItem() {
    if (!canAddDraftItem) {
      return;
    }

    if (isTributaryDocument && !form.taxCategoryId) {
      return;
    }

    const description = form.isManualItem
      ? form.manualDescription.trim()
      : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim();
    const currentTaxCategory = lookups?.tax_categories.find((row) => row.id === form.taxCategoryId) ?? null;
    const itemTaxRate = isTributaryDocument ? Number(currentTaxCategory?.rate_percent ?? 0) : 0;
    const normalizedUnitPrice = isDraftPriceTaxInclusive && itemTaxRate > 0
      ? Number(form.unitPrice || 0) / (1 + (itemTaxRate / 100))
      : Number(form.unitPrice || 0);

    const draftItem: SalesDraftItem = {
      productId: form.isManualItem ? null : form.productId,
      unitId: form.unitId,
      lotId: resolvedDraftLotId,
      taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
      priceIncludesTax: isDraftPriceTaxInclusive,
      qtyBase: form.isManualItem ? null : Number(draftQtyBase),
      conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
      baseUnitPrice:
        form.isManualItem
          ? null
          : Number(normalizedUnitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
      taxRate: itemTaxRate,
      taxLabel: isTributaryDocument
        ? (currentTaxCategory?.label ?? 'IGV')
        : 'Sin IGV',
      isManual: form.isManualItem,
      description,
      qty: Number(form.qty),
      unitPrice: Number(form.unitPrice),
      discountTotal: salesItemDiscountEnabled ? Number(form.draftLineDiscount ?? 0) : 0,
      isFreeOperation: salesFreeItemsEnabled ? Boolean(form.draftIsFreeOperation) : false,
    };

    setCart((prev) => {
      if (draftItem.isManual) {
        return [...prev, draftItem];
      }

      const mergeIndex = prev.findIndex((row) => {
        if (row.isManual) {
          return false;
        }

        return row.productId === draftItem.productId
          && row.unitId === draftItem.unitId
          && row.lotId === draftItem.lotId
          && row.taxCategoryId === draftItem.taxCategoryId
          && Boolean(row.priceIncludesTax) === Boolean(draftItem.priceIncludesTax)
          && Math.abs(Number(row.unitPrice) - Number(draftItem.unitPrice)) < 0.000001;
      });

      if (mergeIndex < 0) {
        return [...prev, draftItem];
      }

      return prev.map((row, index) => {
        if (index !== mergeIndex) {
          return row;
        }

        const mergedQty = Number(row.qty) + Number(draftItem.qty);
        const rowQtyBase = row.qtyBase != null ? Number(row.qtyBase) : null;
        const draftQtyBaseNumber = draftItem.qtyBase != null ? Number(draftItem.qtyBase) : null;
        const mergedQtyBase = rowQtyBase !== null || draftQtyBaseNumber !== null
          ? Number((rowQtyBase ?? 0) + (draftQtyBaseNumber ?? 0))
          : null;

        return {
          ...row,
          qty: mergedQty,
          qtyBase: mergedQtyBase,
        };
      });
    });

    setForm((prev) => ({
      ...prev,
      draftIsFreeOperation: false,
      draftLineDiscount: 0,
      qty: 1,
    }));

    setAutoPriceHint('');
    setAutoPriceSource('MANUAL');
    setAutoPriceTierId(null);
    setAutoPriceDiscountPercent(0);

    // Keep cashier speed high: return focus to product search for next item.
    setTimeout(() => {
      productInputRef.current?.focus();
      productInputRef.current?.select();
    }, 0);
  }

  async function chooseReferenceDocument(documentId: number) {
    setForm((prev) => ({
      ...prev,
      noteAffectedDocumentId: documentId,
    }));

    if (!documentId) {
      setCart([]);
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const details = await fetchCommercialDocumentDetails(accessToken, documentId) as PrintableSalesDocument & {
        items?: Array<{
          productId?: number | null;
          unitId?: number | null;
          priceTierId?: number | null;
          qty: number;
          qtyBase?: number;
          conversionFactor?: number;
          baseUnitPrice?: number;
          description: string;
          unitPrice: number;
          wholesaleDiscountPercent?: number;
          priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
          taxCategoryId?: number | null;
          taxLabel?: string;
          taxRate?: number;
          metadata?: Record<string, unknown> | null;
          lots?: Array<{ lot_id: number; qty: number }>;
        }>;
      };

      const detailsItems = (details.items ?? []) as Array<{
        productId?: number | null;
        unitId?: number | null;
        priceTierId?: number | null;
        qty: number;
        qtyBase?: number;
        conversionFactor?: number;
        baseUnitPrice?: number;
        description: string;
        unitPrice: number;
        wholesaleDiscountPercent?: number;
        priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
        taxCategoryId?: number | null;
        taxLabel?: string;
        taxRate?: number;
        metadata?: Record<string, unknown> | null;
        lots?: Array<{ lot_id: number; qty: number }>;
      }>;

      const rows = detailsItems.map((item) => ({
        productId: item.productId ?? null,
        unitId: item.unitId ?? null,
        lotId: item.lots && item.lots.length > 0 ? Number(item.lots[0].lot_id) : null,
        priceTierId: item.priceTierId ?? null,
        wholesaleDiscountPercent: item.wholesaleDiscountPercent ?? null,
        priceSource: item.priceSource ?? 'MANUAL',
        taxCategoryId: item.taxCategoryId ?? null,
        priceIncludesTax: Boolean(item.metadata && (item.metadata as Record<string, unknown>).price_includes_tax === true),
        qtyBase: item.qtyBase ?? null,
        conversionFactor: item.conversionFactor ?? null,
        baseUnitPrice: item.baseUnitPrice ?? null,
        taxRate: Number(item.taxRate ?? 0),
        taxLabel: item.taxLabel ?? 'Sin IGV',
        isManual: !(item.productId && Number(item.productId) > 0),
        description: item.description,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discountTotal: Number((item.metadata?.descuento ?? item.metadata?.discount_total ?? 0) || 0),
        isFreeOperation: Boolean(item.metadata?.is_free_operation),
        freeOperationTotal: Number((item.metadata?.gratuitas ?? item.metadata?.free_operation_total ?? 0) || 0),
      }));

      setCart(rows);
      setMessage(rows.length > 0 ? 'Items cargados desde el documento afectado.' : 'El documento afectado no tiene items.');
    } catch (error) {
      setCart([]);
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar items del documento afectado');
    } finally {
      setLoading(false);
    }
  }

  function handleQuickAddItem(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    if (!canAddDraftItem || loading) {
      return;
    }

    event.preventDefault();
    addDraftItem();
  }

  useEffect(() => {
    if (!selectedProduct || form.isManualItem) {
      return;
    }

    const basePrice = Number(selectedProduct.sale_price || 0);
    const auto = resolveCustomerProfilePrice(
      selectedProductCommercialConfig,
      selectedCustomer,
      Number(form.qty || 0),
      form.unitId,
      Number(form.currencyId || 1),
      basePrice,
      customerProfilePricingEnabled
    );

    if (!Number.isFinite(auto.price)) {
      return;
    }

    setAutoPriceHint(auto.note);
    setAutoPriceSource(auto.source);
    setAutoPriceTierId(auto.priceTierId);
    setAutoPriceDiscountPercent(auto.discountPercent);
    setForm((prev) => {
      if (Number(prev.unitPrice) === Number(auto.price)) {
        return prev;
      }

      return {
        ...prev,
        unitPrice: Number(auto.price),
      };
    });
  }, [
    form.qty,
    form.unitId,
    form.currencyId,
    form.isManualItem,
    selectedProduct,
    selectedCustomer,
    selectedProductCommercialConfig,
    customerProfilePricingEnabled,
  ]);

  function removeDraftItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const companyProfileForPrint = useMemo(() => {
    if (!lookups?.company_profile) {
      return null;
    }

    return {
      taxId: lookups.company_profile.tax_id ?? null,
      legalName: lookups.company_profile.legal_name ?? null,
      tradeName: lookups.company_profile.trade_name ?? null,
      address: lookups.company_profile.address ?? null,
      phone: lookups.company_profile.phone ?? null,
      email: lookups.company_profile.email ?? null,
      logoUrl: lookups.company_profile.logo_url ?? null,
    };
  }, [lookups]);

  function withCompanyForPrint(document: PrintableSalesDocument): PrintableSalesDocument {
    if (!companyProfileForPrint) {
      return document;
    }

    return {
      ...document,
      company: {
        ...companyProfileForPrint,
        ...(document.company ?? {}),
      },
    };
  }

  function updateDraftItem(
    index: number,
    field: 'qty' | 'unitPrice' | 'discountTotal' | 'isFreeOperation',
    value: number | boolean
  ) {
    setCart((prev) =>
      prev.map((row, i) => {
        if (i !== index) {
          return row;
        }

        return {
          ...row,
          [field]: value,
        };
      })
    );
  }

  function updateCreditInstallment(index: number, patch: Partial<NonNullable<CreateDocumentForm['creditInstallments']>[number]>) {
    setForm((prev) => ({
      ...prev,
      creditInstallments: (prev.creditInstallments ?? []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...patch } : item
      )),
    }));
  }

  function removeCreditInstallment(index: number) {
    setForm((prev) => {
      const rows = prev.creditInstallments ?? [];
      if (rows.length <= 1) {
        return prev;
      }

      return {
        ...prev,
        creditInstallments: rows.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }

  function addCreditInstallment() {
    setForm((prev) => ({
      ...prev,
      creditInstallments: [
        ...(prev.creditInstallments ?? []),
        createCreditInstallmentRow(prev.dueDate || prev.issueDate || TODAY),
      ],
    }));
  }

  function printIssuedPreview(format: 'A4' | '80mm' = 'A4') {
    if (!issuedPreview) {
      return;
    }

    const printable = withCompanyForPrint(issuedPreview.printable);

    setPreviewDialog({
      title: format === '80mm' ? 'Ticket 80mm' : 'Documento emitido A4',
      subtitle: `${issuedPreview.series}-${issuedPreview.number}`,
      html: format === '80mm'
        ? buildCommercialDocument80mmHtml(printable, { embedded: true, showItemDiscount: salesItemDiscountEnabled })
        : buildCommercialDocumentA4Html(printable, { embedded: true, showItemDiscount: salesItemDiscountEnabled }),
      variant: format === '80mm' ? 'compact' : 'wide',
    });
  }

  function formatDebugJson(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      const raw = value.trim();
      if (raw === '') {
        return '""';
      }

      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  async function handleToggleSunatBridgeDebug(row: CommercialDocumentListItem) {
    if (!canViewTaxBridgeDebug) {
      return;
    }

    if (sunatBridgeDebugState?.documentId === row.id) {
      setSunatBridgeDebugState(null);
      return;
    }

    const title = `${docKindLabelResolved(row.document_kind)} ${row.series}-${String(row.number).padStart(6, '0')}`;
    setSunatBridgeDebugState({
      documentId: row.id,
      title,
      loading: true,
      error: '',
      attempts: [],
      selectedLogId: null,
      loadingDetailLogId: null,
      attemptDetails: {},
      debug: null,
    });

    try {
      const history = await fetchTaxBridgeAuditDocumentHistory(accessToken, row.id, 50);
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.documentId !== row.id) {
          return prev;
        }

        const firstLogId = history.logs.length > 0 ? history.logs[0].id : null;

        return {
          ...prev,
          loading: false,
          error: '',
          attempts: history.logs,
          selectedLogId: firstLogId,
          debug: null,
        };
      });

      if (history.logs.length > 0) {
        await loadSunatAuditAttemptDetail(row.id, history.logs[0].id);
        return;
      }

      const response = await fetchTaxBridgeDebug(accessToken, row.id);
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.documentId !== row.id) {
          return prev;
        }

        return {
          ...prev,
          debug: response.debug ?? null,
        };
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo obtener el detalle técnico del puente SUNAT';
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.documentId !== row.id) {
          return prev;
        }

        return {
          ...prev,
          loading: false,
          error: text,
          debug: null,
        };
      });
    }
  }

  async function loadSunatAuditAttemptDetail(documentId: number, logId: number) {
    setSunatBridgeDebugState((prev) => {
      if (!prev || prev.documentId !== documentId) {
        return prev;
      }

      return {
        ...prev,
        selectedLogId: logId,
        loadingDetailLogId: logId,
        error: '',
      };
    });

    try {
      const detail = await fetchTaxBridgeAuditAttemptDetail(accessToken, logId);
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.documentId !== documentId) {
          return prev;
        }

        return {
          ...prev,
          loadingDetailLogId: null,
          attemptDetails: {
            ...prev.attemptDetails,
            [logId]: detail,
          },
        };
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar el intento seleccionado';
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.documentId !== documentId) {
          return prev;
        }

        return {
          ...prev,
          loadingDetailLogId: null,
          error: text,
          attemptDetails: {
            ...prev.attemptDetails,
            [logId]: null,
          },
        };
      });
    }
  }

  async function showDocumentPreview(documentId: number, format: 'A4' | '80mm' = 'A4') {
    try {
      const data = await fetchCommercialDocumentDetails(accessToken, documentId);
      const printable = withCompanyForPrint(data as PrintableSalesDocument);
      setPreviewDialog({
        title: format === '80mm' ? 'Previsualizacion Ticket 80mm' : 'Previsualizacion del documento',
        subtitle: `${data.series}-${String(data.number).padStart(6, '0')}`,
        html: format === '80mm'
          ? buildCommercialDocument80mmHtml(printable, { embedded: true, showItemDiscount: salesItemDiscountEnabled })
          : buildCommercialDocumentA4Html(printable, { embedded: true, showItemDiscount: salesItemDiscountEnabled }),
        variant: format === '80mm' ? 'compact' : 'wide',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar el documento');
    }
  }

  async function handleManualSunatSend(row: CommercialDocumentListItem) {
    setSunatSendingDocumentId(row.id);
    setMessage('');

    try {
      const response = await retryTaxBridgeSend(accessToken, row.id);
      const responseSummary = summarizeSunatDiagnostic(response.sunat_error_code, response.sunat_error_message, response.bridge_response);
      const httpSummary = response.bridge_http_code ? `HTTP ${response.bridge_http_code}` : '';
      const detailSummary = [httpSummary, responseSummary].filter((part) => part !== '').join(' | ');

      setMessage(
        detailSummary
          ? `${response.message || `Envio tributario ejecutado para ${row.series}-${row.number}.`} (${detailSummary})`
          : (response.message || `Envio tributario ejecutado para ${row.series}-${row.number}.`)
      );

      const nextSunatStatus = String(response.sunat_status ?? '').toUpperCase();
      const toastTone: SunatToastState['tone'] = nextSunatStatus === 'ACCEPTED'
        ? 'ok'
        : nextSunatStatus === 'REJECTED' || nextSunatStatus === 'HTTP_ERROR' || nextSunatStatus === 'NETWORK_ERROR'
          ? 'bad'
          : 'warn';

      setSunatToast({
        tone: toastTone,
        title: `SUNAT: ${sunatStatusLabel(nextSunatStatus)}`,
        detail: detailSummary || 'Sin detalle adicional del puente.',
      });

      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar el comprobante a SUNAT');

      setSunatToast({
        tone: 'bad',
        title: 'SUNAT: Error de envio',
        detail: error instanceof Error ? error.message : 'No se pudo enviar el comprobante a SUNAT',
      });
    } finally {
      setSunatSendingDocumentId(null);
    }
  }

  function applyAdvancedDocumentFilters() {
    setReportCustomerSuggestions([]);
    setReportCustomerInputFocused(false);
    setDocumentFiltersApplied({ ...documentFiltersDraft });
    setDocumentsPage(1);
  }

  function clearAdvancedDocumentFilters() {
    setReportCustomerSuggestions([]);
    setReportCustomerVehicles([]);
    setReportCustomerInputFocused(false);
    setDocumentFiltersDraft(initialDocumentAdvancedFilters);
    setDocumentFiltersApplied(initialDocumentAdvancedFilters);
    setDocumentsPage(1);
  }

  function formatVehicleLabel(vehicle: SalesCustomerVehicle): string {
    const core = [vehicle.plate, vehicle.brand, vehicle.model]
      .map((part) => String(part ?? '').trim())
      .filter((part) => part !== '')
      .join(' | ');

    return core || `Vehiculo ${vehicle.id}`;
  }

  function formatReportDocumentVehicle(row: {
    vehicle_plate_snapshot?: string | null;
    vehicle_brand_snapshot?: string | null;
    vehicle_model_snapshot?: string | null;
  }): string {
    const parts = [row.vehicle_plate_snapshot, row.vehicle_brand_snapshot, row.vehicle_model_snapshot]
      .map((part) => String(part ?? '').trim())
      .filter((part) => part !== '');

    return parts.join(' | ');
  }

  function chooseReportCustomer(customer: SalesCustomerSuggestion) {
    suppressNextReportCustomerAutocompleteRef.current = true;
    setReportCustomerSuggestions([]);
    setReportCustomerInputFocused(false);

    const label = `${customer.doc_number ?? 'SIN-DOC'} - ${customer.name}`;
    setDocumentFiltersDraft((prev) => ({
      ...prev,
      customer: label,
      customerId: String(customer.id),
      customerVehicleId: '',
    }));
  }

  async function handleExportDocumentsExcel() {
    setExportingDocuments(true);
    setMessage('');

    try {
      const isCashierPendingQueue =
        shouldPrioritizePendingOrders
        && cashierReportPanelMode === 'PENDING'
        && documentViewFilter === 'PENDING_CONVERSION';
      const pendingFilterParams = buildDocumentFilterParams('PENDING_CONVERSION', lookups?.document_kinds ?? []);
      const filterParams = isCashierPendingQueue
        ? pendingFilterParams
        : buildDocumentFilterParams(documentViewFilter, lookups?.document_kinds ?? []);
      const shouldFilterByCashRegister = shouldApplyCashRegisterFilter();
      const result = await exportCommercialDocumentsExcel(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId: shouldFilterByCashRegister ? cashRegisterId : null,
        documentKind: filterParams.documentKind,
        documentKindId: filterParams.documentKindId,
        conversionState: filterParams.conversionState,
        status: documentFiltersApplied.status || undefined,
        sourceOrigin: documentFiltersApplied.sourceOrigin || undefined,
        customer: documentFiltersApplied.customer || undefined,
        customerId: documentFiltersApplied.customerId ? Number(documentFiltersApplied.customerId) : undefined,
        customerVehicleId: workshopMultiVehicleEnabled && documentFiltersApplied.customerVehicleId
          ? Number(documentFiltersApplied.customerVehicleId)
          : undefined,
        issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
        issueDateTo: documentFiltersApplied.issueDateTo || undefined,
        series: documentFiltersApplied.series || undefined,
        number: documentFiltersApplied.number || undefined,
      });

      const blobUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo exportar el reporte';
      setMessage(text);
    } finally {
      setExportingDocuments(false);
    }
  }

  async function handleExportDocumentsXlsx() {
    setExportingDocuments(true);
    setMessage('');

    try {
      const isCashierPendingQueue =
        shouldPrioritizePendingOrders
        && cashierReportPanelMode === 'PENDING'
        && documentViewFilter === 'PENDING_CONVERSION';
      const pendingFilterParams = buildDocumentFilterParams('PENDING_CONVERSION', lookups?.document_kinds ?? []);
      const filterParams = isCashierPendingQueue
        ? pendingFilterParams
        : buildDocumentFilterParams(documentViewFilter, lookups?.document_kinds ?? []);
      const shouldFilterByCashRegister = shouldApplyCashRegisterFilter();
      const rows = await exportCommercialDocumentsJson(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId: shouldFilterByCashRegister ? cashRegisterId : null,
        documentKind: filterParams.documentKind,
        documentKindId: filterParams.documentKindId,
        conversionState: filterParams.conversionState,
        status: documentFiltersApplied.status || undefined,
        sourceOrigin: documentFiltersApplied.sourceOrigin || undefined,
        customer: documentFiltersApplied.customer || undefined,
        customerId: documentFiltersApplied.customerId ? Number(documentFiltersApplied.customerId) : undefined,
        customerVehicleId: workshopMultiVehicleEnabled && documentFiltersApplied.customerVehicleId
          ? Number(documentFiltersApplied.customerVehicleId)
          : undefined,
        issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
        issueDateTo: documentFiltersApplied.issueDateTo || undefined,
        series: documentFiltersApplied.series || undefined,
        number: documentFiltersApplied.number || undefined,
        max: 20000,
      });

      const sheetRows = (rows as CommercialDocumentListItem[]).map((row) => ({
        ID: row.id,
        Documento: docKindLabelResolved(row.document_kind),
        Serie: row.series,
        Numero: row.number,
        FechaEmision: row.issue_at,
        Cliente: row.customer_name,
        Vehiculo: formatReportDocumentVehicle(row),
        FormaPago: row.payment_method_name ?? 'Sin metodo de pago',
        Estado: commercialStatusLabel(row.status),
        Total: Number(row.total ?? 0),
        Saldo: Number(row.balance_due ?? 0),
      }));

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');

      const fileName = `reporte_ventas_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo exportar XLSX';
      setMessage(text);
    } finally {
      setExportingDocuments(false);
    }
  }

  async function handleExportDocumentsExcelByProduct() {
    setExportingDocuments(true);
    setMessage('');

    try {
      const filterParams = buildDocumentFilterParams(documentViewFilter, lookups?.document_kinds ?? []);
      const shouldFilterByCashRegister = shouldApplyCashRegisterFilter();
      const result = await exportCommercialDocumentsExcel(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId: shouldFilterByCashRegister ? cashRegisterId : null,
        documentKind: filterParams.documentKind,
        documentKindId: filterParams.documentKindId,
        conversionState: filterParams.conversionState,
        status: documentFiltersApplied.status || undefined,
        sourceOrigin: documentFiltersApplied.sourceOrigin || undefined,
        customer: documentFiltersApplied.customer || undefined,
        customerId: documentFiltersApplied.customerId ? Number(documentFiltersApplied.customerId) : undefined,
        customerVehicleId: workshopMultiVehicleEnabled && documentFiltersApplied.customerVehicleId
          ? Number(documentFiltersApplied.customerVehicleId)
          : undefined,
        issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
        issueDateTo: documentFiltersApplied.issueDateTo || undefined,
        series: documentFiltersApplied.series || undefined,
        number: documentFiltersApplied.number || undefined,
        detail: 'PRODUCT',
      });

      const blobUrl = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo exportar detalle por producto';
      setMessage(text);
    } finally {
      setExportingDocuments(false);
    }
  }

  async function handleExportDocumentsXlsxByProduct() {
    setExportingDocuments(true);
    setMessage('');

    try {
      const filterParams = buildDocumentFilterParams(documentViewFilter, lookups?.document_kinds ?? []);
      const shouldFilterByCashRegister = shouldApplyCashRegisterFilter();
      const rows = await exportCommercialDocumentsJson(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId: shouldFilterByCashRegister ? cashRegisterId : null,
        documentKind: filterParams.documentKind,
        documentKindId: filterParams.documentKindId,
        conversionState: filterParams.conversionState,
        status: documentFiltersApplied.status || undefined,
        sourceOrigin: documentFiltersApplied.sourceOrigin || undefined,
        customer: documentFiltersApplied.customer || undefined,
        customerId: documentFiltersApplied.customerId ? Number(documentFiltersApplied.customerId) : undefined,
        customerVehicleId: workshopMultiVehicleEnabled && documentFiltersApplied.customerVehicleId
          ? Number(documentFiltersApplied.customerVehicleId)
          : undefined,
        issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
        issueDateTo: documentFiltersApplied.issueDateTo || undefined,
        series: documentFiltersApplied.series || undefined,
        number: documentFiltersApplied.number || undefined,
        max: 20000,
        detail: 'PRODUCT',
      });

      const detailRows = rows as Array<Record<string, unknown>>;
      const sheetRows = detailRows.map((row) => ({
        ID: Number(row.id ?? 0),
        Documento: String(row.document_kind_label ?? row.document_kind ?? ''),
        Serie: String(row.series ?? ''),
        Numero: String(row.number ?? ''),
        FechaEmision: String(row.issue_at ?? ''),
        Cliente: String(row.customer_name ?? ''),
        Vehiculo: formatReportDocumentVehicle(row as CommercialDocumentProductDetailRow),
        FormaPago: String(row.payment_method_name ?? ''),
        Estado: String(row.status ?? ''),
        Producto: String(row.product_description ?? ''),
        Unidad: String(row.unit_code ?? ''),
        Cantidad: Number(row.qty ?? 0),
        PrecioUnitario: Number(row.unit_price ?? 0),
        TotalLinea: Number(row.line_total ?? 0),
      }));

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'VentasDetalleProducto');

      const fileName = `reporte_ventas_producto_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo exportar XLSX detalle por producto';
      setMessage(text);
    } finally {
      setExportingDocuments(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const selectedTaxConditions = [form.hasDetraccion, form.hasRetencion, form.hasPercepcion].filter(Boolean).length;
      if (selectedTaxConditions > 1) {
        setMessage('Solo puede aplicar una condicion tributaria entre detracción, retención o percepción.');
        setLoading(false);
        return;
      }

      if (isNoteDocument) {
        if (!form.noteAffectedDocumentId) {
          setMessage('Seleccione el documento afectado para la nota.');
          setLoading(false);
          return;
        }

        if (!form.noteReasonCode) {
          setMessage('Seleccione el tipo de nota.');
          setLoading(false);
          return;
        }
      }

      if (isInvoiceDocument && form.hasDetraccion) {
        if (!form.detraccionServiceCode) {
          setMessage('Seleccione el código de bien/servicio sujeto a detracción.');
          setLoading(false);
          return;
        }
      }

      if (isInvoiceDocument && form.hasRetencion) {
        const availableTypes = lookups?.retencion_types ?? [];
        if (availableTypes.length > 0 && !form.retencionTypeCode) {
          setMessage('Seleccione el tipo de retención.');
          setLoading(false);
          return;
        }
      }

      if (isInvoiceDocument && form.hasPercepcion) {
        const availableTypes = lookups?.percepcion_types ?? [];
        if (availableTypes.length > 0 && !form.percepcionTypeCode) {
          setMessage('Seleccione el tipo de percepción.');
          setLoading(false);
          return;
        }
      }

      if (isInvoiceDocument && (form.hasDetraccion || form.hasRetencion || form.hasPercepcion)) {
        const availableOpTypes = lookups?.sunat_operation_types ?? [];
        if (availableOpTypes.length > 0 && !form.sunatOperationTypeCode) {
          setMessage('Seleccione el tipo de operación SUNAT.');
          setLoading(false);
          return;
        }
      }

      const selectedCustomerForValidation = selectedCustomer && Number(selectedCustomer.id) === Number(form.customerId)
        ? selectedCustomer
        : null;

      if (documentKindRequiresRuc(effectiveDocumentKind, {
        noteTargetKind: noteTargetDocumentKind,
        referenceDocumentKind: selectedReferenceDocument?.document_kind ?? null,
      })
        && selectedCustomerForValidation
        && !customerHasRuc(selectedCustomerForValidation)) {
        setMessage('Para este documento, el cliente debe tener RUC válido (11 dígitos).');
        setLoading(false);
        return;
      }

      const computedAdvance = advancesEnabled ? Math.min(Math.max(0, Number(form.advanceAmount ?? 0)), grandTotal) : 0;
      if (form.isCreditSale) {
        const installments = (form.creditInstallments ?? []).map((row) => ({
          amount: Number(row.amount ?? 0),
          dueDate: String(row.dueDate ?? '').trim(),
          observation: String(row.observation ?? '').trim(),
        }));

        if (installments.length === 0) {
          setMessage('Debes registrar al menos una cuota para venta al crédito.');
          setLoading(false);
          return;
        }

        const hasInvalidInstallment = installments.some((row) => row.amount <= 0 || row.dueDate === '');
        if (hasInvalidInstallment) {
          setMessage('Cada cuota debe tener monto mayor a cero y fecha de pago.');
          setLoading(false);
          return;
        }

        const installmentTotal = installments.reduce((acc, row) => acc + row.amount, 0);
        const expectedCreditTotal = Math.max(0, Number((grandTotal - computedAdvance).toFixed(2)));
        if (Math.abs(installmentTotal - expectedCreditTotal) > 0.01) {
          setMessage(`La suma de cuotas debe ser ${expectedCreditTotal.toFixed(2)}.`);
          setLoading(false);
          return;
        }
      }

      const payloadItems = cart.length > 0
        ? cart.map((item) => ({
            ...item,
          lotId: manualLotSelectionEnabled ? item.lotId : null,
          }))
        : canAddDraftItem
          ? [
              {
                productId: form.isManualItem ? null : form.productId,
                unitId: form.unitId,
                lotId: resolvedDraftLotId,
                taxCategoryId: isTributaryDocument ? (form.taxCategoryId ?? null) : null,
                priceIncludesTax: isDraftPriceTaxInclusive,
                qtyBase: form.isManualItem ? null : Number(draftQtyBase),
                conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
                baseUnitPrice:
                  form.isManualItem
                    ? null
                    : Number(
                        (isDraftPriceTaxInclusive && draftTaxRate > 0
                          ? Number(form.unitPrice || 0) / (1 + (draftTaxRate / 100))
                          : Number(form.unitPrice || 0))
                      ) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
                taxRate: isTributaryDocument ? Number(selectedTaxCategory?.rate_percent ?? 0) : 0,
                taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
                isManual: form.isManualItem,
                description: form.isManualItem
                  ? form.manualDescription.trim()
                  : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim(),
                qty: Number(form.qty),
                unitPrice: Number(form.unitPrice),
                discountTotal: salesItemDiscountEnabled ? Number(form.draftLineDiscount ?? 0) : 0,
                isFreeOperation: salesFreeItemsEnabled ? Boolean(form.draftIsFreeOperation) : false,
              },
            ]
          : [];

      if (payloadItems.length === 0) {
        setMessage('Debe agregar al menos un item para emitir.');
        setLoading(false);
        return;
      }

      const normalizedDocumentMetadata = {
        customer_address: form.customerAddress?.trim() || null,
        discount_total: globalDiscountAmount > 0 ? Number(globalDiscountAmount.toFixed(2)) : 0,
        has_detraccion: form.hasDetraccion ?? false,
        detraccion_service_code: form.hasDetraccion ? (form.detraccionServiceCode ?? null) : null,
        has_retencion: form.hasRetencion ?? false,
        retencion_type_code: form.hasRetencion ? (form.retencionTypeCode ?? null) : null,
        has_percepcion: form.hasPercepcion ?? false,
        percepcion_type_code: form.hasPercepcion ? (form.percepcionTypeCode ?? null) : null,
        sunat_operation_type_code: (form.hasDetraccion || form.hasRetencion || form.hasPercepcion)
          ? (form.sunatOperationTypeCode || selectedSunatOperationType?.code || null)
          : null,
        payment_condition: form.isCreditSale ? 'CREDITO' : 'CONTADO',
        credit_installments: form.isCreditSale
          ? (form.creditInstallments ?? []).map((row, index) => ({
              installment_no: index + 1,
              amount: Number(Number(row.amount ?? 0).toFixed(2)),
              due_at: row.dueDate,
              notes: String(row.observation ?? '').trim() || null,
            }))
          : [],
        credit_total: form.isCreditSale ? Number(creditPendingTotal.toFixed(2)) : 0,
        has_advance: advancesEnabled && cappedAdvanceAmount > 0,
        advance_amount: advancesEnabled ? Number(cappedAdvanceAmount.toFixed(2)) : 0,
      };

      if (editingDocumentId) {
        const currentEditingContext = editingDocumentContext;
        const targetDocumentId = currentEditingContext?.id ?? editingDocumentId;
        const itemsPayload = payloadItems.map((item) => {
          const qty = Number(item.qty);
          const taxRate = Number(item.taxRate ?? 0);
          const includesTax = Boolean(item.priceIncludesTax) && taxRate > 0;
          const lineAmounts = computeSalesDraftAmounts(item);

          return {
            description: item.description,
            product_id: item.productId ? Number(item.productId) : null,
            unit_id: item.unitId ? Number(item.unitId) : null,
            price_tier_id: item.priceTierId ? Number(item.priceTierId) : undefined,
            wholesale_discount_percent: item.wholesaleDiscountPercent != null ? Number(item.wholesaleDiscountPercent) : undefined,
            price_source: item.priceSource ?? undefined,
            tax_category_id: item.taxCategoryId ? Number(item.taxCategoryId) : null,
            qty,
            qty_base: item.qtyBase != null ? Number(item.qtyBase) : undefined,
            conversion_factor: item.conversionFactor != null ? Number(item.conversionFactor) : undefined,
            base_unit_price: item.baseUnitPrice != null ? Number(item.baseUnitPrice) : undefined,
            unit_price: Number(item.unitPrice),
            unit_cost: 0,
            discount_total: lineAmounts.discountTotal > 0 ? Number(lineAmounts.discountTotal.toFixed(2)) : undefined,
            subtotal: Number(lineAmounts.subtotal.toFixed(2)),
            tax_total: Number(lineAmounts.tax.toFixed(2)),
            total: Number(lineAmounts.finalTotal.toFixed(2)),
            metadata: {
              price_includes_tax: includesTax,
              descuento: lineAmounts.discountTotal > 0 ? Number(lineAmounts.discountTotal.toFixed(2)) : 0,
              gratuitas: lineAmounts.gratuitaTotal > 0 ? Number(lineAmounts.gratuitaTotal.toFixed(2)) : 0,
              is_free_operation: lineAmounts.isFreeOperation,
            },
            lots: item.lotId ? [{ lot_id: Number(item.lotId), qty }] : undefined,
          };
        });

        await updateCommercialDocument(accessToken, editingDocumentId, {
          document_kind: effectiveDocumentKind,
          document_kind_id: selectedEffectiveDocumentKind?.id ?? null,
          branch_id: branchId,
          warehouse_id: warehouseId,
          cash_register_id: salesFlowMode === 'SELLER_TO_CASHIER' && isSellerUser ? null : cashRegisterId,
          customer_id: Number(form.customerId),
          customer_vehicle_id: form.customerVehicleId ? Number(form.customerVehicleId) : null,
          currency_id: Number(form.currencyId),
          payment_method_id: Number(form.paymentMethodId),
          due_at: form.dueDate || null,
          metadata: normalizedDocumentMetadata,
          items: itemsPayload,
        });

        const nextFilter = resolveViewFilterForDocumentKind(
          currentEditingContext?.documentKind ?? effectiveDocumentKind
        );
        const nextAdvancedFilters: DocumentAdvancedFilters = {
          ...initialDocumentAdvancedFilters,
          series: currentEditingContext?.series ?? form.series ?? '',
          number: currentEditingContext?.number != null ? String(currentEditingContext.number) : '',
        };

        setMessage('Documento comercial actualizado correctamente. Mostrando el comprobante editado en reportes.');
        setEditingDocumentId(null);
        setEditingDocumentContext(null);
        setCart([]);
        setSalesWorkspaceMode('REPORT');
        setCashierReportPanelMode('FULL');
        setDocumentViewFilter(nextFilter);
        setDocumentFiltersDraft(nextAdvancedFilters);
        setDocumentFiltersApplied(nextAdvancedFilters);
        suppressNextPinnedResetRef.current = true;
        setPinnedDocumentId(targetDocumentId);
        setFocusDocumentId(targetDocumentId);
        setDocumentsPage(1);
        return;
      }

      const targetStatus = effectiveDocumentKind === 'QUOTATION'
        ? 'DRAFT'
        : (effectiveDocumentKind === 'SALES_ORDER' && salesFlowMode === 'DIRECT_CASHIER' ? 'ISSUED' : (effectiveDocumentKind === 'SALES_ORDER' ? 'DRAFT' : 'ISSUED'));

      const selectedRestaurantTable = (isRestaurantVertical && effectiveDocumentKind === 'SALES_ORDER')
        ? restaurantTables.find((row) => row.id === (form.restaurantTableId ?? 0))
        : null;

      const response = await createCommercialDocument(accessToken, {
        ...form,
        globalDiscountAmount,
        documentKind: effectiveDocumentKind,
        documentKindId: selectedEffectiveDocumentKind?.id ?? null,
        restaurantTableLabel: selectedRestaurantTable?.name ?? form.restaurantTableLabel ?? '',
        status: targetStatus,
        noteAffectedDocumentId: form.noteAffectedDocumentId ?? null,
        noteReasonCode: form.noteReasonCode ?? '',
        items: payloadItems,
        branchId,
        warehouseId,
        cashRegisterId: salesFlowMode === 'SELLER_TO_CASHIER' && isSellerUser ? null : cashRegisterId,
      });

      const issued = (response as { data?: unknown }).data as
        | {
            id: number;
            document_kind: string;
            series: string;
            number: number;
            issue_at?: string;
            total: number;
            status: string;
          }
        | undefined;

      if (issued) {
        const printTotals = normalizePrintableTotals(lookups, payloadItems);
        const printableGrandTotal = Math.max(printTotals.grandTotal - globalDiscountAmount, 0);
        const selectedNoteReason = activeNoteReasons.find((row) => row.code === (form.noteReasonCode ?? '')) ?? null;
        const selectedVehicle = workshopMultiVehicleEnabled
          ? (customerVehicles.find((row) => row.id === Number(form.customerVehicleId ?? 0)) ?? null)
          : null;
        const selectedReferenceDocumentNumber = selectedReferenceDocument
          ? `${selectedReferenceDocument.series}-${String(selectedReferenceDocument.number).padStart(6, '0')}`
          : '';
        const printable: PrintableSalesDocument = {
          id: Number(issued.id),
          documentKind: form.documentKind,
          series: issued.series,
          number: Number(issued.number),
          issueDate: String(issued.issue_at ?? form.issueDate),
          dueDate: form.dueDate || null,
          status: issued.status,
          currencyCode: selectedCurrency?.code ?? '-',
          currencySymbol: selectedCurrency?.symbol ?? '',
          paymentMethodName: lookups?.payment_methods.find((row) => row.id === form.paymentMethodId)?.name ?? '-',
          customerName: selectedCustomer?.name ?? form.customerQuery,
          customerDocNumber: selectedCustomer?.doc_number ?? '',
          customerAddress: form.customerAddress,
          subtotal: printTotals.subtotal,
          taxTotal: printTotals.taxTotal,
          grandTotal: printableGrandTotal,
          gravadaTotal: printTotals.gravadaTotal,
          inafectaTotal: printTotals.inafectaTotal,
          exoneradaTotal: printTotals.exoneradaTotal,
          metadata: {
            discount_total: globalDiscountAmount > 0 ? Number(globalDiscountAmount.toFixed(2)) : 0,
            table_label: selectedRestaurantTable?.name ?? null,
            source_document_id: form.noteAffectedDocumentId ?? null,
            source_document_kind: selectedReferenceDocument?.document_kind ?? null,
            source_document_number: selectedReferenceDocumentNumber || null,
            note_reason_code: form.noteReasonCode ?? null,
            note_reason_description: selectedNoteReason?.description ?? null,
            has_detraccion: form.hasDetraccion ?? false,
            detraccion_service_code: form.hasDetraccion ? (form.detraccionServiceCode ?? null) : null,
            detraccion_service_name: selectedDetractionService?.name ?? null,
            detraccion_rate_percent: form.hasDetraccion ? detraccionRate : null,
            detraccion_amount: form.hasDetraccion ? detraccionAmount : null,
            detraccion_account_number: lookups?.detraccion_account?.account_number ?? null,
            detraccion_bank_name: lookups?.detraccion_account?.bank_name ?? null,
            has_retencion: form.hasRetencion ?? false,
            retencion_type_code: form.hasRetencion ? (form.retencionTypeCode ?? null) : null,
            retencion_type_name: selectedRetencionType?.name ?? null,
            retencion_rate_percent: form.hasRetencion ? retencionPercentage : null,
            retencion_amount: form.hasRetencion ? retencionAmount : null,
            retencion_account_number: lookups?.retencion_account?.account_number ?? null,
            retencion_bank_name: lookups?.retencion_account?.bank_name ?? null,
            has_percepcion: form.hasPercepcion ?? false,
            percepcion_type_code: form.hasPercepcion ? (form.percepcionTypeCode ?? null) : null,
            percepcion_type_name: selectedPercepcionType?.name ?? null,
            percepcion_rate_percent: form.hasPercepcion ? percepcionPercentage : null,
            percepcion_amount: form.hasPercepcion ? percepcionAmount : null,
            percepcion_account_number: lookups?.percepcion_account?.account_number ?? null,
            percepcion_bank_name: lookups?.percepcion_account?.bank_name ?? null,
            payment_condition: form.isCreditSale ? 'CREDITO' : 'CONTADO',
            credit_installments: form.isCreditSale
              ? (form.creditInstallments ?? []).map((row, index) => ({
                  installment_no: index + 1,
                  amount: Number(Number(row.amount ?? 0).toFixed(2)),
                  due_at: row.dueDate,
                  notes: String(row.observation ?? '').trim() || null,
                }))
              : [],
            credit_total: form.isCreditSale ? Number(creditPendingTotal.toFixed(2)) : 0,
            has_advance: advancesEnabled && cappedAdvanceAmount > 0,
            advance_amount: advancesEnabled ? Number(cappedAdvanceAmount.toFixed(2)) : 0,
            customer_vehicle_id: workshopMultiVehicleEnabled ? (form.customerVehicleId ?? null) : null,
            vehicle_plate: workshopMultiVehicleEnabled ? (selectedVehicle?.plate ?? null) : null,
            vehicle_brand: workshopMultiVehicleEnabled ? (selectedVehicle?.brand ?? null) : null,
            vehicle_model: workshopMultiVehicleEnabled ? (selectedVehicle?.model ?? null) : null,
            sunat_operation_type_code: (form.hasDetraccion || form.hasRetencion || form.hasPercepcion)
              ? (form.sunatOperationTypeCode || selectedSunatOperationType?.code || null)
              : null,
            sunat_operation_type_name: selectedSunatOperationType?.name ?? null,
          },
          items: payloadItems.map((item, index) => ({
            lineNo: index + 1,
            qty: Number(item.qty),
            unitLabel: unitLabelForPrint(lookups?.units ?? null, item.unitId ?? null),
            description: item.description,
            unitPrice: Number(item.unitPrice),
            lineTotal: computeLineTotals(
              Number(item.qty),
              Number(item.unitPrice),
              Number(item.taxRate ?? 0),
              Boolean(item.priceIncludesTax)
            ).total,
          })),
        };
        const printableWithCompany = withCompanyForPrint(printable);

        setIssuedPreview({
          ...issued,
          printable: printableWithCompany,
        });

        setPreviewDialog({
          title: salesFlowMode === 'SELLER_TO_CASHIER' ? 'Ticket de pedido para caja' : 'Documento emitido A4',
          subtitle: `${issued.series}-${Number(issued.number).toString().padStart(6, '0')}`,
          html:
            salesFlowMode === 'SELLER_TO_CASHIER'
              ? buildCommercialDocument80mmHtml(printableWithCompany, { embedded: true, showItemDiscount: salesItemDiscountEnabled })
              : buildCommercialDocumentA4Html(printableWithCompany, { embedded: true, showItemDiscount: salesItemDiscountEnabled }),
          variant: salesFlowMode === 'SELLER_TO_CASHIER' ? 'compact' : 'wide',
        });
      }

      setMessage(
        salesFlowMode === 'SELLER_TO_CASHIER'
          ? 'Pedido comercial generado. Caja puede convertirlo a nota de pedido o comprobante tributario.'
          : 'Documento comercial creado correctamente.'
      );

      const nextFilter = resolveViewFilterForDocumentKind(effectiveDocumentKind);
      const nextAdvancedFilters: DocumentAdvancedFilters = {
        ...initialDocumentAdvancedFilters,
        series: issued?.series ?? '',
        number: issued?.number != null ? String(issued.number) : '',
      };

      setSalesWorkspaceMode('REPORT');
      setCashierReportPanelMode('FULL');
      setDocumentViewFilter(nextFilter);
      setDocumentFiltersDraft(nextAdvancedFilters);
      setDocumentFiltersApplied(nextAdvancedFilters);
      suppressNextPinnedResetRef.current = true;
      if (issued?.id != null) {
        setPinnedDocumentId(Number(issued.id));
        setFocusDocumentId(Number(issued.id));
      }
      setDocumentsPage(1);

      setCart([]);
      setForm((prev) => ({
        ...prev,
        productId: null,
        productQuery: '',
        unitId: null,
        lotId: null,
        isManualItem: false,
        manualDescription: '',
        hasDetraccion: false,
        detraccionServiceCode: '',
        hasRetencion: false,
        retencionTypeCode: '',
        hasPercepcion: false,
        percepcionTypeCode: '',
        sunatOperationTypeCode: '',
        restaurantTableId: null,
        restaurantTableLabel: '',
        isCreditSale: false,
        creditInstallments: [],
        advanceAmount: 0,
        qty: 1,
        unitPrice: 0,
      }));
      if (documentsPage !== 1) {
        setDocumentsPage(1);
      }
      await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo crear documento';

      if (isCashOpeningRequiredError(text)) {
        setMessage('');
        setSunatToast({
          tone: 'bad',
          title: 'Caja cerrada',
          detail: 'Debes aperturar caja antes de realizar la venta.',
        });
      } else {
        setMessage(text);
      }
    } finally {
      setLoading(false);
    }
  }

  async function executeConvertDocument(source: CommercialDocumentListItem, targetDocumentKind: 'INVOICE' | 'RECEIPT' | 'SALES_ORDER') {
    if (!canConvertInCurrentMode) {
      setMessage('En este modo, solo caja puede convertir pedidos a boleta/factura.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const targetSeriesRows = await fetchSeriesNumbers(accessToken, {
        documentKind: targetDocumentKind,
        branchId,
        warehouseId,
      });

      const targetSeries = targetSeriesRows[0]?.series;
      if (!targetSeries) {
        setMessage(`No existe serie habilitada para ${targetDocumentKind}.`);
        setLoading(false);
        return;
      }

      const nowIso = nowLimaIso();
      const conversionResponse = await convertCommercialDocument(accessToken, source.id, {
        target_document_kind: targetDocumentKind,
        series: targetSeries,
        issue_at: nowIso,
        cash_register_id: cashRegisterId ?? undefined,
        payment_method_id: form.paymentMethodId ? Number(form.paymentMethodId) : undefined,
        defer_sunat_send: true,
      });

      const convertedId = Number((conversionResponse as { data?: { id?: number } })?.data?.id ?? 0);

      if (convertedId > 0) {
        setPostConvertPrintModal({
          title: 'Documento convertido',
          subtitle: 'Elige formato de impresion',
          details: null,
          loading: true,
          error: '',
        });

        try {
          const details = await fetchCommercialDocumentDetails(accessToken, convertedId);
          const printableDetails = withCompanyForPrint(details as PrintableSalesDocument);
          setPostConvertPrintModal({
            title: 'Documento convertido',
            subtitle: `${printableDetails.series}-${String(printableDetails.number).padStart(6, '0')}`,
            details: printableDetails,
            loading: false,
            error: '',
          });
        } catch (error) {
          setPostConvertPrintModal({
            title: 'Documento convertido',
            subtitle: '',
            details: null,
            loading: false,
            error: error instanceof Error ? error.message : 'No se pudo cargar el documento convertido',
          });
        }
      }

      setMessage(
        `Documento ${source.series}-${source.number} convertido a ${
          targetDocumentKind === 'INVOICE'
            ? 'Factura'
            : targetDocumentKind === 'RECEIPT'
              ? 'Boleta'
              : 'Nota de pedido'
        } correctamente.`
      );

      if (documentsPage !== 1) {
        setDocumentsPage(1);
      }
      await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo convertir documento';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function openConvertPreview(source: CommercialDocumentListItem, targetDocumentKind: 'INVOICE' | 'RECEIPT' | 'SALES_ORDER') {
    if (!canConvertInCurrentMode) {
      setMessage('En este modo, solo caja puede convertir pedidos.');
      return;
    }

    setConvertPreviewModal({
      source,
      targetDocumentKind,
      details: null,
      previewHtml: '',
      loading: true,
      error: '',
    });

    try {
      const details = await fetchCommercialDocumentDetails(accessToken, source.id);
      if (!details.items || details.items.length === 0) {
        setConvertPreviewModal(null);
        setMessage('El documento origen no tiene items para convertir.');
        return;
      }

      const printableDetails = withCompanyForPrint(details as PrintableSalesDocument);

      setConvertPreviewModal({
        source,
        targetDocumentKind,
        details: printableDetails,
        previewHtml: buildCommercialDocumentA4Html(printableDetails, { embedded: true, showItemDiscount: salesItemDiscountEnabled }),
        loading: false,
        error: '',
      });
    } catch (error) {
      setConvertPreviewModal({
        source,
        targetDocumentKind,
        details: null,
        previewHtml: '',
        loading: false,
        error: error instanceof Error ? error.message : 'No se pudo cargar vista previa de conversion',
      });
    }
  }

  async function handleVoidDocument(row: CommercialDocumentListItem) {
    if (!canVoidDocumentsInCurrentMode) {
      setMessage('La anulacion de documentos esta deshabilitada en la configuracion actual.');
      return;
    }

    const isReceipt = isReceiptDocument(row);
    const docLabel = docKindLabelResolved(row.document_kind);
    const accepted = window.confirm(`Se anulara ${docLabel} ${row.series}-${row.number}. Desea continuar?`);
    if (!accepted) {
      return;
    }

    const reason = window.prompt('Motivo de anulacion (opcional):', '') ?? '';

    setLoading(true);
    setMessage('');
    try {
      const response = await voidCommercialDocument(accessToken, row.id, {
        reason: reason.trim() || undefined,
        notes: reason.trim() || undefined,
        void_at: nowLimaIso(),
      });
      const linkedSummaryId = toPositiveInt((response as { daily_summary_id?: unknown } | null)?.daily_summary_id);
      const summaryType = isReceipt ? 'RA' : 'baja SUNAT';
      const summaryInfo = linkedSummaryId && isReceipt ? ` Asignado automaticamente a ${summaryType} #${linkedSummaryId}.` : '';
      setMessage(`${docLabel} ${row.series}-${row.number} anulado correctamente.${summaryInfo}`);
      await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo anular el documento';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddReceiptToDeclarationSummary(row: CommercialDocumentListItem) {
    if (!canAddReceiptToDeclarationSummary(row)) {
      setMessage('Esta boleta no puede agregarse a resumen RC en este momento.');
      return;
    }

    const accepted = window.confirm(
      `Se agregara Boleta ${row.series}-${row.number} al resumen diario de declaracion (RC). Desea continuar?`
    );
    if (!accepted) {
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      // TODO: Implementar endpoint para agregar boleta a RC manualmente
      setMessage('Boleta agregada a resumen RC. (Funcionalidad en desarrollo)');
      // await addCommercialDocumentToDeclarationSummary(accessToken, row.id);
      // await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo agregar documento al resumen';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleSunatVoidCommunication(row: CommercialDocumentListItem) {
    const accepted = window.confirm(
      `Se enviara comunicacion de baja SUNAT para ${row.series}-${row.number}. Desea continuar?`
    );
    if (!accepted) {
      return;
    }

    const reason = window.prompt('Motivo de baja SUNAT (opcional):', '') ?? '';

    setLoading(true);
    setMessage('');
    try {
      const response = await sendSunatVoidCommunication(accessToken, row.id, {
        reason: reason.trim() || undefined,
        notes: reason.trim() || undefined,
      });

      const responseSummary = summarizeSunatDiagnostic(response.sunat_error_code, response.sunat_error_message, response.bridge_response);
      const httpSummary = response.bridge_http_code ? `HTTP ${response.bridge_http_code}` : '';
      const endpointSummary = response.debug?.endpoint ? `endpoint=${response.debug.endpoint}` : '';
      const payloadHashSummary = response.debug?.payload_sha1 ? `payload_sha1=${response.debug.payload_sha1}` : '';
      const detailSummary = [httpSummary, responseSummary, endpointSummary, payloadHashSummary]
        .filter((part) => part !== '')
        .join(' | ');

      setMessage(
        detailSummary
          ? `${response.message || 'Comunicacion de baja SUNAT ejecutada.'} (${detailSummary})`
          : (response.message || 'Comunicacion de baja SUNAT ejecutada.')
      );

      setSunatToast({
        tone: response.sunat_void_status === 'ACCEPTED' ? 'ok' : response.sunat_void_status === 'REJECTED' ? 'bad' : 'warn',
        title: `Baja SUNAT: ${response.sunat_void_label || response.sunat_void_status}`,
        detail: detailSummary || 'Sin detalle adicional del puente.',
      });

      await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo comunicar la baja SUNAT';
      setMessage(text);
      setSunatToast({
        tone: 'bad',
        title: 'Baja SUNAT: Error',
        detail: text,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadXml(row: CommercialDocumentListItem) {
    setLoading(true);
    setMessage('');
    try {
      const { blob, filename, endpoint, httpStatus, method, contentType, responseHeaders } = await downloadSunatXml(accessToken, row.id);
      console.groupCollapsed(`[SUNAT][XML] ${row.series}-${String(row.number).padStart(6, '0')}`);
      console.log('frontend_request', {
        method,
        url: `${window.location.origin}/api/sales/commercial-documents/${row.id}/download-xml`,
      });
      console.log('backend_response', {
        httpStatus,
        contentType,
        bridgeEndpoint: endpoint,
        filename,
        blobSize: blob.size,
      });
      console.log('response_headers', responseHeaders);
      console.groupEnd();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const detail = [
        `Metodo: GET`,
        `HTTP: ${httpStatus}`,
        endpoint ? `Endpoint: ${endpoint}` : '',
        `Archivo: ${filename}`,
      ].filter(Boolean).join('\n');
      setSunatToast({ tone: 'ok', title: 'XML descargado correctamente', detail });
      setMessage(`XML descargado: ${filename}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo descargar el XML';
      const endpoint = (error as Record<string, unknown>).endpoint as string | undefined;
      const httpStatus = (error as Record<string, unknown>).httpStatus as number | undefined;
      const contentType = (error as Record<string, unknown>).contentType as string | undefined;
      const responseHeaders = (error as Record<string, unknown>).responseHeaders as Record<string, unknown> | undefined;
      console.groupCollapsed(`[SUNAT][XML][ERROR] ${row.series}-${String(row.number).padStart(6, '0')}`);
      console.log('error', {
        method: 'GET',
        endpoint,
        httpStatus,
        contentType,
        message: text,
      });
      console.log('response_headers', responseHeaders ?? {});
      console.groupEnd();
      const detail = [
        `Metodo: GET`,
        httpStatus ? `HTTP: ${httpStatus}` : '',
        endpoint ? `Endpoint: ${endpoint}` : '',
        `Error: ${text}`,
      ].filter(Boolean).join('\n');
      setSunatToast({ tone: 'bad', title: 'Error al descargar XML', detail });
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadCdr(row: CommercialDocumentListItem) {
    setLoading(true);
    setMessage('');
    try {
      const { blob, filename, endpoint, httpStatus, method, contentType, responseHeaders } = await downloadSunatCdr(accessToken, row.id);
      console.groupCollapsed(`[SUNAT][CDR] ${row.series}-${String(row.number).padStart(6, '0')}`);
      console.log('frontend_request', {
        method,
        url: `${window.location.origin}/api/sales/commercial-documents/${row.id}/download-cdr`,
      });
      console.log('backend_response', {
        httpStatus,
        contentType,
        bridgeEndpoint: endpoint,
        filename,
        blobSize: blob.size,
      });
      console.log('response_headers', responseHeaders);
      console.groupEnd();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const detail = [
        `Metodo: GET`,
        `HTTP: ${httpStatus}`,
        endpoint ? `Endpoint: ${endpoint}` : '',
        `Archivo: ${filename}`,
      ].filter(Boolean).join('\n');
      setSunatToast({ tone: 'ok', title: 'CDR descargado correctamente', detail });
      setMessage(`CDR descargado: ${filename}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo descargar el CDR';
      const endpoint = (error as Record<string, unknown>).endpoint as string | undefined;
      const httpStatus = (error as Record<string, unknown>).httpStatus as number | undefined;
      const contentType = (error as Record<string, unknown>).contentType as string | undefined;
      const responseHeaders = (error as Record<string, unknown>).responseHeaders as Record<string, unknown> | undefined;
      console.groupCollapsed(`[SUNAT][CDR][ERROR] ${row.series}-${String(row.number).padStart(6, '0')}`);
      console.log('error', {
        method: 'GET',
        endpoint,
        httpStatus,
        contentType,
        message: text,
      });
      console.log('response_headers', responseHeaders ?? {});
      console.groupEnd();
      const detail = [
        `Metodo: GET`,
        httpStatus ? `HTTP: ${httpStatus}` : '',
        endpoint ? `Endpoint: ${endpoint}` : '',
        `Error: ${text}`,
      ].filter(Boolean).join('\n');
      setSunatToast({ tone: 'bad', title: 'Error al descargar CDR', detail });
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenNoteFromDocument(
    row: CommercialDocumentListItem,
    noteKind: 'CREDIT_NOTE' | 'DEBIT_NOTE'
  ) {
    setLoading(true);
    setMessage('');
    try {
      const details = await fetchCommercialDocumentDetails(accessToken, row.id) as PrintableSalesDocument & {
        customerId?: number;
        customerVehicleId?: number | null;
        currencyId?: number;
        paymentMethodId?: number | null;
        customerDocNumber?: string;
        customerAddress?: string;
        items?: Array<{
          productId?: number | null;
          unitId?: number | null;
          priceTierId?: number | null;
          qty: number;
          qtyBase?: number;
          conversionFactor?: number;
          baseUnitPrice?: number;
          description: string;
          unitPrice: number;
          wholesaleDiscountPercent?: number;
          priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
          taxCategoryId?: number | null;
          taxLabel?: string;
          taxRate?: number;
          metadata?: Record<string, unknown> | null;
          lots?: Array<{ lot_id: number; qty: number }>;
        }>;
      };

      const detailsItems = (details.items ?? []) as NonNullable<typeof details.items>;

      const editableItems: SalesDraftItem[] = detailsItems.map((item) => ({
        productId: item.productId ?? null,
        unitId: item.unitId ?? null,
        lotId: item.lots && item.lots.length > 0 ? Number(item.lots[0].lot_id) : null,
        priceTierId: item.priceTierId ?? null,
        wholesaleDiscountPercent: item.wholesaleDiscountPercent ?? null,
        priceSource: item.priceSource ?? 'MANUAL',
        taxCategoryId: item.taxCategoryId ?? null,
        priceIncludesTax: Boolean(
          item.metadata && (item.metadata as Record<string, unknown>).price_includes_tax === true
        ),
        qtyBase: item.qtyBase ?? null,
        conversionFactor: item.conversionFactor ?? null,
        baseUnitPrice: item.baseUnitPrice ?? null,
        taxRate: Number(item.taxRate ?? 0),
        taxLabel: item.taxLabel ?? 'Sin IGV',
        isManual: !(item.productId && Number(item.productId) > 0),
        description: item.description,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discountTotal: Number((item.metadata?.descuento ?? item.metadata?.discount_total ?? 0) || 0),
        isFreeOperation: Boolean(item.metadata?.is_free_operation),
        freeOperationTotal: Number((item.metadata?.gratuitas ?? item.metadata?.free_operation_total ?? 0) || 0),
      }));

      setCart(editableItems);
      setForm((prev) => ({
        ...initialForm,
        documentKind: noteKind,
        customerId: Number(details.customerId ?? 0),
        customerVehicleId: toOptionalNumber(details.customerVehicleId ?? details.metadata?.customer_vehicle_id),
        currencyId: Number(details.currencyId ?? prev.currencyId ?? 1),
        paymentMethodId: Number(details.paymentMethodId ?? prev.paymentMethodId ?? 1),
        customerQuery: `${details.customerDocNumber ?? 'SIN-DOC'} - ${details.customerName ?? 'Cliente'}`,
        customerAddress: details.customerAddress ?? '',
        issueDate: TODAY,
        series: '',
        noteAffectedDocumentId: row.id,
        noteReasonCode: '',
        productId: null,
        productQuery: '',
        lotId: null,
        manualDescription: '',
        isManualItem: false,
      }));

      setSelectedCustomer(null);
      setSelectedProduct(null);
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setEditingDocumentId(null);
      setEditingDocumentContext(null);
      setSalesWorkspaceMode('SELL');

      const noteLabel = noteKind === 'CREDIT_NOTE' ? 'Nota de Credito' : 'Nota de Debito';
      setMessage(
        `${noteLabel} pre-cargada desde ${row.series}-${String(row.number).padStart(6, '0')}. ` +
        `Verifica la serie, selecciona el motivo y ajusta los items si corresponde.`
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar el documento';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function startEditDraft(row: CommercialDocumentListItem) {
    if (!canEditCommercialDocument(row, canEditDraftInCurrentMode, canEditIssuedBeforeSunatFinalInCurrentMode)) {
      setMessage('La edicion no esta permitida para este comprobante en la configuracion actual.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const details = await fetchCommercialDocumentDetails(accessToken, row.id) as PrintableSalesDocument & {
        customerId?: number;
        customerVehicleId?: number | null;
        currencyId?: number;
        paymentMethodId?: number | null;
        items?: Array<{
          productId?: number | null;
          unitId?: number | null;
          priceTierId?: number | null;
          qty: number;
          qtyBase?: number;
          conversionFactor?: number;
          baseUnitPrice?: number;
          description: string;
          unitPrice: number;
          wholesaleDiscountPercent?: number;
          priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
          taxCategoryId?: number | null;
          taxLabel?: string;
          taxRate?: number;
          metadata?: Record<string, unknown> | null;
          lots?: Array<{ lot_id: number; qty: number }>;
        }>;
      };

      const detailsItems = (details.items ?? []) as Array<{
        productId?: number | null;
        unitId?: number | null;
        priceTierId?: number | null;
        qty: number;
        qtyBase?: number;
        conversionFactor?: number;
        baseUnitPrice?: number;
        description: string;
        unitPrice: number;
        wholesaleDiscountPercent?: number;
        priceSource?: 'MANUAL' | 'TIER' | 'PROFILE';
        taxCategoryId?: number | null;
        taxLabel?: string;
        taxRate?: number;
        metadata?: Record<string, unknown> | null;
        lots?: Array<{ lot_id: number; qty: number }>;
      }>;

      const editableItems: SalesDraftItem[] = detailsItems.map((item) => ({
        productId: item.productId ?? null,
        unitId: item.unitId ?? null,
        lotId: item.lots && item.lots.length > 0 ? Number(item.lots[0].lot_id) : null,
        priceTierId: item.priceTierId ?? null,
        wholesaleDiscountPercent: item.wholesaleDiscountPercent ?? null,
        priceSource: item.priceSource ?? 'MANUAL',
        taxCategoryId: item.taxCategoryId ?? null,
        priceIncludesTax: Boolean(item.metadata && (item.metadata as Record<string, unknown>).price_includes_tax === true),
        qtyBase: item.qtyBase ?? null,
        conversionFactor: item.conversionFactor ?? null,
        baseUnitPrice: item.baseUnitPrice ?? null,
        taxRate: Number(item.taxRate ?? 0),
        taxLabel: item.taxLabel ?? 'Sin IGV',
        isManual: !(item.productId && Number(item.productId) > 0),
        description: item.description,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
      }));

      setCart(editableItems);
      setForm((prev) => ({
        ...prev,
        documentKind: details.documentKind,
        customerId: Number(details.customerId ?? prev.customerId ?? 0),
        customerVehicleId: toOptionalNumber(details.customerVehicleId ?? details.metadata?.customer_vehicle_id),
        currencyId: Number(details.currencyId ?? prev.currencyId ?? 1),
        paymentMethodId: Number(details.paymentMethodId ?? prev.paymentMethodId ?? 1),
        customerQuery: `${details.customerDocNumber ?? 'SIN-DOC'} - ${details.customerName ?? 'Cliente'}`,
        customerAddress: details.customerAddress ?? '',
        issueDate: details.issueDate ? String(details.issueDate).slice(0, 10) : prev.issueDate,
        dueDate: details.dueDate ? String(details.dueDate).slice(0, 10) : '',
        series: details.series ?? prev.series,
        globalDiscountAmount: Number((details.metadata?.discount_total ?? 0) || 0),
        productId: null,
        productQuery: '',
        lotId: null,
        manualDescription: '',
        isManualItem: false,
        draftIsFreeOperation: false,
        draftLineDiscount: 0,
        qty: 1,
      }));

      setSelectedCustomer(null);
      setSelectedProduct(null);
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setAutoPriceHint('');
      setAutoPriceSource('MANUAL');
      setAutoPriceTierId(null);
      setAutoPriceDiscountPercent(0);

      setEditingDocumentId(row.id);
      setEditingDocumentContext({
        id: row.id,
        documentKind: row.document_kind,
        series: String(row.series ?? ''),
        number: Number(row.number ?? 0),
      });
      setSalesWorkspaceMode('SELL');
      setMessage(`Editando ${docKindLabelResolved(row.document_kind)} ${row.series}-${row.number}.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar el documento para edicion';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  function cancelEditingDraft() {
    setEditingDocumentId(null);
    setEditingDocumentContext(null);
    setCart([]);
    setSelectedProduct(null);
    setSelectedProductCommercialConfig(null);
    setSelectedProductUnitOptions(lookups?.units ?? []);
    setForm((prev) => ({
      ...initialForm,
      currencyId: prev.currencyId,
      paymentMethodId: prev.paymentMethodId,
      taxCategoryId: prev.taxCategoryId,
      documentKind: salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser ? 'QUOTATION' : prev.documentKind,
      series: prev.series,
    }));
    setMessage('Edicion cancelada.');
  }

  async function confirmConvertFromPreview() {
    if (!convertPreviewModal) {
      return;
    }

    const source = convertPreviewModal.source;
    const targetDocumentKind = convertPreviewModal.targetDocumentKind;
    setConvertPreviewModal(null);
    await executeConvertDocument(source, targetDocumentKind);
  }

  function openPostConvertPrint(format: '80mm' | 'A4') {
    if (!postConvertPrintModal?.details) {
      return;
    }

    const details = withCompanyForPrint(postConvertPrintModal.details);
    setPreviewDialog({
      title: format === '80mm' ? 'Ticket 80mm' : 'Documento A4',
      subtitle: `${details.series}-${String(details.number).padStart(6, '0')}`,
      html: format === '80mm'
        ? buildCommercialDocument80mmHtml(details, { embedded: true, showItemDiscount: salesItemDiscountEnabled })
        : buildCommercialDocumentA4Html(details, { embedded: true, showItemDiscount: salesItemDiscountEnabled }),
      variant: format === '80mm' ? 'compact' : 'wide',
    });
    setPostConvertPrintModal(null);
  }

  function handleSwitchToSellWorkspace() {
    const defaultDocumentKind = (salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser)
      ? 'QUOTATION'
      : initialForm.documentKind;
    const defaultSeries = effectiveDocumentKind === defaultDocumentKind
      ? (series.find((row) => row.series === form.series)?.series ?? series[0]?.series ?? '')
      : '';

    setSalesWorkspaceMode('SELL');
    setLoadingReferenceDocument(false);
    setEditingDocumentId(null);
    setEditingDocumentContext(null);
    setConvertPreviewModal(null);
    setPostConvertPrintModal(null);
    setPreviewDialog(null);
    setSunatBridgeDebugState(null);
    setSunatToast(null);
    setMessage('');
    setCart([]);
    setLots([]);
    setReferenceDocuments([]);
    setSelectedCustomer(null);
    setSelectedProduct(null);
    setSelectedProductCommercialConfig(null);
    setSelectedProductUnitOptions(lookups?.units ?? []);
    setCustomerSuggestions([]);
    setProductSuggestions([]);
    setActiveCustomerIndex(-1);
    setActiveProductIndex(-1);
    setCustomerInputFocused(false);
    setResolvingCustomerDocument(false);
    setCreditPlanModalOpen(false);
    setIssuedPreview(null);
    setFocusDocumentId(null);
    setHighlightedDocumentId(null);
    setPinnedDocumentId(null);
    setAutoPriceHint('');
    setAutoPriceSource('MANUAL');
    setAutoPriceTierId(null);
    setAutoPriceDiscountPercent(0);

    const defaultCurrencyId = (lookups?.currencies.find((row) => row.is_default)?.id ?? lookups?.currencies?.[0]?.id ?? initialForm.currencyId);
    const defaultPaymentMethodId = resolveDefaultPaymentMethodId(lookups?.payment_methods, initialForm.paymentMethodId || 1);
    const defaultTaxCategoryId = (
      lookups?.tax_categories.find((row) => Number(row.rate_percent) > 0)?.id
      ?? lookups?.tax_categories?.[0]?.id
      ?? initialForm.taxCategoryId
    );

    setForm({
      ...initialForm,
      documentKind: defaultDocumentKind,
      series: defaultSeries,
      currencyId: defaultCurrencyId,
      paymentMethodId: defaultPaymentMethodId,
      taxCategoryId: defaultTaxCategoryId,
      issueDate: TODAY,
      dueDate: TODAY,
      receiptSendMode: 'DIRECT',
    });
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Ventas</h3>
        <button type="button" onClick={() => void loadData()} disabled={loading || loadingBootstrap || loadingDocuments}>
          Refrescar
        </button>
      </div>

      <div className="sales-topbar">
      <div className="workspace-mode-switch">
        {canUseSellWorkspace && (
          <button
            type="button"
            className={`mode-btn${salesWorkspaceMode === 'SELL' ? ' mode-btn-active' : ''}`}
            onClick={handleSwitchToSellWorkspace}
          >
            {shouldPrioritizePendingOrders ? '🧾 Venta / Emision manual' : '🛒 Venta rápida'}
          </button>
        )}
        <button
          type="button"
          className={`mode-btn${salesWorkspaceMode === 'REPORT' ? ' mode-btn-active' : ''}`}
          onClick={() => setSalesWorkspaceMode('REPORT')}
        >
          📊 Reporte de ventas
        </button>
      </div>

      <div className="sales-mode-summary" aria-live="polite">
        <span className="sales-mode-chip">Modo: {salesFlowModeLabel}</span>
        {isSeparatedMode && <span className="sales-mode-chip">Perfil: {activeProfileLabel}</span>}
        <span className={featureSourceBadgeClass(sellerToCashierSource)}>
          Fuente flujo: {featureSourceLabel(sellerToCashierSource)}
        </span>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sales-mode-toggle"
            onClick={() => setShowRuntimeConfig((prev) => !prev)}
          >
            Configuracion activa
          </button>
          {showRuntimeConfig && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                zIndex: 20,
                minWidth: '320px',
                maxWidth: 'min(90vw, 520px)',
                padding: '10px',
                border: '1px solid #dbe4f0',
                borderRadius: '10px',
                background: '#ffffff',
                boxShadow: '0 14px 30px rgba(15, 23, 42, 0.16)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem',
              }}
            >
              <span className="sales-mode-chip" style={{ background: canEditDraftInCurrentMode ? '#d1fae5' : '#fee2e2', color: canEditDraftInCurrentMode ? '#065f46' : '#991b1b' }}>
                Edicion borrador: {canEditDraftInCurrentMode ? 'Habilitada' : 'Deshabilitada'}
              </span>
              <span className="sales-mode-chip" style={{ background: canVoidDocumentsInCurrentMode ? '#d1fae5' : '#fee2e2', color: canVoidDocumentsInCurrentMode ? '#065f46' : '#991b1b' }}>
                Anulacion: {canVoidDocumentsInCurrentMode ? 'Habilitada' : 'Deshabilitada'}
              </span>
              <span className={featureSourceBadgeClass(documentVoidSource)}>
                Fuente anulacion: {featureSourceLabel(documentVoidSource)}
              </span>
              <span className="sales-mode-chip" style={{ background: taxBridgeEnabled ? '#dbeafe' : '#f3f4f6', color: taxBridgeEnabled ? '#1e3a8a' : '#374151' }}>
                SUNAT bridge: {taxBridgeEnabled ? 'Habilitado' : 'Deshabilitado'}
              </span>
              <span className={featureSourceBadgeClass(taxBridgeSource)}>
                Fuente SUNAT bridge: {featureSourceLabel(taxBridgeSource)}
              </span>
              <span className="sales-mode-chip" style={{ background: allowVoidForSeller ? '#ecfeff' : '#fee2e2', color: allowVoidForSeller ? '#155e75' : '#991b1b' }}>
                Vendedor: {allowVoidForSeller ? 'Puede anular' : 'Sin anulacion'}
              </span>
              <span className="sales-mode-chip" style={{ background: allowVoidForCashier ? '#ecfeff' : '#fee2e2', color: allowVoidForCashier ? '#155e75' : '#991b1b' }}>
                Caja: {allowVoidForCashier ? 'Puede anular' : 'Sin anulacion'}
              </span>
              <span className="sales-mode-chip" style={{ background: allowVoidForAdmin ? '#ecfeff' : '#fee2e2', color: allowVoidForAdmin ? '#155e75' : '#991b1b' }}>
                Admin: {allowVoidForAdmin ? 'Puede anular' : 'Sin anulacion'}
              </span>
              <span className="sales-mode-chip" style={{ background: reverseStockOnVoidEnabled ? '#dbeafe' : '#fef3c7', color: reverseStockOnVoidEnabled ? '#1e3a8a' : '#92400e' }}>
                Reversa stock al anular: {reverseStockOnVoidEnabled ? 'Activa' : 'Inactiva'}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className="sales-mode-toggle"
          onClick={() => setShowModeSummaryDetails((prev) => !prev)}
        >
          {showModeSummaryDetails ? 'Ocultar detalle' : 'Ver detalle'}
        </button>
      </div>
      </div>{/* /sales-topbar */}

      {showModeSummaryDetails && isSeparatedMode && (
        <p className="notice" style={{ marginTop: '0.25rem' }}>
          <strong>Perfil activo:</strong> {activeProfileLabel}. {activeProfileHint}
        </p>
      )}

      {message && <p className="notice">{message}</p>}
      {sunatToast && (
        <div className="sales-sunat-toast-anchor">
          <div className={`sales-sunat-toast ${sunatToast.tone}`} role="status" aria-live="polite">
            <strong>{sunatToast.title}</strong>
            <span>{sunatToast.detail}</span>
            <button type="button" onClick={() => setSunatToast(null)} aria-label="Cerrar notificacion">Cerrar</button>
          </div>
        </div>
      )}
      {salesWorkspaceMode === 'SELL' && canUseSellWorkspace && (
        <>
      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-grid-head">
          <label>
            Tipo de comprobante
            <select
              value={selectedEffectiveDocumentKind?.id ?? ''}
              disabled={salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser}
              onChange={(e) => {
                const selectedId = Number(e.target.value || 0);
                const selectedKind = (lookups?.document_kinds ?? []).find((kind) => kind.id === selectedId);
                if (!selectedKind) {
                  return;
                }

                setForm((prev) => ({
                  ...prev,
                  documentKind: selectedKind.code as CreateDocumentForm['documentKind'],
                }));
              }}
            >
              {(lookups?.document_kinds ?? [])
                .filter((kind) => !isSeparatedMode || !isCashierUser || (kind.code !== 'QUOTATION' && kind.code !== 'SALES_ORDER'))
                .map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
                ))}
            </select>
          </label>

          <label>
            Serie
            <select
              value={form.series}
              onChange={(e) => setForm((prev) => ({ ...prev, series: e.target.value }))}
            >
              {series.map((row) => (
                <option key={row.id} value={row.series}>
                  {row.series} ({row.current_number + 1})
                </option>
              ))}
            </select>
          </label>

          <label>
            Moneda
            <select
              value={form.currencyId}
              onChange={(e) => setForm((prev) => ({ ...prev, currencyId: Number(e.target.value) }))}
            >
              {(lookups?.currencies ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.code})
                </option>
              ))}
            </select>
          </label>

          <label>
            Metodo de pago
            <select
              value={form.paymentMethodId}
              disabled={salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentMethodId: Number(e.target.value) }))}
            >
              {(lookups?.payment_methods ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sales-grid-meta sales-grid-meta-primary">
          <label className="with-suggest sales-field-customer-meta" onBlur={handleCustomerSuggestBlur}>
            <div className="sales-customer-field-head">
              <span>Cliente</span>
              <button
                type="button"
                className="btn-mini sales-customer-resolve-btn"
                onClick={() => void resolveCustomerFromPadron()}
                disabled={loading || resolvingCustomerDocument}
              >
                {resolvingCustomerDocument ? 'Consultando...' : 'Consultar DNI/RUC'}
              </button>
            </div>
            <input
              ref={customerInputRef}
              value={form.customerQuery}
              onChange={(e) => {
                setCustomerInputFocused(true);
                setForm((prev) => ({ ...prev, customerQuery: e.target.value }));
              }}
              onFocus={() => setCustomerInputFocused(true)}
              onKeyDown={handleCustomerKeyDown}
              placeholder="Buscar por nombre, documento, placa, marca o modelo"
            />
            {customerSuggestions.length > 0 && (
              <div className="suggest-box suggest-box--customer">
                {customerSuggestions.map((row, index) => (
                  <button
                    type="button"
                    key={row.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseCustomer(row)}
                    className={`suggest-item ${index === activeCustomerIndex ? 'active' : ''}`}
                  >
                    <strong>{row.name}</strong>
                    <span>
                      {row.doc_number ?? 'SIN-DOC'} {row.plate ? `| PLACA: ${row.plate}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </label>

          {workshopMultiVehicleEnabled && (
            <label className="sales-field-customer-vehicle">
              Vehículo
              <select
                value={form.customerVehicleId ?? ''}
                disabled={loadingCustomerVehicles || Number(form.customerId) <= 0 || customerVehicles.length === 0}
                onChange={(e) => {
                  const nextId = e.target.value ? Number(e.target.value) : null;
                  setForm((prev) => ({ ...prev, customerVehicleId: nextId }));
                }}
              >
                <option value="">
                  {loadingCustomerVehicles
                    ? 'Cargando vehículos...'
                    : (Number(form.customerId) <= 0 ? 'Seleccione un cliente' : 'Sin vehículo')}
                </option>
                {customerVehicles.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.plate}{row.brand ? ` | ${row.brand}` : ''}{row.model ? ` ${row.model}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="sales-field-address">
            Dirección
            <input
              value={form.customerAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, customerAddress: e.target.value }))}
              placeholder="Dirección del cliente"
            />
          </label>

          <label className="sales-field-issue-date">
            Fecha emision
            <input
              type="date"
              value={form.issueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, issueDate: e.target.value || TODAY }))}
            />
          </label>

          <label className="sales-field-due-date">
            Vencimiento
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value || prev.issueDate || TODAY }))}
            />
          </label>
        </div>

        <details className="sales-meta-collapse" open={isNoteDocument || form.isCreditSale || form.hasDetraccion || form.hasRetencion || form.hasPercepcion || (isRestaurantVertical && effectiveDocumentKind === 'SALES_ORDER')}>
          <summary className="sales-meta-collapse-summary">Datos adicionales</summary>
          <div className="sales-grid-meta sales-grid-meta-secondary">
            <div className="sales-igv-toggle-row">
              <div className="tax-mode-toggle" role="group" aria-label="Modo de precio IGV">
                <label className="tax-mode-toggle-label">
                  <input
                    type="checkbox"
                    checked={priceTaxMode === 'INCLUSIVE'}
                    onChange={(e) => setPriceTaxMode(e.target.checked ? 'INCLUSIVE' : 'EXCLUSIVE')}
                  />
                  Incluye IGV en precios
                </label>
              </div>
              <span className="sales-igv-toggle-row-hint">
                {priceTaxMode === 'INCLUSIVE' ? 'Los precios ingresados ya incluyen IGV' : 'IGV se calcula sobre el precio base'}
              </span>
            </div>
            {isRestaurantVertical && effectiveDocumentKind === 'SALES_ORDER' && (
              <label className="sales-field-address">
                Mesa / zona
                <select
                  value={form.restaurantTableId ?? ''}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : null;
                    const selected = restaurantTables.find((row) => row.id === nextId) ?? null;

                    setForm((prev) => ({
                      ...prev,
                      restaurantTableId: nextId,
                      restaurantTableLabel: selected ? selected.name : '',
                    }));
                  }}
                >
                  <option value="">Sin mesa asignada</option>
                  {restaurantTables
                    .filter((row) => row.status !== 'DISABLED')
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} - {row.name} ({row.status})
                      </option>
                    ))}
                </select>
              </label>
            )}

            {isTributaryDocument && (
              <label className="sales-field-due-date">
                Envío SUNAT
                <select
                  value={form.receiptSendMode ?? 'DIRECT'}
                  onChange={(e) => {
                    const nextMode = e.target.value === 'SUMMARY'
                      ? 'SUMMARY'
                      : (e.target.value === 'NO_SEND' ? 'NO_SEND' : 'DIRECT');
                    setForm((prev) => ({ ...prev, receiptSendMode: nextMode }));
                  }}
                >
                  <option value="DIRECT">Directo (send_xml)</option>
                  {effectiveDocumentKindBase === 'RECEIPT' && (
                    <option value="SUMMARY">Por resumen diario (RC)</option>
                  )}
                  <option value="NO_SEND">No enviar ahora</option>
                </select>
              </label>
            )}

            {(effectiveDocumentKindBase === 'INVOICE' || effectiveDocumentKindBase === 'RECEIPT') && (
              <div className="sales-tributary-slot">
                <details className="sales-tributary-panel sales-credit-summary-panel">
                  <summary className="sales-tributary-summary sales-credit-summary-bar">
                    <div className="sales-credit-summary-left">
                      <span className="sales-tributary-title">Condición de pago SUNAT</span>
                      <span className={`sales-tributary-chip ${form.isCreditSale ? 'is-active' : ''}`}>
                        {form.isCreditSale ? 'Crédito' : 'Contado'}
                      </span>
                      {form.isCreditSale && (
                        <span className="sales-tributary-chip is-warning">Cuotas {creditInstallments.length}</span>
                      )}
                      {form.isCreditSale && creditObservationCount > 0 && (
                        <span className="sales-tributary-chip is-soft">Obs. {creditObservationCount}</span>
                      )}
                      {advancesEnabled && cappedAdvanceAmount > 0 && (
                        <span className="sales-tributary-chip is-soft">Anticipo {selectedCurrency?.symbol ?? ''} {cappedAdvanceAmount.toFixed(2)}</span>
                      )}
                    </div>

                    {form.isCreditSale && (
                      <div className="sales-credit-summary-right">
                        <span className="sales-credit-total-pill">
                          <strong>Cuotas</strong>
                          <span>{selectedCurrency?.symbol ?? ''} {creditInstallmentsTotal.toFixed(2)}</span>
                        </span>
                        <span className="sales-credit-total-pill is-highlight">
                          <strong>Saldo</strong>
                          <span>{selectedCurrency?.symbol ?? ''} {creditPendingTotal.toFixed(2)}</span>
                        </span>
                      </div>
                    )}
                  </summary>

                  <div className="sales-tributary-grid sales-credit-summary-grid">
                    <label className="sales-tributary-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(form.isCreditSale)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm((prev) => ({
                            ...prev,
                            isCreditSale: checked,
                            creditInstallments: checked
                              ? (prev.creditInstallments && prev.creditInstallments.length > 0
                                ? prev.creditInstallments
                                : [createCreditInstallmentRow(
                                    prev.dueDate || prev.issueDate || TODAY,
                                    Math.max(0, grandTotal - Math.max(0, Number(prev.advanceAmount ?? 0)))
                                  )])
                              : [],
                          }));

                          setCreditPlanModalOpen(checked);
                        }}
                      />
                      <span>Venta al crédito</span>
                    </label>

                    {advancesEnabled && (
                      <label className="sales-tributary-field">
                        <span>Anticipo aplicado</span>
                        <input
                          type="number"
                          min={0}
                          max={grandTotal}
                          step="0.01"
                          value={form.advanceAmount ?? 0}
                          onChange={(e) => {
                            const next = Math.max(0, Number(e.target.value || 0));
                            setForm((prev) => ({ ...prev, advanceAmount: next }));
                          }}
                        />
                      </label>
                    )}

                    {form.isCreditSale && (
                      <div className="sales-credit-config-bar">
                        <div className="sales-credit-config-inline">
                          <button
                            className="sales-credit-config-button"
                            type="button"
                            onClick={() => setCreditPlanModalOpen(true)}
                          >
                            {creditInstallments.length > 0 ? 'Editar cuotas' : 'Configurar cuotas'}
                          </button>
                          <span>
                            {creditInstallments.length} cuota(s) registradas{creditObservationCount > 0 ? ` • ${creditObservationCount} con observación` : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {isNoteDocument && (
              <>
                <label className="sales-field-customer-meta">
                  Documento afectado
                  <select
                    value={form.noteAffectedDocumentId ?? ''}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setForm((prev) => ({ ...prev, noteAffectedDocumentId: value }));
                      if (value) {
                        void chooseReferenceDocument(value);
                      } else {
                        setCart([]);
                      }
                    }}
                    disabled={loadingReferenceDocument || !form.customerId}
                  >
                    <option value="">Seleccionar comprobante</option>
                    {referenceDocuments.map((row) => {
                      const sourceTotal = Number(row.total ?? 0);
                      const appliedTotal = isCreditNote
                        ? Number(row.applied_credit_total ?? 0)
                        : Number(row.applied_debit_total ?? 0);
                      const remainingTotal = Math.max(0, sourceTotal - appliedTotal);

                      return (
                        <option key={row.id} value={row.id}>
                          {docKindLabelResolved(row.document_kind)} {row.series}-{String(row.number).padStart(6, '0')} | Disponible: {remainingTotal.toFixed(2)}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label className="sales-field-address">
                  Tipo de {isCreditNote ? 'nota de credito' : 'nota de debito'}
                  <select
                    value={form.noteReasonCode ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, noteReasonCode: e.target.value }))}
                  >
                    <option value="">Seleccionar tipo</option>
                    {activeNoteReasons.map((row) => (
                      <option key={row.id} value={row.code}>
                        {row.code} - {row.description}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedReferenceDocument && (
                  <p className="notice sales-note-affected-compact">
                    Afectando: {docKindLabelResolved(selectedReferenceDocument.document_kind)} {selectedReferenceDocument.series}-{String(selectedReferenceDocument.number).padStart(6, '0')}
                  </p>
                )}
              </>
            )}

            {isInvoiceDocument && ((lookups?.detraccion_service_codes ?? []).length > 0 || (lookups?.retencion_types ?? []).length > 0 || (lookups?.percepcion_types ?? []).length > 0 || (lookups?.retencion_percentage ?? null) !== null) && (
              <div className="sales-tributary-slot">
                <details className="sales-tributary-panel">
                  <summary className="sales-tributary-summary">
                    <span className="sales-tributary-title">Condiciones tributarias</span>
                    <span className={`sales-tributary-chip ${form.hasDetraccion ? 'is-active' : ''}`}>
                      Detracción {form.hasDetraccion ? 'activa' : 'off'}
                    </span>
                    <span className={`sales-tributary-chip ${form.hasRetencion ? 'is-active' : ''}`}>
                      Retención {form.hasRetencion ? 'activa' : 'off'}
                    </span>
                    <span className={`sales-tributary-chip ${form.hasPercepcion ? 'is-active' : ''}`}>
                      Percepción {form.hasPercepcion ? 'activa' : 'off'}
                    </span>
                    {!form.hasDetraccion && grandTotal >= detractionMinAmount && (
                      <span className="sales-tributary-chip is-warning">Umbral S/ {detractionMinAmount.toFixed(2)}</span>
                    )}
                    {selectedSunatOperationType && (
                      <span className="sales-tributary-chip is-soft">Op. SUNAT {selectedSunatOperationType.code}</span>
                    )}
                    {lookups?.detraccion_account?.account_number && (
                      <span className="sales-tributary-chip is-soft">Cta Detr. {lookups.detraccion_account.account_number}</span>
                    )}
                    {lookups?.retencion_account?.account_number && (
                      <span className="sales-tributary-chip is-soft">Cta Ret. {lookups.retencion_account.account_number}</span>
                    )}
                    {lookups?.percepcion_account?.account_number && (
                      <span className="sales-tributary-chip is-soft">Cta Perc. {lookups.percepcion_account.account_number}</span>
                    )}
                  </summary>

                  <div className="sales-tributary-grid">
                    {(lookups?.detraccion_service_codes ?? []).length > 0 && (
                      <label className="sales-tributary-toggle">
                        <input
                          type="checkbox"
                          checked={form.hasDetraccion ?? false}
                          onChange={(e) => {
                            setForm((prev) => ({
                              ...prev,
                              hasDetraccion: e.target.checked,
                              detraccionServiceCode: e.target.checked ? prev.detraccionServiceCode : '',
                              hasRetencion: e.target.checked ? false : prev.hasRetencion,
                              retencionTypeCode: e.target.checked ? '' : prev.retencionTypeCode,
                              hasPercepcion: e.target.checked ? false : prev.hasPercepcion,
                              percepcionTypeCode: e.target.checked ? '' : prev.percepcionTypeCode,
                              sunatOperationTypeCode:
                                e.target.checked
                                  ? pickOperationTypeCode('DETRACCION')
                                  : prev.hasRetencion
                                    ? pickOperationTypeCode('RETENCION')
                                    : prev.hasPercepcion
                                      ? pickOperationTypeCode('PERCEPCION')
                                  : '',
                            }));
                          }}
                        />
                        <span>Detracción SPOT</span>
                      </label>
                    )}

                    {((lookups?.retencion_types ?? []).length > 0 || (lookups?.retencion_percentage ?? null) !== null) && (
                      <label className="sales-tributary-toggle">
                        <input
                          type="checkbox"
                          checked={form.hasRetencion ?? false}
                          onChange={(e) => {
                            setForm((prev) => ({
                              ...prev,
                              hasRetencion: e.target.checked,
                              retencionTypeCode: e.target.checked ? (prev.retencionTypeCode || (retencionTypes[0]?.code ?? '')) : '',
                              hasDetraccion: e.target.checked ? false : prev.hasDetraccion,
                              detraccionServiceCode: e.target.checked ? '' : prev.detraccionServiceCode,
                              hasPercepcion: e.target.checked ? false : prev.hasPercepcion,
                              percepcionTypeCode: e.target.checked ? '' : prev.percepcionTypeCode,
                              sunatOperationTypeCode:
                                e.target.checked
                                  ? pickOperationTypeCode('RETENCION')
                                  : prev.hasDetraccion
                                    ? pickOperationTypeCode('DETRACCION')
                                    : prev.hasPercepcion
                                      ? pickOperationTypeCode('PERCEPCION')
                                  : '',
                            }));
                          }}
                        />
                        <span>Retención</span>
                      </label>
                    )}

                    {(lookups?.percepcion_types ?? []).length > 0 && (
                      <label className="sales-tributary-toggle">
                        <input
                          type="checkbox"
                          checked={form.hasPercepcion ?? false}
                          onChange={(e) => {
                            setForm((prev) => ({
                              ...prev,
                              hasPercepcion: e.target.checked,
                              percepcionTypeCode: e.target.checked ? (prev.percepcionTypeCode || (percepcionTypes[0]?.code ?? '')) : '',
                              hasDetraccion: e.target.checked ? false : prev.hasDetraccion,
                              detraccionServiceCode: e.target.checked ? '' : prev.detraccionServiceCode,
                              hasRetencion: e.target.checked ? false : prev.hasRetencion,
                              retencionTypeCode: e.target.checked ? '' : prev.retencionTypeCode,
                              sunatOperationTypeCode:
                                e.target.checked
                                  ? pickOperationTypeCode('PERCEPCION')
                                  : prev.hasDetraccion
                                    ? pickOperationTypeCode('DETRACCION')
                                    : prev.hasRetencion
                                      ? pickOperationTypeCode('RETENCION')
                                  : '',
                            }));
                          }}
                        />
                        <span>Percepción</span>
                      </label>
                    )}

                    {sunatOperationTypes.length > 0 && (
                      <label className="sales-tributary-field">
                        <span>Operación SUNAT</span>
                        <select
                          value={form.sunatOperationTypeCode ?? ''}
                          onChange={(e) => setForm((prev) => ({ ...prev, sunatOperationTypeCode: e.target.value }))}
                        >
                          <option value="">Seleccionar tipo</option>
                          {sunatOperationTypes.map((row) => (
                            <option key={row.code} value={row.code}>
                              {row.code} - {row.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {form.hasDetraccion && (
                      <>
                        <label className="sales-tributary-field sales-tributary-field-wide">
                          <span>Tipo de detracción</span>
                          <select
                            value={form.detraccionServiceCode ?? ''}
                            onChange={(e) => setForm((prev) => ({ ...prev, detraccionServiceCode: e.target.value }))}
                          >
                            <option value="">Seleccionar código</option>
                            {(lookups?.detraccion_service_codes ?? []).map((row) => (
                              <option key={row.id} value={row.code}>
                                {row.code} - {row.name} ({row.rate_percent.toFixed(2)}%)
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="sales-tributary-inline-note sales-tributary-field-wide">
                          <span>SPOT aplica según código SUNAT para bienes y servicios.</span>
                          {selectedDetractionService && detraccionAmount > 0 && (
                            <strong>{selectedDetractionService.rate_percent.toFixed(2)}% | {selectedCurrency?.symbol ?? ''} {detraccionAmount.toFixed(2)}</strong>
                          )}
                          {lookups?.detraccion_account?.account_number && (
                            <span>
                              Cta: {lookups.detraccion_account.account_number}
                              {lookups.detraccion_account.bank_name ? ` (${lookups.detraccion_account.bank_name})` : ''}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {form.hasRetencion && (
                      <>
                        {retencionTypes.length > 0 && (
                          <label className="sales-tributary-field">
                            <span>Tipo de retención</span>
                            <select
                              value={form.retencionTypeCode ?? ''}
                              onChange={(e) => setForm((prev) => ({ ...prev, retencionTypeCode: e.target.value }))}
                            >
                              <option value="">Seleccionar tipo</option>
                              {retencionTypes.map((row) => (
                                <option key={row.code} value={row.code}>
                                  {row.code} - {row.name} ({row.rate_percent.toFixed(2)}%)
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <div className="sales-tributary-inline-note sales-tributary-field-wide">
                          {retencionAmount > 0 && (
                            <strong>
                              {selectedRetencionType ? `${selectedRetencionType.name} ` : 'Retención '}| {retencionPercentage.toFixed(2)}% | {selectedCurrency?.symbol ?? ''} {retencionAmount.toFixed(2)}
                            </strong>
                          )}
                          {lookups?.retencion_account?.account_number && (
                            <span>
                              Cta: {lookups.retencion_account.account_number}
                              {lookups.retencion_account.bank_name ? ` (${lookups.retencion_account.bank_name})` : ''}
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {form.hasPercepcion && (
                      <>
                        {percepcionTypes.length > 0 && (
                          <label className="sales-tributary-field">
                            <span>Tipo de percepción</span>
                            <select
                              value={form.percepcionTypeCode ?? ''}
                              onChange={(e) => setForm((prev) => ({ ...prev, percepcionTypeCode: e.target.value }))}
                            >
                              <option value="">Seleccionar tipo</option>
                              {percepcionTypes.map((row) => (
                                <option key={row.code} value={row.code}>
                                  {row.code} - {row.name} ({row.rate_percent.toFixed(2)}%)
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <div className="sales-tributary-inline-note sales-tributary-field-wide">
                          {percepcionAmount > 0 && (
                            <strong>
                              {selectedPercepcionType ? `${selectedPercepcionType.name} ` : 'Percepción '}| {percepcionPercentage.toFixed(2)}% | {selectedCurrency?.symbol ?? ''} {percepcionAmount.toFixed(2)}
                            </strong>
                          )}
                          {lookups?.percepcion_account?.account_number && (
                            <span>
                              Cta: {lookups.percepcion_account.account_number}
                              {lookups.percepcion_account.bank_name ? ` (${lookups.percepcion_account.bank_name})` : ''}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </details>

                <div className="sales-tributary-preview" role="status" aria-live="polite">
                  <span>
                    Op. SUNAT: {selectedSunatOperationType ? `${selectedSunatOperationType.code} - ${selectedSunatOperationType.name}` : '-'}
                  </span>
                  <span>
                    Régimen: {form.hasDetraccion ? 'Detracción' : form.hasRetencion ? 'Retención' : form.hasPercepcion ? 'Percepción' : 'Ninguno'}
                  </span>
                  {form.hasDetraccion && (
                    <span>
                      Detracción: {selectedDetractionService?.rate_percent?.toFixed(2) ?? '0.00'}% | {selectedCurrency?.symbol ?? ''} {detraccionAmount.toFixed(2)}
                      {lookups?.detraccion_account?.account_number ? ` | Cta ${lookups.detraccion_account.account_number}` : ''}
                    </span>
                  )}
                  {form.hasRetencion && (
                    <span>
                      Retención: {retencionPercentage.toFixed(2)}% | {selectedCurrency?.symbol ?? ''} {retencionAmount.toFixed(2)}
                      {lookups?.retencion_account?.account_number ? ` | Cta ${lookups.retencion_account.account_number}` : ''}
                    </span>
                  )}
                  {form.hasPercepcion && (
                    <span>
                      Percepción: {percepcionPercentage.toFixed(2)}% | {selectedCurrency?.symbol ?? ''} {percepcionAmount.toFixed(2)}
                      {lookups?.percepcion_account?.account_number ? ` | Cta ${lookups.percepcion_account.account_number}` : ''}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>

        <div className="sales-concepts-shell">
          <section className="sales-concepts-main">
            <header className="sales-section-head">
              <h4>Conceptos del comprobante</h4>
              <p>{isNoteDocument ? 'Los items se cargan automaticamente desde el documento afectado.' : 'Agrega productos o items manuales y arma el detalle antes de emitir.'}</p>
            </header>

            <div className="sales-grid-main">
              <div className={`sales-grid-row sales-grid-row-item ${isTributaryDocument ? 'tax-on' : 'tax-off'} ${(salesItemDiscountEnabled || salesFreeItemsEnabled) ? 'has-line-tools' : ''}`}>
                <div className="with-suggest sales-field-product sales-field-shell">
                  <div className="sales-field-product-head">
                    <span>{form.isManualItem ? 'Descripcion manual' : 'Producto'}</span>
                    <label className="sales-stock-toggle sales-stock-toggle-inline">
                      <input
                        type="checkbox"
                        checked={form.isManualItem}
                        onChange={(e) => toggleManualItem(e.target.checked)}
                      />
                      Agregar sin stock
                    </label>
                  </div>
                  {form.isManualItem ? (
                    <input
                      value={form.manualDescription}
                      onChange={(e) => setForm((prev) => ({ ...prev, manualDescription: e.target.value }))}
                      placeholder="Ej: Servicio tecnico especializado"
                    />
                  ) : (
                    <>
                      <input
                        ref={productInputRef}
                        value={form.productQuery}
                        onChange={(e) => setForm((prev) => ({ ...prev, productQuery: e.target.value }))}
                        onKeyDown={handleProductKeyDown}
                        placeholder="Buscar producto por SKU o nombre"
                      />
                      {productSuggestions.length > 0 && (
                        <div className="suggest-box suggest-box--product">
                          {productSuggestions.map((row, index) => (
                            <button
                              type="button"
                              key={row.id}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={() => void chooseProduct(row)}
                              className={`suggest-item ${index === activeProductIndex ? 'active' : ''}`}
                            >
                              {(() => {
                                const stock = stockByProductId.get(row.id) ?? 0;
                                return (
                                  <>
                                    <strong>{row.name}</strong>
                                    <span className="suggest-sku">{row.sku ?? 'SIN-SKU'}</span>
                                    <span className="suggest-stock">
                                      Stock: <span className={`stock-chip ${stockToneClass(stock)}`}>{stock.toFixed(3)}</span>
                                    </span>
                                  </>
                                );
                              })()}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <label className="sales-field-unit">
                  Unidad
                  <select
                    value={form.unitId ?? ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        unitId: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                  >
                    <option value="">Seleccionar unidad</option>
                    {(selectedProductUnitOptions.length > 0 ? selectedProductUnitOptions : lookups?.units ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.code} - {row.name}
                      </option>
                    ))}
                  </select>
                </label>

                {manualLotSelectionEnabled && (
                  <label className="sales-field-lot">
                    Lote
                    <select
                      value={form.lotId ?? ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          lotId: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                      disabled={form.isManualItem}
                    >
                      {!form.isManualItem && lots.length === 0 && <option value="">Sin lotes</option>}
                      {form.isManualItem && <option value="">No aplica</option>}
                      {!form.isManualItem &&
                        lots.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.lot_code} | Stock {row.stock}{row.expires_at ? ` | Vence: ${fmtDateLima(row.expires_at)}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                )}

                {lotTrackingEnabled && !manualLotSelectionEnabled && !form.isManualItem && selectedProduct?.lot_tracking && (
                  <div className="sales-field-context">
                    <span className="sales-price-hint">
                      Salida por lotes automatica: {lotOutflowStrategy}. El sistema asignara los lotes al emitir.
                    </span>
                  </div>
                )}

                <label className="sales-field-qty">
                  Cantidad
                  <input
                    type="number"
                    step="0.001"
                    value={form.qty}
                    onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                  />
                </label>

                {isTributaryDocument && (
                  <label className="sales-field-igv">
                    Tipo de IGV
                    <select
                      value={form.taxCategoryId ?? ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          taxCategoryId: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    >
                      <option value="">Seleccionar tipo IGV</option>
                      {(lookups?.tax_categories ?? []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label} ({Number(row.rate_percent).toFixed(2)}%)
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="sales-field-price">
                  Precio unitario
                  <input
                    type="number"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(e) => setForm((prev) => ({ ...prev, unitPrice: Number(e.target.value) }))}
                    onKeyDown={handleQuickAddItem}
                  />
                </label>

                {salesItemDiscountEnabled && (
                  <label className="sales-field-inline-tool sales-field-inline-discount">
                    Descuento
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.draftLineDiscount ?? 0}
                      onChange={(e) => setForm((prev) => ({ ...prev, draftLineDiscount: Number(e.target.value) }))}
                      disabled={Boolean(form.draftIsFreeOperation)}
                    />
                  </label>
                )}

                {salesFreeItemsEnabled && (
                  <label className="sales-field-inline-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(form.draftIsFreeOperation)}
                      onChange={(e) => setForm((prev) => ({
                        ...prev,
                        draftIsFreeOperation: e.target.checked,
                        draftLineDiscount: e.target.checked ? 0 : prev.draftLineDiscount,
                      }))}
                    />
                    Operación gratuita
                  </label>
                )}

                <div className="sales-field-action">
                  <button
                    type="button"
                    onClick={addDraftItem}
                    disabled={loading || !canAddDraftItem || isNoteDocument}
                  >
                    Agregar item
                  </button>
                </div>

              </div>

                {autoPriceHint && (
                  <p className="sales-price-hint">{autoPriceHint}</p>
                )}

                {!form.isManualItem && selectedProductCommercialConfig?.product?.unit_id && form.unitId && (
                  <p className="sales-price-hint">
                    Equivalencia base: {Number(form.qty || 0).toFixed(3)} x factor {Number(draftConversionFactor || 1).toFixed(6)} = {Number(draftQtyBase || 0).toFixed(6)} en unidad base.
                  </p>
                )}

            </div>

            {cart.length > 0 && (
              <div className="table-wrap sales-cart-wrap">
                <h4>Detalle de venta</h4>
                <div className="sales-cart-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Descripcion</th>
                        <th>Stock</th>
                        <th>Tipo IGV</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        {(salesItemDiscountEnabled || salesFreeItemsEnabled) && (
                          <th>{salesItemDiscountEnabled ? 'Descuento' : 'Gratis'}</th>
                        )}
                        <th>Subtotal</th>
                        {(salesItemDiscountEnabled || salesFreeItemsEnabled) && <th>Total</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, index) => (
                        <tr key={`${item.productId}-${item.lotId}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{item.description}</td>
                          <td>
                            {item.isManual || !item.productId
                              ? '-'
                              : (() => {
                                  const stock = stockByProductId.get(item.productId) ?? 0;
                                  return <span className={`stock-chip ${stockToneClass(stock)}`}>{stock.toFixed(3)}</span>;
                                })()}
                          </td>
                          <td>{item.taxLabel}</td>
                          <td>
                            <input
                              className="cell-input"
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={item.qty}
                              onChange={(e) => updateDraftItem(index, 'qty', Number(e.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              className="cell-input"
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateDraftItem(index, 'unitPrice', Number(e.target.value))}
                            />
                          </td>
                          {(salesItemDiscountEnabled || salesFreeItemsEnabled) && (
                            <td>
                              <div className="sales-table-line-meta">
                                {salesItemDiscountEnabled && (
                                  <input
                                    className="cell-input"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={Number(item.discountTotal ?? 0)}
                                    onChange={(e) => updateDraftItem(index, 'discountTotal', Number(e.target.value))}
                                    disabled={Boolean(item.isFreeOperation)}
                                  />
                                )}
                                {salesFreeItemsEnabled && (
                                  <label className="sales-inline-check">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(item.isFreeOperation)}
                                      onChange={(e) => {
                                        updateDraftItem(index, 'isFreeOperation', e.target.checked);
                                        if (e.target.checked) {
                                          updateDraftItem(index, 'discountTotal', 0);
                                        }
                                      }}
                                    />
                                    Gratis
                                  </label>
                                )}
                              </div>
                            </td>
                          )}
                          <td>
                            {computeSalesDraftAmounts(item).subtotal.toFixed(2)}
                          </td>
                          {(salesItemDiscountEnabled || salesFreeItemsEnabled) && (
                            <td>{computeSalesDraftAmounts(item).finalTotal.toFixed(2)}</td>
                          )}
                          <td>
                            <button type="button" className="btn-mini danger" onClick={() => removeDraftItem(index)}>
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {cart.length === 0 && (
              <div className="sales-main-empty" aria-live="polite">
                Agrega productos para construir el comprobante. El resumen se actualiza automaticamente en el panel derecho.
              </div>
            )}
          </section>

          <aside className="sales-concepts-side" aria-live="polite">
            <header className="sales-section-head">
              <h4>Montos del comprobante</h4>
              <p className="sales-live-caption">
                <span className="sales-live-dot" aria-hidden="true" />
                Resumen automatico al escribir.
              </p>
            </header>

            <div className="sales-summary">
              {salesGlobalDiscountEnabled && (
                <label className="sales-summary-input sales-summary-input-discount">
                  <span>Descuento global</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.globalDiscountAmount ?? 0}
                    onChange={(e) => setForm((prev) => ({ ...prev, globalDiscountAmount: Number(e.target.value) }))}
                    placeholder="0.00"
                  />
                </label>
              )}
              <article>
                <span>Subtotal</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {previewSummaryTotals.subtotal.toFixed(2)}
                </strong>
              </article>
              <article>
                <span>Impuestos</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {previewSummaryTotals.tax.toFixed(2)}
                </strong>
              </article>
              {(salesGlobalDiscountEnabled || salesItemDiscountEnabled || salesFreeItemsEnabled) && (
                <article>
                  <span>Descuentos</span>
                  <strong>
                    {selectedCurrency?.symbol ?? ''} {previewSummaryTotals.discount.toFixed(2)}
                  </strong>
                </article>
              )}
              <article>
                <span>Total</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {previewSummaryTotals.total.toFixed(2)}
                </strong>
              </article>
            </div>

            {isTributaryDocument && (
              <div className="sales-tax-preview">
                <div className="sales-tax-preview-head">
                  <h4>Resumen tributario</h4>
                  <button
                    type="button"
                    className="btn-mini"
                    onClick={() => setShowTaxBreakdown((prev) => !prev)}
                  >
                    {showTaxBreakdown ? 'Ocultar detalle' : 'Ver detalle'}
                  </button>
                </div>
                <div className="sales-tax-preview-grid">
                  {showTaxBreakdown && (
                    <>
                      <article><span>Total Descuento</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.discountTotal.toFixed(2)}</strong></article>
                      {salesGlobalDiscountEnabled && (
                        <article><span>Descuento global</span><strong>{selectedCurrency?.symbol ?? ''} {globalDiscountAmount.toFixed(2)}</strong></article>
                      )}
                      <article><span>Total Ope. Inafecta</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.inafectaTotal.toFixed(2)}</strong></article>
                      <article><span>Total Ope. Exonerada</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.exoneradaTotal.toFixed(2)}</strong></article>
                    </>
                  )}
                  <article><span>Total Ope. Gravada</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.gravadaTotal.toFixed(2)}</strong></article>
                  <article><span>Total IGV ({tributaryPreview.igvRateLabel.toFixed(2)}%)</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.igvTotal.toFixed(2)}</strong></article>
                  {form.hasDetraccion && detraccionAmount > 0 && (
                    <article><span>Detracción ({detraccionRate.toFixed(2)}%)</span><strong>{selectedCurrency?.symbol ?? ''} {detraccionAmount.toFixed(2)}</strong></article>
                  )}
                  {form.hasRetencion && retencionAmount > 0 && (
                    <article><span>Retención {selectedRetencionType ? `${selectedRetencionType.name} ` : 'de IGV '}({retencionPercentage.toFixed(2)}%)</span><strong>{selectedCurrency?.symbol ?? ''} {retencionAmount.toFixed(2)}</strong></article>
                  )}
                  {form.hasPercepcion && percepcionAmount > 0 && (
                    <article><span>Percepción {selectedPercepcionType ? `${selectedPercepcionType.name} ` : ''}({percepcionPercentage.toFixed(2)}%)</span><strong>{selectedCurrency?.symbol ?? ''} {percepcionAmount.toFixed(2)}</strong></article>
                  )}
                  {showTaxBreakdown && (
                    <>
                      <article><span>ICBPER</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.icbperTotal.toFixed(2)}</strong></article>
                      <article><span>Total Ope. Gratuita</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.gratuitaTotal.toFixed(2)}</strong></article>
                      <article><span>Otros Cargos</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.otherChargesTotal.toFixed(2)}</strong></article>
                    </>
                  )}
                  <article className="sales-tax-preview-total"><span>Importe Total</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.grandTotal.toFixed(2)}</strong></article>
                </div>
              </div>
            )}

            <div className="sales-side-actions">
              {editingDocumentId && (
                <p className="shortcut-hint" style={{ marginBottom: '0.35rem' }}>
                  Modo edicion activo para documento #{editingDocumentId}.
                </p>
              )}
              <button
                ref={submitButtonRef}
                type="submit"
                disabled={
                  loading ||
                  !canSubmitDocument
                }
              >
                {loading
                  ? 'Procesando...'
                  : editingDocumentId
                    ? 'Guardar cambios'
                    : salesFlowMode === 'SELLER_TO_CASHIER'
                      ? 'Generar pedido comercial'
                      : 'Emitir comprobante'}
              </button>
              {editingDocumentId && (
                <button type="button" onClick={cancelEditingDraft} disabled={loading}>
                  Cancelar edicion
                </button>
              )}
              {salesFlowMode === 'SELLER_TO_CASHIER' && (
                <p className="shortcut-hint">Modo vendedor activo: se genera pedido comercial (cotizacion/proforma) y caja convierte a nota de pedido o comprobante tributario.</p>
              )}
              {isSeparatedMode && isCashierUser && (
                <p className="shortcut-hint">Perfil caja: usa Reporte de ventas para convertir pedidos pendientes.</p>
              )}
              <p className="shortcut-hint">Atajos: F2 Cliente | F3 Producto | F9 Emitir</p>
            </div>
          </aside>
        </div>
      </form>

      {issuedPreview && (
        <div className="issued-preview">
          <h4>Vista previa de emision</h4>
          <p>
            {docKindLabelResolved(issuedPreview.document_kind)} {issuedPreview.series}-{issuedPreview.number} | Total:{' '}
            {issuedPreview.total.toFixed(2)} | Estado: {commercialStatusLabel(issuedPreview.status)}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => printIssuedPreview('A4')}>
              Imprimir A4 / PDF
            </button>
            <button type="button" onClick={() => printIssuedPreview('80mm')}>
              Imprimir Ticket 80mm
            </button>
          </div>
        </div>
      )}

        </>
      )}

      {salesWorkspaceMode === 'REPORT' && (
        <>
      {shouldPrioritizePendingOrders && (
        <div className="workspace-mode-switch" style={{ marginTop: '0.35rem', marginBottom: '0.65rem' }}>
          <button
            type="button"
            className={`mode-btn${cashierReportPanelMode === 'PENDING' ? ' mode-btn-active' : ''}`}
            onClick={() => {
              setCashierReportPanelMode('PENDING');
              setDocumentViewFilter('PENDING_CONVERSION');
              setDocumentsPage(1);
            }}
          >
            Pedidos pendientes
          </button>
          <button
            type="button"
            className={`mode-btn${cashierReportPanelMode === 'FULL' ? ' mode-btn-active' : ''}`}
            onClick={() => {
              setCashierReportPanelMode('FULL');
              setDocumentViewFilter('ALL');
              setDocumentsPage(1);
            }}
          >
            Reporte completo
          </button>
        </div>
      )}

      {shouldPrioritizePendingOrders && cashierReportPanelMode === 'PENDING' && (
        <div className="table-wrap" style={{ marginBottom: '0.9rem', border: '1px solid #93c5fd', boxShadow: '0 6px 18px rgba(37, 99, 235, 0.12)' }}>
          <h4>Pedidos comerciales pendientes (prioridad caja)</h4>
          <table>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((row) => (
                <tr key={`top-${row.id}`}>
                  <td>{docKindLabelResolved(row.document_kind)} {row.series}-{row.number}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.total}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button type="button" className="btn-mini" disabled={loadingDocuments} onClick={() => void showDocumentPreview(row.id, 'A4')}>Ver A4</button>
                      <button type="button" className="btn-mini" disabled={loadingDocuments} onClick={() => void showDocumentPreview(row.id, '80mm')}>Ver Ticket</button>
                      {canConvertInCurrentMode && (
                        <>
                          <button type="button" className="btn-mini" disabled={loadingDocuments} onClick={() => void openConvertPreview(row, 'INVOICE')}>Factura</button>
                          <button type="button" className="btn-mini" disabled={loadingDocuments} onClick={() => void openConvertPreview(row, 'RECEIPT')}>Boleta</button>
                          {row.document_kind === 'QUOTATION' && (
                            <button type="button" className="btn-mini" disabled={loadingDocuments} onClick={() => void openConvertPreview(row, 'SALES_ORDER')}>Nota de pedido</button>
                          )}
                        </>
                      )}
                      {canEditDraftInCurrentMode && String(row.status).toUpperCase() === 'DRAFT' && (
                        <button type="button" className="btn-mini" disabled={loadingDocuments} onClick={() => void startEditDraft(row)}>Editar</button>
                      )}
                      {canVoidDocumentsInCurrentMode && !['VOID', 'CANCELED'].includes(String(row.status).toUpperCase()) && (
                        <button type="button" className="btn-mini danger" disabled={loadingDocuments} onClick={() => void handleVoidDocument(row)}>Anular</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr><td colSpan={4}>No hay pedidos comerciales pendientes en esta sucursal/almacen.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <small>
              Pagina {documentsMeta.page} de {documentsMeta.last_page} | Total registros: {documentsMeta.total}
            </small>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={loadingDocuments || documentsMeta.page <= 1}
                onClick={() => setDocumentsPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={loadingDocuments || documentsMeta.page >= documentsMeta.last_page}
                onClick={() => setDocumentsPage((prev) => Math.min(documentsMeta.last_page, prev + 1))}
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {(!shouldPrioritizePendingOrders || cashierReportPanelMode === 'FULL') && (
        <>
      <div className="series-collapsible">
        <button
          type="button"
          className="series-toggle"
          onClick={() => setSeriesExpanded((v) => !v)}
        >
          <span>Series disponibles</span>
          <span className="series-toggle-arrow">{seriesExpanded ? '▲' : '▼'}</span>
          <span className="series-toggle-count">{series.length} serie{series.length !== 1 ? 's' : ''}</span>
        </button>
        {seriesExpanded && (
          <div className="series-collapsible-body">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Serie</th>
                  <th>Correlativo</th>
                </tr>
              </thead>
              <tbody>
                {series.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{docKindLabelResolved(row.document_kind)}</td>
                    <td>{row.series}</td>
                    <td>{row.current_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <h4>Documentos comerciales</h4>

        {/* Document kind chip-tabs */}
        <div className="doc-kind-tabs">
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'ALL' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('ALL'); setDocumentsPage(1); }} disabled={loadingDocuments}>Todos</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'TRIBUTARY' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('TRIBUTARY'); setDocumentsPage(1); }} disabled={loadingDocuments}>Tributarios</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'QUOTATION' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('QUOTATION'); setDocumentsPage(1); }} disabled={loadingDocuments}>Pedidos comerciales</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'SALES_ORDER' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('SALES_ORDER'); setDocumentsPage(1); }} disabled={loadingDocuments}>Notas de pedido</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'PENDING_CONVERSION' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('PENDING_CONVERSION'); setDocumentsPage(1); }} disabled={loadingDocuments}>Pendientes por convertir</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'CONVERTED' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('CONVERTED'); setDocumentsPage(1); }} disabled={loadingDocuments}>Ya convertidos</button>
          <button
            type="button"
            className={`doc-kind-tab${documentFiltersApplied.sourceOrigin === 'RESTAURANT' ? ' active' : ''}`}
            onClick={() => {
              const next = documentFiltersApplied.sourceOrigin === 'RESTAURANT' ? '' : 'RESTAURANT';
              setDocumentFiltersDraft((prev) => ({ ...prev, sourceOrigin: next }));
              setDocumentFiltersApplied((prev) => ({ ...prev, sourceOrigin: next }));
              setDocumentsPage(1);
            }}
            disabled={loadingDocuments}
          >
            Origen restaurante
          </button>
        </div>

        {/* Advanced search filters */}
        <div className="report-filters">
          <div className="report-filters-header">
            <span className="report-filters-title">Filtros de búsqueda</span>
          </div>
          <div className="report-filter-grid">
            <label>
              <span>Cliente / Documento</span>
              <div className="with-suggest report-filter-customer-suggest" onBlur={() => window.setTimeout(() => setReportCustomerInputFocused(false), 120)}>
                <input
                  value={documentFiltersDraft.customer}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setReportCustomerInputFocused(true);
                    setDocumentFiltersDraft((prev) => ({
                      ...prev,
                      customer: nextValue,
                      customerId: '',
                      customerVehicleId: '',
                    }));
                    setReportCustomerVehicles([]);
                  }}
                  onFocus={() => setReportCustomerInputFocused(true)}
                  placeholder="Nombre, RUC, DNI…"
                />
                {reportCustomerSuggestions.length > 0 && (
                  <div className="suggest-box report-suggest-box">
                    {reportCustomerSuggestions.map((row) => (
                      <button
                        type="button"
                        key={row.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseReportCustomer(row)}
                        className="suggest-item report-suggest-item"
                      >
                        <strong>{row.name}</strong>
                        <span>{row.doc_number ?? 'SIN-DOC'}{row.plate ? ` | ${row.plate}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            {workshopMultiVehicleEnabled && (
              <label>
                <span>Vehículo del cliente</span>
                <select
                  value={documentFiltersDraft.customerVehicleId}
                  disabled={loadingReportCustomerVehicles || Number(documentFiltersDraft.customerId || 0) <= 0 || reportCustomerVehicles.length === 0}
                  onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, customerVehicleId: event.target.value }))}
                >
                  <option value="">
                    {loadingReportCustomerVehicles
                      ? 'Cargando vehículos...'
                      : (Number(documentFiltersDraft.customerId || 0) <= 0 ? 'Seleccione un cliente' : 'Todos')}
                  </option>
                  {reportCustomerVehicles.map((row) => (
                    <option key={row.id} value={row.id}>{formatVehicleLabel(row)}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Fecha desde</span>
              <input
                type="date"
                value={documentFiltersDraft.issueDateFrom}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, issueDateFrom: event.target.value }))}
              />
            </label>
            <label>
              <span>Fecha hasta</span>
              <input
                type="date"
                value={documentFiltersDraft.issueDateTo}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, issueDateTo: event.target.value }))}
              />
            </label>
            <label>
              <span>Serie</span>
              <input
                value={documentFiltersDraft.series}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, series: event.target.value }))}
                placeholder="Ej. F001"
              />
            </label>
            <label>
              <span>Número</span>
              <input
                value={documentFiltersDraft.number}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, number: event.target.value }))}
                placeholder="Ej. 00001"
              />
            </label>
            <label>
              <span>Estado</span>
              <select
                value={documentFiltersDraft.status}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="">Todos los estados</option>
                <option value="DRAFT">Borrador</option>
                <option value="APPROVED">Aprobado</option>
                <option value="ISSUED">Emitido</option>
                <option value="VOID">Anulado</option>
                <option value="CANCELED">Cancelado</option>
              </select>
            </label>
            <label>
              <span>Origen</span>
              <select
                value={documentFiltersDraft.sourceOrigin}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, sourceOrigin: event.target.value as '' | 'RESTAURANT' }))}
              >
                <option value="">Todos</option>
                <option value="RESTAURANT">Restaurante</option>
              </select>
            </label>
          </div>
          <div className="report-filter-actions">
            <button type="button" className="btn-apply" onClick={applyAdvancedDocumentFilters} disabled={loadingDocuments}>
              ✓ Aplicar
            </button>
            <button type="button" className="btn-clear" onClick={clearAdvancedDocumentFilters} disabled={loadingDocuments}>
              ✕ Limpiar
            </button>
            <span className="report-filter-spacer" />
            <button type="button" className="btn-export" onClick={() => void handleExportDocumentsExcel()} disabled={loadingDocuments || exportingDocuments}>
              {exportingDocuments ? 'Exportando…' : '⬇ CSV'}
            </button>
            <button type="button" className="btn-export" onClick={() => void handleExportDocumentsXlsx()} disabled={loadingDocuments || exportingDocuments}>
              {exportingDocuments ? 'Exportando…' : '⬇ XLSX'}
            </button>
            <button type="button" className="btn-export" onClick={() => void handleExportDocumentsExcelByProduct()} disabled={loadingDocuments || exportingDocuments}>
              {exportingDocuments ? 'Exportando…' : '⬇ CSV Detalle Productos'}
            </button>
            <button type="button" className="btn-export" onClick={() => void handleExportDocumentsXlsxByProduct()} disabled={loadingDocuments || exportingDocuments}>
              {exportingDocuments ? 'Exportando…' : '⬇ XLSX Detalle Productos'}
            </button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Documento</th>
              <th>Fecha emision</th>
              <th>Cliente</th>
              {workshopMultiVehicleEnabled && <th>Vehículo</th>}
              <th>Forma de pago</th>
              <th>Conversiones</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Acciones</th>
              <th>SUNAT</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((row) => {
              const sunatUi = resolveSunatUiState(row);
              const declarationSummaryId = toPositiveInt(row.sunat_summary_id);
              const cancellationSummaryId = toPositiveInt(row.sunat_void_summary_id);
              const declarationSummaryStatus = String(row.declaration_summary_status ?? '').trim().toUpperCase();
              const cancellationSummaryStatus = String(row.cancellation_summary_status ?? '').trim().toUpperCase();
              const editControl = resolveEditControlState(
                row,
                canEditDraftInCurrentMode,
                canEditIssuedBeforeSunatFinalInCurrentMode
              );

              return (
              <tr
                key={row.id}
                ref={Number(row.id) === focusDocumentId ? focusedReportRowRef : null}
                className={[
                  Number(row.id) === highlightedDocumentId ? 'sales-row-focused' : '',
                  Number(row.id) === pinnedDocumentId ? 'sales-row-selected' : '',
                ].filter(Boolean).join(' ')}
              >
                <td>{row.id}</td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span>{docKindLabelResolved(row.document_kind)} {row.series}-{row.number}</span>
                    {toBooleanFlag(row.has_restaurant_origin) && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        width: 'fit-content',
                        padding: '0.08rem 0.45rem',
                        borderRadius: '9999px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: '#ecfeff',
                        color: '#0e7490',
                        border: '1px solid #67e8f9',
                      }}>
                        Restaurante
                      </span>
                    )}
                  </div>
                </td>
                <td>{row.issue_at ? formatStoredDateTime(row.issue_at) : '-'}</td>
                <td>{row.customer_name}</td>
                {workshopMultiVehicleEnabled && <td>{formatReportDocumentVehicle(row) || '-'}</td>}
                <td>{row.payment_method_name ?? 'Sin metodo de pago'}</td>
                <td>
                    {(row.document_kind === 'QUOTATION' || row.document_kind === 'SALES_ORDER') ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                        {row.document_kind === 'QUOTATION' && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                            padding: '0.1rem 0.55rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700,
                            background: toBooleanFlag(row.has_order_conversion) ? '#d1fae5' : '#fff7ed',
                            color: toBooleanFlag(row.has_order_conversion) ? '#065f46' : '#9a3412',
                            border: `1px solid ${toBooleanFlag(row.has_order_conversion) ? '#6ee7b7' : '#fdba74'}`,
                          }}>
                            {toBooleanFlag(row.has_order_conversion) ? '✓ Nota pedido' : '⏳ Nota pedido'}
                          </span>
                        )}
                        {row.document_kind === 'SALES_ORDER' && (
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic' }}>
                            es nota de pedido
                          </span>
                        )}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          padding: '0.1rem 0.55rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700,
                          background: toBooleanFlag(row.has_tributary_conversion) ? '#d1fae5' : '#fff7ed',
                          color: toBooleanFlag(row.has_tributary_conversion) ? '#065f46' : '#9a3412',
                          border: `1px solid ${toBooleanFlag(row.has_tributary_conversion) ? '#6ee7b7' : '#fdba74'}`,
                        }}>
                          {toBooleanFlag(row.has_tributary_conversion) ? '✓ Tributario emitido' : '⏳ Tributario pendiente'}
                        </span>
                      </div>
                    ) : ((['INVOICE', 'RECEIPT'].includes(resolveRowDocumentKindBase(row)) && row.source_document_id) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-start' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                          padding: '0.1rem 0.55rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700,
                          background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7',
                        }}>
                          ✓ Emitido desde {row.source_document_kind === 'SALES_ORDER' ? 'nota de pedido' : 'pedido comercial'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#4b5563' }}>
                          Origen #{row.source_document_id}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                    ))}
                </td>
                <td>{commercialStatusLabel(row.status)}</td>
                <td>{row.total}</td>
                <td>
                  {(row.document_kind === 'QUOTATION' || row.document_kind === 'SALES_ORDER') ? (
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-mini sales-action-btn sales-action-view"
                        disabled={loading}
                        onClick={() => void showDocumentPreview(row.id, 'A4')}
                        title="Ver comprobante"
                      >
                        👁️
                      </button>
                      <button
                        type="button"
                        className="btn-mini sales-action-btn sales-action-view"
                        disabled={loading}
                        onClick={() => void showDocumentPreview(row.id, '80mm')}
                        title="Ver ticket 80mm"
                      >
                        🧾
                      </button>
                      {canConvertInCurrentMode && (
                        <div className="sales-actions-dropdown">
                          <button
                            type="button"
                            title="Opciones de conversion"
                            className="btn-mini sales-action-btn sales-action-view"
                            disabled={loading}
                          >
                            ⇄
                          </button>
                          <div className="sales-actions-dropdown-menu">
                            <button
                              type="button"
                              className="btn-mini"
                              disabled={loading}
                              onClick={() => void openConvertPreview(row, 'INVOICE')}
                            >
                              Factura
                            </button>
                            <button
                              type="button"
                              className="btn-mini"
                              disabled={loading}
                              onClick={() => void openConvertPreview(row, 'RECEIPT')}
                            >
                              Boleta
                            </button>
                            {row.document_kind === 'QUOTATION' && (
                              <button
                                type="button"
                                className="btn-mini"
                                disabled={loading}
                                onClick={() => void openConvertPreview(row, 'SALES_ORDER')}
                              >
                                Nota pedido
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {editControl.visible && (
                        <button
                          type="button"
                          className="btn-mini sales-action-btn sales-action-edit"
                          disabled={loading || !editControl.enabled}
                          onClick={() => void startEditDraft(row)}
                          title={editControl.reason}
                        >
                          📝
                        </button>
                      )}
                      {canVoidDocumentsInCurrentMode && !['VOID', 'CANCELED'].includes(String(row.status).toUpperCase()) && (
                        <button
                          type="button"
                          className="btn-mini sales-action-btn sales-action-void"
                          disabled={loading}
                          onClick={() => void handleVoidDocument(row)}
                          title="Anular comprobante"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-mini sales-action-btn sales-action-view"
                        disabled={loading}
                        onClick={() => void showDocumentPreview(row.id, 'A4')}
                        title="Ver comprobante"
                      >
                        👁️
                      </button>
                      <button
                        type="button"
                        className="btn-mini sales-action-btn sales-action-view"
                        disabled={loading}
                        onClick={() => void showDocumentPreview(row.id, '80mm')}
                        title="Ver ticket 80mm"
                      >
                        🧾
                      </button>
                      {editControl.visible && (
                        <button
                          type="button"
                          className="btn-mini sales-action-btn sales-action-edit"
                          disabled={loading || !editControl.enabled}
                          onClick={() => void startEditDraft(row)}
                          title={editControl.reason}
                        >
                          📝
                        </button>
                      )}
                      {canVoidBeforeSunatSend(row, canVoidDocumentsInCurrentMode)
                        && isPendingManualSunat(row)
                        && !['VOID', 'CANCELED'].includes(String(row.status).toUpperCase()) && (
                          <button
                            type="button"
                            className="btn-mini sales-action-btn sales-action-void"
                            disabled={loading}
                            onClick={() => void handleVoidDocument(row)}
                            title="Anulación no tributaria (sin envío SUNAT)"
                          >
                            🗑️
                          </button>
                        )}
                      {!isTributaryRow(row)
                        && canVoidDocumentsInCurrentMode
                        && !['VOID', 'CANCELED'].includes(String(row.status).toUpperCase()) && (
                          <button
                            type="button"
                            className="btn-mini sales-action-btn sales-action-void"
                            disabled={loading}
                            onClick={() => void handleVoidDocument(row)}
                            title="Anular comprobante"
                          >
                            🗑️
                          </button>
                        )}
                    </div>
                  )}
                </td>
                <td>
                  {(declarationSummaryId || cancellationSummaryId) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.35rem' }}>
                      {declarationSummaryId && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.08rem 0.48rem',
                            borderRadius: '9999px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            ...summaryFlowBadgeStyle(declarationSummaryStatus),
                          }}
                          title="Asignado a resumen diario de declaracion"
                        >
                          En RC {summaryFlowStatusLabel(declarationSummaryStatus)} #{declarationSummaryId}
                        </span>
                      )}
                      {cancellationSummaryId && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.08rem 0.48rem',
                            borderRadius: '9999px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            ...summaryFlowBadgeStyle(cancellationSummaryStatus),
                          }}
                          title="Asignado a resumen diario de anulacion"
                        >
                          En RA {summaryFlowStatusLabel(cancellationSummaryStatus)} #{cancellationSummaryId}
                        </span>
                      )}
                    </div>
                  )}
                  {isTributaryRow(row) ? (
                    <div
                      className={`sales-sunat-dropdown ${canOpenSunatActionsMenu(row, taxBridgeEnabled, canVoidDocumentsInCurrentMode) ? '' : 'is-locked'}`}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}>
                        <button type="button" className={`sales-sunat-badge ${sunatUi.className}`}>
                          {sunatUi.label}
                        </button>
                        {canViewTaxBridgeDebug && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handleToggleSunatBridgeDebug(row);
                            }}
                            title="Ver historial de intentos SUNAT (payload y respuesta por intento)"
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '9999px',
                              border: sunatBridgeDebugState?.documentId === row.id ? '1px solid #0f766e' : '1px solid #cbd5e1',
                              background: sunatBridgeDebugState?.documentId === row.id ? '#ecfeff' : '#f8fafc',
                              color: '#0f172a',
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              lineHeight: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            i
                          </button>
                        )}
                      </div>
                      <div className="sales-sunat-dropdown-menu">
                        {/* ── DOCS ACEPTADOS: Descargas + Notas ─────────────── */}
                        {String(row.sunat_status ?? '').toUpperCase() === 'ACCEPTED' && (
                          <>
                            <p className="sunat-menu-section-label">Descargar</p>
                            <div className="sunat-menu-row">
                              <button
                                type="button"
                                className="sunat-menu-btn sunat-menu-btn--download"
                                disabled={loading || !taxBridgeEnabled}
                                onClick={() => void handleDownloadXml(row)}
                                title={taxBridgeEnabled ? 'Descargar XML — GET bridge/dowload_xml/{ruc}/{tipo}/{serie}/{numero}' : 'Puente tributario no habilitado'}
                              >
                                🗂️ XML
                              </button>
                              <button
                                type="button"
                                className="sunat-menu-btn sunat-menu-btn--download"
                                disabled={loading || !taxBridgeEnabled}
                                onClick={() => void handleDownloadCdr(row)}
                                title={taxBridgeEnabled ? 'Descargar CDR ZIP — GET bridge/dowload_cdr/{ruc}/{tipo}/{serie}/{numero}' : 'Puente tributario no habilitado'}
                              >
                                📦 CDR
                              </button>
                            </div>
                            {['INVOICE', 'RECEIPT'].includes(resolveRowDocumentKindBase(row)) && (
                              <>
                                <div className="sunat-menu-divider" />
                                <p className="sunat-menu-section-label">Notas</p>
                                <button
                                  type="button"
                                  className="sunat-menu-btn sunat-menu-btn--note"
                                  disabled={loading}
                                  onClick={() => void handleOpenNoteFromDocument(row, 'CREDIT_NOTE')}
                                  title="Pre-carga los datos del comprobante en el formulario"
                                >
                                  📉 Nota de Credito
                                </button>
                                <button
                                  type="button"
                                  className="sunat-menu-btn sunat-menu-btn--note"
                                  disabled={loading}
                                  onClick={() => void handleOpenNoteFromDocument(row, 'DEBIT_NOTE')}
                                  title="Pre-carga los datos del comprobante en el formulario"
                                >
                                  📈 Nota de Debito
                                </button>
                              </>
                            )}
                            <div className="sunat-menu-divider" />
                          </>
                        )}
                        {canSendSunatManually(row, taxBridgeEnabled) && (
                          <button
                            type="button"
                            className="sunat-menu-btn"
                            disabled={loading || sunatSendingDocumentId === row.id}
                            onClick={() => void handleManualSunatSend(row)}
                          >
                            🚀 {sunatSendingDocumentId === row.id ? 'Enviando...' : 'Enviar a SUNAT'}
                          </button>
                        )}
                        {canVoidBeforeSunatSend(row, canVoidDocumentsInCurrentMode)
                          && !isReceiptDocument(row)
                          && !isPendingManualSunat(row) && (
                          <button
                            type="button"
                            className="sunat-menu-btn sunat-menu-btn--danger"
                            disabled={loading}
                            onClick={() => void handleVoidDocument(row)}
                            title="Anular internamente sin enviar a SUNAT"
                          >
                            🗑️ Anular (sin envio SUNAT)
                          </button>
                        )}
                        {canVoidBeforeSunatSend(row, canVoidDocumentsInCurrentMode)
                          && isReceiptDocument(row)
                          && !canAnulateAcceptedReceipt(row)
                          && !isPendingManualSunat(row) && (
                          <button
                            type="button"
                            className="sunat-menu-btn sunat-menu-btn--danger"
                            disabled={loading}
                            onClick={() => void handleVoidDocument(row)}
                            title="Anular boleta y agrupar automaticamente a RA (resumen anulacion)"
                          >
                            🗑️ Anular a RA
                          </button>
                        )}
                        {isReceiptDocument(row) && String(row.status).toUpperCase() === 'ISSUED' && (
                          <>
                            {canAddReceiptToDeclarationSummary(row) && (
                              <button
                                type="button"
                                className="sunat-menu-btn"
                                disabled={loading}
                                onClick={() => void handleAddReceiptToDeclarationSummary(row)}
                                title={String(row.sunat_status ?? '').toUpperCase() === 'ACCEPTED'
                                  ? 'Agregar boleta aceptada al resumen diario de declaracion (RC)'
                                  : 'Agregar boleta al resumen diario de declaracion (RC)'}
                              >
                                📋 Agregar a RC (declaracion)
                              </button>
                            )}
                            {canAnulateAcceptedReceipt(row) && (
                              <button
                                type="button"
                                className="sunat-menu-btn sunat-menu-btn--danger"
                                disabled={loading || !canVoidDocumentsInCurrentMode}
                                onClick={() => void handleVoidDocument(row)}
                                title={!canVoidDocumentsInCurrentMode
                                  ? 'Sin permiso de anulacion'
                                  : 'Anular boleta aceptada por SUNAT y agrupar a RA (resumen anulacion)'}
                              >
                                🗑️ Anular a RA
                              </button>
                            )}
                          </>
                        )}
                        {canRequestSunatVoidCommunication(row) && !isReceiptDocument(row) && (
                          <>
                            <button
                              type="button"
                              className="sunat-menu-btn sunat-menu-btn--danger"
                              disabled={loading || !taxBridgeEnabled || !canVoidDocumentsInCurrentMode}
                              onClick={() => void handleSunatVoidCommunication(row)}
                              title={!taxBridgeEnabled
                                ? 'Puente tributario no habilitado'
                                : (!canVoidDocumentsInCurrentMode
                                  ? 'Sin permiso de anulacion'
                                  : 'Envia comunicacion de baja a SUNAT')}
                            >
                              📤 Comunicar baja SUNAT
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
          <small>
            Pagina {documentsMeta.page} de {documentsMeta.last_page} | Total registros: {documentsMeta.total}
          </small>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              disabled={loading || documentsMeta.page <= 1}
              onClick={() => setDocumentsPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={loading || documentsMeta.page >= documentsMeta.last_page}
              onClick={() => setDocumentsPage((prev) => Math.min(documentsMeta.last_page, prev + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
        </>
      )}

        </>
      )}

      {creditPlanModalOpen && form.isCreditSale && (
        <div
          className="sales-credit-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCreditPlanModalOpen(false);
            }
          }}
        >
          <div className="sales-credit-modal">
            <div className="sales-credit-modal-header">
              <div>
                <h3>Plan de cuotas</h3>
                <p>Configura monto, fecha y observación por cuota sin ocupar la pantalla principal de venta.</p>
              </div>
              <button type="button" className="sales-credit-modal-close" onClick={() => setCreditPlanModalOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="sales-credit-modal-summary">
              <span className="sales-tributary-chip is-warning">Cuotas {creditInstallments.length}</span>
              <span className="sales-tributary-chip is-soft">Saldo {selectedCurrency?.symbol ?? ''} {creditPendingTotal.toFixed(2)}</span>
              {advancesEnabled && cappedAdvanceAmount > 0 && (
                <span className="sales-tributary-chip is-soft">Anticipo {selectedCurrency?.symbol ?? ''} {cappedAdvanceAmount.toFixed(2)}</span>
              )}
            </div>

            <div className="sales-credit-installment-list">
              {creditInstallments.map((row, index) => (
                <div className="sales-credit-installment-card" key={`credit-installment-modal-${index}`}>
                  <div className="sales-credit-installment-head">
                    <div className="sales-credit-installment-meta">
                      <span className="sales-credit-installment-index">Cuota {index + 1}</span>
                      <span className="sales-credit-installment-caption">Programa el compromiso de cobro y agrega contexto para el vendedor.</span>
                    </div>
                    <button
                      className="sales-credit-installment-remove"
                      type="button"
                      onClick={() => removeCreditInstallment(index)}
                      disabled={creditInstallments.length <= 1}
                    >
                      Quitar cuota
                    </button>
                  </div>

                  <div className="sales-credit-installment-grid">
                    <label className="sales-credit-installment-field">
                      <span>Monto</span>
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updateCreditInstallment(index, { amount: Math.max(0, Number(e.target.value || 0)) })}
                      />
                    </label>

                    <label className="sales-credit-installment-field">
                      <span>Fecha pago</span>
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => updateCreditInstallment(index, { dueDate: e.target.value })}
                      />
                    </label>

                    <label className="sales-credit-installment-field is-wide">
                      <span>Observación</span>
                      <textarea
                        rows={2}
                        maxLength={300}
                        value={row.observation ?? ''}
                        onChange={(e) => updateCreditInstallment(index, { observation: e.target.value })}
                        placeholder="Ej. Cliente deposita después de recibir mercadería"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="sales-credit-installment-toolbar">
              <button className="sales-credit-installment-add" type="button" onClick={addCreditInstallment}>
                Agregar otra cuota
              </button>
              <span className="sales-credit-installment-help">La suma de cuotas debe coincidir con el saldo pendiente del comprobante.</span>
            </div>

            <div className="sales-credit-modal-footer">
              <button type="button" className="sales-credit-modal-close" onClick={() => setCreditPlanModalOpen(false)}>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {previewDialog && (
        <HtmlPreviewDialog
          title={previewDialog.title}
          subtitle={previewDialog.subtitle}
          html={previewDialog.html}
          variant={previewDialog.variant}
          onClose={() => setPreviewDialog(null)}
        />
      )}

      {sunatBridgeDebugState && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3349,
              background: 'rgba(15, 23, 42, 0.52)',
            }}
            onClick={() => setSunatBridgeDebugState(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSunatBridgeDebugState(null);
              }
            }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 3350,
              width: 'min(1080px, 96vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              background: '#ffffff',
              border: '1px solid #dbe4f0',
              borderRadius: '14px',
              boxShadow: '0 28px 70px rgba(15, 23, 42, 0.42)',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(120deg, #0f172a 0%, #0f766e 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Detalle tecnico SUNAT bridge</h3>
                <p style={{ margin: '4px 0 0', opacity: 0.88, fontSize: '0.84rem' }}>{sunatBridgeDebugState.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSunatBridgeDebugState(null)}
                style={{ border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(15,23,42,0.2)', color: '#fff', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ padding: '14px 16px' }}>
              {sunatBridgeDebugState.loading ? (
                <p style={{ margin: 0, color: '#64748b' }}>Consultando trazabilidad tecnica del envio...</p>
              ) : sunatBridgeDebugState.error ? (
                <p style={{ margin: 0, color: '#dc2626' }}>{sunatBridgeDebugState.error}</p>
              ) : sunatBridgeDebugState.attempts.length > 0 ? (
                <>
                  <div style={{ marginBottom: '0.8rem', color: '#334155', fontSize: '0.85rem' }}>
                    Se encontraron {sunatBridgeDebugState.attempts.length} intento(s) para este comprobante.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.95fr) 1.4fr', gap: '0.75rem' }}>
                    <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                        Intentos del puente
                      </header>
                      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        {sunatBridgeDebugState.attempts.map((attempt) => {
                          const isSelected = sunatBridgeDebugState.selectedLogId === attempt.id;
                          return (
                            <button
                              key={attempt.id}
                              type="button"
                              onClick={() => {
                                const hasDetail = Object.prototype.hasOwnProperty.call(sunatBridgeDebugState.attemptDetails, attempt.id);
                                if (!hasDetail) {
                                  void loadSunatAuditAttemptDetail(sunatBridgeDebugState.documentId, attempt.id);
                                  return;
                                }

                                setSunatBridgeDebugState((prev) => {
                                  if (!prev) {
                                    return prev;
                                  }

                                  return {
                                    ...prev,
                                    selectedLogId: attempt.id,
                                  };
                                });
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                border: 'none',
                                borderBottom: '1px solid #e2e8f0',
                                background: isSelected ? '#ecfeff' : '#fff',
                                padding: '10px',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                                <strong style={{ color: '#0f172a', fontSize: '0.8rem' }}>Intento #{attempt.attempt_number}</strong>
                                <span style={{ fontSize: '0.72rem', color: '#334155' }}>{sunatStatusLabel(attempt.status)}</span>
                              </div>
                              <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.74rem' }}>
                                {attempt.sent_at ? fmtDateTimeFullLima(attempt.sent_at) : 'Sin fecha'}
                              </div>
                              <div style={{ marginTop: '0.22rem', color: '#475569', fontSize: '0.72rem' }}>
                                {attempt.http_code ? `HTTP ${attempt.http_code}` : 'Sin HTTP'}
                                {attempt.response_time_ms !== null && attempt.response_time_ms !== undefined ? ` · ${Number(attempt.response_time_ms).toFixed(2)} ms` : ''}
                                {attempt.is_retry ? ' · Reintento' : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                        Detalle por intento
                      </header>
                      <div style={{ padding: '10px' }}>
                        {sunatBridgeDebugState.selectedLogId === null ? (
                          <p style={{ margin: 0, color: '#64748b' }}>Selecciona un intento para ver payload y respuesta.</p>
                        ) : sunatBridgeDebugState.loadingDetailLogId === sunatBridgeDebugState.selectedLogId ? (
                          <p style={{ margin: 0, color: '#64748b' }}>Cargando detalle del intento...</p>
                        ) : !sunatBridgeDebugState.attemptDetails[sunatBridgeDebugState.selectedLogId] ? (
                          <p style={{ margin: 0, color: '#b91c1c' }}>No se pudo cargar el detalle de este intento.</p>
                        ) : (
                          (() => {
                            const detail = sunatBridgeDebugState.attemptDetails[sunatBridgeDebugState.selectedLogId!] as TaxBridgeAuditAttemptDetail;
                            return (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem', marginBottom: '0.9rem' }}>
                                  <article><strong>Modo</strong><div>{detail.bridge.mode || '-'}</div></article>
                                  <article><strong>Estado SUNAT</strong><div>{sunatStatusLabel(detail.sunat.status || '')}</div></article>
                                  <article><strong>HTTP bridge</strong><div>{detail.response.status_code ? `HTTP ${detail.response.status_code}` : '-'}</div></article>
                                  <article><strong>Ticket</strong><div>{detail.sunat.ticket || '-'}</div></article>
                                  <article><strong>Código SUNAT</strong><div>{detail.sunat.code || '-'}</div></article>
                                  <article><strong>SHA1 payload</strong><div>{detail.request.sha1 || '-'}</div></article>
                                </div>

                                <div style={{ marginBottom: '0.8rem', color: '#334155', fontSize: '0.85rem' }}>
                                  <strong>Endpoint:</strong> {detail.bridge.method || 'POST'} {detail.bridge.endpoint || '-'}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                                    <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                                      Payload enviado
                                    </header>
                                    <pre style={{ margin: 0, padding: '10px', maxHeight: '36vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: 1.45 }}>
                                      {formatDebugJson(detail.request.payload)}
                                    </pre>
                                  </section>

                                  <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                                    <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                                      Respuesta del bridge
                                    </header>
                                    <pre style={{ margin: 0, padding: '10px', maxHeight: '36vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: 1.45 }}>
                                      {formatDebugJson(detail.response.body)}
                                    </pre>
                                  </section>
                                </div>

                                {(detail.error?.message || detail.sunat.message) && (
                                  <p style={{ margin: '10px 0 0', color: '#b91c1c', fontWeight: 600 }}>
                                    Detalle: {detail.error?.message || detail.sunat.message}
                                  </p>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>
                    </section>
                  </div>
                </>
              ) : !sunatBridgeDebugState.debug ? (
                <p style={{ margin: 0, color: '#64748b' }}>No existe histórico de intentos para este comprobante.</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', marginBottom: '0.9rem' }}>
                    <article><strong>Modo</strong><div>{sunatBridgeDebugState.debug.bridge_mode || '-'}</div></article>
                    <article><strong>Estado SUNAT</strong><div>{sunatBridgeDebugState.debug.sunat_status_label || sunatBridgeDebugState.debug.sunat_status || '-'}</div></article>
                    <article><strong>HTTP bridge</strong><div>{sunatBridgeDebugState.debug.bridge_http_code ? `HTTP ${sunatBridgeDebugState.debug.bridge_http_code}` : '-'}</div></article>
                    <article><strong>Ticket</strong><div>{sunatBridgeDebugState.debug.sunat_ticket || '-'}</div></article>
                    <article><strong>Error SUNAT</strong><div>{sunatBridgeDebugState.debug.sunat_error_code || '-'}</div></article>
                    <article><strong>SHA1 payload</strong><div>{sunatBridgeDebugState.debug.payload_sha1 || '-'}</div></article>
                  </div>

                  <div style={{ marginBottom: '0.8rem', color: '#334155', fontSize: '0.85rem' }}>
                    <strong>Endpoint:</strong> {sunatBridgeDebugState.debug.method || 'POST'} {sunatBridgeDebugState.debug.endpoint || '-'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                        Payload enviado
                      </header>
                      <pre style={{ margin: 0, padding: '10px', maxHeight: '44vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: 1.45 }}>
                        {formatDebugJson(sunatBridgeDebugState.debug.payload)}
                      </pre>
                    </section>

                    <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                        Respuesta del bridge
                      </header>
                      <pre style={{ margin: 0, padding: '10px', maxHeight: '44vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: 1.45 }}>
                        {formatDebugJson(sunatBridgeDebugState.debug.bridge_response)}
                      </pre>
                    </section>
                  </div>

                  {sunatBridgeDebugState.debug.sunat_error_message && (
                    <p style={{ margin: '10px 0 0', color: '#b91c1c', fontWeight: 600 }}>
                      Detalle error SUNAT: {sunatBridgeDebugState.debug.sunat_error_message}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {convertPreviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3299, pointerEvents: 'none' }} />
      )}

      {convertPreviewModal && (
        <div
          role="dialog"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setConvertPreviewModal(null);
            }
          }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 3300,
            width: 'min(860px, 96vw)',
            maxHeight: '86vh',
            overflow: 'auto',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #dbe4f0',
            borderRadius: '14px',
            boxShadow: '0 28px 70px rgba(15, 23, 42, 0.38)',
            outline: 'none',
            pointerEvents: 'auto',
          }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #e5e7eb', background: 'linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%)', color: '#fff' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.2px' }}>Confirmar conversion</h3>
            <p style={{ margin: '4px 0 0', opacity: 0.88, fontSize: '0.85rem' }}>
              {convertPreviewModal.source.document_kind} {convertPreviewModal.source.series}-{convertPreviewModal.source.number} {'->'} {
                convertPreviewModal.targetDocumentKind === 'INVOICE'
                  ? 'Factura'
                  : convertPreviewModal.targetDocumentKind === 'RECEIPT'
                    ? 'Boleta'
                    : 'Nota de pedido'
              }
            </p>
          </div>

          <div style={{ padding: '16px' }}>
            {convertPreviewModal.loading && <p style={{ margin: 0, color: '#64748b' }}>Cargando detalle del documento...</p>}
            {!convertPreviewModal.loading && convertPreviewModal.error && (
              <p style={{ margin: 0, color: '#dc2626' }}>{convertPreviewModal.error}</p>
            )}
            {!convertPreviewModal.loading && !convertPreviewModal.error && convertPreviewModal.details && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <article><strong>Cliente</strong><div>{convertPreviewModal.details.customerName}</div></article>
                  <article><strong>Total</strong><div>{convertPreviewModal.details.currencySymbol} {Number(convertPreviewModal.details.grandTotal ?? 0).toFixed(2)}</div></article>
                  <article><strong>Estado origen</strong><div>{commercialStatusLabel(convertPreviewModal.details.status)}</div></article>
                </div>
                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  height: '420px',
                  background: '#fff',
                }}>
                  <iframe
                    title="Vista previa de conversion"
                    srcDoc={convertPreviewModal.previewHtml}
                    style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                  />
                </div>
              </>
            )}

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={() => setConvertPreviewModal(null)} style={{ padding: '10px 14px', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmConvertFromPreview()}
                disabled={convertPreviewModal.loading || !!convertPreviewModal.error || !convertPreviewModal.details}
                style={{ padding: '10px 14px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Confirmar conversion
              </button>
            </div>
          </div>
        </div>
      )}

      {postConvertPrintModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3299, pointerEvents: 'none' }} />
      )}

      {postConvertPrintModal && (
        <div
          role="dialog"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setPostConvertPrintModal(null);
            }
          }}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 3300,
            width: 'min(460px, 96vw)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #dbe4f0',
            borderRadius: '14px',
            boxShadow: '0 28px 70px rgba(15, 23, 42, 0.38)',
            overflow: 'hidden',
            outline: 'none',
            pointerEvents: 'auto',
          }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #e5e7eb', background: 'linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%)', color: '#fff' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.2px' }}>{postConvertPrintModal.title}</h3>
            <p style={{ margin: '4px 0 0', opacity: 0.86, fontSize: '0.85rem' }}>{postConvertPrintModal.subtitle || 'Selecciona formato de impresion'}</p>
          </div>
          <div style={{ padding: '16px' }}>
            {postConvertPrintModal.loading ? (
              <p style={{ textAlign: 'center', color: '#64748b', margin: 0 }}>Cargando documento convertido...</p>
            ) : postConvertPrintModal.details ? (
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                <button
                  type="button"
                  onClick={() => openPostConvertPrint('80mm')}
                  style={{ padding: '12px 14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                >
                  Imprimir Ticket 80mm
                </button>
                <button
                  type="button"
                  onClick={() => openPostConvertPrint('A4')}
                  style={{ padding: '12px 14px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}
                >
                  Imprimir A4 / PDF
                </button>
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#dc2626', margin: 0 }}>{postConvertPrintModal.error || 'No se pudo cargar documento convertido'}</p>
            )}

            <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPostConvertPrintModal(null)}
                style={{ padding: '10px 14px', backgroundColor: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
