import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchInventoryProducts, fetchInventoryStock } from '../../inventory/api';
import type { InventoryProduct, InventoryStockRow } from '../../inventory/types';
import { createStockEntry, exportPurchasesCsv, exportPurchasesJson, fetchPurchasesLookups, fetchPurchasesReport, fetchSupplierAutocomplete, receivePurchaseOrder, resolveSupplierByDocument, updateStockEntry } from '../api';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
import { fetchCompanyProfile } from '../../company/api';
import type { CompanyProfile } from '../../company/types';
import {
  asInputDate,
  buildPurchaseDetailHtml,
  clampPurchaseDiscount,
  computePurchaseLineAmounts,
  entryTypeLabel,
  formatDateTime,
  purchaseStatusLabel,
  resolveDefaultCashPaymentMethodId,
  resolveDefaultPurchaseTaxCategory,
  stockToneClass,
  todayAsInputDate,
  type PurchaseEntryDraft as EntryRowDraft,
} from '../utils/purchase-helpers';
import type {
  CreateStockEntryItemPayload,
  PurchasesLookups,
  StockEntryRow,
  StockEntryType,
  PurchasesPagination,
} from '../types';

type PurchasesViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
  uiProfile?: 'DEFAULT' | 'RESTAURANT';
  canEditPurchaseEntries?: boolean;
};

type PartialReceiveDraftRow = {
  product_id: number;
  product_name: string;
  ordered_qty: number;
  receive_qty: string;
};

type SupplierSuggestion = {
  id: number;
  doc_type: string | null;
  doc_number: string;
  name: string;
  address: string | null;
  source: string;
};

type PurchasesWorkspaceMode = 'ENTRY' | 'REPORT';
type PriceTaxMode = 'EXCLUSIVE' | 'INCLUSIVE';

type PurchasesReportFilters = {
  entryType: StockEntryType | 'ALL';
  reference: string;
  dateFrom: string;
  dateTo: string;
};

const initialReportFilters: PurchasesReportFilters = {
  entryType: 'ALL',
  reference: '',
  dateFrom: '',
  dateTo: '',
};

const initialPagination: PurchasesPagination = {
  current_page: 1,
  per_page: 10,
  total: 0,
  total_pages: 1,
};

function buildEmptyRow(seed: number): EntryRowDraft {
  return {
    key: `row-${seed}-${Date.now()}`,
    product_id: null,
    lot_id: null,
    product_query: '',
    qty: '1',
    unit_cost: '0',
    discount_total: '0',
    is_free_operation: false,
    lot_code: '',
    manufacture_at: '',
    expires_at: '',
    tax_category_id: undefined,
    tax_rate: undefined,
  };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePurchaseUnitCost(unitCost: number, taxRate: number, priceTaxMode: PriceTaxMode): number {
  if (priceTaxMode !== 'INCLUSIVE' || taxRate <= 0) {
    return unitCost;
  }

  const divisor = 1 + taxRate / 100;
  if (divisor <= 0) {
    return unitCost;
  }

  return unitCost / divisor;
}

export function PurchasesView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
  uiProfile,
  canEditPurchaseEntries = false,
}: PurchasesViewProps) {
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const supplierInputRef = useRef<HTMLInputElement | null>(null);
  const draftDatesPopoverRef = useRef<HTMLDivElement | null>(null);
  const focusedReportRowRef = useRef<HTMLTableRowElement | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stockRows, setStockRows] = useState<InventoryStockRow[]>([]);
  const [reportRows, setReportRows] = useState<StockEntryRow[]>([]);
  const [reportPagination, setReportPagination] = useState<PurchasesPagination>(initialPagination);
  const [reportPage, setReportPage] = useState(1);
  const [reportFiltersDraft, setReportFiltersDraft] = useState<PurchasesReportFilters>(initialReportFilters);
  const [reportFiltersApplied, setReportFiltersApplied] = useState<PurchasesReportFilters>(initialReportFilters);
  const [workspaceMode, setWorkspaceMode] = useState<PurchasesWorkspaceMode>('ENTRY');
  const [lookups, setLookups] = useState<PurchasesLookups | null>(null);
  const [entryDate, setEntryDate] = useState(todayAsInputDate());
  const [detailPreviewEntry, setDetailPreviewEntry] = useState<StockEntryRow | null>(null);
  const [isProductSuggestOpen, setIsProductSuggestOpen] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [isDraftDatesPopoverOpen, setIsDraftDatesPopoverOpen] = useState(false);
  const [showPurchaseTaxBreakdown, setShowPurchaseTaxBreakdown] = useState(false);
  const [partialReceiveTarget, setPartialReceiveTarget] = useState<StockEntryRow | null>(null);
  const [partialReceiveRows, setPartialReceiveRows] = useState<PartialReceiveDraftRow[]>([]);
  const [partialReceiveBusy, setPartialReceiveBusy] = useState(false);
  const [priceTaxMode, setPriceTaxMode] = useState<PriceTaxMode>('INCLUSIVE');
  const [focusReportEntryId, setFocusReportEntryId] = useState<number | null>(null);
  const [highlightedReportEntryId, setHighlightedReportEntryId] = useState<number | null>(null);
  const [pinnedReportEntryId, setPinnedReportEntryId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [purchaseNatureFilter, setPurchaseNatureFilter] = useState<'ALL' | 'PRODUCT' | 'SUPPLY'>('ALL');

  const [entryType, setEntryType] = useState<StockEntryType>('PURCHASE');
  const [referenceNo, setReferenceNo] = useState('');
  const [dueDate, setDueDate] = useState(todayAsInputDate());
  const [supplierReference, setSupplierReference] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState<SupplierSuggestion[]>([]);
  const [activeSupplierIndex, setActiveSupplierIndex] = useState(-1);
  const [supplierInputFocused, setSupplierInputFocused] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<EntryRowDraft[]>([]);
  const [draftItem, setDraftItem] = useState<EntryRowDraft>(buildEmptyRow(1));
  const [hasDetraccion, setHasDetraccion] = useState(false);
  const [detraccionServiceCode, setDetraccionServiceCode] = useState('');
  const [hasRetencion, setHasRetencion] = useState(false);
  const [retencionTypeCode, setRetencionTypeCode] = useState('');
  const [retencionScope, setRetencionScope] = useState<'COMPRADOR' | 'PROVEEDOR'>('COMPRADOR');
  const [hasPercepcion, setHasPercepcion] = useState(false);
  const [percepcionTypeCode, setPercepcionTypeCode] = useState('');
  const [sunatOperationTypeCode, setSunatOperationTypeCode] = useState('');
  const [resolvingSupplierDoc, setResolvingSupplierDoc] = useState(false);

  const isRestaurant = (uiProfile ?? ((activeVerticalCode ?? '').toUpperCase() === 'RESTAURANT' ? 'RESTAURANT' : 'DEFAULT')) === 'RESTAURANT';

  useEffect(() => {
    if (isRestaurant) {
      setPurchaseNatureFilter('SUPPLY');
    } else {
      setPurchaseNatureFilter('ALL');
    }
  }, [isRestaurant]);

  const selectableProducts = useMemo(() => {
    if (purchaseNatureFilter === 'ALL') {
      return products;
    }
    return products.filter((row) => row.product_nature === purchaseNatureFilter);
  }, [products, purchaseNatureFilter]);

  const visibleStockRows = useMemo(() => {
    if (purchaseNatureFilter === 'ALL') {
      return stockRows;
    }
    const allowedProductIds = new Set(selectableProducts.map((row) => row.id));
    return stockRows.filter((row) => allowedProductIds.has(row.product_id));
  }, [stockRows, selectableProducts, purchaseNatureFilter]);

  const stockByProductId = useMemo(() => {
    const stockMap = new Map<number, number>();
    visibleStockRows.forEach((row) => {
      const current = stockMap.get(row.product_id) ?? 0;
      stockMap.set(row.product_id, current + Number(row.stock ?? 0));
    });
    return stockMap;
  }, [visibleStockRows]);

  const totalQty = useMemo(() => {
    return rows.reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
  }, [rows]);

  const inventorySettings = lookups?.inventory_settings ?? null;
  const inventoryProEnabled = Boolean(inventorySettings?.enable_inventory_pro);
  const lotTrackingEnabled = inventoryProEnabled && Boolean(inventorySettings?.enable_lot_tracking);
  const expiryTrackingEnabled = lotTrackingEnabled && Boolean(inventorySettings?.enable_expiry_tracking);

  const activeProductSuggestions = useMemo(() => {
    if (!isProductSuggestOpen) {
      return [] as InventoryProduct[];
    }

    const query = draftItem.product_query?.trim().toLowerCase() ?? '';
    if (query.length < 1) {
      return [] as InventoryProduct[];
    }

    return selectableProducts
      .filter((product) => {
        const sku = (product.sku ?? '').toLowerCase();
        const name = (product.name ?? '').toLowerCase();
        return sku.includes(query) || name.includes(query);
      })
      .slice(0, 20);
  }, [draftItem.product_query, isProductSuggestOpen, selectableProducts]);

  useEffect(() => {
    if (activeProductSuggestions.length === 0) {
      setActiveProductIndex(-1);
      return;
    }

    setActiveProductIndex((prev) => {
      if (prev < 0) {
        return 0;
      }
      return Math.min(prev, activeProductSuggestions.length - 1);
    });
  }, [activeProductSuggestions]);

  useEffect(() => {
    if (!supplierInputFocused) {
      return;
    }

    const query = supplierReference.trim();
    if (query.length < 2) {
      setSupplierSuggestions([]);
      setActiveSupplierIndex(-1);
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await fetchSupplierAutocomplete(accessToken, query);
        if (canceled) {
          return;
        }
        setSupplierSuggestions(rows);
        setActiveSupplierIndex(rows.length > 0 ? 0 : -1);
      } catch {
        if (canceled) {
          return;
        }
        setSupplierSuggestions([]);
        setActiveSupplierIndex(-1);
      }
    }, 220);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [accessToken, supplierInputFocused, supplierReference]);

  useEffect(() => {
    if (lotTrackingEnabled) {
      return;
    }

    setDraftItem((prev) => (prev.lot_code || prev.manufacture_at || prev.expires_at
      ? { ...prev, lot_code: '', manufacture_at: '', expires_at: '' }
      : prev));
    setRows((prev) => {
      if (!prev.some((row) => row.lot_code.trim() !== '' || row.manufacture_at !== '' || row.expires_at !== '')) {
        return prev;
      }

      return prev.map((row) => ({
        ...row,
        lot_code: '',
        manufacture_at: '',
        expires_at: '',
      }));
    });
  }, [lotTrackingEnabled]);

  useEffect(() => {
    if (expiryTrackingEnabled) {
      return;
    }

    setDraftItem((prev) => (prev.manufacture_at || prev.expires_at
      ? { ...prev, manufacture_at: '', expires_at: '' }
      : prev));
    setRows((prev) => {
      if (!prev.some((row) => row.manufacture_at !== '' || row.expires_at !== '')) {
        return prev;
      }

      return prev.map((row) => ({
        ...row,
        manufacture_at: '',
        expires_at: '',
      }));
    });
  }, [expiryTrackingEnabled]);

  const totalsWithTax = useMemo(() => {
    const lines = rows.map((row) => {
      const computed = computePurchaseLineAmounts(row);
      return {
        subtotal: computed.subtotal,
        taxAmount: computed.taxAmount,
        total: computed.finalTotal,
        discountTotal: computed.discountTotal,
        taxRate: Number(row.tax_rate) || 0,
        taxCategoryId: row.tax_category_id,
      };
    });

    const netTotal = lines.reduce((acc, line) => acc + line.subtotal, 0);
    const taxTotal = lines.reduce((acc, line) => acc + line.taxAmount, 0);
    const itemDiscountTotal = lines.reduce((acc, line) => acc + line.discountTotal, 0);
    const globalDiscountTotal = clampPurchaseDiscount(globalDiscountAmount, netTotal + taxTotal - itemDiscountTotal);
    const grandTotal = Math.max(netTotal + taxTotal - itemDiscountTotal - globalDiscountTotal, 0);

    return { netTotal, taxTotal, itemDiscountTotal, globalDiscountTotal, grandTotal };
  }, [globalDiscountAmount, rows]);

  const purchaseTaxPreview = useMemo(() => {
    const categories = lookups?.tax_categories ?? [];
    const activeIgvRate = Number(lookups?.active_igv_rate_percent ?? 18);
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const byType = new Map<string, {
      label: string;
      rate: number;
      taxable: number;
      tax: number;
      total: number;
      itemCount: number;
    }>();

    let gravadaTotal = 0;
    let exoneradaTotal = 0;
    let inafectaTotal = 0;
    let noTributariaTotal = 0;
    let igvTotal = 0;
    let firstGravadaRate: number | null = null;

    rows.forEach((row) => {
      const computed = computePurchaseLineAmounts(row);
      const subtotal = computed.subtotal;

      const category = row.tax_category_id ? categoryById.get(row.tax_category_id) : undefined;
      const label = category?.label ?? 'Sin IGV';
      const code = String(category?.code ?? '').toUpperCase();
      const rate = Number(row.tax_rate ?? category?.rate_percent ?? 0);
      const tax = computed.taxAmount;
      const total = computed.finalTotal;
      const key = `${row.tax_category_id ?? 'NO_TAX'}-${rate.toFixed(4)}-${label}`;

      const current = byType.get(key) ?? {
        label,
        rate,
        taxable: 0,
        tax: 0,
        total: 0,
        itemCount: 0,
      };

      current.taxable += subtotal;
      current.tax += tax;
      current.total += total;
      current.itemCount += 1;
      byType.set(key, current);

      if (computed.isFreeOperation) {
        return;
      }

      if (rate > 0) {
        gravadaTotal += subtotal;
        igvTotal += tax;
        if (firstGravadaRate === null) {
          firstGravadaRate = rate;
        }
        return;
      }

      const labelUpper = String(label).toUpperCase();
      if (labelUpper.includes('EXONER')) {
        exoneradaTotal += subtotal;
      } else if (labelUpper.includes('INAFECT') || code.includes('30')) {
        inafectaTotal += subtotal;
      } else {
        noTributariaTotal += subtotal;
      }
    });

    return {
      isTributaryPurchase: gravadaTotal > 0 || igvTotal > 0,
      rows: Array.from(byType.values()).sort((a, b) => b.taxable - a.taxable),
      igvRateLabel: firstGravadaRate !== null ? firstGravadaRate : activeIgvRate,
      gravadaTotal,
      exoneradaTotal,
      inafectaTotal,
      noTributariaTotal,
      igvTotal,
      discountTotal: totalsWithTax.itemDiscountTotal + totalsWithTax.globalDiscountTotal,
      icbperTotal: 0,
      gratuitaTotal: rows.reduce((acc, row) => acc + computePurchaseLineAmounts(row).gratuitaTotal, 0),
      otherChargesTotal: 0,
      grandTotal: totalsWithTax.grandTotal,
    };
  }, [rows, lookups?.tax_categories, lookups?.active_igv_rate_percent, totalsWithTax.globalDiscountTotal, totalsWithTax.grandTotal, totalsWithTax.itemDiscountTotal]);

  const detraccionServices = lookups?.detraccion_service_codes ?? [];
  const retencionTypes = lookups?.retencion_types ?? [];
  const percepcionTypes = lookups?.percepcion_types ?? [];
  const operationTypes = lookups?.sunat_operation_types ?? [];
  const canUseRetencionComprador = Boolean(lookups?.retencion_comprador_enabled);
  const canUseRetencionProveedor = Boolean(lookups?.retencion_proveedor_enabled);
  const canUsePercepcion = Boolean(lookups?.percepcion_enabled);
  const purchaseGlobalDiscountEnabled = Boolean(lookups?.global_discount_enabled);
  const purchaseItemDiscountEnabled = Boolean(lookups?.item_discount_enabled);
  const purchaseFreeOperationEnabled = Boolean(lookups?.free_operation_enabled);
  const selectedDetraccion = detraccionServices.find((row) => row.code === detraccionServiceCode) ?? null;
  const selectedRetencion = retencionTypes.find((row) => row.code === retencionTypeCode) ?? null;
  const selectedPercepcion = percepcionTypes.find((row) => row.code === percepcionTypeCode) ?? null;
  const selectedOperationType = operationTypes.find((row) => row.code === sunatOperationTypeCode) ?? null;
  const pickOperationTypeCode = (regime: 'NONE' | 'DETRACCION' | 'RETENCION' | 'PERCEPCION'): string => {
    return (
      operationTypes.find((row) => (row.regime ?? 'NONE') === regime)?.code
      ?? operationTypes.find((row) => (row.regime ?? 'NONE') === 'NONE')?.code
      ?? operationTypes.find((row) => row.code === '0101')?.code
      ?? operationTypes[0]?.code
      ?? ''
    );
  };
  const defaultPurchaseTaxCategory = useMemo(() => resolveDefaultPurchaseTaxCategory(lookups), [lookups]);
  const detraccionAmount = hasDetraccion ? (totalsWithTax.grandTotal * Number(selectedDetraccion?.rate_percent ?? 0)) / 100 : 0;
  const retencionAmount = hasRetencion ? (totalsWithTax.grandTotal * Number(selectedRetencion?.rate_percent ?? 0)) / 100 : 0;
  const percepcionAmount = hasPercepcion ? (totalsWithTax.grandTotal * Number(selectedPercepcion?.rate_percent ?? 0)) / 100 : 0;

  useEffect(() => {
    if (entryType !== 'PURCHASE') {
      setHasDetraccion(false);
      setHasRetencion(false);
      setHasPercepcion(false);
      return;
    }

    if (!detraccionServiceCode && detraccionServices.length > 0) {
      setDetraccionServiceCode(detraccionServices[0].code);
    }
    if (!retencionTypeCode && retencionTypes.length > 0) {
      setRetencionTypeCode(retencionTypes[0].code);
    }
    if (!percepcionTypeCode && percepcionTypes.length > 0) {
      setPercepcionTypeCode(percepcionTypes[0].code);
    }
    if (!sunatOperationTypeCode && operationTypes.length > 0) {
      if (hasDetraccion) {
        setSunatOperationTypeCode(pickOperationTypeCode('DETRACCION'));
      } else if (hasRetencion) {
        setSunatOperationTypeCode(pickOperationTypeCode('RETENCION'));
      } else if (hasPercepcion) {
        setSunatOperationTypeCode(pickOperationTypeCode('PERCEPCION'));
      }
    }
  }, [
    entryType,
    detraccionServiceCode,
    detraccionServices,
    retencionTypeCode,
    retencionTypes,
    percepcionTypeCode,
    percepcionTypes,
    hasDetraccion,
    hasRetencion,
    hasPercepcion,
    sunatOperationTypeCode,
    operationTypes,
  ]);

  useEffect(() => {
    if (entryType !== 'PURCHASE') {
      return;
    }
    if (hasRetencion && hasPercepcion) {
      setHasPercepcion(false);
    }
    if (hasDetraccion && hasRetencion) {
      setHasRetencion(false);
    }
    if (hasDetraccion && hasPercepcion) {
      setHasPercepcion(false);
    }
  }, [entryType, hasDetraccion, hasRetencion, hasPercepcion]);

  useEffect(() => {
    if (entryType !== 'PURCHASE') {
      return;
    }

    const minAmount = Number(lookups?.detraccion_min_amount ?? 700);
    if (!Number.isFinite(minAmount) || minAmount <= 0) {
      return;
    }

    if (totalsWithTax.grandTotal >= minAmount && detraccionServices.length > 0 && !hasRetencion && !hasPercepcion) {
      setHasDetraccion(true);
      setHasRetencion(false);
      setHasPercepcion(false);
    }
  }, [entryType, totalsWithTax.grandTotal, lookups?.detraccion_min_amount, detraccionServices.length, hasRetencion, hasPercepcion]);

  useEffect(() => {
    if (!selectedOperationType) {
      return;
    }

    const regime = selectedOperationType.regime ?? 'NONE';
    if (regime !== 'DETRACCION' && regime !== 'RETENCION' && regime !== 'PERCEPCION') {
      return;
    }
    if (regime === 'DETRACCION') {
      setHasDetraccion(true);
      setHasRetencion(false);
      setHasPercepcion(false);
    } else if (regime === 'RETENCION') {
      setHasDetraccion(false);
      setHasRetencion(true);
      setHasPercepcion(false);
    } else if (regime === 'PERCEPCION') {
      setHasDetraccion(false);
      setHasRetencion(false);
      setHasPercepcion(true);
    }
  }, [selectedOperationType]);

  useEffect(() => {
    if (!defaultPurchaseTaxCategory) {
      return;
    }

    if (!['PURCHASE', 'PURCHASE_ORDER'].includes(entryType)) {
      return;
    }

    setDraftItem((prev) => {
      if (prev.tax_category_id) {
        return prev;
      }

      return {
        ...prev,
        tax_category_id: defaultPurchaseTaxCategory.id,
        tax_rate: defaultPurchaseTaxCategory.rate_percent,
      };
    });
  }, [defaultPurchaseTaxCategory, entryType]);

  useEffect(() => {
    if (!isDraftDatesPopoverOpen) {
      return;
    }

    const handleDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (draftDatesPopoverRef.current && !draftDatesPopoverRef.current.contains(target)) {
        setIsDraftDatesPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentPointerDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown);
    };
  }, [isDraftDatesPopoverOpen]);

  async function loadData() {
    setIsLoading(true);
    setMessage('');

    try {
      const [productData, stockData, lookupsData] = await Promise.all([
        fetchInventoryProducts(accessToken, { status: 1 }),
        fetchInventoryStock(accessToken, { warehouseId }),
        fetchPurchasesLookups(accessToken),
      ]);

      setProducts(productData.filter((row) => row.is_stockable));
      setStockRows(stockData);
      setLookups(lookupsData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar compras y stock');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadReport(page = 1, appliedFilters = reportFiltersApplied) {
    setIsLoadingReport(true);

    try {
      const response = await fetchPurchasesReport(accessToken, {
        warehouseId,
        entryType: appliedFilters.entryType === 'ALL' ? null : appliedFilters.entryType,
        reference: appliedFilters.reference || undefined,
        dateFrom: appliedFilters.dateFrom || undefined,
        dateTo: appliedFilters.dateTo || undefined,
        page,
        perPage: 10,
      });

      setReportRows(response.data);
      setReportPagination(response.pagination);
      setReportPage(response.pagination.current_page || page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar el reporte de compras');
    } finally {
      setIsLoadingReport(false);
    }
  }

  useEffect(() => {
    void loadData();
    if (workspaceMode === 'REPORT') {
      void loadReport(1, reportFiltersApplied);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, warehouseId, workspaceMode]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const profile = await fetchCompanyProfile(accessToken);
        if (!cancelled) {
          setCompanyProfile(profile);
        }
      } catch {
        if (!cancelled) {
          setCompanyProfile(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (workspaceMode !== 'REPORT') {
      return;
    }
    void loadReport(reportPage, reportFiltersApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPage, workspaceMode]);

  useEffect(() => {
    if (paymentMethodId !== null) {
      return;
    }

    const defaultCashId = resolveDefaultCashPaymentMethodId(lookups);
    if (defaultCashId !== null) {
      setPaymentMethodId(defaultCashId);
    }
  }, [lookups, paymentMethodId]);

  useEffect(() => {
    if (workspaceMode !== 'REPORT' || focusReportEntryId === null) {
      return;
    }

    const existsInCurrentPage = reportRows.some((row) => Number(row.id) === focusReportEntryId);
    if (!existsInCurrentPage) {
      return;
    }

    const rowEl = focusedReportRowRef.current;
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }

    setHighlightedReportEntryId(focusReportEntryId);
    setFocusReportEntryId(null);
  }, [workspaceMode, reportRows, focusReportEntryId]);

  useEffect(() => {
    if (highlightedReportEntryId === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedReportEntryId(null);
    }, 3400);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedReportEntryId]);

  const visibleReportRows = useMemo(() => {
    if (pinnedReportEntryId === null) {
      return reportRows;
    }
    return reportRows.filter((row) => Number(row.id) === pinnedReportEntryId);
  }, [reportRows, pinnedReportEntryId]);

  function updateDraftItem(patch: Partial<EntryRowDraft>) {
    setDraftItem((prev) => ({ ...prev, ...patch }));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function updateRow(key: string, patch: Partial<EntryRowDraft>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function resetEntryFormState() {
    setRows([]);
    setDraftItem(buildEmptyRow(1));
    setReferenceNo('');
    setSupplierReference('');
    setSupplierAddress('');
    setGlobalDiscountAmount(0);
    setSupplierSuggestions([]);
    setActiveSupplierIndex(-1);
    setSupplierInputFocused(false);
    setPaymentMethodId(resolveDefaultCashPaymentMethodId(lookups));
    setEntryDate(todayAsInputDate());
    setNotes('');
    setHasDetraccion(false);
    setHasRetencion(false);
    setHasPercepcion(false);
    setDetraccionServiceCode('');
    setRetencionTypeCode('');
    setPercepcionTypeCode('');
    setSunatOperationTypeCode('');
    setDueDate(todayAsInputDate());
    setEditingEntryId(null);
  }

  function beginEditEntry(entry: StockEntryRow) {
    const items = entry.items ?? [];
    if (items.length === 0) {
      setMessage('No se puede editar: el ingreso no tiene lineas de detalle.');
      return;
    }

    const metadata = (entry.metadata ?? {}) as Record<string, unknown>;

    setWorkspaceMode('ENTRY');
    setEditingEntryId(Number(entry.id));
    setEntryType(entry.entry_type);
    setReferenceNo(entry.reference_no ?? '');
    setSupplierReference(entry.supplier_reference ?? '');
    setSupplierAddress(String(metadata.supplier_address ?? ''));
    setEntryDate(asInputDate(entry.issue_at));
    setNotes(entry.notes ?? '');
    setHasDetraccion(Boolean(metadata.has_detraccion));
    setDetraccionServiceCode(String(metadata.detraccion_service_code ?? ''));
    setHasRetencion(Boolean(metadata.has_retencion));
    setRetencionTypeCode(String(metadata.retencion_type_code ?? ''));
    setRetencionScope(String(metadata.retencion_scope ?? 'COMPRADOR') === 'PROVEEDOR' ? 'PROVEEDOR' : 'COMPRADOR');
    setHasPercepcion(Boolean(metadata.has_percepcion));
    setPercepcionTypeCode(String(metadata.percepcion_type_code ?? ''));
    setSunatOperationTypeCode(String(metadata.sunat_operation_type_code ?? ''));
    setRows(items.map((item, idx) => ({
      key: `edit-${entry.id}-${idx + 1}`,
      product_id: Number(item.product_id),
      lot_id: item.lot_id ?? null,
      product_query: item.product_name,
      qty: String(Number(item.qty ?? 0)),
      unit_cost: Number(item.unit_cost ?? 0).toFixed(4),
      discount_total: Number(item.discount_total ?? item.metadata?.discount_total ?? 0).toFixed(2),
      is_free_operation: Boolean(item.metadata?.is_free_operation),
      lot_code: item.lot_code ?? '',
      manufacture_at: '',
      expires_at: '',
      tax_category_id: item.tax_category_id ?? undefined,
      tax_rate: Number(item.tax_rate ?? 0),
    })));
    setGlobalDiscountAmount(Number(metadata.discount_total ?? 0));
    setDueDate(String(metadata.due_date ?? '').trim() || asInputDate(entry.issue_at) || todayAsInputDate());
    setMessage(`Editando ingreso #${entry.id}. Al guardar se recalculara el impacto en inventario.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditEntry() {
    resetEntryFormState();
    setMessage('Edicion cancelada.');
  }

  function chooseProductForDraft(product: InventoryProduct) {
    updateDraftItem({
      product_id: product.id,
      lot_id: null,
      product_query: `${product.sku ?? 'SIN-SKU'} - ${product.name}`,
      lot_code: product.lot_tracking && lotTrackingEnabled ? draftItem.lot_code : '',
      manufacture_at: product.has_expiration && expiryTrackingEnabled ? draftItem.manufacture_at : '',
      expires_at: product.has_expiration && expiryTrackingEnabled ? draftItem.expires_at : '',
    });
    setIsProductSuggestOpen(false);
    setActiveProductIndex(-1);
  }

  function canAddDraftItem(row: EntryRowDraft): boolean {
    const product = row.product_id ? products.find((item) => item.id === row.product_id) ?? null : null;
    const qty = Number(row.qty);
    if (!row.product_id || !Number.isFinite(qty) || Math.abs(qty) <= 0) {
      return false;
    }

    if (entryType !== 'ADJUSTMENT' && qty <= 0) {
      return false;
    }

    if (row.unit_cost === '') {
      return false;
    }

    const cost = Number(row.unit_cost);
    if (!Number.isFinite(cost) || cost < 0) {
      return false;
    }

    if (lotTrackingEnabled && inventorySettings?.enforce_lot_for_tracked && product?.lot_tracking && row.lot_code.trim() === '') {
      return false;
    }

    return true;
  }

  async function resolveSupplierFromPadron() {
    const document = supplierReference.replace(/\D+/g, '').trim();
    if (document.length !== 8 && document.length !== 11) {
      setMessage('Ingrese un DNI (8) o RUC (11) en el campo proveedor para consultar.');
      return;
    }
    try {
      setResolvingSupplierDoc(true);
      setMessage('Consultando padron...');
      const resolved = await resolveSupplierByDocument(accessToken, document);
      setSupplierReference(`${resolved.doc_number} - ${resolved.name}`);
      setSupplierAddress(resolved.address ?? '');
      setSupplierSuggestions([]);
      setActiveSupplierIndex(-1);
      setSupplierInputFocused(false);
      setMessage(resolved.message);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo consultar el documento';
      setMessage(text);
    } finally {
      setResolvingSupplierDoc(false);
    }
  }

  function chooseSupplier(supplier: SupplierSuggestion) {
    setSupplierReference(`${supplier.doc_number} - ${supplier.name}`);
    setSupplierAddress(supplier.address ?? '');
    setSupplierSuggestions([]);
    setActiveSupplierIndex(-1);
    setSupplierInputFocused(false);
  }

  function handleSupplierKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (supplierSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSupplierIndex((prev) => Math.min(prev + 1, supplierSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSupplierIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = supplierSuggestions[activeSupplierIndex >= 0 ? activeSupplierIndex : 0];
      if (selected) {
        chooseSupplier(selected);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setSupplierSuggestions([]);
      setActiveSupplierIndex(-1);
    }
  }

  function handleSupplierSuggestBlur() {
    window.setTimeout(() => {
      setSupplierInputFocused(false);
      setSupplierSuggestions([]);
      setActiveSupplierIndex(-1);
    }, 120);
  }

  function resolveDraftProduct(row: EntryRowDraft): EntryRowDraft {
    if (row.product_id) {
      return row;
    }

    const query = normalizeSearchText(row.product_query || '');
    if (!query) {
      return row;
    }

    const exact = selectableProducts.find((product) => {
      const sku = normalizeSearchText(product.sku ?? '');
      const name = normalizeSearchText(product.name ?? '');
      const combo = normalizeSearchText(`${product.sku ?? 'SIN-SKU'} - ${product.name}`);
      return query === sku || query === name || query === combo;
    });

    if (exact) {
      return {
        ...row,
        product_id: exact.id,
        lot_id: null,
        product_query: `${exact.sku ?? 'SIN-SKU'} - ${exact.name}`,
      };
    }

    const filtered = selectableProducts.filter((product) => {
      const sku = normalizeSearchText(product.sku ?? '');
      const name = normalizeSearchText(product.name ?? '');
      return sku.includes(query) || name.includes(query);
    });

    if (filtered.length === 1) {
      const only = filtered[0];
      return {
        ...row,
        product_id: only.id,
        lot_id: null,
        product_query: `${only.sku ?? 'SIN-SKU'} - ${only.name}`,
      };
    }

    if (filtered.length > 0) {
      const first = filtered[0];
      return {
        ...row,
        product_id: first.id,
        lot_id: null,
        product_query: `${first.sku ?? 'SIN-SKU'} - ${first.name}`,
      };
    }

    return row;
  }

  function addDraftToRows() {
    const resolvedDraft = resolveDraftProduct(draftItem);

    if (!canAddDraftItem(resolvedDraft)) {
      if (!resolvedDraft.product_id) {
        setMessage('Selecciona un producto valido para agregar el item.');
      } else if (!Number.isFinite(Number(resolvedDraft.qty)) || Math.abs(Number(resolvedDraft.qty)) <= 0) {
        setMessage('Ingresa una cantidad valida (distinta de 0).');
      } else if (entryType !== 'ADJUSTMENT' && Number(resolvedDraft.qty) <= 0) {
        setMessage('Para compras y ordenes de compra la cantidad debe ser mayor a 0.');
      } else if (!Number.isFinite(Number(resolvedDraft.unit_cost)) || Number(resolvedDraft.unit_cost) < 0) {
        setMessage('Ingresa un costo unitario valido (0 o mayor).');
      } else {
        setMessage('Completa los datos requeridos para agregar el item.');
      }
      return;
    }

    setMessage('');

    const resolvedTaxRate = Number(resolvedDraft.tax_rate ?? 0);
    const resolvedUnitCost = Number(resolvedDraft.unit_cost ?? 0);
    const normalizedUnitCost = normalizePurchaseUnitCost(resolvedUnitCost, resolvedTaxRate, priceTaxMode);

    setRows((prev) => [
      ...prev,
      {
        ...resolvedDraft,
        unit_cost: normalizedUnitCost.toFixed(4),
        key: `item-${Date.now()}-${prev.length + 1}`,
      },
    ]);

    const nextDraft = buildEmptyRow(rows.length + 2);
    nextDraft.tax_category_id = resolvedDraft.tax_category_id;
    nextDraft.tax_rate = resolvedDraft.tax_rate;
    nextDraft.lot_code = lotTrackingEnabled ? resolvedDraft.lot_code : '';
    nextDraft.manufacture_at = expiryTrackingEnabled ? resolvedDraft.manufacture_at : '';
    nextDraft.expires_at = expiryTrackingEnabled ? resolvedDraft.expires_at : '';
    setDraftItem(nextDraft);
    setIsDraftDatesPopoverOpen(false);
    setIsProductSuggestOpen(false);
    setActiveProductIndex(-1);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        productInputRef.current?.focus();
        productInputRef.current?.select();
      });
    });
  }

  function handleQuickAppendRow(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    addDraftToRows();
  }

  function handleProductSuggestKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (activeProductSuggestions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveProductIndex((prev) => Math.min(prev + 1, activeProductSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveProductIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = activeProductSuggestions[activeProductIndex >= 0 ? activeProductIndex : 0];
      if (selected) {
        chooseProductForDraft(selected);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsProductSuggestOpen(false);
      setActiveProductIndex(-1);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!warehouseId) {
      setMessage('Selecciona un almacen activo para registrar el ingreso.');
      return;
    }

    const payloadItems: CreateStockEntryItemPayload[] = rows
      .map((row) => ({
        product_id: Number(row.product_id ?? 0),
        qty: Number(row.qty),
        unit_cost: row.unit_cost !== '' ? Number(row.unit_cost) : undefined,
        lot_id: lotTrackingEnabled && row.lot_id ? Number(row.lot_id) : undefined,
        lot_code: lotTrackingEnabled && row.lot_code.trim() !== '' ? row.lot_code.trim() : undefined,
        manufacture_at: expiryTrackingEnabled && row.manufacture_at.trim() !== '' ? row.manufacture_at.trim() : undefined,
        expires_at: expiryTrackingEnabled && row.expires_at.trim() !== '' ? row.expires_at.trim() : undefined,
        tax_category_id: row.tax_category_id ? Number(row.tax_category_id) : undefined,
        tax_rate: row.tax_rate ? Number(row.tax_rate) : undefined,
        metadata: {
          discount_total: purchaseItemDiscountEnabled ? clampPurchaseDiscount(Number(row.discount_total) || 0, computePurchaseLineAmounts(row).grossTotal) : 0,
          is_free_operation: purchaseFreeOperationEnabled ? Boolean(row.is_free_operation) : false,
          gratuitas: purchaseFreeOperationEnabled && row.is_free_operation ? Number(computePurchaseLineAmounts(row).gratuitaTotal.toFixed(2)) : 0,
        },
      }))
      .filter((row) => row.product_id > 0 && Number.isFinite(row.qty) && (entryType === 'ADJUSTMENT' ? Math.abs(row.qty) > 0 : row.qty > 0));

    if (payloadItems.length === 0) {
      setMessage('Debes ingresar al menos una linea valida con producto y cantidad.');
      return;
    }

    if (entryType === 'PURCHASE' || entryType === 'PURCHASE_ORDER') {
      const referenceValue = referenceNo.trim();
      const supplierValue = supplierReference.trim();

      if (!referenceValue) {
        setMessage(entryType === 'PURCHASE'
          ? 'La referencia de la compra es obligatoria.'
          : 'La referencia de la orden de compra es obligatoria.');
        return;
      }

      if (!supplierValue) {
        setMessage(entryType === 'PURCHASE'
          ? 'El proveedor es obligatorio para registrar la compra.'
          : 'El proveedor es obligatorio para registrar la orden de compra.');
        return;
      }
    }

    if (entryType === 'ADJUSTMENT' && !notes.trim()) {
      setMessage('El motivo/nota es obligatorio para registrar un ajuste de inventario.');
      return;
    }

    if (entryType === 'PURCHASE') {
      const selectedTaxConditions = (hasDetraccion ? 1 : 0) + (hasRetencion ? 1 : 0) + (hasPercepcion ? 1 : 0);
      if (selectedTaxConditions > 1) {
        setMessage('Solo puedes aplicar una condicion tributaria por compra.');
        return;
      }

      if ((hasDetraccion || hasRetencion || hasPercepcion) && !sunatOperationTypeCode) {
        setMessage('Selecciona el tipo de operacion SUNAT para la condicion tributaria.');
        return;
      }

      if (hasDetraccion && !detraccionServiceCode) {
        setMessage('Selecciona el tipo/codigo de detraccion.');
        return;
      }

      if (hasRetencion && !retencionTypeCode) {
        setMessage('Selecciona el tipo de retencion.');
        return;
      }

      if (hasPercepcion && !percepcionTypeCode) {
        setMessage('Selecciona el tipo de percepcion.');
        return;
      }
    }

    setIsSubmitting(true);
    setMessage('');

    const supplierReferenceTrimmed = supplierReference.trim();
    const supplierAddressTrimmed = supplierAddress.trim();
    const supplierPattern = supplierReferenceTrimmed.match(/^(\d{8}|\d{11})\s*[-:]\s*(.+)$/);
    const supplierDocNumber = supplierPattern ? supplierPattern[1] : (supplierReferenceTrimmed.match(/^(\d{8}|\d{11})$/)?.[1] ?? null);
    const supplierName = supplierPattern
      ? supplierPattern[2].trim()
      : (supplierReferenceTrimmed !== '' ? supplierReferenceTrimmed : null);

    const metadata: Record<string, unknown> = {};
    if (supplierReferenceTrimmed !== '') {
      metadata.supplier_doc_number = supplierDocNumber;
      metadata.supplier_name = supplierName;
    }
    if (supplierAddressTrimmed !== '') {
      metadata.supplier_address = supplierAddressTrimmed;
    }
    if (purchaseGlobalDiscountEnabled) {
      metadata.discount_total = Number(totalsWithTax.globalDiscountTotal.toFixed(2));
    }
    if (purchaseItemDiscountEnabled) {
      metadata.item_discount_total = Number(totalsWithTax.itemDiscountTotal.toFixed(2));
    }
    if (purchaseFreeOperationEnabled) {
      metadata.free_operation_total = Number(purchaseTaxPreview.gratuitaTotal.toFixed(2));
    }
    if (entryType === 'PURCHASE') {
      metadata.has_detraccion = hasDetraccion;
      metadata.detraccion_service_code = hasDetraccion ? detraccionServiceCode : null;
      metadata.has_retencion = hasRetencion;
      metadata.retencion_type_code = hasRetencion ? retencionTypeCode : null;
      metadata.retencion_scope = hasRetencion ? retencionScope : null;
      metadata.has_percepcion = hasPercepcion;
      metadata.percepcion_type_code = hasPercepcion ? percepcionTypeCode : null;
      metadata.sunat_operation_type_code = (hasDetraccion || hasRetencion || hasPercepcion) ? sunatOperationTypeCode : null;
    }
    if (dueDate.trim()) {
      metadata.due_date = dueDate.trim();
    }

    try {
      const saved = editingEntryId
        ? await updateStockEntry(accessToken, editingEntryId, {
            reference_no: referenceNo.trim() || undefined,
            supplier_reference: supplierReferenceTrimmed || undefined,
            payment_method_id: paymentMethodId || undefined,
            issue_at: entryDate,
            notes: notes.trim() || undefined,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            items: payloadItems,
            edit_reason: 'Edicion desde reporte de compras',
          })
        : await createStockEntry(accessToken, {
            warehouse_id: warehouseId,
            entry_type: entryType,
            reference_no: referenceNo.trim() || undefined,
            supplier_reference: supplierReferenceTrimmed || undefined,
            payment_method_id: paymentMethodId || undefined,
            issue_at: entryDate,
            notes: notes.trim() || undefined,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            items: payloadItems,
          });

      const savedId = Number(saved.data.id);
      resetEntryFormState();
      setMessage(editingEntryId
        ? 'Ingreso actualizado correctamente.'
        : (entryType === 'PURCHASE_ORDER' ? 'Orden de compra registrada correctamente.' : 'Ingreso registrado correctamente.'));

      setWorkspaceMode('REPORT');
      setReportFiltersDraft(initialReportFilters);
      setReportFiltersApplied(initialReportFilters);
      setReportPage(1);
      setPinnedReportEntryId(savedId);

      await loadData();
      await loadReport(1, initialReportFilters);
      setFocusReportEntryId(savedId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (editingEntryId ? 'No se pudo actualizar el ingreso' : 'No se pudo registrar el ingreso'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyReportFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...reportFiltersDraft };
    setPinnedReportEntryId(null);
    setReportFiltersApplied(next);
    setReportPage(1);
    void loadReport(1, next);
  }

  function clearReportFilters() {
    setPinnedReportEntryId(null);
    setReportFiltersDraft(initialReportFilters);
    setReportFiltersApplied(initialReportFilters);
    setReportPage(1);
    void loadReport(1, initialReportFilters);
  }

  async function handleExportReportCsv() {
    setIsExportingReport(true);
    setMessage('');

    try {
      const { blob, fileName } = await exportPurchasesCsv(accessToken, {
        warehouseId,
        entryType: reportFiltersApplied.entryType === 'ALL' ? null : reportFiltersApplied.entryType,
        reference: reportFiltersApplied.reference || undefined,
        dateFrom: reportFiltersApplied.dateFrom || undefined,
        dateTo: reportFiltersApplied.dateTo || undefined,
      });

      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar el reporte de compras');
    } finally {
      setIsExportingReport(false);
    }
  }

  async function handleExportReportXlsx() {
    setIsExportingReport(true);
    setMessage('');

    try {
      const rows = await exportPurchasesJson(accessToken, {
        warehouseId,
        entryType: reportFiltersApplied.entryType === 'ALL' ? null : reportFiltersApplied.entryType,
        reference: reportFiltersApplied.reference || undefined,
        dateFrom: reportFiltersApplied.dateFrom || undefined,
        dateTo: reportFiltersApplied.dateTo || undefined,
      });

      const sheetRows = rows.flatMap((entry) => {
        const entryDetails = entry.items ?? [];
        const entrySummary = entryDetails.reduce((acc, item) => {
          const subtotal = Number(item.subtotal ?? 0);
          const tax = Number(item.tax_amount ?? 0);
          const taxRate = Number(item.tax_rate ?? 0);
          const taxLabel = String(item.tax_label ?? '').toUpperCase();

          acc.net += subtotal;
          acc.tax += tax;
          if (taxRate > 0) {
            acc.gravada += subtotal;
          } else if (taxLabel.includes('EXONER')) {
            acc.exonerada += subtotal;
          } else if (taxLabel.includes('INAFECT')) {
            acc.inafecta += subtotal;
          } else {
            acc.noTributaria += subtotal;
          }
          return acc;
        }, { net: 0, tax: 0, gravada: 0, exonerada: 0, inafecta: 0, noTributaria: 0 });
        const computedTotal = entrySummary.net + entrySummary.tax;
        const details = entry.items ?? [];
        if (details.length === 0) {
          return [
            {
              IngresoID: entry.id,
              Tipo: entryTypeLabel(entry.entry_type),
              Estado: purchaseStatusLabel(entry.status, entry.status_label),
              Fecha: formatDateTime(entry.issue_at),
              Referencia: entry.reference_no ?? entry.supplier_reference ?? '',
              MetodoPago: entry.payment_method ?? '',
              Items: Number(entry.total_items ?? 0),
              CantidadTotal: Number(entry.total_qty ?? 0),
              TotalIngreso: Number(entry.total_amount ?? 0),
              OpGravada: 0,
              OpExonerada: 0,
              OpInafecta: 0,
              OpNoTributaria: Number(entry.total_amount ?? 0),
              IGVTotal: 0,
              Producto: '',
              Lote: '',
              Cantidad: 0,
              CostoUnitario: 0,
              Subtotal: 0,
              TipoIGV: '',
              TasaIGV: 0,
              MontoIGV: 0,
              TotalLinea: 0,
              NotaLinea: entry.notes ?? '',
            },
          ];
        }

        return details.map((item) => ({
          IngresoID: entry.id,
          Tipo: entryTypeLabel(entry.entry_type),
          Estado: purchaseStatusLabel(entry.status, entry.status_label),
          Fecha: formatDateTime(entry.issue_at),
          Referencia: entry.reference_no ?? entry.supplier_reference ?? '',
          MetodoPago: entry.payment_method ?? '',
          Items: Number(entry.total_items ?? 0),
          CantidadTotal: Number(entry.total_qty ?? 0),
          TotalIngreso: details.length > 0 ? computedTotal : Number(entry.total_amount ?? 0),
          OpGravada: entrySummary.gravada,
          OpExonerada: entrySummary.exonerada,
          OpInafecta: entrySummary.inafecta,
          OpNoTributaria: entrySummary.noTributaria,
          IGVTotal: entrySummary.tax,
          Producto: item.product_name,
          Lote: item.lot_code ?? '',
          Cantidad: Number(item.qty),
          CostoUnitario: Number(item.unit_cost),
          Subtotal: Number(item.subtotal),
          TipoIGV: item.tax_label,
          TasaIGV: Number(item.tax_rate),
          MontoIGV: Number(item.tax_amount),
          TotalLinea: Number(item.line_total),
          NotaLinea: item.notes ?? '',
        }));
      });

      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Compras');

      const fileName = `reporte_compras_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar el reporte de compras');
    } finally {
      setIsExportingReport(false);
    }
  }

  async function handleReceiveOrder(entry: StockEntryRow) {
    if (entry.entry_type !== 'PURCHASE_ORDER') {
      return;
    }

    const confirmed = window.confirm(`Se recepcionara la OC #${entry.id} y se registrara una compra con ingreso a stock. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    setIsLoadingReport(true);
    setMessage('');

    try {
      const result = await receivePurchaseOrder(accessToken, entry.id, {
        issue_at: asInputDate(entryDate),
      });

      setMessage(`OC #${result.data.purchase_order_id} recepcionada. Ingreso generado #${result.data.received_entry_id}.`);
      await loadData();
      await loadReport(reportPage, reportFiltersApplied);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo recepcionar la orden de compra');
    } finally {
      setIsLoadingReport(false);
    }
  }

  function openPartialReceive(entry: StockEntryRow) {
    const detailRows = entry.items ?? [];
    const grouped = new Map<number, PartialReceiveDraftRow>();

    detailRows.forEach((row) => {
      const current = grouped.get(row.product_id);
      if (!current) {
        grouped.set(row.product_id, {
          product_id: row.product_id,
          product_name: row.product_name,
          ordered_qty: Number(row.qty ?? 0),
          receive_qty: '',
        });
        return;
      }

      current.ordered_qty += Number(row.qty ?? 0);
      grouped.set(row.product_id, current);
    });

    setPartialReceiveRows(Array.from(grouped.values()));
    setPartialReceiveTarget(entry);
  }

  function closePartialReceive() {
    setPartialReceiveTarget(null);
    setPartialReceiveRows([]);
  }

  async function submitPartialReceive() {
    if (!partialReceiveTarget) {
      return;
    }

    const lines = partialReceiveRows
      .map((row) => ({
        product_id: row.product_id,
        qty: Number(row.receive_qty || 0),
      }))
      .filter((row) => Number.isFinite(row.qty) && row.qty > 0);

    if (lines.length === 0) {
      setMessage('Ingresa al menos una cantidad parcial mayor a 0 para recepcionar.');
      return;
    }

    setPartialReceiveBusy(true);
    setMessage('');

    try {
      const result = await receivePurchaseOrder(accessToken, partialReceiveTarget.id, {
        issue_at: asInputDate(entryDate),
        items: lines,
      });

      closePartialReceive();
      setMessage(`Recepcion parcial registrada. OC #${result.data.purchase_order_id} -> ingreso #${result.data.received_entry_id}. Estado: ${result.data.status ?? '-'}.`);
      await loadData();
      await loadReport(reportPage, reportFiltersApplied);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar la recepcion parcial');
    } finally {
      setPartialReceiveBusy(false);
    }
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>{isRestaurant ? 'Compras de Insumos' : 'Compras, Ordenes e Ingresos'}</h3>
        <button type="button" onClick={() => void loadData()} disabled={isLoading || isSubmitting}>
          Refrescar
        </button>
      </div>

      <div className="workspace-mode-switch">
        <button
          type="button"
          className={`mode-btn${workspaceMode === 'ENTRY' ? ' mode-btn-active' : ''}`}
          onClick={() => setWorkspaceMode('ENTRY')}
          disabled={workspaceMode === 'ENTRY'}
        >
          🧾 Registro de compras
        </button>
        <button
          type="button"
          className={`mode-btn${workspaceMode === 'REPORT' ? ' mode-btn-active' : ''}`}
          onClick={() => {
            setWorkspaceMode('REPORT');
            void loadReport(1, reportFiltersApplied);
          }}
          disabled={workspaceMode === 'REPORT'}
        >
          📊 Reporte de compras
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <p>
        {isRestaurant
          ? 'Registra ordenes de compra, compras efectivas y ajustes de insumos. Solo la compra y el ajuste impactan stock inmediatamente.'
          : 'Registra ordenes de compra, ingresos por compra o ajustes de stock. Solo la compra y el ajuste impactan inventario inmediatamente.'}
      </p>

      {workspaceMode === 'ENTRY' && (
      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-grid-head purchases-grid-head">
          <label className="purchases-field-entry-type">
            Tipo de movimiento
            <select value={entryType} onChange={(e) => setEntryType(e.target.value as StockEntryType)} disabled={editingEntryId !== null}>
              <option value="PURCHASE_ORDER">Orden de compra</option>
              <option value="PURCHASE">Compra (ingreso)</option>
              <option value="ADJUSTMENT">Ajuste (+/-)</option>
            </select>
          </label>

          <label className="purchases-field-reference">
            Referencia
            <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value.toUpperCase())} placeholder="OC-001, Factura proveedor" />
          </label>

          <label className="with-suggest purchases-field-supplier" onBlur={handleSupplierSuggestBlur}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <span>Proveedor / RUC</span>
              <button
                type="button"
                className="btn-mini"
                onClick={() => void resolveSupplierFromPadron()}
                disabled={resolvingSupplierDoc}
              >
                {resolvingSupplierDoc ? 'Consultando...' : 'Consultar DNI/RUC'}
              </button>
            </div>
            <input
              ref={supplierInputRef}
              value={supplierReference}
              onChange={(e) => {
                setSupplierInputFocused(true);
                setSupplierReference(e.target.value);
                setSupplierAddress('');
              }}
              onFocus={() => setSupplierInputFocused(true)}
              onKeyDown={handleSupplierKeyDown}
              placeholder="Ingrese RUC/DNI y presione Consultar, o escriba el nombre"
            />
            {supplierSuggestions.length > 0 && (
              <div className="suggest-box suggest-box--customer">
                {supplierSuggestions.map((row, index) => (
                  <button
                    key={`${row.id}-${row.doc_number}-${row.name}-${index}`}
                    type="button"
                    className={index === activeSupplierIndex ? 'active' : ''}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseSupplier(row);
                    }}
                  >
                    <strong>{row.name}</strong>
                    <small>
                      {[row.doc_number, row.address].filter(Boolean).join(' · ') || 'Sin datos'}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="purchases-field-supplier-address">
            Dirección proveedor
            <input
              value={supplierAddress}
              onChange={(e) => setSupplierAddress(e.target.value)}
              placeholder="Dirección fiscal/comercial"
            />
          </label>

          <label className="purchases-field-payment">
            Tipo de pago
            <select value={paymentMethodId ?? ''} onChange={(e) => setPaymentMethodId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin especificar</option>
              {(lookups?.payment_methods ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label className="purchases-field-entry-date">
            Fecha de documento
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(asInputDate(e.target.value))} />
          </label>

          <label className="purchases-field-due-date">
            Vencimiento
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Fecha de vencimiento" />
          </label>

          {isRestaurant && (
          <label className="purchases-field-item-type">
            Tipo de item
            <select value={purchaseNatureFilter} onChange={(e) => setPurchaseNatureFilter(e.target.value as 'ALL' | 'PRODUCT' | 'SUPPLY')}>
              <option value="ALL">Todos</option>
              <option value="SUPPLY">Insumos</option>
              <option value="PRODUCT">Producto/Carta</option>
            </select>
          </label>
          )}
        </div>

        <details className="sales-meta-collapse" open={Boolean(notes) || hasDetraccion || hasRetencion || hasPercepcion}>
          <summary className="sales-meta-collapse-summary">Datos adicionales</summary>
          <div className="sales-grid-meta sales-grid-meta-secondary">
            <div className="sales-igv-toggle-row">
              <div className="tax-mode-toggle" role="group" aria-label="Modo de costo IGV">
                <label className="tax-mode-toggle-label">
                  <input
                    type="checkbox"
                    checked={priceTaxMode === 'INCLUSIVE'}
                    onChange={(e) => setPriceTaxMode(e.target.checked ? 'INCLUSIVE' : 'EXCLUSIVE')}
                  />
                  Incluye IGV en costos
                </label>
              </div>
              <span className="sales-igv-toggle-row-hint">
                {priceTaxMode === 'INCLUSIVE' ? 'Costos ingresados ya incluyen IGV' : 'IGV se calcula sobre el costo base'}
              </span>
            </div>
            <label className="sales-field-address">
              Nota general
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalle general del ingreso" />
            </label>

            {entryType === 'PURCHASE' && (detraccionServices.length > 0 || canUseRetencionComprador || canUseRetencionProveedor || canUsePercepcion) && (
              <div className="sales-tributary-slot">
                <details className="sales-tributary-panel">
                  <summary className="sales-tributary-summary">
                    <strong className="sales-tributary-title">Condiciones tributarias</strong>
                    <span className={`sales-tributary-chip ${hasDetraccion || hasRetencion || hasPercepcion ? 'is-active' : 'is-soft'}`}>
                      {hasDetraccion ? 'Detraccion' : hasRetencion ? 'Retencion' : hasPercepcion ? 'Percepcion' : 'Sin regimen'}
                    </span>
                    {(hasDetraccion || hasRetencion || hasPercepcion) && (
                      <span className="sales-tributary-chip is-warning">SUNAT {sunatOperationTypeCode || '-'}</span>
                    )}
                  </summary>

                  <div className="sales-tributary-grid">
                    <label className="sales-tributary-field sales-tributary-field-wide">
                      <span>Tipo de operacion SUNAT</span>
                      <select
                        value={sunatOperationTypeCode}
                        onChange={(e) => setSunatOperationTypeCode(e.target.value)}
                        disabled={operationTypes.length === 0}
                      >
                        <option value="">Selecciona operacion</option>
                        {operationTypes.map((row) => (
                          <option key={row.code} value={row.code}>{row.code} - {row.name}</option>
                        ))}
                      </select>
                    </label>

                    {detraccionServices.length > 0 && (
                      <>
                        <label className="sales-tributary-toggle">
                          <input
                            type="checkbox"
                            checked={hasDetraccion}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setHasDetraccion(checked);
                              if (checked) {
                                setHasRetencion(false);
                                setHasPercepcion(false);
                                setSunatOperationTypeCode(pickOperationTypeCode('DETRACCION'));
                              } else if (hasRetencion) {
                                setSunatOperationTypeCode(pickOperationTypeCode('RETENCION'));
                              } else if (hasPercepcion) {
                                setSunatOperationTypeCode(pickOperationTypeCode('PERCEPCION'));
                              } else {
                                setSunatOperationTypeCode('');
                              }
                            }}
                          />
                          Detraccion
                        </label>
                        <label className="sales-tributary-field">
                          <span>Tipo detraccion</span>
                          <select
                            value={detraccionServiceCode}
                            onChange={(e) => setDetraccionServiceCode(e.target.value)}
                            disabled={!hasDetraccion}
                          >
                            <option value="">Selecciona</option>
                            {detraccionServices.map((row) => (
                              <option key={row.code} value={row.code}>{row.code} - {row.name} ({Number(row.rate_percent).toFixed(2)}%)</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {(canUseRetencionComprador || canUseRetencionProveedor) && (
                      <>
                        <label className="sales-tributary-toggle">
                          <input
                            type="checkbox"
                            checked={hasRetencion}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setHasRetencion(checked);
                              if (checked) {
                                setHasDetraccion(false);
                                setHasPercepcion(false);
                                setSunatOperationTypeCode(pickOperationTypeCode('RETENCION'));
                              } else if (hasDetraccion) {
                                setSunatOperationTypeCode(pickOperationTypeCode('DETRACCION'));
                              } else if (hasPercepcion) {
                                setSunatOperationTypeCode(pickOperationTypeCode('PERCEPCION'));
                              } else {
                                setSunatOperationTypeCode('');
                              }
                            }}
                          />
                          Retencion
                        </label>
                        <label className="sales-tributary-field">
                          <span>Tipo retencion</span>
                          <select
                            value={retencionTypeCode}
                            onChange={(e) => setRetencionTypeCode(e.target.value)}
                            disabled={!hasRetencion}
                          >
                            <option value="">Selecciona</option>
                            {retencionTypes.map((row) => (
                              <option key={row.code} value={row.code}>{row.code} - {row.name} ({Number(row.rate_percent).toFixed(2)}%)</option>
                            ))}
                          </select>
                        </label>
                        {(canUseRetencionComprador && canUseRetencionProveedor) && (
                          <label className="sales-tributary-field">
                            <span>Escenario retencion</span>
                            <select value={retencionScope} onChange={(e) => setRetencionScope(e.target.value as 'COMPRADOR' | 'PROVEEDOR')} disabled={!hasRetencion}>
                              <option value="COMPRADOR">Retencion al comprador</option>
                              <option value="PROVEEDOR">Retencion del proveedor</option>
                            </select>
                          </label>
                        )}
                      </>
                    )}

                    {canUsePercepcion && (
                      <>
                        <label className="sales-tributary-toggle">
                          <input
                            type="checkbox"
                            checked={hasPercepcion}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setHasPercepcion(checked);
                              if (checked) {
                                setHasDetraccion(false);
                                setHasRetencion(false);
                                setSunatOperationTypeCode(pickOperationTypeCode('PERCEPCION'));
                              } else if (hasDetraccion) {
                                setSunatOperationTypeCode(pickOperationTypeCode('DETRACCION'));
                              } else if (hasRetencion) {
                                setSunatOperationTypeCode(pickOperationTypeCode('RETENCION'));
                              } else {
                                setSunatOperationTypeCode('');
                              }
                            }}
                          />
                          Percepcion
                        </label>
                        <label className="sales-tributary-field">
                          <span>Tipo percepcion</span>
                          <select
                            value={percepcionTypeCode}
                            onChange={(e) => setPercepcionTypeCode(e.target.value)}
                            disabled={!hasPercepcion}
                          >
                            <option value="">Selecciona</option>
                            {percepcionTypes.map((row) => (
                              <option key={row.code} value={row.code}>{row.code} - {row.name} ({Number(row.rate_percent).toFixed(2)}%)</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    {(hasDetraccion || hasRetencion || hasPercepcion) && (
                      <p className="sales-tributary-inline-note">
                        <strong>Vista previa:</strong>{' '}
                        {hasDetraccion && `${Number(selectedDetraccion?.rate_percent ?? 0).toFixed(2)}% = ${detraccionAmount.toFixed(2)}`}
                        {hasRetencion && `${Number(selectedRetencion?.rate_percent ?? 0).toFixed(2)}% = ${retencionAmount.toFixed(2)} (${retencionScope})`}
                        {hasPercepcion && `${Number(selectedPercepcion?.rate_percent ?? 0).toFixed(2)}% = ${percepcionAmount.toFixed(2)}`}
                      </p>
                    )}
                  </div>
                </details>

                {(hasDetraccion || hasRetencion || hasPercepcion) && (
                  <div className="sales-tributary-preview" aria-live="polite">
                    <span>Operacion: {selectedOperationType ? `${selectedOperationType.code} ${selectedOperationType.name}` : '-'}</span>
                    {hasDetraccion && <span>Detraccion: {detraccionAmount.toFixed(2)} ({lookups?.detraccion_account?.account_number ?? 'sin cuenta'})</span>}
                    {hasRetencion && <span>Retencion: {retencionAmount.toFixed(2)} ({lookups?.retencion_account?.account_number ?? 'sin cuenta'})</span>}
                    {hasPercepcion && <span>Percepcion: {percepcionAmount.toFixed(2)} ({lookups?.percepcion_account?.account_number ?? 'sin cuenta'})</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </details>

        <div className="sales-concepts-shell">
          <section className="sales-concepts-main">
            <header className="sales-section-head">
              <h4>Lineas de compra</h4>
              <p>Agrega productos y arma el detalle de ingreso antes de registrar.</p>
            </header>

            <div className="sales-grid-main">
              <div className={`sales-grid-row sales-grid-row-item tax-on purchases-entry-row ${(purchaseItemDiscountEnabled || purchaseFreeOperationEnabled) ? 'has-line-tools' : ''}`}>
                <label className="with-suggest sales-field-product">
                  Producto
                  <input
                    ref={productInputRef}
                    value={draftItem.product_query}
                    onFocus={() => setIsProductSuggestOpen(true)}
                    onKeyDown={handleProductSuggestKeyDown}
                    onBlur={() => {
                      setTimeout(() => setIsProductSuggestOpen(false), 120);
                    }}
                    onChange={(e) => {
                      updateDraftItem({ product_query: e.target.value, product_id: null, lot_id: null });
                      setIsProductSuggestOpen(true);
                      setActiveProductIndex(0);
                    }}
                    placeholder="Buscar por SKU o nombre"
                  />
                  {isProductSuggestOpen && activeProductSuggestions.length > 0 && (
                    <div className="suggest-box suggest-box--product">
                      {activeProductSuggestions.map((product, index) => (
                        <button
                          type="button"
                          className={`suggest-item ${index === activeProductIndex ? 'active' : ''}`}
                          key={product.id}
                          onClick={() => chooseProductForDraft(product)}
                        >
                          {(() => {
                            const stock = stockByProductId.get(product.id) ?? 0;
                            return (
                              <>
                                <strong>{product.name}</strong>
                                <span className="suggest-sku">{product.sku ?? 'SIN-SKU'}</span>
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
                </label>

                <label className="sales-field-qty">
                  Cantidad
                  <input
                    type="number"
                    step="0.001"
                    value={draftItem.qty}
                    onChange={(e) => updateDraftItem({ qty: e.target.value })}
                    onKeyDown={handleQuickAppendRow}
                    placeholder={entryType === 'ADJUSTMENT' ? 'Ej: -2 o 5' : 'Ej: 10'}
                  />
                </label>

                <label className="sales-field-price">
                  Costo unitario
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={draftItem.unit_cost}
                    onChange={(e) => updateDraftItem({ unit_cost: e.target.value })}
                    onKeyDown={handleQuickAppendRow}
                    placeholder="0.00"
                  />
                </label>

                {lotTrackingEnabled && (
                <label className="sales-field-lot">
                  Lote
                  <input value={draftItem.lot_code} onChange={(e) => updateDraftItem({ lot_code: e.target.value })} placeholder="Lote o codigo" />
                </label>
                )}

                {expiryTrackingEnabled && (
                <div className="sales-field-context purchases-field-dates" ref={draftDatesPopoverRef}>
                  <span>Fechas</span>
                  <button
                    type="button"
                    className="purchases-dates-trigger"
                    onClick={() => setIsDraftDatesPopoverOpen((prev) => !prev)}
                  >
                    <span className="purchases-dates-trigger__lead">
                      <span className="purchases-dates-trigger__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                          <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v11a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1Zm13 8H4v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8ZM5 6a1 1 0 0 0-1 1v1h16V7a1 1 0 0 0-1-1H5Z" />
                        </svg>
                      </span>
                      <span>{draftItem.manufacture_at || draftItem.expires_at ? 'Editar' : 'Configurar'}</span>
                    </span>
                    <span className={`purchases-dates-trigger__chevron ${isDraftDatesPopoverOpen ? 'is-open' : ''}`} aria-hidden="true">▾</span>
                  </button>

                  {isDraftDatesPopoverOpen && (
                    <div className="purchases-dates-popover" role="dialog" aria-label="Fechas del item">
                      <label>
                        Fabricacion
                        <input
                          type="date"
                          value={draftItem.manufacture_at}
                          onChange={(e) => updateDraftItem({ manufacture_at: e.target.value })}
                        />
                      </label>
                      <label>
                        Vencimiento
                        <input
                          type="date"
                          value={draftItem.expires_at}
                          onChange={(e) => updateDraftItem({ expires_at: e.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-mini"
                        onClick={() => setIsDraftDatesPopoverOpen(false)}
                      >
                        Listo
                      </button>
                    </div>
                  )}
                </div>
                )}

                <label className="sales-field-igv">
                  Tipo IGV
                  <select
                    value={draftItem.tax_category_id ?? ''}
                    onChange={(e) => {
                      const cat = (lookups?.tax_categories ?? []).find((t) => t.id === Number(e.target.value));
                      updateDraftItem({
                        tax_category_id: cat ? cat.id : undefined,
                        tax_rate: cat ? cat.rate_percent : undefined,
                      });
                    }}
                  >
                    <option value="">Sin IGV</option>
                    {(lookups?.tax_categories ?? []).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </label>

                {purchaseItemDiscountEnabled && (
                  <label className="sales-field-inline-tool sales-field-inline-discount">
                    Descuento
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={draftItem.discount_total}
                      onChange={(e) => updateDraftItem({ discount_total: e.target.value })}
                      disabled={draftItem.is_free_operation}
                    />
                  </label>
                )}

                {purchaseFreeOperationEnabled && (
                  <label className="sales-field-inline-toggle">
                    <input
                      type="checkbox"
                      checked={draftItem.is_free_operation}
                      onChange={(e) => updateDraftItem({
                        is_free_operation: e.target.checked,
                        discount_total: e.target.checked ? '0' : draftItem.discount_total,
                      })}
                    />
                    Operación gratuita
                  </label>
                )}

                <div className="sales-field-action">
                  <button type="button" onClick={addDraftToRows}>
                    Agregar item
                  </button>
                </div>

              </div>
            </div>

            <div className="table-wrap sales-cart-wrap purchases-lines-wrap">
              <div className="sales-cart-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock actual</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    {lotTrackingEnabled && <th>Lote</th>}
                    {expiryTrackingEnabled && <th>Fabricacion</th>}
                    {expiryTrackingEnabled && <th>Vencimiento</th>}
                    <th>Tipo IGV</th>
                    {(purchaseItemDiscountEnabled || purchaseFreeOperationEnabled) && (
                      <th>{purchaseItemDiscountEnabled ? 'Descuento' : 'Gratis'}</th>
                    )}
                    <th>Subtotal</th>
                    <th>IGV</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9 + (lotTrackingEnabled ? 1 : 0) + (expiryTrackingEnabled ? 2 : 0)}>Aun no agregaste items.</td>
                    </tr>
                  )}
                  {rows.map((row) => {
                    const qty = Number(row.qty) || 0;
                    const line = computePurchaseLineAmounts(row);
                    const taxAmount = line.taxAmount;
                    const lineTotal = line.finalTotal;
                    const productStock = row.product_id ? (stockByProductId.get(row.product_id) ?? 0) : 0;

                    return (
                      <tr key={row.key}>
                        <td>{row.product_query || '-'}</td>
                        <td>
                          <span className={`stock-chip ${stockToneClass(productStock)}`}>{productStock.toFixed(3)}</span>
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="number"
                            step="0.001"
                            value={row.qty}
                            onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                            placeholder={entryType === 'ADJUSTMENT' ? 'Ej: -2 o 5' : 'Ej: 10'}
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="number"
                            step="0.0001"
                            min="0"
                            value={row.unit_cost}
                            onChange={(e) => updateRow(row.key, { unit_cost: e.target.value })}
                            placeholder="0.0000"
                          />
                        </td>
                        {lotTrackingEnabled && <td>{row.lot_code || '-'}</td>}
                        {expiryTrackingEnabled && <td>{row.manufacture_at || '-'}</td>}
                        {expiryTrackingEnabled && <td>{row.expires_at || '-'}</td>}
                        <td>
                          {(lookups?.tax_categories ?? []).find((cat) => cat.id === row.tax_category_id)?.label ?? 'Sin IGV'}
                        </td>
                        {(purchaseItemDiscountEnabled || purchaseFreeOperationEnabled) && (
                          <td>
                            <div className="sales-table-line-meta purchases-table-line-meta">
                              {purchaseItemDiscountEnabled && (
                                <input
                                  className="cell-input"
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={row.discount_total}
                                  onChange={(e) => updateRow(row.key, { discount_total: e.target.value })}
                                  disabled={row.is_free_operation}
                                />
                              )}
                              {purchaseFreeOperationEnabled && (
                                <label className="sales-inline-check">
                                  <input
                                    type="checkbox"
                                    checked={row.is_free_operation}
                                    onChange={(e) => updateRow(row.key, {
                                      is_free_operation: e.target.checked,
                                      discount_total: e.target.checked ? '0' : row.discount_total,
                                    })}
                                  />
                                  Gratis
                                </label>
                              )}
                            </div>
                          </td>
                        )}
                        <td>{line.subtotal.toFixed(2)}</td>
                        <td>{taxAmount.toFixed(2)}</td>
                        <td>{lineTotal.toFixed(2)}</td>
                        <td>
                          <button type="button" onClick={() => removeRow(row.key)}>
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </section>

          <aside className="sales-concepts-side" aria-live="polite">
            <header className="sales-section-head">
              <h4>Montos de la compra</h4>
              <p>Vista previa consolidada en tiempo real.</p>
            </header>

            <div className="sales-summary">
              {purchaseGlobalDiscountEnabled && (
                <label className="sales-summary-input sales-summary-input-discount">
                  <span>Descuento global</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={globalDiscountAmount}
                    onChange={(e) => setGlobalDiscountAmount(Number(e.target.value))}
                    placeholder="0.00"
                  />
                </label>
              )}
              <article>
                <span>Subtotal</span>
                <strong>{totalsWithTax.netTotal.toFixed(2)}</strong>
              </article>
              <article>
                <span>Impuestos</span>
                <strong>{totalsWithTax.taxTotal.toFixed(2)}</strong>
              </article>
              {(purchaseGlobalDiscountEnabled || purchaseItemDiscountEnabled || purchaseFreeOperationEnabled) && (
                <article>
                  <span>Descuentos</span>
                  <strong>{(totalsWithTax.itemDiscountTotal + totalsWithTax.globalDiscountTotal).toFixed(2)}</strong>
                </article>
              )}
              <article>
                <span>Total</span>
                <strong>{totalsWithTax.grandTotal.toFixed(2)}</strong>
              </article>
            </div>

            <div className="sales-tax-preview">
              <div className="sales-tax-preview-head">
                <h4>Resumen tributario</h4>
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => setShowPurchaseTaxBreakdown((prev) => !prev)}
                >
                  {showPurchaseTaxBreakdown ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
              </div>
              <div className="sales-tax-preview-grid">
                {showPurchaseTaxBreakdown && (
                  <>
                    <article><span>Total Descuento</span><strong>{purchaseTaxPreview.discountTotal.toFixed(2)}</strong></article>
                    {purchaseGlobalDiscountEnabled && (
                      <article><span>Descuento global</span><strong>{totalsWithTax.globalDiscountTotal.toFixed(2)}</strong></article>
                    )}
                    <article><span>Total Ope. Inafecta</span><strong>{purchaseTaxPreview.inafectaTotal.toFixed(2)}</strong></article>
                    <article><span>Total Ope. Exonerada</span><strong>{purchaseTaxPreview.exoneradaTotal.toFixed(2)}</strong></article>
                  </>
                )}
                <article><span>Total Ope. Gravada</span><strong>{purchaseTaxPreview.gravadaTotal.toFixed(2)}</strong></article>
                <article><span>Total IGV ({purchaseTaxPreview.igvRateLabel.toFixed(2)}%)</span><strong>{purchaseTaxPreview.igvTotal.toFixed(2)}</strong></article>
                {showPurchaseTaxBreakdown && (
                  <>
                    <article><span>ICBPER</span><strong>{purchaseTaxPreview.icbperTotal.toFixed(2)}</strong></article>
                    <article><span>Total Ope. Gratuita</span><strong>{purchaseTaxPreview.gratuitaTotal.toFixed(2)}</strong></article>
                    <article><span>Otros Cargos</span><strong>{purchaseTaxPreview.otherChargesTotal.toFixed(2)}</strong></article>
                    <article><span>No tributarias</span><strong>{purchaseTaxPreview.noTributariaTotal.toFixed(2)}</strong></article>
                  </>
                )}
                <article className="sales-tax-preview-total"><span>Importe Total</span><strong>{purchaseTaxPreview.grandTotal.toFixed(2)}</strong></article>
              </div>

              {!purchaseTaxPreview.isTributaryPurchase && (
                <p className="shortcut-hint" style={{ marginTop: '0.4rem' }}>
                  Compra no tributaria: no se detecta IGV aplicable en las lineas actuales.
                </p>
              )}
            </div>

            <div className="sales-side-actions">
              <button type="submit" disabled={isSubmitting || isLoading}>
                {isSubmitting ? (editingEntryId ? 'Actualizando...' : 'Registrando...') : (editingEntryId ? `Guardar cambios #${editingEntryId}` : 'Registrar ingreso')}
              </button>
              {editingEntryId !== null && (
                <button type="button" className="btn-clear" onClick={cancelEditEntry} disabled={isSubmitting}>
                  Cancelar edicion
                </button>
              )}
              <p className="shortcut-hint">La seleccion de IGV viene desde base de datos y se aplica por linea.</p>
            </div>
          </aside>
        </div>
      </form>
      )}

      {workspaceMode === 'REPORT' && (
      <div className="table-wrap">
        <h4>Reporte de compras</h4>
        <div className="report-filters" style={{ marginBottom: '0.8rem' }}>
          <div className="report-filters-header">
            <span className="report-filters-title">Filtros de búsqueda</span>
          </div>
          <form className="report-filter-grid" onSubmit={applyReportFilters}>
            <label>
              <span>Tipo</span>
              <select
                value={reportFiltersDraft.entryType}
                onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, entryType: e.target.value as PurchasesReportFilters['entryType'] }))}
              >
                <option value="ALL">Todos</option>
                <option value="PURCHASE_ORDER">Orden de compra</option>
                <option value="PURCHASE">Compra</option>
                <option value="ADJUSTMENT">Ajuste</option>
              </select>
            </label>

            <label>
              <span>Referencia</span>
              <input
                value={reportFiltersDraft.reference}
                onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, reference: e.target.value.toUpperCase() }))}
                placeholder="OC, factura o proveedor"
              />
            </label>

            <label>
              <span>Fecha desde</span>
              <input
                type="date"
                value={reportFiltersDraft.dateFrom}
                onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </label>

            <label>
              <span>Fecha hasta</span>
              <input
                type="date"
                value={reportFiltersDraft.dateTo}
                onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </label>
          </form>

          <div className="report-filter-actions">
            <button
              type="button"
              className="btn-apply"
              onClick={() => {
                const next = { ...reportFiltersDraft };
                setReportFiltersApplied(next);
                setReportPage(1);
                void loadReport(1, next);
              }}
              disabled={isLoadingReport}
            >
              ✓ Aplicar
            </button>
            <button type="button" className="btn-clear" onClick={clearReportFilters} disabled={isLoadingReport}>
              ✕ Limpiar
            </button>
            <span className="report-filter-spacer" />
            <button type="button" className="btn-export" onClick={() => void handleExportReportCsv()} disabled={isExportingReport || isLoadingReport}>
              {isExportingReport ? 'Exportando…' : '⬇ CSV'}
            </button>
            <button type="button" className="btn-export" onClick={() => void handleExportReportXlsx()} disabled={isExportingReport || isLoadingReport}>
              {isExportingReport ? 'Exportando…' : '⬇ XLSX'}
            </button>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th style={{ minWidth: '10rem' }}>Fecha</th>
              <th>Referencia</th>
              <th>Pago</th>
              <th>Items</th>
              <th>Cantidad</th>
              <th>Total</th>
              <th style={{ width: '9.2rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleReportRows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center' }}>No hay registros para los filtros actuales.</td>
              </tr>
            )}
            {visibleReportRows.map((entry) => (
              <tr
                key={entry.id}
                ref={Number(entry.id) === focusReportEntryId ? focusedReportRowRef : null}
                className={Number(entry.id) === highlightedReportEntryId ? 'sales-row-focused' : ''}
              >
                <td>{entry.id}</td>
                <td>{entryTypeLabel(entry.entry_type)}</td>
                <td>{purchaseStatusLabel(entry.status, entry.status_label)}</td>
                <td>{formatDateTime(entry.issue_at)}</td>
                <td>{entry.reference_no ?? entry.supplier_reference ?? '-'}</td>
                <td>{entry.payment_method ?? '-'}</td>
                <td>{entry.total_items}</td>
                <td>{Number(entry.total_qty).toFixed(3)}</td>
                <td>{Number(entry.total_amount).toFixed(2)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: entry.entry_type === 'PURCHASE_ORDER' && !['CLOSED', 'VOID', 'CANCELED'].includes(String(entry.status || '').toUpperCase()) ? 'flex-start' : 'center', gap: '0.35rem' }}>
                    {canEditPurchaseEntries && (
                      <button
                        type="button"
                        className="btn-mini sales-action-btn sales-action-edit"
                        title="Editar"
                        aria-label="Editar"
                        onClick={() => beginEditEntry(entry)}
                      >
                        📝
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn-mini sales-action-btn sales-action-view"
                      title="Ver detalle"
                      aria-label="Ver detalle"
                      onClick={() => setDetailPreviewEntry(entry)}
                      disabled={(entry.items ?? []).length === 0}
                    >
                      👁️
                    </button>

                    {entry.entry_type === 'PURCHASE_ORDER' && !['CLOSED', 'VOID', 'CANCELED'].includes(String(entry.status || '').toUpperCase()) && (
                      <div className="sales-actions-dropdown">
                        <button
                          type="button"
                          title="Opciones de recepcion"
                          className="btn-mini sales-action-btn sales-action-view"
                          disabled={isLoadingReport}
                        >
                          ⇄
                        </button>
                        <div className="sales-actions-dropdown-menu">
                          <button
                            type="button"
                            className="btn-mini"
                            onClick={() => void handleReceiveOrder(entry)}
                            disabled={isLoadingReport}
                          >
                            Recepcionar total
                          </button>
                          <button
                            type="button"
                            className="btn-mini"
                            onClick={() => openPartialReceive(entry)}
                            disabled={isLoadingReport}
                          >
                            Recepcionar parcial
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="module-header" style={{ marginTop: '0.8rem' }}>
          <button type="button" onClick={() => setReportPage((prev) => Math.max(1, prev - 1))} disabled={reportPage <= 1 || isLoadingReport}>
            Anterior
          </button>
          <p style={{ margin: 0 }}>
            Pagina {reportPagination.current_page} de {Math.max(1, reportPagination.total_pages)} - Registros: {reportPagination.total}
          </p>
          <button
            type="button"
            onClick={() => setReportPage((prev) => Math.min(reportPagination.total_pages || 1, prev + 1))}
            disabled={reportPage >= (reportPagination.total_pages || 1) || isLoadingReport}
          >
            Siguiente
          </button>
        </div>
      </div>
      )}

      {detailPreviewEntry && (
        <HtmlPreviewDialog
          title="Detalle de compra"
          subtitle={`Ingreso #${detailPreviewEntry.id} | ${formatDateTime(detailPreviewEntry.issue_at)}`}
          html={buildPurchaseDetailHtml(detailPreviewEntry, { company: companyProfile })}
          variant="wide"
          onClose={() => setDetailPreviewEntry(null)}
        />
      )}

      {partialReceiveTarget && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '780px', width: '100%' }}>
            <header className="modal-head" style={{ marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0 }}>Recepcion parcial OC #{partialReceiveTarget.id}</h4>
            </header>

            <p style={{ marginTop: 0 }}>
              Ingresa solo las cantidades a recepcionar ahora. El sistema calculara el saldo pendiente automaticamente.
            </p>

            <div className="table-wrap" style={{ maxHeight: '320px', overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Ordenado</th>
                    <th>Recepcionar ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {partialReceiveRows.map((row) => (
                    <tr key={row.product_id}>
                      <td>{row.product_name}</td>
                      <td>{row.ordered_qty.toFixed(3)}</td>
                      <td>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={row.receive_qty}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setPartialReceiveRows((prev) => prev.map((draft) => (
                              draft.product_id === row.product_id
                                ? { ...draft, receive_qty: nextValue }
                                : draft
                            )));
                          }}
                          placeholder="0.000"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="module-header" style={{ marginTop: '1rem' }}>
              <button type="button" onClick={submitPartialReceive} disabled={partialReceiveBusy}>
                {partialReceiveBusy ? 'Registrando...' : 'Guardar recepcion parcial'}
              </button>
              <button type="button" onClick={closePartialReceive} disabled={partialReceiveBusy}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
