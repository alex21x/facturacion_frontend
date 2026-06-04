import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../../styles/modules/purchases.css';
import { createInventoryProduct, fetchInventoryLots, fetchInventoryProducts, fetchInventoryStock } from '../../inventory/api';
import type { InventoryLotRow, InventoryProduct, InventoryStockRow } from '../../inventory/types';
import { createStockEntry, exportPurchasesCsv, exportPurchasesJson, fetchPurchasesLookups, fetchPurchasesReport, fetchSupplierAutocomplete, fetchSuppliersCatalog, importSuppliersBulk, receivePurchaseOrder, resolveSupplierByDocument, updateStockEntry, type SupplierBulkImportRow } from '../api';
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
  normalizePurchasePriceTaxMode,
  resolvePurchaseUnitCostGross,
  resolvePurchaseUnitCostNet,
  stockToneClass,
  todayAsInputDate,
  type PurchaseEntryDraft as EntryRowDraft,
  type PurchasePriceTaxMode as PriceTaxMode,
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
  phone?: string | null;  
  source: string;
};

type PurchasesWorkspaceMode = 'ENTRY' | 'REPORT';
const INTERNAL_UNIT_COST_DECIMALS = 6;

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

const DOCUMENTARY_ENTRY_TYPES: StockEntryType[] = ['PURCHASE', 'PURCHASE_ORDER', 'NON_TAX_IN', 'NON_TAX_OUT'];

const SUPPLIER_BULK_TEMPLATE_HEADERS = [
  'TIPO_DOCUMENTO',
  'NUMERO_DOCUMENTO',
  'RAZON_SOCIAL',
  'DIRECCION',
  'TELEFONO',
  'ORIGEN',
];

const QUICK_SUPPLIER_DOC_TYPE_OPTIONS = [
  { value: 'RUC', label: 'RUC (11 dígitos)' },
  { value: 'DNI', label: 'DNI (8 dígitos)' },
  { value: 'CE', label: 'Carnet extranjería' },
  { value: 'PAS', label: 'Pasaporte' },
  { value: 'OTRO', label: 'Otro documento' },
];

function sanitizeQuickSupplierDocNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
}

function validateQuickSupplierDocNumber(docType: string, docNumber: string): string | null {
  if (docType === 'RUC') {
    return /^\d{11}$/.test(docNumber) ? null : 'El RUC debe tener 11 dígitos.';
  }

  if (docType === 'DNI') {
    return /^\d{8}$/.test(docNumber) ? null : 'El DNI debe tener 8 dígitos.';
  }

  return docNumber.length >= 4 ? null : 'Ingrese un número de documento válido.';
}

function normalizeSupplierExcelHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSpreadsheetDocNumber(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }

  const raw = String(value ?? '').trim();
  if (/^\d+(\.0+)?$/u.test(raw)) {
    return String(Math.trunc(Number(raw)));
  }

  if (/^\d+(\.\d+)?e\+\d+$/iu.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return Math.trunc(numeric).toString();
    }
  }

  return raw;
}

function normalizeSupplierImportRows(rawRows: Array<Record<string, unknown>>): SupplierBulkImportRow[] {
  return rawRows
    .map((raw) => {
      const row = Object.entries(raw).reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[normalizeSupplierExcelHeader(key)] = value;
        return acc;
      }, {});

      const normalizedDocNumber = normalizeSpreadsheetDocNumber(row.NUMERO_DOCUMENTO ?? row.DOC_NUMBER ?? '').replace(/\D+/g, '');
      const normalizedLegalName = String(row.RAZON_SOCIAL ?? row.LEGAL_NAME ?? row.NOMBRE ?? '').trim();

      if (normalizedDocNumber === '' || normalizedLegalName === '') {
        return null;
      }

      const payload: SupplierBulkImportRow = {
        doc_type: String(row.TIPO_DOCUMENTO ?? row.DOC_TYPE ?? '').trim() || undefined,
        doc_number: normalizedDocNumber,
        legal_name: normalizedLegalName,
        address: String(row.DIRECCION ?? row.ADDRESS ?? '').trim() || undefined,
        phone: String(row.TELEFONO ?? row.PHONE ?? '').trim() || undefined,
        source: String(row.ORIGEN ?? row.SOURCE ?? '').trim() || undefined,
      };

      return payload;
    })
    .filter((row): row is SupplierBulkImportRow => row !== null);
}

function buildEmptyRow(seed: number, priceTaxMode: PriceTaxMode = 'INCLUSIVE'): EntryRowDraft {
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
    price_tax_mode: priceTaxMode,
  };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function resolveReportEntryGrandTotal(entry: StockEntryRow): number {
  const details = Array.isArray(entry.items) ? entry.items : [];
  const reportedTotal = Number(entry.total_amount ?? 0);

  if (details.length === 0) {
    return Number.isFinite(reportedTotal) ? reportedTotal : 0;
  }

  const grossFromItems = details.reduce((acc, item) => {
    const lineTotal = Number(item.line_total ?? 0);
    if (Number.isFinite(lineTotal)) {
      return acc + lineTotal;
    }

    const subtotal = Number(item.subtotal ?? 0);
    const taxAmount = Number(item.tax_amount ?? 0);
    return acc + (Number.isFinite(subtotal) ? subtotal : 0) + (Number.isFinite(taxAmount) ? taxAmount : 0);
  }, 0);

  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const itemDiscountFromMetadata = Number(metadata.item_discount_total ?? 0);
  const globalDiscountFromMetadata = Number(metadata.discount_total ?? 0);
  const discountFromMetadata = Math.max(
    0,
    (Number.isFinite(itemDiscountFromMetadata) ? itemDiscountFromMetadata : 0)
      + (Number.isFinite(globalDiscountFromMetadata) ? globalDiscountFromMetadata : 0)
  );

  return Math.max(grossFromItems - discountFromMetadata, 0);
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
  const supplierImportFileInputRef = useRef<HTMLInputElement | null>(null);  
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
  const [draftProductLots, setDraftProductLots] = useState<InventoryLotRow[]>([]);
  const [hasDetraccion, setHasDetraccion] = useState(false);
  const [detraccionServiceCode, setDetraccionServiceCode] = useState('');
  const [hasRetencion, setHasRetencion] = useState(false);
  const [retencionTypeCode, setRetencionTypeCode] = useState('');
  const [retencionScope, setRetencionScope] = useState<'COMPRADOR' | 'PROVEEDOR'>('COMPRADOR');
  const [hasPercepcion, setHasPercepcion] = useState(false);
  const [percepcionTypeCode, setPercepcionTypeCode] = useState('');
  const [sunatOperationTypeCode, setSunatOperationTypeCode] = useState('');
  const [resolvingSupplierDoc, setResolvingSupplierDoc] = useState(false);
  const [supplierImporting, setSupplierImporting] = useState(false);
  const [supplierExporting, setSupplierExporting] = useState(false);
  const [showQuickSupplierPopup, setShowQuickSupplierPopup] = useState(false);
  const [submittingQuickSupplier, setSubmittingQuickSupplier] = useState(false);
  const [quickSupplierDocType, setQuickSupplierDocType] = useState('RUC');
  const [quickSupplierDocNumber, setQuickSupplierDocNumber] = useState('');
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierAddress, setQuickSupplierAddress] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');
  const [showQuickProductPopup, setShowQuickProductPopup] = useState(false);
  const [quickProductName, setQuickProductName] = useState('');
  const [quickProductSku, setQuickProductSku] = useState('');
  const [quickProductNature, setQuickProductNature] = useState<'PRODUCT' | 'SUPPLY'>('PRODUCT');
  const [quickProductCostPrice, setQuickProductCostPrice] = useState('0');
  const [quickProductSalePrice, setQuickProductSalePrice] = useState('0');
  const [quickProductInitialQty, setQuickProductInitialQty] = useState('0');
  const [quickProductStockNote, setQuickProductStockNote] = useState('Alta rápida desde Compras');
  const [quickProductSaving, setQuickProductSaving] = useState(false);

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

  const purchaseEntryHint = useMemo(() => {
    const modeLabel = priceTaxMode === 'INCLUSIVE' ? 'con IGV incluido' : 'sin IGV incluido';
    const countLabel = rows.length === 1 ? 'item' : 'items';

    if (rows.length === 0) {
      return `Agrega productos para armar el detalle. El costo se captura ${modeLabel} y se normaliza a costo neto internamente.`;
    }

    return `${rows.length} ${countLabel} en el detalle. El costo se captura ${modeLabel} y se normaliza a costo neto internamente.`;
  }, [priceTaxMode, rows.length]);

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

  const normalizedDraftLotCode = useMemo(() => draftItem.lot_code.trim().toUpperCase(), [draftItem.lot_code]);
  const availableDraftLots = useMemo(() => {
    const map = new Map<string, InventoryLotRow>();

    draftProductLots.forEach((lot) => {
      const key = String(lot.lot_code ?? '').trim().toUpperCase();
      if (!key) {
        return;
      }

      const current = map.get(key);
      if (!current) {
        map.set(key, lot);
        return;
      }

      const currentMovedAt = Date.parse(String(current.received_at ?? ''));
      const candidateMovedAt = Date.parse(String(lot.received_at ?? ''));
      if (Number.isFinite(candidateMovedAt) && (!Number.isFinite(currentMovedAt) || candidateMovedAt > currentMovedAt)) {
        map.set(key, lot);
      }
    });

    return Array.from(map.values());
  }, [draftProductLots]);
  const selectedDraftLot = useMemo(
    () => availableDraftLots.find((lot) => String(lot.lot_code ?? '').trim().toUpperCase() === normalizedDraftLotCode) ?? null,
    [availableDraftLots, normalizedDraftLotCode]
  );

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

  async function downloadSupplierTemplate() {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const dataSheet = XLSX.utils.aoa_to_sheet([
        SUPPLIER_BULK_TEMPLATE_HEADERS,
        ['RUC', '20123456789', 'Proveedor ejemplo SAC', 'Av. Principal 123 - Lima', '987654321', 'import'],
      ]);
      dataSheet['!cols'] = [
        { wch: 18 },
        { wch: 22 },
        { wch: 42 },
        { wch: 42 },
        { wch: 18 },
        { wch: 14 },
      ];

      const instructionsSheet = XLSX.utils.aoa_to_sheet([
        ['CAMPO', 'REGLA'],
        ['TIPO_DOCUMENTO', 'Opcional: RUC, DNI, CE, PAS. Si va vacío se infiere por longitud del documento.'],
        ['NUMERO_DOCUMENTO', 'Obligatorio. No se importan duplicados por documento.'],
        ['RAZON_SOCIAL', 'Obligatorio.'],
        ['DIRECCION', 'Opcional.'],
        ['TELEFONO', 'Opcional.'],
        ['ORIGEN', 'Opcional. Por defecto: import.'],
      ]);
      instructionsSheet['!cols'] = [{ wch: 24 }, { wch: 90 }];

      XLSX.utils.book_append_sheet(workbook, dataSheet, 'PROVEEDORES');
      XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'INSTRUCCIONES');
      XLSX.writeFile(workbook, 'formato_importacion_proveedores.xlsx');
      setMessage('Formato de proveedores descargado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo descargar formato de proveedores.');
    }
  }

  async function exportSuppliersXlsx() {
    setSupplierExporting(true);
    setMessage('');

    try {
      const rows = await fetchSuppliersCatalog(accessToken, { limit: 10000 });
      const XLSX = await import('xlsx');

      const sheetRows = rows.map((row) => ({
        TIPO_DOCUMENTO: row.doc_type ?? '',
        NUMERO_DOCUMENTO: row.doc_number ?? '',
        RAZON_SOCIAL: row.name ?? '',
        DIRECCION: row.address ?? '',
        TELEFONO: row.phone ?? '',
        ORIGEN: row.source ?? '',
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Proveedores');
      XLSX.writeFile(workbook, `proveedores_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
      setMessage(`Exportación completada: ${rows.length} proveedores.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar proveedores.');
    } finally {
      setSupplierExporting(false);
    }
  }  

  async function handleSupplierImportFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setSupplierImporting(true);
    setMessage('');

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      if (!firstSheet) {
        throw new Error('El archivo no contiene una hoja válida.');
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
      const rows = normalizeSupplierImportRows(rawRows);

      if (rows.length === 0) {
        throw new Error('No se encontraron filas válidas para importar.');
      }

      let created = 0;
      let skipped = 0;
      let firstError = '';
      const chunks: SupplierBulkImportRow[][] = [];
      for (let index = 0; index < rows.length; index += 500) {
        chunks.push(rows.slice(index, index + 500));
      }

      for (const chunk of chunks) {
        const response = await importSuppliersBulk(accessToken, chunk);
        created += Number(response.summary.created ?? 0);
        skipped += Number(response.summary.skipped ?? 0);
        if (!firstError && response.errors.length > 0) {
          firstError = response.errors[0].message;
        }
      }

      setMessage(`Importación proveedores: ${created} creados, ${skipped} omitidos.${firstError ? ` Primer error: ${firstError}` : ''}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo importar proveedores.');
    } finally {
      setSupplierImporting(false);
    }
  }

  useEffect(() => {
    if (!lotTrackingEnabled || !warehouseId || !draftItem.product_id) {
      setDraftProductLots([]);
      return;
    }

    let canceled = false;

    const loadLots = async () => {
      try {
        const rows = await fetchInventoryLots(accessToken, {
          warehouseId,
          productId: draftItem.product_id,
          onlyWithStock: false,
        });
        if (canceled) {
          return;
        }
        setDraftProductLots(rows);
      } catch {
        if (canceled) {
          return;
        }
        setDraftProductLots([]);
      }
    };

    void loadLots();

    return () => {
      canceled = true;
    };
  }, [accessToken, draftItem.product_id, lotTrackingEnabled, warehouseId]);

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

  async function reloadProductsCatalogAndPick(productId: number) {
    const refreshed = await fetchInventoryProducts(accessToken, { status: 1 });
    const stockable = refreshed.filter((row) => row.is_stockable);
    setProducts(stockable);

    const picked = stockable.find((row) => row.id === productId) ?? null;
    if (picked) {
      chooseProductForDraft(picked);
    }
  }

  function openQuickProductPopup() {
    setQuickProductName(draftItem.product_query.trim());
    setQuickProductSku('');
    setQuickProductNature(isRestaurant ? 'SUPPLY' : 'PRODUCT');
    setQuickProductCostPrice(draftItem.unit_cost || '0');
    setQuickProductSalePrice('0');
    setQuickProductInitialQty((Number(draftItem.qty) > 0 ? String(draftItem.qty) : '0'));
    setQuickProductStockNote('Alta rápida desde Compras');
    setShowQuickProductPopup(true);
  }

  async function handleQuickCreateProduct() {
    const name = quickProductName.trim();
    if (!name) {
      setMessage('Ingresa un nombre para crear el producto rápido.');
      return;
    }

    const costPrice = Number(quickProductCostPrice || 0);
    const salePrice = Number(quickProductSalePrice || 0);
    const initialQty = Number(quickProductInitialQty || 0);
    if (
      !Number.isFinite(costPrice)
      || costPrice < 0
      || !Number.isFinite(salePrice)
      || salePrice < 0
      || !Number.isFinite(initialQty)
      || initialQty < 0
    ) {
      setMessage('Costo, precio de venta y stock inicial deben ser números válidos mayores o iguales a cero.');
      return;
    }

    setQuickProductSaving(true);
    setMessage('');
    try {
      const created = await createInventoryProduct(accessToken, {
        name,
        sku: quickProductSku.trim() || null,
        product_nature: quickProductNature,
        cost_price: costPrice,
        sale_price: salePrice,
        is_stockable: true,
        lot_tracking: false,
        has_expiration: false,
        status: 1,
        initial_qty: initialQty,
        initial_cost: costPrice,
        warehouse_id: warehouseId,
        stock_note: quickProductStockNote.trim() || null,
      });

      await reloadProductsCatalogAndPick(created.id);
      setShowQuickProductPopup(false);
      setMessage('Producto creado y seleccionado en el borrador.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el producto rápido');
    } finally {
      setQuickProductSaving(false);
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
    setPriceTaxMode('INCLUSIVE');
    setDraftItem(buildEmptyRow(1, 'INCLUSIVE'));
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
    const defaultRowPriceTaxMode = normalizePurchasePriceTaxMode(metadata.price_tax_mode, 'INCLUSIVE');

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
    setPriceTaxMode(defaultRowPriceTaxMode);
    setRows(items.map((item, idx) => {
      const itemMetadata = (item.metadata ?? {}) as Record<string, unknown>;
      const taxRate = Number(item.tax_rate ?? 0);
      const storedNetUnitCost = Number(item.unit_cost ?? 0);
      const storedInputUnitCost = Number(itemMetadata.unit_cost_input ?? Number.NaN);
      const visibleUnitCost = Number.isFinite(storedInputUnitCost)
        ? storedInputUnitCost
        : (defaultRowPriceTaxMode === 'INCLUSIVE'
          ? resolvePurchaseUnitCostGross(storedNetUnitCost, taxRate)
          : storedNetUnitCost);

      return {
        key: `edit-${entry.id}-${idx + 1}`,
        product_id: Number(item.product_id),
        lot_id: item.lot_id ?? null,
        product_query: item.product_name,
        qty: String(Number(item.qty ?? 0)),
        unit_cost: visibleUnitCost.toFixed(INTERNAL_UNIT_COST_DECIMALS),
        discount_total: Number(item.discount_total ?? itemMetadata.discount_total ?? 0).toFixed(2),
        is_free_operation: Boolean(itemMetadata.is_free_operation),
        lot_code: item.lot_code ?? '',
        manufacture_at: '',
        expires_at: '',
        tax_category_id: item.tax_category_id ?? undefined,
        tax_rate: taxRate,
        price_tax_mode: defaultRowPriceTaxMode,
      };
    }));
    setDraftItem(buildEmptyRow(items.length + 1, defaultRowPriceTaxMode));
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

  function handleDraftLotCodeChange(value: string) {
    const normalized = value.trim().toUpperCase();
    const matched = availableDraftLots.find((lot) => String(lot.lot_code ?? '').trim().toUpperCase() === normalized) ?? null;

    updateDraftItem({
      lot_code: value,
      lot_id: matched ? Number(matched.id) : null,
      manufacture_at: matched && expiryTrackingEnabled ? (matched.manufacture_at ?? '') : draftItem.manufacture_at,
      expires_at: matched && expiryTrackingEnabled ? (matched.expires_at ?? '') : draftItem.expires_at,
    });
  }

  function handleDraftLotSelection(value: string) {
    if (value === '') {
      updateDraftItem({ lot_id: null });
      return;
    }

    const lotId = Number(value);
    const matched = availableDraftLots.find((lot) => Number(lot.id) === lotId) ?? null;
    if (!matched) {
      return;
    }

    updateDraftItem({
      lot_id: Number(matched.id),
      lot_code: matched.lot_code,
      manufacture_at: expiryTrackingEnabled ? (matched.manufacture_at ?? '') : draftItem.manufacture_at,
      expires_at: expiryTrackingEnabled ? (matched.expires_at ?? '') : draftItem.expires_at,
    });
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

  async function handleQuickCreateSupplier() {
    const legalName = quickSupplierName.trim();
    const docNumber = sanitizeQuickSupplierDocNumber(quickSupplierDocNumber);

    if (!legalName) {
      setMessage('Ingrese nombre o razón social para crear proveedor rápido.');
      return;
    }

    const docValidationError = validateQuickSupplierDocNumber(quickSupplierDocType, docNumber);
    if (docValidationError) {
      setMessage(docValidationError);
      return;
    }

    setSubmittingQuickSupplier(true);
    setMessage('');

    try {
      const response = await importSuppliersBulk(accessToken, [
        {
          doc_type: quickSupplierDocType,
          doc_number: docNumber,
          legal_name: legalName,
          address: quickSupplierAddress.trim() || undefined,
          phone: quickSupplierPhone.trim() || undefined,
          source: 'quick',
        },
      ]);

      if ((response.summary.errors ?? 0) > 0 && response.errors.length > 0) {
        throw new Error(response.errors[0].message);
      }

      const rows = await fetchSupplierAutocomplete(accessToken, docNumber);
      const picked = rows.find((row) => String(row.doc_number ?? '').trim().toUpperCase() === docNumber) ?? rows[0] ?? null;
      if (picked) {
        chooseSupplier(picked);
      }

      setQuickSupplierDocType('RUC');
      setQuickSupplierDocNumber('');
      setQuickSupplierName('');
      setQuickSupplierAddress('');
      setQuickSupplierPhone('');
      setShowQuickSupplierPopup(false);

      if ((response.summary.created ?? 0) > 0) {
        setMessage('Proveedor rápido creado correctamente.');
      } else {
        setMessage('Proveedor ya existía. Se seleccionó en el formulario.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear proveedor rápido');
    } finally {
      setSubmittingQuickSupplier(false);
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
        setMessage('Para este tipo de documento la cantidad debe ser mayor a 0.');
      } else if (!Number.isFinite(Number(resolvedDraft.unit_cost)) || Number(resolvedDraft.unit_cost) < 0) {
        setMessage('Ingresa un costo unitario valido (0 o mayor).');
      } else {
        setMessage('Completa los datos requeridos para agregar el item.');
      }
      return;
    }

    setMessage('');

    const resolvedUnitCost = Number(resolvedDraft.unit_cost ?? 0);

    setRows((prev) => [
      ...prev,
      {
        ...resolvedDraft,
        unit_cost: resolvedUnitCost.toFixed(INTERNAL_UNIT_COST_DECIMALS),
        price_tax_mode: priceTaxMode,
        key: `item-${Date.now()}-${prev.length + 1}`,
      },
    ]);

    const nextDraft = buildEmptyRow(rows.length + 2, priceTaxMode);
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
      .map((row) => {
        const resolvedPriceTaxMode = priceTaxMode;
        const resolvedInputUnitCost = row.unit_cost !== '' ? Number(row.unit_cost) : 0;
        const resolvedTaxRate = row.tax_rate ? Number(row.tax_rate) : 0;
        const resolvedUnitCostNet = resolvePurchaseUnitCostNet(resolvedInputUnitCost, resolvedTaxRate, resolvedPriceTaxMode);
        const resolvedUnitCostGross = resolvePurchaseUnitCostGross(resolvedUnitCostNet, resolvedTaxRate);
        const lineAmounts = computePurchaseLineAmounts({ ...row, price_tax_mode: resolvedPriceTaxMode });

        return {
          product_id: Number(row.product_id ?? 0),
          qty: Number(row.qty),
          unit_cost: Number.isFinite(resolvedUnitCostNet) ? resolvedUnitCostNet : undefined,
          lot_id: lotTrackingEnabled && row.lot_id ? Number(row.lot_id) : undefined,
          lot_code: lotTrackingEnabled && row.lot_code.trim() !== '' ? row.lot_code.trim() : undefined,
          manufacture_at: expiryTrackingEnabled && row.manufacture_at.trim() !== '' ? row.manufacture_at.trim() : undefined,
          expires_at: expiryTrackingEnabled && row.expires_at.trim() !== '' ? row.expires_at.trim() : undefined,
          tax_category_id: row.tax_category_id ? Number(row.tax_category_id) : undefined,
          tax_rate: row.tax_rate ? Number(row.tax_rate) : undefined,
          metadata: {
            discount_total: purchaseItemDiscountEnabled ? clampPurchaseDiscount(Number(row.discount_total) || 0, lineAmounts.grossTotal) : 0,
            is_free_operation: purchaseFreeOperationEnabled ? Boolean(row.is_free_operation) : false,
            gratuitas: purchaseFreeOperationEnabled && row.is_free_operation ? Number(lineAmounts.gratuitaTotal.toFixed(2)) : 0,
            price_tax_mode: resolvedPriceTaxMode,
            unit_cost_input: Number(resolvedInputUnitCost.toFixed(INTERNAL_UNIT_COST_DECIMALS)),
            unit_cost_net: Number(resolvedUnitCostNet.toFixed(INTERNAL_UNIT_COST_DECIMALS)),
            unit_cost_gross: Number(resolvedUnitCostGross.toFixed(INTERNAL_UNIT_COST_DECIMALS)),
            tax_rate_snapshot: Number(resolvedTaxRate.toFixed(2)),
          },
        };
      })
      .filter((row) => row.product_id > 0 && Number.isFinite(row.qty) && (entryType === 'ADJUSTMENT' ? Math.abs(row.qty) > 0 : row.qty > 0));

    if (payloadItems.length === 0) {
      setMessage('Debes ingresar al menos una linea valida con producto y cantidad.');
      return;
    }

    if (DOCUMENTARY_ENTRY_TYPES.includes(entryType)) {
      const referenceValue = referenceNo.trim();
      const supplierValue = supplierReference.trim();

      if (!referenceValue) {
        setMessage('La referencia del documento es obligatoria.');
        return;
      }

      if (!supplierValue) {
        setMessage('El proveedor/origen es obligatorio para registrar el documento.');
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
    const supplierPattern = supplierReferenceTrimmed.match(/^([A-Za-z0-9-]{4,20})\s*[-:]\s*(.+)$/);
    const supplierDocNumber = supplierPattern
      ? supplierPattern[1].toUpperCase()
      : (supplierReferenceTrimmed.match(/^([A-Za-z0-9-]{4,20})$/)?.[1]?.toUpperCase() ?? null);
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
      metadata.price_tax_mode = priceTaxMode;
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
        : (entryType === 'PURCHASE_ORDER'
            ? 'Orden de compra registrada correctamente.'
            : (entryType === 'NON_TAX_IN'
                ? 'Ingreso no tributario registrado correctamente.'
                : (entryType === 'NON_TAX_OUT' ? 'Salida no tributaria registrada correctamente.' : 'Ingreso registrado correctamente.'))));

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

        return details.map((item) => {
          const itemMetadata = (item.metadata ?? {}) as Record<string, unknown>;

          return {
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
            ModoCosto: String(itemMetadata.price_tax_mode ?? entry.metadata?.price_tax_mode ?? 'EXCLUSIVE'),
            CostoIngresado: Number(itemMetadata.unit_cost_input ?? item.unit_cost),
            CostoUnitario: Number(item.unit_cost),
            CostoUnitarioConIGV: Number(itemMetadata.unit_cost_gross ?? item.unit_cost),
            Subtotal: Number(item.subtotal),
            TipoIGV: item.tax_label,
            TasaIGV: Number(item.tax_rate),
            MontoIGV: Number(item.tax_amount),
            TotalLinea: Number(item.line_total),
            NotaLinea: item.notes ?? '',
          };
        });
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
    <section className="module-panel purchases-module">
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

      <section className="purchases-supplier-catalog" aria-label="Catalogo de proveedores">
        <h4>Catalogo de proveedores</h4>
        <p>Gestiona importación, exportación y formato de plantilla sin afectar el formulario de registro.</p>
        <div className="purchases-supplier-catalog-actions">
          <button
            type="button"
            className="btn-mini"
            onClick={() => void downloadSupplierTemplate()}
          >
            Descargar formato
          </button>
          <button
            type="button"
            className="btn-mini"
            onClick={() => supplierImportFileInputRef.current?.click()}
            disabled={supplierImporting}
          >
            {supplierImporting ? 'Importando...' : 'Importar proveedores'}
          </button>
          <button
            type="button"
            className="btn-mini"
            onClick={() => void exportSuppliersXlsx()}
            disabled={supplierExporting}
          >
            {supplierExporting ? 'Exportando...' : 'Exportar proveedores'}
          </button>
        </div>
      </section>

      {workspaceMode === 'ENTRY' && (
      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-grid-head purchases-grid-head">
          <label className="purchases-field-entry-type">
            Tipo de movimiento
            <select value={entryType} onChange={(e) => setEntryType(e.target.value as StockEntryType)} disabled={editingEntryId !== null}>
              <option value="PURCHASE_ORDER">Orden de compra</option>
              <option value="PURCHASE">Compra (ingreso)</option>
              <option value="NON_TAX_IN">Ingreso no tributario</option>
              <option value="NON_TAX_OUT">Salida no tributaria</option>
              <option value="ADJUSTMENT">Ajuste (+/-)</option>
            </select>
          </label>

          <label className="purchases-field-reference">
            Referencia
            <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value.toUpperCase())} placeholder="OC-001, Factura proveedor" />
          </label>

          <label className="with-suggest purchases-field-supplier" onBlur={handleSupplierSuggestBlur}>
            <div className="purchases-supplier-head">
              <span>Proveedor / RUC</span>
              <div className="purchases-supplier-tools">
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => void resolveSupplierFromPadron()}
                  disabled={resolvingSupplierDoc}
                >
                  {resolvingSupplierDoc ? 'Consultando...' : 'Consultar DNI/RUC'}
                </button>
              </div>
              <div className="purchases-supplier-tools">
                <button
                  type="button"
                  className="btn-mini"
                  onClick={() => setShowQuickSupplierPopup(true)}
                  disabled={isSubmitting}
                >
                  Proveedor rápido
                </button>
              </div>
            </div>
            <input
              ref={supplierImportFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(event) => void handleSupplierImportFileChange(event)}
            />
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
                    className={`suggest-item ${index === activeSupplierIndex ? 'active' : ''}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      chooseSupplier(row);
                    }}
                  >
                    <strong>{row.name}</strong>
                    <span>
                      {[row.doc_number, row.phone, row.address].filter(Boolean).join(' · ') || 'Sin datos'}
                    </span>
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
              <div className="tax-mode-toggle" role="group" aria-label="Modo de costo comercial con IGV">
                <label className="tax-mode-toggle-label">
                  <input
                    type="checkbox"
                    checked={priceTaxMode === 'INCLUSIVE'}
                    onChange={(e) => {
                      const nextMode = e.target.checked ? 'INCLUSIVE' : 'EXCLUSIVE';
                      setPriceTaxMode(nextMode);
                      setDraftItem((prev) => ({ ...prev, price_tax_mode: nextMode }));
                    }}
                  />
                  Incluye IGV en costos
                </label>
              </div>
              <span className="sales-igv-toggle-row-hint">
                {priceTaxMode === 'INCLUSIVE' ? 'Modo por defecto para items nuevos: el costo ingresado es comercial (con IGV).' : 'Modo por defecto para items nuevos: el IGV se calcula sobre el costo base.'}
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
            <header className="sales-section-head purchases-section-head">
              <h4>Lineas de compra</h4>
              <p className="purchases-entry-hint">{purchaseEntryHint}</p>
            </header>

            <div className="sales-grid-main">
              <div className={`sales-grid-row sales-grid-row-item tax-on purchases-entry-row ${(purchaseItemDiscountEnabled || purchaseFreeOperationEnabled) ? 'has-line-tools' : ''}`}>
                <label className="with-suggest sales-field-product purchases-quick-product-field">
                  <span className="purchases-quick-product-field-head">
                    <span>Producto</span>
                    <button type="button" className="btn-mini purchases-quick-product-trigger" onClick={openQuickProductPopup}>
                      Crear producto rápido
                    </button>
                  </span>
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
                  Costo unitario comercial
                  <input
                    type="number"
                    step="0.000001"
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
                  <input
                    value={draftItem.lot_code}
                    onChange={(e) => handleDraftLotCodeChange(e.target.value)}
                    placeholder="Lote o codigo"
                  />
                  {availableDraftLots.length > 0 && (
                    <select
                      className="purchases-lot-select"
                      value={draftItem.lot_id ? String(draftItem.lot_id) : ''}
                      onChange={(e) => handleDraftLotSelection(e.target.value)}
                    >
                      <option value="">Usar lote guardado (opcional)</option>
                      {availableDraftLots.map((lot) => {
                        const expires = lot.expires_at ? lot.expires_at.slice(0, 10) : 'sin venc.';
                        return (
                          <option key={lot.id} value={lot.id}>
                            {lot.lot_code} · Vence: {expires}
                          </option>
                        );
                      })}
                    </select>
                  )}
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
                              step="0.000001"
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
              <h4>Montos del comprobante</h4>
              <p className="sales-live-caption">
                <span className="sales-live-dot" aria-hidden="true" />
                Resumen automatico al escribir.
              </p>
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
              <p className="shortcut-hint">El modo de costo IGV se define para todo el comprobante; el tipo IGV sigue aplicando por linea.</p>
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
                <option value="NON_TAX_IN">Ingreso no tributario</option>
                <option value="NON_TAX_OUT">Salida no tributaria</option>
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
              <th>N°</th>
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
            {visibleReportRows.map((entry, entryIdx) => (
              <tr
                key={entry.id}
                ref={Number(entry.id) === focusReportEntryId ? focusedReportRowRef : null}
                className={Number(entry.id) === highlightedReportEntryId ? 'sales-row-focused' : ''}
              >
                <td>{(reportPage - 1) * 10 + entryIdx + 1}</td>
                <td>{entryTypeLabel(entry.entry_type)}</td>
                <td>{purchaseStatusLabel(entry.status, entry.status_label)}</td>
                <td>{formatDateTime(entry.issue_at)}</td>
                <td>{entry.reference_no ?? entry.supplier_reference ?? '-'}</td>
                <td>{entry.payment_method ?? '-'}</td>
                <td>{entry.total_items}</td>
                <td>{Number(entry.total_qty).toFixed(3)}</td>
                <td>{resolveReportEntryGrandTotal(entry).toFixed(2)}</td>
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
          <button
            type="button"
            onClick={() => setReportPage(1)}
            disabled={reportPage <= 1 || isLoadingReport}
          >
            Inicio
          </button>
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
          <button
            type="button"
            onClick={() => setReportPage(Math.max(1, reportPagination.total_pages || 1))}
            disabled={reportPage >= (reportPagination.total_pages || 1) || isLoadingReport}
          >
            Última
          </button>
        </div>
      </div>
      )}

      {detailPreviewEntry && (
        <HtmlPreviewDialog
          title="Documento de compra A4"
          subtitle={`Ingreso #${detailPreviewEntry.id} | ${formatDateTime(detailPreviewEntry.issue_at)}`}
          html={buildPurchaseDetailHtml(detailPreviewEntry, { company: companyProfile })}
          variant="wide"
          onClose={() => setDetailPreviewEntry(null)}
        />
      )}

      {showQuickProductPopup && typeof document !== 'undefined' && createPortal(
        <div className="purchases-quick-product-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowQuickProductPopup(false)}>
          <div className="purchases-quick-product-modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="purchases-quick-product-modal-head">
              <div>
              <h4>Crear nuevo producto rápido</h4>
                <p className="purchases-quick-product-modal-copy">Se registrará en catálogo y se seleccionará automáticamente en la línea de compra.</p>
              </div>
              <button
                type="button"
                className="purchases-quick-product-modal-close"
                onClick={() => setShowQuickProductPopup(false)}
                aria-label="Cerrar"
                disabled={quickProductSaving}
              >
                ×
              </button>
            </header>

            <label className="purchases-quick-product-field-control">
              <span>Nombre *</span>
              <input
                type="text"
                maxLength={180}
                value={quickProductName}
                onChange={(event) => setQuickProductName(event.target.value)}
                placeholder="Ej. Aceite 20W50"
              />
            </label>

            <div className="purchases-quick-product-modal-grid">
              <label className="purchases-quick-product-field-control">
                <span>SKU</span>
                <input
                  type="text"
                  maxLength={60}
                  value={quickProductSku}
                  onChange={(event) => setQuickProductSku(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label className="purchases-quick-product-field-control">
                <span>Naturaleza</span>
                <select
                  value={quickProductNature}
                  onChange={(event) => setQuickProductNature(event.target.value as 'PRODUCT' | 'SUPPLY')}
                >
                  <option value="PRODUCT">Producto</option>
                  <option value="SUPPLY">Insumo</option>
                </select>
              </label>
            </div>

            <div className="purchases-quick-product-modal-grid">
              <label className="purchases-quick-product-field-control">
                <span>Costo</span>
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={quickProductCostPrice}
                  onChange={(event) => setQuickProductCostPrice(event.target.value)}
                />
              </label>
              <label className="purchases-quick-product-field-control">
                <span>Precio venta</span>
                <input
                  type="number"
                  step="0.000001"
                  min="0"
                  value={quickProductSalePrice}
                  onChange={(event) => setQuickProductSalePrice(event.target.value)}
                />
              </label>
            </div>

            <div className="purchases-quick-product-modal-grid">
              <label className="purchases-quick-product-field-control">
                <span>Stock inicial inmediato</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={quickProductInitialQty}
                  onChange={(event) => setQuickProductInitialQty(event.target.value)}
                />
              </label>
              <label className="purchases-quick-product-field-control">
                <span>Nota de trazabilidad</span>
                <input
                  type="text"
                  maxLength={255}
                  value={quickProductStockNote}
                  onChange={(event) => setQuickProductStockNote(event.target.value)}
                  placeholder="Movimiento de stock inicial"
                />
              </label>
            </div>

            {warehouseId === null && Number(quickProductInitialQty || 0) > 0 && (
              <p className="purchases-quick-product-modal-warning">
                El almacén actual no está definido; deja stock inicial en 0 o selecciona un almacén antes de guardar.
              </p>
            )}

            <div className="purchases-quick-product-modal-actions">
              <button type="button" onClick={() => setShowQuickProductPopup(false)} disabled={quickProductSaving}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleQuickCreateProduct()}
                disabled={quickProductSaving || (warehouseId === null && Number(quickProductInitialQty || 0) > 0)}
              >
                {quickProductSaving ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showQuickSupplierPopup && typeof document !== 'undefined' && createPortal(
        <div className="purchases-quick-product-modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowQuickSupplierPopup(false)}>
          <div className="purchases-quick-product-modal-card" onClick={(event) => event.stopPropagation()}>
            <header className="purchases-quick-product-modal-head">
              <div>
                <h4>Crear proveedor rápido</h4>
                <p className="purchases-quick-product-modal-copy">Registra proveedor manual cuando no aparece en la búsqueda.</p>
              </div>
              <button
                type="button"
                className="purchases-quick-product-modal-close"
                onClick={() => setShowQuickSupplierPopup(false)}
                aria-label="Cerrar"
                disabled={submittingQuickSupplier}
              >
                ×
              </button>
            </header>

            <label className="purchases-quick-product-field-control">
              <span>Tipo documento</span>
              <select value={quickSupplierDocType} onChange={(event) => setQuickSupplierDocType(event.target.value)}>
                {QUICK_SUPPLIER_DOC_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="purchases-quick-product-field-control">
              <span>Número documento *</span>
              <input
                type="text"
                maxLength={20}
                value={quickSupplierDocNumber}
                onChange={(event) => setQuickSupplierDocNumber(sanitizeQuickSupplierDocNumber(event.target.value))}
                placeholder="Ej. 20123456789"
              />
            </label>

            <label className="purchases-quick-product-field-control">
              <span>Nombre / Razón social *</span>
              <input
                type="text"
                maxLength={180}
                value={quickSupplierName}
                onChange={(event) => setQuickSupplierName(event.target.value)}
                placeholder="Ej. Proveedor SAC"
              />
            </label>

            <div className="purchases-quick-product-modal-grid">
              <label className="purchases-quick-product-field-control">
                <span>Dirección</span>
                <input
                  type="text"
                  maxLength={250}
                  value={quickSupplierAddress}
                  onChange={(event) => setQuickSupplierAddress(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label className="purchases-quick-product-field-control">
                <span>Teléfono</span>
                <input
                  type="text"
                  maxLength={40}
                  value={quickSupplierPhone}
                  onChange={(event) => setQuickSupplierPhone(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
            </div>

            <div className="purchases-quick-product-modal-actions">
              <button type="button" onClick={() => setShowQuickSupplierPopup(false)} disabled={submittingQuickSupplier}>
                Cancelar
              </button>
              <button type="button" onClick={() => void handleQuickCreateSupplier()} disabled={submittingQuickSupplier}>
                {submittingQuickSupplier ? 'Guardando...' : 'Guardar proveedor'}
              </button>
            </div>
          </div>
        </div>,
        document.body
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
