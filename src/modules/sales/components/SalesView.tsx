import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchInventoryLots, fetchInventoryProducts } from '../../inventory/api';
import type { InventoryLotRow, InventoryProduct } from '../../inventory/types';
import {
  convertCommercialDocument,
  createCommercialDocument,
  exportCommercialDocumentsExcel,
  exportCommercialDocumentsJson,
  fetchCommercialDocumentDetails,
  fetchCustomerAutocomplete,
  fetchCommercialDocuments,
  fetchProductCommercialConfig,
  fetchSalesLookups,
  fetchSeriesNumbers,
} from '../api';
import { fetchCommerceSettings } from '../../masters/api';
import {
  buildCommercialDocument80mmHtml,
  buildCommercialDocumentA4Html,
  type PrintableSalesDocument,
} from '../print';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
import type {
  CommercialDocumentListItem,
  CreateDocumentForm,
  PaginationMeta,
  SalesCustomerSuggestion,
  SalesDraftItem,
  SalesLookups,
  SeriesNumber,
} from '../types';

type SalesViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  cashRegisterId: number | null;
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
};

type DocumentAdvancedFilters = {
  customer: string;
  issueDateFrom: string;
  issueDateTo: string;
  series: string;
  number: string;
  status: string;
};

type SalesWorkspaceMode = 'SELL' | 'REPORT';
type SalesFlowMode = 'DIRECT_CASHIER' | 'SELLER_TO_CASHIER';
type CashierReportPanelMode = 'PENDING' | 'FULL';

const SALES_REPORT_FILTERS_STORAGE_KEY = 'sales.report.filters.v1';

const initialDocumentAdvancedFilters: DocumentAdvancedFilters = {
  customer: '',
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
): { price: number; note: string } {
  if (!config?.features.PRODUCT_WHOLESALE_PRICING || qty <= 0) {
    return { price: fallbackPrice, note: '' };
  }

  const activeRows = (config.wholesale_prices ?? []).filter((row) => Number(row.status) === 1);
  if (activeRows.length === 0) {
    return { price: fallbackPrice, note: '' };
  }

  const inRange = activeRows.filter((row) => {
    const min = Number(row.min_qty ?? 0);
    const max = row.max_qty === null ? null : Number(row.max_qty);
    return qty >= min && (max === null || qty <= max);
  });

  if (inRange.length === 0) {
    return { price: fallbackPrice, note: '' };
  }

  const sameUnit = inRange
    .filter((row) => row.unit_id !== null && row.unit_id === unitId)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));

  const generic = inRange
    .filter((row) => row.unit_id === null)
    .sort((a, b) => Number(a.min_qty) - Number(b.min_qty));

  const picked = sameUnit[0] ?? generic[0] ?? null;
  if (!picked) {
    return { price: fallbackPrice, note: '' };
  }

  return {
    price: Number(picked.unit_price),
    note: `Precio por mayor aplicado desde cantidad ${picked.min_qty}${picked.max_qty ? ` hasta ${picked.max_qty}` : '+'}.`,
  };
}

function todayAsInputDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function unitLabelForPrint(units: SalesLookups['units'] | null, unitId: number | null): string {
  if (!unitId) {
    return '-';
  }

  return units?.find((row) => row.id === unitId)?.code ?? String(unitId);
}

function normalizePrintableTotals(lookups: SalesLookups | null, items: SalesDraftItem[]) {
  const taxCategories = lookups?.tax_categories ?? [];

  let subtotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;
  let gravadaTotal = 0;
  let inafectaTotal = 0;
  let exoneradaTotal = 0;

  for (const item of items) {
    const lineSubtotal = Number(item.qty) * Number(item.unitPrice);
    const category = taxCategories.find((row) => row.id === item.taxCategoryId) ?? null;
    const code = String(category?.code ?? '').trim();
    const ratePercent = Number(item.taxRate ?? category?.rate_percent ?? 0);
    const lineTax = lineSubtotal * (ratePercent / 100);

    subtotal += lineSubtotal;
    taxTotal += lineTax;
    grandTotal += lineSubtotal + lineTax;

    const isFreeTransfer = code === '21' || code === '37';
    const isGravada = /^1\d$/.test(code);
    const isExonerada = /^2\d$/.test(code) && !isFreeTransfer;
    const isInafecta = /^3\d$/.test(code) && !isFreeTransfer;

    if (isGravada) {
      gravadaTotal += lineSubtotal;
    } else if (isExonerada) {
      exoneradaTotal += lineSubtotal;
    } else if (isInafecta) {
      inafectaTotal += lineSubtotal;
    } else if (ratePercent <= 0) {
      inafectaTotal += lineSubtotal;
    } else {
      gravadaTotal += lineSubtotal;
    }
  }

  return {
    subtotal,
    taxTotal,
    grandTotal,
    gravadaTotal,
    inafectaTotal,
    exoneradaTotal,
  };
}

const TODAY = todayAsInputDate();

const initialForm: CreateDocumentForm = {
  documentKind: 'RECEIPT',
  customerId: 0,
  currencyId: 1,
  paymentMethodId: 1,
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
  series: '',
  qty: 1,
  unitPrice: 0,
};

const TRIBUTARY_DOCUMENTS: CreateDocumentForm['documentKind'][] = [
  'INVOICE',
  'RECEIPT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
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

function buildDocumentFilterParams(filter: DocumentViewFilter): {
  documentKind?: string;
  conversionState?: 'PENDING' | 'CONVERTED';
} {
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

function resolveSalesFlowMode(features: Array<{ feature_code: string; is_enabled: boolean }>): SalesFlowMode {
  const row = features.find((item) => item.feature_code === 'SALES_SELLER_TO_CASHIER');
  return row?.is_enabled ? 'SELLER_TO_CASHIER' : 'DIRECT_CASHIER';
}

export function SalesView({ accessToken, branchId, warehouseId, cashRegisterId, currentUserRoleCode, currentUserRoleProfile }: SalesViewProps) {
  const [lookups, setLookups] = useState<SalesLookups | null>(null);
  const [series, setSeries] = useState<SeriesNumber[]>([]);
  const [documents, setDocuments] = useState<CommercialDocumentListItem[]>([]);
  const [documentsMeta, setDocumentsMeta] = useState<PaginationMeta>({ page: 1, per_page: 10, total: 0, last_page: 1 });
  const [documentsPage, setDocumentsPage] = useState(1);
  const [documentViewFilter, setDocumentViewFilter] = useState<DocumentViewFilter>('ALL');
  const [customerSuggestions, setCustomerSuggestions] = useState<SalesCustomerSuggestion[]>([]);
  const [productSuggestions, setProductSuggestions] = useState<InventoryProduct[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [form, setForm] = useState<CreateDocumentForm>(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomerSuggestion | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const [selectedProductCommercialConfig, setSelectedProductCommercialConfig] = useState<ProductCommercialConfig | null>(null);
  const [selectedProductUnitOptions, setSelectedProductUnitOptions] = useState<SalesLookups['units']>([]);
  const [autoPriceHint, setAutoPriceHint] = useState('');
  const [cart, setCart] = useState<SalesDraftItem[]>([]);
  const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);
  const [activeCustomerIndex, setActiveCustomerIndex] = useState(-1);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
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
  const [documentFiltersApplied, setDocumentFiltersApplied] = useState<DocumentAdvancedFilters>(() => {
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
  const [exportingDocuments, setExportingDocuments] = useState(false);

  const [salesWorkspaceMode, setSalesWorkspaceMode] = useState<SalesWorkspaceMode>('SELL');
  const [cashierReportPanelMode, setCashierReportPanelMode] = useState<CashierReportPanelMode>('PENDING');
  const [salesFlowMode, setSalesFlowMode] = useState<SalesFlowMode>('DIRECT_CASHIER');
  const [seriesExpanded, setSeriesExpanded] = useState(false);
  const [cashierDefaultApplied, setCashierDefaultApplied] = useState(false);

  const normalizedRoleCode = (currentUserRoleCode ?? '').toUpperCase();
  const normalizedRoleProfile = (currentUserRoleProfile ?? '').toUpperCase();
  const isSellerUser = normalizedRoleProfile === 'SELLER' || normalizedRoleCode.includes('VENDED') || normalizedRoleCode.includes('SELLER');
  const isCashierUser = normalizedRoleProfile === 'CASHIER' || normalizedRoleCode.includes('CAJA') || normalizedRoleCode.includes('CAJER') || normalizedRoleCode.includes('CASHIER') || normalizedRoleCode.includes('ADMIN');
  const isSeparatedMode = salesFlowMode === 'SELLER_TO_CASHIER';
  const canUseSellWorkspace = true;
  const shouldPrioritizePendingOrders = isSeparatedMode && isCashierUser;
  const canConvertInCurrentMode = !isSeparatedMode || isCashierUser;

  const salesFlowModeLabel = salesFlowMode === 'SELLER_TO_CASHIER'
    ? 'Vendedor -> Caja independiente'
    : 'Venta directa en punto de venta';

  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);

  const draftSubtotal = useMemo(() => Number(form.qty) * Number(form.unitPrice), [form.qty, form.unitPrice]);
  const isTributaryDocument = useMemo(() => {
    return TRIBUTARY_DOCUMENTS.includes(form.documentKind);
  }, [form.documentKind]);
  const effectiveDocumentKind = salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser ? 'QUOTATION' : form.documentKind;
  const isCurrentPreDocument = effectiveDocumentKind === 'QUOTATION' || effectiveDocumentKind === 'SALES_ORDER';
  const canCreateDocumentInCurrentMode = !isSeparatedMode || !isCashierUser || !isCurrentPreDocument;

  const selectedTaxCategory = useMemo(() => {
    return lookups?.tax_categories.find((row) => row.id === form.taxCategoryId) ?? null;
  }, [lookups, form.taxCategoryId]);

  const draftTaxRate = useMemo(() => {
    if (!isTributaryDocument) {
      return 0;
    }

    return Number(selectedTaxCategory?.rate_percent ?? 0);
  }, [isTributaryDocument, selectedTaxCategory]);

  const draftTaxTotal = useMemo(() => draftSubtotal * (draftTaxRate / 100), [draftSubtotal, draftTaxRate]);
  const draftGrandTotal = useMemo(() => draftSubtotal + draftTaxTotal, [draftSubtotal, draftTaxTotal]);
  const draftConversionFactor = useMemo(() => {
    if (form.isManualItem) {
      return 1;
    }

    return resolveConversionFactor(selectedProductCommercialConfig, form.unitId);
  }, [form.isManualItem, form.unitId, selectedProductCommercialConfig]);
  const draftQtyBase = useMemo(() => Number(form.qty || 0) * Number(draftConversionFactor || 1), [form.qty, draftConversionFactor]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + Number(item.qty) * Number(item.unitPrice), 0);
  }, [cart]);
  const taxTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const itemSubtotal = Number(item.qty) * Number(item.unitPrice);
      const itemRate = Number(item.taxRate ?? 0);
      return acc + itemSubtotal * (itemRate / 100);
    }, 0);
  }, [cart]);
  const grandTotal = useMemo(() => subtotal + taxTotal, [subtotal, taxTotal]);

  const selectedCurrency = useMemo(() => {
    return lookups?.currencies.find((row) => row.id === form.currencyId) ?? null;
  }, [lookups, form.currencyId]);

  const defaultEnabledUnit = useMemo(() => {
    return lookups?.units?.[0] ?? null;
  }, [lookups]);

  const canAddDraftItem = useMemo(() => {
    const validTax = !isTributaryDocument || Boolean(form.taxCategoryId);

    if (!validTax || form.qty <= 0 || Number(form.unitPrice) < 0) {
      return false;
    }

    if (form.isManualItem) {
      return form.manualDescription.trim().length > 0;
    }

    const lotIsValid = lots.length === 0 || Boolean(form.lotId);

    return Boolean(selectedProduct && lotIsValid);
  }, [
    form.isManualItem,
    form.lotId,
    form.manualDescription,
    form.qty,
    form.taxCategoryId,
    form.unitPrice,
    isTributaryDocument,
    lots.length,
    selectedProduct,
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
        lotId: form.isManualItem ? null : form.lotId,
        taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
        qtyBase: form.isManualItem ? null : Number(draftQtyBase),
        conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
        baseUnitPrice:
          form.isManualItem
            ? null
            : Number(form.unitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
        taxRate: isTributaryDocument ? Number(selectedTaxCategory?.rate_percent ?? 0) : 0,
        taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
        isManual: form.isManualItem,
        description: draftDescription,
        qty: Number(form.qty),
        unitPrice: Number(form.unitPrice),
      },
    ];
  }, [
    canAddDraftItem,
    cart,
    form.isManualItem,
    form.lotId,
    form.manualDescription,
    form.productId,
    form.qty,
    form.taxCategoryId,
    form.unitId,
    form.unitPrice,
    isTributaryDocument,
    selectedProduct,
    draftQtyBase,
    draftConversionFactor,
    selectedTaxCategory,
  ]);

  const tributaryPreview = useMemo(() => {
    const base = {
      discountTotal: 0,
      inafectaTotal: 0,
      exoneradaTotal: 0,
      gravadaTotal: 0,
      igvTotal: 0,
      igvRateLabel: 18,
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
      const subtotalValue = Number(item.qty) * Number(item.unitPrice);
      const category = categories.find((row) => row.id === item.taxCategoryId) ?? null;
      const code = String(category?.code ?? '').trim();
      const ratePercent = Number(item.taxRate ?? category?.rate_percent ?? 0);
      const taxValue = subtotalValue * (ratePercent / 100);

      const isFreeTransfer = code === '21' || code === '37';
      const isGravada = /^1\d$/.test(code);
      const isExonerada = /^2\d$/.test(code) && !isFreeTransfer;
      const isInafecta = /^3\d$/.test(code) && !isFreeTransfer;

      if (isFreeTransfer) {
        base.gratuitaTotal += subtotalValue;
      } else if (isGravada) {
        base.gravadaTotal += subtotalValue;
        base.igvTotal += taxValue;

        if (firstGravadaRate === null && ratePercent > 0) {
          firstGravadaRate = ratePercent;
        }
      } else if (isExonerada) {
        base.exoneradaTotal += subtotalValue;
      } else if (isInafecta) {
        base.inafectaTotal += subtotalValue;
      } else {
        if (ratePercent > 0) {
          base.gravadaTotal += subtotalValue;
          base.igvTotal += taxValue;
        } else {
          base.inafectaTotal += subtotalValue;
        }
      }
    }

    base.igvRateLabel = firstGravadaRate !== null ? firstGravadaRate : 18;
    base.grandTotal =
      base.gravadaTotal +
      base.exoneradaTotal +
      base.inafectaTotal +
      base.igvTotal +
      base.otherChargesTotal;

    return base;
  }, [isTributaryDocument, lookups, previewItems]);

  async function loadData() {
    setLoading(true);
    setMessage('');

    try {
      const filterParams = buildDocumentFilterParams(documentViewFilter);
      const [lookupRows, seriesRows, docs, commerce] = await Promise.all([
        fetchSalesLookups(accessToken),
        fetchSeriesNumbers(accessToken, { documentKind: effectiveDocumentKind, branchId, warehouseId }),
        salesWorkspaceMode === 'REPORT'
          ? fetchCommercialDocuments(accessToken, {
              branchId,
              warehouseId,
              cashRegisterId,
              documentKind: filterParams.documentKind,
              conversionState: filterParams.conversionState,
              status: documentFiltersApplied.status || undefined,
              customer: documentFiltersApplied.customer || undefined,
              issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
              issueDateTo: documentFiltersApplied.issueDateTo || undefined,
              series: documentFiltersApplied.series || undefined,
              number: documentFiltersApplied.number || undefined,
              page: documentsPage,
              perPage: documentsMeta.per_page,
            })
          : Promise.resolve(null),
        fetchCommerceSettings(accessToken),
      ]);

      setLookups(lookupRows);
      setSeries(seriesRows);
      setSalesFlowMode(resolveSalesFlowMode(commerce.features ?? []));
      if (docs) {
        setDocuments(docs.data);
        setDocumentsMeta(docs.meta);
      }

      const defaultCurrency = lookupRows.currencies.find((row) => row.is_default) ?? lookupRows.currencies[0];
      const defaultPayment = lookupRows.payment_methods[0];
      const defaultTaxCategory = lookupRows.tax_categories.find((row) => Number(row.rate_percent) > 0)
        ?? lookupRows.tax_categories[0]
        ?? null;

      setForm((prev) => ({
        ...prev,
        currencyId: prev.currencyId || defaultCurrency?.id || 1,
        paymentMethodId: prev.paymentMethodId || defaultPayment?.id || 1,
        unitId: prev.unitId || lookupRows.units?.[0]?.id || null,
        taxCategoryId: prev.taxCategoryId || defaultTaxCategory?.id || null,
        series:
          seriesRows.find((row) => row.series === prev.series)?.series ??
          seriesRows[0]?.series ??
          '',
        documentKind: salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser ? 'QUOTATION' : prev.documentKind,
      }));

      if (seriesRows.length === 0) {
        setMessage(`No hay series activas para ${effectiveDocumentKind} en la sucursal/almacen seleccionados. Configura la serie en Maestros > Series.`);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar Sales';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, warehouseId, cashRegisterId, documentsPage, documentViewFilter, documentFiltersApplied, salesWorkspaceMode, effectiveDocumentKind, salesFlowMode]);

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
    const timer = setTimeout(async () => {
      try {
        if (form.customerQuery.trim().length < 2) {
          setCustomerSuggestions([]);
          return;
        }

        const rows = await fetchCustomerAutocomplete(accessToken, form.customerQuery.trim());
        setCustomerSuggestions(rows);
        setActiveCustomerIndex(rows.length > 0 ? 0 : -1);
      } catch {
        setCustomerSuggestions([]);
        setActiveCustomerIndex(-1);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [accessToken, form.customerQuery]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (form.productQuery.trim().length < 2) {
          setProductSuggestions([]);
          return;
        }

        const rows = await fetchInventoryProducts(accessToken, {
          search: form.productQuery.trim(),
          warehouseId,
        });
        setProductSuggestions(rows);
        setActiveProductIndex(rows.length > 0 ? 0 : -1);
      } catch {
        setProductSuggestions([]);
        setActiveProductIndex(-1);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [accessToken, form.productQuery, warehouseId]);

  useEffect(() => {
    if (form.isManualItem) {
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
        const rows = await fetchInventoryLots(accessToken, { warehouseId });
        const byProduct = rows.filter((row) => row.product_id === form.productId);
        setLots(byProduct);

        if (byProduct.length > 0) {
          setForm((prev) => ({ ...prev, lotId: prev.lotId || byProduct[0].id }));
        }
      } catch {
        setLots([]);
      }
    })();
  }, [accessToken, form.isManualItem, form.productId, warehouseId]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchSeriesNumbers(accessToken, {
          documentKind: form.documentKind,
          branchId,
          warehouseId,
        });

        setSeries(rows);

        setForm((prev) => ({
          ...prev,
          series: rows.find((row) => row.series === prev.series)?.series ?? rows[0]?.series ?? '',
        }));

        if (rows.length === 0) {
          setMessage(`No hay series activas para ${form.documentKind} en la sucursal/almacen seleccionados. Configura la serie en Maestros > Series.`);
        }
      } catch {
        setSeries([]);
      }
    })();
  }, [accessToken, form.documentKind, branchId, warehouseId]);

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
    setSelectedCustomer(customer);
    setForm((prev) => ({
      ...prev,
      customerId: customer.id,
      customerQuery: `${customer.doc_number ?? 'SIN-DOC'} - ${customer.name}`,
      customerAddress: customer.address ?? '',
    }));
    setCustomerSuggestions([]);
    setActiveCustomerIndex(-1);
  }

  async function chooseProduct(product: InventoryProduct) {
    const basePrice = Number(product.sale_price || 0);
    const fallbackUnitId = product.unit_id ?? defaultEnabledUnit?.id ?? null;

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
        const wholesale = resolveWholesalePrice(config, Number(form.qty || 1), baseUnitId, basePrice);
        setAutoPriceHint(wholesale.note);

        setForm((prev) => ({
          ...prev,
          unitId: baseUnitId,
          unitPrice: wholesale.price,
        }));
      } else {
        setSelectedProductUnitOptions(lookups?.units ?? []);
        const wholesale = resolveWholesalePrice(config, Number(form.qty || 1), fallbackUnitId, basePrice);
        setAutoPriceHint(wholesale.note);
        setForm((prev) => ({
          ...prev,
          unitPrice: wholesale.price,
        }));
      }
    } catch {
      setSelectedProductCommercialConfig(null);
      setSelectedProductUnitOptions(lookups?.units ?? []);
      setAutoPriceHint('');
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

    setCart((prev) => [
      ...prev,
      {
        productId: form.isManualItem ? null : form.productId,
        unitId: form.unitId,
        lotId: form.isManualItem ? null : form.lotId,
        taxCategoryId: isTributaryDocument ? form.taxCategoryId : null,
        qtyBase: form.isManualItem ? null : Number(draftQtyBase),
        conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
        baseUnitPrice:
          form.isManualItem
            ? null
            : Number(form.unitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
        taxRate: itemTaxRate,
        taxLabel: isTributaryDocument
          ? (currentTaxCategory?.label ?? 'IGV')
          : 'Sin IGV',
        isManual: form.isManualItem,
        description,
        qty: Number(form.qty),
        unitPrice: Number(form.unitPrice),
      },
    ]);

    setForm((prev) => ({
      ...prev,
      qty: 1,
    }));

    setAutoPriceHint('');
  }

  useEffect(() => {
    if (!selectedProduct || form.isManualItem) {
      return;
    }

    const basePrice = Number(selectedProduct.sale_price || 0);
    const auto = resolveWholesalePrice(
      selectedProductCommercialConfig,
      Number(form.qty || 0),
      form.unitId,
      basePrice
    );

    if (!Number.isFinite(auto.price)) {
      return;
    }

    setAutoPriceHint(auto.note);
    setForm((prev) => {
      if (Number(prev.unitPrice) === Number(auto.price)) {
        return prev;
      }

      return {
        ...prev,
        unitPrice: Number(auto.price),
      };
    });
  }, [form.qty, form.unitId, form.isManualItem, selectedProduct, selectedProductCommercialConfig]);

  function removeDraftItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDraftItem(index: number, field: 'qty' | 'unitPrice', value: number) {
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

  function printIssuedPreview() {
    if (!issuedPreview) {
      return;
    }

    setPreviewDialog({
      title: 'Documento emitido A4',
      subtitle: `${issuedPreview.series}-${issuedPreview.number}`,
      html: buildCommercialDocumentA4Html(issuedPreview.printable, { embedded: true }),
      variant: 'wide',
    });
  }

  async function showDocumentPreview(documentId: number) {
    try {
      const data = await fetchCommercialDocumentDetails(accessToken, documentId);
      setPreviewDialog({
        title: 'Previsualizacion del documento',
        subtitle: `${data.series}-${String(data.number).padStart(6, '0')}`,
        html: buildCommercialDocumentA4Html(data, { embedded: true }),
        variant: 'wide',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar el documento');
    }
  }

  function applyAdvancedDocumentFilters() {
    setDocumentFiltersApplied({ ...documentFiltersDraft });
    setDocumentsPage(1);
  }

  function clearAdvancedDocumentFilters() {
    setDocumentFiltersDraft(initialDocumentAdvancedFilters);
    setDocumentFiltersApplied(initialDocumentAdvancedFilters);
    setDocumentsPage(1);
  }

  async function handleExportDocumentsExcel() {
    setExportingDocuments(true);
    setMessage('');

    try {
      const filterParams = buildDocumentFilterParams(documentViewFilter);
      const result = await exportCommercialDocumentsExcel(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId,
        documentKind: filterParams.documentKind,
        conversionState: filterParams.conversionState,
        status: documentFiltersApplied.status || undefined,
        customer: documentFiltersApplied.customer || undefined,
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
      const filterParams = buildDocumentFilterParams(documentViewFilter);
      const rows = await exportCommercialDocumentsJson(accessToken, {
        branchId,
        warehouseId,
        cashRegisterId,
        documentKind: filterParams.documentKind,
        conversionState: filterParams.conversionState,
        status: documentFiltersApplied.status || undefined,
        customer: documentFiltersApplied.customer || undefined,
        issueDateFrom: documentFiltersApplied.issueDateFrom || undefined,
        issueDateTo: documentFiltersApplied.issueDateTo || undefined,
        series: documentFiltersApplied.series || undefined,
        number: documentFiltersApplied.number || undefined,
        max: 20000,
      });

      const sheetRows = rows.map((row) => ({
        ID: row.id,
        Documento: row.document_kind,
        Serie: row.series,
        Numero: row.number,
        FechaEmision: row.issue_at,
        Cliente: row.customer_name,
        FormaPago: row.payment_method_name ?? 'Sin metodo de pago',
        Estado: row.status,
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const payloadItems = cart.length > 0
        ? cart
        : canAddDraftItem
          ? [
              {
                productId: form.isManualItem ? null : form.productId,
                unitId: form.unitId,
                lotId: form.isManualItem ? null : form.lotId,
                taxCategoryId: isTributaryDocument ? (form.taxCategoryId ?? null) : null,
                qtyBase: form.isManualItem ? null : Number(draftQtyBase),
                conversionFactor: form.isManualItem ? null : Number(draftConversionFactor),
                baseUnitPrice:
                  form.isManualItem
                    ? null
                    : Number(form.unitPrice || 0) / Math.max(Number(draftConversionFactor || 1), 0.00000001),
                taxRate: isTributaryDocument ? Number(selectedTaxCategory?.rate_percent ?? 0) : 0,
                taxLabel: isTributaryDocument ? (selectedTaxCategory?.label ?? 'IGV') : 'Sin IGV',
                isManual: form.isManualItem,
                description: form.isManualItem
                  ? form.manualDescription.trim()
                  : `${selectedProduct?.sku ?? 'SIN-SKU'} - ${selectedProduct?.name ?? ''}`.trim(),
                qty: Number(form.qty),
                unitPrice: Number(form.unitPrice),
              },
            ]
          : [];

      if (payloadItems.length === 0) {
        setMessage('Debe agregar al menos un item para emitir.');
        setLoading(false);
        return;
      }

      const response = await createCommercialDocument(accessToken, {
        ...form,
        documentKind: effectiveDocumentKind,
        items: payloadItems,
        branchId,
        warehouseId,
        cashRegisterId: salesFlowMode === 'SELLER_TO_CASHIER' ? null : cashRegisterId,
      });

      const issued = (response as { data?: unknown }).data as
        | {
            id: number;
            document_kind: string;
            series: string;
            number: number;
            total: number;
            status: string;
          }
        | undefined;

      if (issued) {
        const printTotals = normalizePrintableTotals(lookups, payloadItems);
        const printable: PrintableSalesDocument = {
          id: Number(issued.id),
          documentKind: form.documentKind,
          series: issued.series,
          number: Number(issued.number),
          issueDate: form.issueDate,
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
          grandTotal: printTotals.grandTotal,
          gravadaTotal: printTotals.gravadaTotal,
          inafectaTotal: printTotals.inafectaTotal,
          exoneradaTotal: printTotals.exoneradaTotal,
          items: payloadItems.map((item, index) => ({
            lineNo: index + 1,
            qty: Number(item.qty),
            unitLabel: unitLabelForPrint(lookups?.units ?? null, item.unitId ?? null),
            description: item.description,
            unitPrice: Number(item.unitPrice),
            lineTotal: Number(item.qty) * Number(item.unitPrice),
          })),
        };

        setIssuedPreview({
          ...issued,
          printable,
        });

        setPreviewDialog({
          title: salesFlowMode === 'SELLER_TO_CASHIER' ? 'Ticket de pedido para caja' : 'Documento emitido A4',
          subtitle: `${issued.series}-${Number(issued.number).toString().padStart(6, '0')}`,
          html:
            salesFlowMode === 'SELLER_TO_CASHIER'
              ? buildCommercialDocument80mmHtml(printable, { embedded: true })
              : buildCommercialDocumentA4Html(printable, { embedded: true }),
          variant: salesFlowMode === 'SELLER_TO_CASHIER' ? 'compact' : 'wide',
        });
      }

      setMessage(
        salesFlowMode === 'SELLER_TO_CASHIER'
          ? 'Pedido comercial generado. Caja puede convertirlo a nota de pedido o comprobante tributario.'
          : 'Documento comercial creado correctamente.'
      );
      setCart([]);
      setForm((prev) => ({
        ...prev,
        productId: prev.isManualItem ? null : prev.productId,
        lotId: prev.isManualItem ? null : prev.lotId,
        manualDescription: '',
        qty: 1,
        unitPrice: prev.unitPrice,
      }));
      if (documentsPage !== 1) {
        setDocumentsPage(1);
      }
      await loadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo crear documento';
      setMessage(text);
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

      const nowIso = new Date().toISOString();
      const conversionResponse = await convertCommercialDocument(accessToken, source.id, {
        target_document_kind: targetDocumentKind,
        series: targetSeries,
        issue_at: nowIso,
        cash_register_id: cashRegisterId ?? undefined,
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
          setPostConvertPrintModal({
            title: 'Documento convertido',
            subtitle: `${details.series}-${String(details.number).padStart(6, '0')}`,
            details,
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

      setConvertPreviewModal({
        source,
        targetDocumentKind,
        details,
        previewHtml: buildCommercialDocumentA4Html(details, { embedded: true }),
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

    const details = postConvertPrintModal.details;
    setPreviewDialog({
      title: format === '80mm' ? 'Ticket 80mm' : 'Documento A4',
      subtitle: `${details.series}-${String(details.number).padStart(6, '0')}`,
      html: format === '80mm'
        ? buildCommercialDocument80mmHtml(details, { embedded: true })
        : buildCommercialDocumentA4Html(details, { embedded: true }),
      variant: format === '80mm' ? 'compact' : 'wide',
    });
    setPostConvertPrintModal(null);
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Sales</h3>
        <button type="button" onClick={() => void loadData()} disabled={loading}>
          Refrescar
        </button>
      </div>

      <div className="workspace-mode-switch">
        {canUseSellWorkspace && (
          <button
            type="button"
            className={`mode-btn${salesWorkspaceMode === 'SELL' ? ' mode-btn-active' : ''}`}
            onClick={() => setSalesWorkspaceMode('SELL')}
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

      <p className="notice" style={{ marginTop: '0.35rem' }}>
        <strong>Modo de venta actual:</strong> {salesFlowModeLabel}
      </p>

      {isSeparatedMode && (
        <p className="notice" style={{ marginTop: '0.25rem' }}>
          <strong>Perfil activo:</strong> {isSellerUser ? 'Vendedor' : isCashierUser ? 'Caja' : 'No identificado'}.
          {' '}
          {isSellerUser
            ? 'Puedes generar pedido comercial (cotizacion/proforma); caja realiza la emision final.'
            : isCashierUser
              ? 'Tu vista inicia en pedidos comerciales pendientes para conversion y emision.'
              : 'Configura un perfil VENDEDOR/CAJERO para separar flujos.'}
        </p>
      )}

      {message && <p className="notice">{message}</p>}

      {salesWorkspaceMode === 'SELL' && canUseSellWorkspace && (
        <>
      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-grid-head">
          <label>
            Tipo de comprobante
            <select
              value={effectiveDocumentKind}
              disabled={salesFlowMode === 'SELLER_TO_CASHIER' && !isCashierUser}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  documentKind: e.target.value as CreateDocumentForm['documentKind'],
                }))
              }
            >
              {(lookups?.document_kinds ?? [])
                .filter((kind) => !isSeparatedMode || !isCashierUser || (kind.code !== 'QUOTATION' && kind.code !== 'SALES_ORDER'))
                .map((kind) => (
                <option key={kind.code} value={kind.code}>
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

        <div className="sales-grid-meta">
          <label className="with-suggest sales-field-customer-meta">
            Cliente
            <input
              ref={customerInputRef}
              value={form.customerQuery}
              onChange={(e) => setForm((prev) => ({ ...prev, customerQuery: e.target.value }))}
              onKeyDown={handleCustomerKeyDown}
              placeholder="Buscar por nombre, documento o placa"
            />
            {customerSuggestions.length > 0 && (
              <div className="suggest-box">
                {customerSuggestions.map((row, index) => (
                  <button
                    type="button"
                    key={row.id}
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

          <label className="sales-field-address">
            Direccion cliente
            <input
              value={form.customerAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, customerAddress: e.target.value }))}
              placeholder="Direccion para impresion"
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
            Fecha vencimiento
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value || prev.issueDate || TODAY }))}
            />
          </label>
        </div>

        <div className="sales-concepts-shell">
          <section className="sales-concepts-main">
            <header className="sales-section-head">
              <h4>Conceptos del comprobante</h4>
              <p>Agrega productos o items manuales y arma el detalle antes de emitir.</p>
            </header>

            <div className="sales-grid-main">
              <div className="sales-grid-row sales-grid-row-top">
                <label className="with-suggest sales-field-product">
                  {form.isManualItem ? 'Descripcion manual' : 'Producto'}
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
                        <div className="suggest-box">
                          {productSuggestions.map((row, index) => (
                            <button
                              type="button"
                              key={row.id}
                              onClick={() => void chooseProduct(row)}
                              className={`suggest-item ${index === activeProductIndex ? 'active' : ''}`}
                            >
                              <strong>{row.name}</strong>
                              <span>{row.sku ?? 'SIN-SKU'}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </label>

                <div className="sales-field-stock-toggle">
                  <label className="sales-stock-toggle">
                    <input
                      type="checkbox"
                      checked={form.isManualItem}
                      onChange={(e) => toggleManualItem(e.target.checked)}
                    />
                    Agregar sin stock
                  </label>
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
                          {row.lot_code} | Stock {row.stock}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className={`sales-grid-row sales-grid-row-bottom ${isTributaryDocument ? 'tax-on' : 'tax-off'}`}>
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
                  />
                </label>

                {autoPriceHint && (
                  <p className="sales-price-hint">{autoPriceHint}</p>
                )}

                {!form.isManualItem && selectedProductCommercialConfig?.product?.unit_id && form.unitId && (
                  <p className="sales-price-hint">
                    Equivalencia base: {Number(form.qty || 0).toFixed(3)} x factor {Number(draftConversionFactor || 1).toFixed(6)} = {Number(draftQtyBase || 0).toFixed(6)} en unidad base.
                  </p>
                )}

                <label className="sales-field-context">
                  Sucursal/Almacen/Caja
                  <input
                    disabled
                    value={`${branchId ?? 'N/A'} / ${warehouseId ?? 'N/A'} / ${cashRegisterId ?? 'N/A'}`}
                  />
                </label>

                <div className="sales-field-action">
                  <button
                    type="button"
                    onClick={addDraftItem}
                    disabled={loading || !canAddDraftItem}
                  >
                    Agregar item
                  </button>
                </div>
              </div>
            </div>

            {cart.length > 0 && (
              <div className="table-wrap sales-cart-wrap">
                <h4>Detalle de venta</h4>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Descripcion</th>
                      <th>Tipo IGV</th>
                      <th>Cantidad</th>
                      <th>Precio</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={`${item.productId}-${item.lotId}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.description}</td>
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
                        <td>{(item.qty * item.unitPrice).toFixed(2)}</td>
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
            )}

            {cart.length === 0 && (
              <div className="sales-main-empty" aria-live="polite">
                Agrega productos para construir el comprobante. El resumen se actualiza automaticamente al lado derecho.
              </div>
            )}
          </section>

          <aside className="sales-concepts-side" aria-live="polite">
            <header className="sales-section-head">
              <h4>Montos del comprobante</h4>
              <p>Vista previa consolidada en tiempo real.</p>
            </header>

            <div className="sales-summary">
              <article>
                <span>Subtotal</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {(cart.length > 0 ? subtotal : draftSubtotal).toFixed(2)}
                </strong>
              </article>
              <article>
                <span>Impuestos</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {(cart.length > 0 ? taxTotal : draftTaxTotal).toFixed(2)}
                </strong>
              </article>
              <article>
                <span>Total</span>
                <strong>
                  {selectedCurrency?.symbol ?? ''} {(cart.length > 0 ? grandTotal : draftGrandTotal).toFixed(2)}
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
                      <article><span>Total Ope. Inafecta</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.inafectaTotal.toFixed(2)}</strong></article>
                      <article><span>Total Ope. Exonerada</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.exoneradaTotal.toFixed(2)}</strong></article>
                    </>
                  )}
                  <article><span>Total Ope. Gravada</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.gravadaTotal.toFixed(2)}</strong></article>
                  <article><span>Total IGV ({tributaryPreview.igvRateLabel.toFixed(2)}%)</span><strong>{selectedCurrency?.symbol ?? ''} {tributaryPreview.igvTotal.toFixed(2)}</strong></article>
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
              <button
                ref={submitButtonRef}
                type="submit"
                disabled={
                  loading ||
                  !canSubmitDocument
                }
              >
                {loading ? 'Procesando...' : salesFlowMode === 'SELLER_TO_CASHIER' ? 'Generar pedido comercial' : 'Emitir comprobante'}
              </button>
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
            {issuedPreview.document_kind} {issuedPreview.series}-{issuedPreview.number} | Total:{' '}
            {issuedPreview.total.toFixed(2)} | Estado: {issuedPreview.status}
          </p>
          <button type="button" onClick={printIssuedPreview}>
            Imprimir A4 / PDF
          </button>
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
                  <td>{row.document_kind} {row.series}-{row.number}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.total}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button type="button" className="btn-mini" disabled={loading} onClick={() => void showDocumentPreview(row.id)}>Ver</button>
                      <button type="button" className="btn-mini" disabled={loading || !canConvertInCurrentMode} onClick={() => void openConvertPreview(row, 'INVOICE')}>Factura</button>
                      <button type="button" className="btn-mini" disabled={loading || !canConvertInCurrentMode} onClick={() => void openConvertPreview(row, 'RECEIPT')}>Boleta</button>
                      {row.document_kind === 'QUOTATION' && (
                        <button type="button" className="btn-mini" disabled={loading || !canConvertInCurrentMode} onClick={() => void openConvertPreview(row, 'SALES_ORDER')}>Nota de pedido</button>
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
                    <td>{row.document_kind}</td>
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
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'ALL' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('ALL'); setDocumentsPage(1); }} disabled={loading}>Todos</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'TRIBUTARY' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('TRIBUTARY'); setDocumentsPage(1); }} disabled={loading}>Tributarios</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'QUOTATION' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('QUOTATION'); setDocumentsPage(1); }} disabled={loading}>Pedidos comerciales</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'SALES_ORDER' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('SALES_ORDER'); setDocumentsPage(1); }} disabled={loading}>Notas de pedido</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'PENDING_CONVERSION' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('PENDING_CONVERSION'); setDocumentsPage(1); }} disabled={loading}>Pendientes por convertir</button>
          <button type="button" className={`doc-kind-tab${documentViewFilter === 'CONVERTED' ? ' active' : ''}`} onClick={() => { setDocumentViewFilter('CONVERTED'); setDocumentsPage(1); }} disabled={loading}>Ya convertidos</button>
        </div>

        {/* Advanced search filters */}
        <div className="report-filters">
          <div className="report-filters-header">
            <span className="report-filters-title">Filtros de búsqueda</span>
          </div>
          <div className="report-filter-grid">
            <label>
              <span>Cliente / Documento</span>
              <input
                value={documentFiltersDraft.customer}
                onChange={(event) => setDocumentFiltersDraft((prev) => ({ ...prev, customer: event.target.value }))}
                placeholder="Nombre, RUC, DNI…"
              />
            </label>
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
          </div>
          <div className="report-filter-actions">
            <button type="button" className="btn-apply" onClick={applyAdvancedDocumentFilters} disabled={loading}>
              ✓ Aplicar
            </button>
            <button type="button" className="btn-clear" onClick={clearAdvancedDocumentFilters} disabled={loading}>
              ✕ Limpiar
            </button>
            <span className="report-filter-spacer" />
            <button type="button" className="btn-export" onClick={() => void handleExportDocumentsExcel()} disabled={loading || exportingDocuments}>
              {exportingDocuments ? 'Exportando…' : '⬇ CSV'}
            </button>
            <button type="button" className="btn-export" onClick={() => void handleExportDocumentsXlsx()} disabled={loading || exportingDocuments}>
              {exportingDocuments ? 'Exportando…' : '⬇ XLSX'}
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
              <th>Forma de pago</th>
              <th>Conversiones</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>
                  {row.document_kind} {row.series}-{row.number}
                </td>
                <td>{row.issue_at ? new Date(row.issue_at).toLocaleString() : '-'}</td>
                <td>{row.customer_name}</td>
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
                    ) : ((row.document_kind === 'INVOICE' || row.document_kind === 'RECEIPT') && row.source_document_id) ? (
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
                    )}
                </td>
                <td>{row.status}</td>
                <td>{row.total}</td>
                <td>
                  {(row.document_kind === 'QUOTATION' || row.document_kind === 'SALES_ORDER') ? (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-mini"
                        disabled={loading}
                        onClick={() => void showDocumentPreview(row.id)}
                      >
                        👁 Ver
                      </button>
                      <button
                        type="button"
                        className="btn-mini"
                        disabled={loading || !canConvertInCurrentMode}
                        onClick={() => void openConvertPreview(row, 'INVOICE')}
                      >
                        Convertir a Factura
                      </button>
                      <button
                        type="button"
                        className="btn-mini"
                        disabled={loading || !canConvertInCurrentMode}
                        onClick={() => void openConvertPreview(row, 'RECEIPT')}
                      >
                        Convertir a Boleta
                      </button>
                      {row.document_kind === 'QUOTATION' && (
                        <button
                          type="button"
                          className="btn-mini"
                          disabled={loading || !canConvertInCurrentMode}
                          onClick={() => void openConvertPreview(row, 'SALES_ORDER')}
                        >
                          Convertir a Nota de pedido
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-mini"
                      disabled={loading}
                      onClick={() => void showDocumentPreview(row.id)}
                    >
                      👁 Ver
                    </button>
                  )}
                </td>
              </tr>
            ))}
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

      {previewDialog && (
        <HtmlPreviewDialog
          title={previewDialog.title}
          subtitle={previewDialog.subtitle}
          html={previewDialog.html}
          variant={previewDialog.variant}
          onClose={() => setPreviewDialog(null)}
        />
      )}

      {convertPreviewModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.62)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3300,
          padding: '20px',
        }}>
          <div style={{
            width: 'min(860px, 96vw)',
            maxHeight: '86vh',
            overflow: 'auto',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #dbe4f0',
            borderRadius: '14px',
            boxShadow: '0 28px 70px rgba(15, 23, 42, 0.38)',
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
                    <article><strong>Estado origen</strong><div>{convertPreviewModal.details.status}</div></article>
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
        </div>
      )}

      {postConvertPrintModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.62)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3300,
          padding: '20px',
        }}>
          <div style={{
            width: 'min(460px, 96vw)',
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #dbe4f0',
            borderRadius: '14px',
            boxShadow: '0 28px 70px rgba(15, 23, 42, 0.38)',
            overflow: 'hidden',
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
        </div>
      )}
    </section>
  );
}
