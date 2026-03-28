import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchInventoryProducts, fetchInventoryStock } from '../../inventory/api';
import type { InventoryProduct, InventoryStockRow } from '../../inventory/types';
import { createStockEntry, exportPurchasesJson, fetchPurchasesLookups, fetchPurchasesReport } from '../api';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
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
};

type EntryRowDraft = {
  key: string;
  product_id: number | null;
  product_query: string;
  qty: string;
  unit_cost: string;
  lot_code: string;
  manufacture_at: string;
  expires_at: string;
  tax_category_id?: number;
  tax_rate?: number;
  notes: string;
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

function todayAsInputDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function asInputDate(value?: string | null): string {
  if (!value) {
    return todayAsInputDate();
  }

  const onlyDate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(onlyDate) ? onlyDate : todayAsInputDate();
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString('es-PE');
}

function buildPurchaseDetailHtml(entry: StockEntryRow): string {
  const details = entry.items ?? [];
  const rows = details.length > 0
    ? details.map((item) => {
        return `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.lot_code ?? '-'}</td>
            <td style="text-align:right">${Number(item.qty).toFixed(3)}</td>
            <td style="text-align:right">${Number(item.unit_cost).toFixed(4)}</td>
            <td style="text-align:right">${Number(item.subtotal).toFixed(2)}</td>
            <td>${item.tax_label || 'Sin IGV'}</td>
            <td style="text-align:right">${Number(item.tax_rate).toFixed(2)}%</td>
            <td style="text-align:right">${Number(item.tax_amount).toFixed(2)}</td>
            <td style="text-align:right">${Number(item.line_total).toFixed(2)}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="9" style="text-align:center;color:#64748b">No hay detalle de items para este ingreso.</td></tr>';

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Detalle compra #${entry.id}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 16px; color: #0f172a; }
      h2 { margin: 0 0 6px; }
      .meta { margin: 0 0 12px; color: #475569; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; }
      th { background: #e2e8f0; text-align: left; }
      .totals { margin-top: 10px; width: 360px; margin-left: auto; }
      .totals td { text-align: right; }
      .totals td:first-child { text-align: left; }
      .total-row { font-weight: 700; background: #f1f5f9; }
    </style>
  </head>
  <body>
    <h2>Detalle de compra #${entry.id}</h2>
    <p class="meta">
      Tipo: ${entry.entry_type === 'PURCHASE' ? 'Compra' : 'Ajuste'} |
      Fecha: ${formatDateTime(entry.issue_at)} |
      Referencia: ${entry.reference_no ?? entry.supplier_reference ?? '-'}
    </p>

    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Lote</th>
          <th>Cantidad</th>
          <th>Costo unitario</th>
          <th>Subtotal</th>
          <th>Tipo IGV</th>
          <th>Tasa IGV</th>
          <th>IGV</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <table class="totals">
      <tbody>
        <tr><td>Cantidad total</td><td>${Number(entry.total_qty).toFixed(3)}</td></tr>
        <tr><td>Subtotal</td><td>${Number(entry.total_amount).toFixed(2)}</td></tr>
        <tr class="total-row"><td>Total ingreso</td><td>${Number(entry.total_amount).toFixed(2)}</td></tr>
      </tbody>
    </table>
  </body>
</html>`;
}

function buildEmptyRow(seed: number): EntryRowDraft {
  return {
    key: `row-${seed}-${Date.now()}`,
    product_id: null,
    product_query: '',
    qty: '1',
    unit_cost: '0',
    lot_code: '',
    manufacture_at: '',
    expires_at: '',
    tax_category_id: undefined,
    tax_rate: undefined,
    notes: '',
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

export function PurchasesView({ accessToken, warehouseId }: PurchasesViewProps) {
  const productInputRef = useRef<HTMLInputElement | null>(null);
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
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [priceTaxMode, setPriceTaxMode] = useState<PriceTaxMode>('INCLUSIVE');
  const [message, setMessage] = useState('');

  const [entryType, setEntryType] = useState<StockEntryType>('PURCHASE');
  const [referenceNo, setReferenceNo] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<EntryRowDraft[]>([]);
  const [draftItem, setDraftItem] = useState<EntryRowDraft>(buildEmptyRow(1));

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

    return products
      .filter((product) => {
        const sku = (product.sku ?? '').toLowerCase();
        const name = (product.name ?? '').toLowerCase();
        return sku.includes(query) || name.includes(query);
      })
      .slice(0, 10);
  }, [draftItem.product_query, isProductSuggestOpen, products]);

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
      const qty = Number(row.qty) || 0;
      const cost = Number(row.unit_cost) || 0;
      const taxRate = Number(row.tax_rate) || 0;
      const subtotal = qty * cost;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;
      return { subtotal, taxAmount, total, taxRate, taxCategoryId: row.tax_category_id };
    });

    const netTotal = lines.reduce((acc, line) => acc + line.subtotal, 0);
    const taxTotal = lines.reduce((acc, line) => acc + line.taxAmount, 0);
    const grandTotal = netTotal + taxTotal;

    return { netTotal, taxTotal, grandTotal };
  }, [rows]);

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
    if (workspaceMode !== 'REPORT') {
      return;
    }
    void loadReport(reportPage, reportFiltersApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPage, workspaceMode]);

  function updateDraftItem(patch: Partial<EntryRowDraft>) {
    setDraftItem((prev) => ({ ...prev, ...patch }));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function chooseProductForDraft(product: InventoryProduct) {
    updateDraftItem({
      product_id: product.id,
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

    if (expiryTrackingEnabled && product?.has_expiration && row.expires_at.trim() === '') {
      return false;
    }

    return true;
  }

  function resolveDraftProduct(row: EntryRowDraft): EntryRowDraft {
    if (row.product_id) {
      return row;
    }

    const query = normalizeSearchText(row.product_query || '');
    if (!query) {
      return row;
    }

    const exact = products.find((product) => {
      const sku = normalizeSearchText(product.sku ?? '');
      const name = normalizeSearchText(product.name ?? '');
      const combo = normalizeSearchText(`${product.sku ?? 'SIN-SKU'} - ${product.name}`);
      return query === sku || query === name || query === combo;
    });

    if (exact) {
      return {
        ...row,
        product_id: exact.id,
        product_query: `${exact.sku ?? 'SIN-SKU'} - ${exact.name}`,
      };
    }

    const filtered = products.filter((product) => {
      const sku = normalizeSearchText(product.sku ?? '');
      const name = normalizeSearchText(product.name ?? '');
      return sku.includes(query) || name.includes(query);
    });

    if (filtered.length === 1) {
      const only = filtered[0];
      return {
        ...row,
        product_id: only.id,
        product_query: `${only.sku ?? 'SIN-SKU'} - ${only.name}`,
      };
    }

    if (filtered.length > 0) {
      const first = filtered[0];
      return {
        ...row,
        product_id: first.id,
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
        setMessage('Ingresa una cantidad valida mayor a 0.');
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
    setIsProductSuggestOpen(false);
    setActiveProductIndex(-1);

    setTimeout(() => {
      productInputRef.current?.focus();
      productInputRef.current?.select();
    }, 0);
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
        lot_code: lotTrackingEnabled && row.lot_code.trim() !== '' ? row.lot_code.trim() : undefined,
        manufacture_at: expiryTrackingEnabled && row.manufacture_at.trim() !== '' ? row.manufacture_at.trim() : undefined,
        expires_at: expiryTrackingEnabled && row.expires_at.trim() !== '' ? row.expires_at.trim() : undefined,
        tax_category_id: row.tax_category_id ? Number(row.tax_category_id) : undefined,
        tax_rate: row.tax_rate ? Number(row.tax_rate) : undefined,
        notes: row.notes.trim() !== '' ? row.notes.trim() : undefined,
      }))
      .filter((row) => row.product_id > 0 && Number.isFinite(row.qty) && Math.abs(row.qty) > 0);

    if (payloadItems.length === 0) {
      setMessage('Debes ingresar al menos una linea valida con producto y cantidad.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      await createStockEntry(accessToken, {
        warehouse_id: warehouseId,
        entry_type: entryType,
        reference_no: referenceNo.trim() || undefined,
        supplier_reference: supplierReference.trim() || undefined,
        payment_method_id: paymentMethodId || undefined,
        issue_at: entryDate,
        notes: notes.trim() || undefined,
        items: payloadItems,
      });

      setRows([]);
      setDraftItem(buildEmptyRow(1));
      setReferenceNo('');
      setSupplierReference('');
      setPaymentMethodId(null);
      setEntryDate(todayAsInputDate());
      setNotes('');
      setMessage('Ingreso registrado correctamente.');
      await loadData();
      if (workspaceMode === 'REPORT') {
        await loadReport(1, reportFiltersApplied);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el ingreso');
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyReportFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...reportFiltersDraft };
    setReportFiltersApplied(next);
    setReportPage(1);
    void loadReport(1, next);
  }

  function clearReportFilters() {
    setReportFiltersDraft(initialReportFilters);
    setReportFiltersApplied(initialReportFilters);
    setReportPage(1);
    void loadReport(1, initialReportFilters);
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
        const details = entry.items ?? [];
        if (details.length === 0) {
          return [
            {
              IngresoID: entry.id,
              Tipo: entry.entry_type === 'PURCHASE' ? 'Compra' : 'Ajuste',
              Fecha: entry.issue_at,
              Referencia: entry.reference_no ?? entry.supplier_reference ?? '',
              MetodoPago: entry.payment_method ?? '',
              Producto: '',
              Lote: '',
              Cantidad: Number(entry.total_qty ?? 0),
              CostoUnitario: 0,
              Subtotal: Number(entry.total_amount ?? 0),
              TipoIGV: '',
              TasaIGV: 0,
              MontoIGV: 0,
              TotalLinea: Number(entry.total_amount ?? 0),
              NotaLinea: entry.notes ?? '',
            },
          ];
        }

        return details.map((item) => ({
          IngresoID: entry.id,
          Tipo: entry.entry_type === 'PURCHASE' ? 'Compra' : 'Ajuste',
          Fecha: entry.issue_at,
          Referencia: entry.reference_no ?? entry.supplier_reference ?? '',
          MetodoPago: entry.payment_method ?? '',
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

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Compras e Ingresos</h3>
        <div className="module-header">
          <button type="button" onClick={() => setWorkspaceMode('ENTRY')} disabled={workspaceMode === 'ENTRY'}>
            Registro de compras
          </button>
          <button
            type="button"
            onClick={() => {
              setWorkspaceMode('REPORT');
              void loadReport(1, reportFiltersApplied);
            }}
            disabled={workspaceMode === 'REPORT'}
          >
            Reporte de compras
          </button>
          <button type="button" onClick={() => void loadData()} disabled={isLoading || isSubmitting}>
            Refrescar
          </button>
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      <p>
        Registra ingresos por compra o ajustes de stock. El stock impacta en inventario y queda disponible para venta.
      </p>

      {workspaceMode === 'ENTRY' && (
      <form className="sales-form" onSubmit={handleSubmit}>
        <div className="sales-grid-head">
          <label>
            Tipo de movimiento
            <select value={entryType} onChange={(e) => setEntryType(e.target.value as StockEntryType)}>
              <option value="PURCHASE">Compra (ingreso)</option>
              <option value="ADJUSTMENT">Ajuste (+/-)</option>
            </select>
          </label>

          <label>
            Referencia
            <input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="OC-001, Factura proveedor" />
          </label>

          <label>
            Proveedor / referencia
            <input value={supplierReference} onChange={(e) => setSupplierReference(e.target.value)} placeholder="Proveedor o RUC" />
          </label>

          <label>
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

          <label>
            Fecha de compra
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(asInputDate(e.target.value))} />
          </label>
        </div>

        <div className="sales-concepts-shell">
          <section className="sales-concepts-main">
            <header className="sales-section-head">
              <div className="sales-section-head-main">
                <h4>Lineas de compra</h4>
                <div className="tax-mode-toggle" role="group" aria-label="Modo de costo IGV">
                  <label className="tax-mode-toggle-label">
                    <input
                      type="checkbox"
                      checked={priceTaxMode === 'INCLUSIVE'}
                      onChange={(e) => setPriceTaxMode(e.target.checked ? 'INCLUSIVE' : 'EXCLUSIVE')}
                    />
                    Incluye IGV
                  </label>
                </div>
              </div>
              <p>Agrega productos y arma el detalle de ingreso antes de registrar.</p>
            </header>

            <label>
              Nota general
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalle general del ingreso" />
            </label>

            <div className="sales-grid-main">
              <div className="sales-grid-row sales-grid-row-item tax-on purchases-entry-row">
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
                      updateDraftItem({ product_query: e.target.value, product_id: null });
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
                          <strong>{product.name}</strong>
                          <span>{product.sku ?? 'SIN-SKU'}</span>
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
                <label className="sales-field-context">
                  Fabricacion
                  <input type="date" value={draftItem.manufacture_at} onChange={(e) => updateDraftItem({ manufacture_at: e.target.value })} />
                </label>
                )}

                {expiryTrackingEnabled && (
                <label className="sales-field-context">
                  Vencimiento
                  <input type="date" value={draftItem.expires_at} onChange={(e) => updateDraftItem({ expires_at: e.target.value })} />
                </label>
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

                <label className="sales-field-context purchases-field-note">
                  Nota
                  <input value={draftItem.notes} onChange={(e) => updateDraftItem({ notes: e.target.value })} placeholder="Observacion" />
                </label>

                <div className="sales-field-action">
                  <button type="button" onClick={addDraftToRows}>
                    Agregar item
                  </button>
                </div>
              </div>
            </div>

            <div className="table-wrap sales-cart-wrap purchases-lines-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    {lotTrackingEnabled && <th>Lote</th>}
                    {expiryTrackingEnabled && <th>Fabricacion</th>}
                    {expiryTrackingEnabled && <th>Vencimiento</th>}
                    <th>Tipo IGV</th>
                    <th>Nota</th>
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
                    const unitCost = Number(row.unit_cost) || 0;
                    const taxRate = Number(row.tax_rate) || 0;
                    const subtotal = qty * unitCost;
                    const taxAmount = subtotal * (taxRate / 100);
                    const lineTotal = subtotal + taxAmount;

                    return (
                      <tr key={row.key}>
                        <td>{row.product_query || '-'}</td>
                        <td>{qty.toFixed(3)}</td>
                        <td>{unitCost.toFixed(4)}</td>
                        {lotTrackingEnabled && <td>{row.lot_code || '-'}</td>}
                        {expiryTrackingEnabled && <td>{row.manufacture_at || '-'}</td>}
                        {expiryTrackingEnabled && <td>{row.expires_at || '-'}</td>}
                        <td>
                          {(lookups?.tax_categories ?? []).find((cat) => cat.id === row.tax_category_id)?.label ?? 'Sin IGV'}
                        </td>
                        <td>{row.notes || '-'}</td>
                        <td>{subtotal.toFixed(2)}</td>
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
          </section>

          <aside className="sales-concepts-side" aria-live="polite">
            <header className="sales-section-head">
              <h4>Montos de la compra</h4>
              <p>Vista previa consolidada en tiempo real.</p>
            </header>

            <div className="sales-summary">
              <article>
                <span>Total cantidad</span>
                <strong>{totalQty.toFixed(3)}</strong>
              </article>
              <article>
                <span>Subtotal (neto)</span>
                <strong>{totalsWithTax.netTotal.toFixed(2)}</strong>
              </article>
              <article>
                <span>Total IGV</span>
                <strong>{totalsWithTax.taxTotal.toFixed(2)}</strong>
              </article>
              <article className="sales-tax-preview-total">
                <span>Importe Total</span>
                <strong>{totalsWithTax.grandTotal.toFixed(2)}</strong>
              </article>
            </div>

            <div className="sales-side-actions">
              <button type="submit" disabled={isSubmitting || isLoading}>
                {isSubmitting ? 'Registrando...' : 'Registrar ingreso'}
              </button>
              <p className="shortcut-hint">La seleccion de IGV viene desde base de datos y se aplica por linea.</p>
            </div>
          </aside>
        </div>
      </form>
      )}

      {workspaceMode === 'ENTRY' && (
      <div className="table-wrap">
        <h4>Stock actual para venta</h4>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Almacen</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {stockRows.map((row) => (
              <tr key={`${row.product_id}-${row.warehouse_id}`}>
                <td>{row.product_name}</td>
                <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                <td>{row.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {workspaceMode === 'REPORT' && (
      <div className="table-wrap">
        <div className="module-header">
          <h4>Reporte de compras</h4>
          <button type="button" onClick={handleExportReportXlsx} disabled={isExportingReport || isLoadingReport}>
            {isExportingReport ? 'Exportando...' : 'Exportar Excel (XLSX)'}
          </button>
        </div>

        <form className="grid-form" onSubmit={applyReportFilters} style={{ marginBottom: '0.8rem' }}>
          <label>
            Tipo
            <select
              value={reportFiltersDraft.entryType}
              onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, entryType: e.target.value as PurchasesReportFilters['entryType'] }))}
            >
              <option value="ALL">Todos</option>
              <option value="PURCHASE">Compra</option>
              <option value="ADJUSTMENT">Ajuste</option>
            </select>
          </label>

          <label>
            Referencia
            <input
              value={reportFiltersDraft.reference}
              onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="OC, factura o proveedor"
            />
          </label>

          <label>
            Fecha desde
            <input
              type="date"
              value={reportFiltersDraft.dateFrom}
              onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </label>

          <label>
            Fecha hasta
            <input
              type="date"
              value={reportFiltersDraft.dateTo}
              onChange={(e) => setReportFiltersDraft((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </label>

          <div className="module-header" style={{ gridColumn: '1 / -1' }}>
            <button type="submit" disabled={isLoadingReport}>
              Filtrar
            </button>
            <button type="button" onClick={clearReportFilters} disabled={isLoadingReport}>
              Limpiar
            </button>
          </div>
        </form>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Referencia</th>
              <th>Pago</th>
              <th>Items</th>
              <th>Cantidad</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reportRows.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.id}</td>
                <td>{entry.entry_type === 'PURCHASE' ? 'Compra' : 'Ajuste'}</td>
                <td>{formatDateTime(entry.issue_at)}</td>
                <td>{entry.reference_no ?? entry.supplier_reference ?? '-'}</td>
                <td>{entry.payment_method ?? '-'}</td>
                <td>{entry.total_items}</td>
                <td>{Number(entry.total_qty).toFixed(3)}</td>
                <td>{Number(entry.total_amount).toFixed(2)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => setDetailPreviewEntry(entry)}
                    disabled={(entry.items ?? []).length === 0}
                  >
                    Ver detalle
                  </button>
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
          html={buildPurchaseDetailHtml(detailPreviewEntry)}
          variant="wide"
          onClose={() => setDetailPreviewEntry(null)}
        />
      )}
    </section>
  );
}
