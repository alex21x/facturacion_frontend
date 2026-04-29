import { useEffect, useMemo, useState } from 'react';
import { fmtDateLima, fmtDateTimeLima } from '../../../shared/utils/lima';
import {
  fetchInventoryLots,
  fetchInventoryProducts,
  fetchInventoryStock,
  fetchKardex,
  fetchInventoryProductImportBatches,
  fetchInventoryProductImportBatchDetail,
  fetchInventoryProDashboard,
  fetchInventoryProDailySnapshot,
  fetchInventoryProLotExpiry,
  createInventoryProReportRequest,
  fetchInventoryProReportRequest,
  fetchInventoryProReportRequests,
} from '../api';
import type {
  InventoryLotRow,
  InventoryProduct,
  InventoryStockRow,
  KardexRow,
  KardexMeta,
  InventoryProDashboardResponse,
  InventoryProDailySnapshotResponse,
  InventoryProLotExpiryResponse,
  InventoryProReportRequestListItem,
  InventoryProReportRequestDetail,
  InventoryProductImportBatch,
  InventoryProductImportBatchDetail,
  ReportsApiReportCode,
} from '../types';
import '../inventory.css';

type InvTab = 'stock' | 'lotes' | 'ubicaciones' | 'kardex' | 'importaciones' | 'dashboard' | 'reportes';

const REF_TYPE_LABELS: Record<string, string> = {
  STOCK_ENTRY: 'Ingreso',
  PRODUCT_IMPORT: 'Importacion masiva',
  COMMERCIAL_DOCUMENT: 'Doc. Comercial',
  COMMERCIAL_DOCUMENT_VOID: 'Anulacion doc. comercial',
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: 'Entrada',
  OUT: 'Salida',
};

const STOCK_ENTRY_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  ADJUSTMENT: 'Ajuste',
  PURCHASE_ORDER: 'Orden de compra',
};

const DOCUMENT_KIND_NOTE_LABELS: Record<string, string> = {
  INVOICE: 'Factura',
  RECEIPT: 'Boleta',
  CREDIT_NOTE: 'Nota de credito',
  DEBIT_NOTE: 'Nota de debito',
  SALES_ORDER: 'Nota de pedido',
  QUOTATION: 'Cotizacion',
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  INVENTORY_STOCK_SNAPSHOT: 'Foto de stock',
  INVENTORY_KARDEX_PHYSICAL: 'Kardex fisico',
  INVENTORY_KARDEX_VALUED: 'Kardex valorizado',
  INVENTORY_LOT_EXPIRY: 'Venc. de lotes',
  INVENTORY_CUT: 'Corte de inventario',
  STOCK_SNAPSHOT: 'Foto de stock',
  KARDEX_PHYSICAL: 'Kardex fisico',
  KARDEX_VALUED: 'Kardex valorizado',
  LOT_EXPIRY: 'Venc. de lotes',
  SALES_DOCUMENTS_SUMMARY: 'Resumen de comprobantes de venta',
  SALES_SUNAT_MONITOR: 'Monitoreo SUNAT',
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'En proceso',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
};

const EXPIRY_BUCKET_LABELS: Record<string, string> = {
  EXPIRED: 'Vencido',
  DUE_7: 'Vence ≤7 dias',
  DUE_30: 'Vence ≤30 dias',
  DUE_60: 'Vence ≤60 dias',
  OK: 'Vigente',
  NO_EXPIRY: 'Sin vencimiento',
};

const IMPORT_BATCH_STATUS_LABELS: Record<string, string> = {
  PROCESSING: 'Procesando',
  COMPLETED: 'Completado',
  COMPLETED_WITH_ERRORS: 'Completado con errores',
};

function fmtDateTime(value: string | null | undefined): string {
  return fmtDateTimeLima(value);
}

function fmtDate(value: string | null | undefined): string {
  return fmtDateLima(value);
}

function fileNameTimestampLima(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const period = (get('dayPeriod') || 'AM').toUpperCase();

  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}-${get('minute')}-${get('second')}_${period}`;
}

const EXPORT_KEY_LABELS: Record<string, string> = {
  id: 'ID',
  moved_at: 'FechaHora',
  movement_type: 'Movimiento',
  quantity: 'Cantidad',
  unit_cost: 'CostoUnitario',
  line_total: 'TotalLinea',
  product_id: 'ProductoID',
  product_sku: 'SKU',
  product_name: 'Producto',
  warehouse_id: 'AlmacenID',
  warehouse_code: 'AlmacenCodigo',
  warehouse_name: 'Almacen',
  lot_id: 'LoteID',
  lot_code: 'Lote',
  ref_type: 'ReferenciaTipo',
  ref_id: 'ReferenciaID',
  snapshot_date: 'Fecha',
  expires_at: 'Vencimiento',
  manufacture_at: 'Fabricacion',
  expiry_bucket: 'Bucket',
  days_to_expire: 'DiasParaVencer',
};

function humanizeInventoryNote(note: string | null | undefined): string {
  const raw = (note ?? '').trim();
  if (!raw) {
    return '-';
  }

  let translated = raw;
  Object.entries(DOCUMENT_KIND_NOTE_LABELS).forEach(([code, label]) => {
    translated = translated.replace(new RegExp(`\\b${code}\\b`, 'g'), label);
  });

  return translated;
}

function formatExportCell(key: string, value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (key === 'movement_type') {
    return MOVEMENT_TYPE_LABELS[value] ?? value;
  }
  if (key === 'ref_type') {
    return REF_TYPE_LABELS[value] ?? value;
  }
  if (key === 'expiry_bucket') {
    return EXPIRY_BUCKET_LABELS[value] ?? value;
  }

  if (/(moved_at|requested_at|started_at|finished_at|generated_at)$/i.test(key)) {
    return fmtDateTime(value);
  }
  if (/(snapshot_date|expires_at|manufacture_at|date_from|date_to)$/i.test(key)) {
    return fmtDate(value);
  }

  return value;
}

type InventoryViewProps = {
  accessToken: string;
  warehouseId: number | null;
  activeVerticalCode?: string | null;
  uiProfile?: 'DEFAULT' | 'RESTAURANT';
};

export function InventoryView({
  accessToken,
  warehouseId,
  activeVerticalCode = null,
  uiProfile,
}: InventoryViewProps) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<InvTab>('stock');
  const [stockQuickSearch, setStockQuickSearch] = useState('');
  const [lotQuickSearch, setLotQuickSearch] = useState('');
  const [locationQuickSearch, setLocationQuickSearch] = useState('');
  const [stockNatureFilter, setStockNatureFilter] = useState<'ALL' | 'PRODUCT' | 'SUPPLY'>('ALL');
  const [lotNatureFilter, setLotNatureFilter] = useState<'ALL' | 'PRODUCT' | 'SUPPLY'>('ALL');

  const isRestaurant = (uiProfile ?? ((activeVerticalCode ?? '').toUpperCase() === 'RESTAURANT' ? 'RESTAURANT' : 'DEFAULT')) === 'RESTAURANT';

  useEffect(() => {
    setStockNatureFilter('ALL');
    setLotNatureFilter('ALL');
  }, [isRestaurant]);

  // Kardex state
  const [kardex, setKardex] = useState<KardexRow[]>([]);
  const [kardexProductId, setKardexProductId] = useState<number | null>(null);
  const [kardexDateFrom, setKardexDateFrom] = useState('');
  const [kardexDateTo, setKardexDateTo] = useState('');
  const [kardexLoading, setKardexLoading] = useState(false);
  const [exportingKardex, setExportingKardex] = useState(false);
  const [kardexPage, setKardexPage] = useState(1);
  const [kardexPerPage] = useState(25);
  const [kardexMeta, setKardexMeta] = useState<KardexMeta>({ current_page: 1, per_page: 25, total: 0, total_pages: 1 });
  const [stockPage, setStockPage] = useState(1);
  const [stockPerPage] = useState(20);

  // Inventory Pro dashboard/report state
  const [dashboardDays, setDashboardDays] = useState(30);
  const [dashboardData, setDashboardData] = useState<InventoryProDashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dailySnapshotData, setDailySnapshotData] = useState<InventoryProDailySnapshotResponse | null>(null);
  const [dailySnapshotLoading, setDailySnapshotLoading] = useState(false);
  const [lotExpiryData, setLotExpiryData] = useState<InventoryProLotExpiryResponse | null>(null);
  const [lotExpiryLoading, setLotExpiryLoading] = useState(false);
  const [exportingDashboard, setExportingDashboard] = useState(false);
  const [exportingDailySnapshot, setExportingDailySnapshot] = useState(false);
  const [exportingLotExpiry, setExportingLotExpiry] = useState(false);
  const [exportingRequestResult, setExportingRequestResult] = useState(false);
  const [creatingReportRequest, setCreatingReportRequest] = useState(false);
  const [loadingReportRequests, setLoadingReportRequests] = useState(false);
  const [loadingReportRequestDetail, setLoadingReportRequestDetail] = useState(false);
  const [reportCode, setReportCode] = useState<ReportsApiReportCode>('INVENTORY_STOCK_SNAPSHOT');
  const [reportRequests, setReportRequests] = useState<InventoryProReportRequestListItem[]>([]);
  const [selectedReportRequestId, setSelectedReportRequestId] = useState<number | null>(null);
  const [selectedReportRequest, setSelectedReportRequest] = useState<InventoryProReportRequestDetail | null>(null);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [importBatches, setImportBatches] = useState<InventoryProductImportBatch[]>([]);
  const [importBatchesLoading, setImportBatchesLoading] = useState(false);
  const [selectedImportBatchId, setSelectedImportBatchId] = useState<number | null>(null);
  const [selectedImportBatchDetail, setSelectedImportBatchDetail] = useState<InventoryProductImportBatchDetail | null>(null);
  const [importBatchDetailLoading, setImportBatchDetailLoading] = useState(false);
  const [importBatchesPage, setImportBatchesPage] = useState(1);
  const [importBatchItemsPage, setImportBatchItemsPage] = useState(1);
  const [importBatchesPerPage] = useState(8);
  const [importBatchItemsPerPage] = useState(20);

  const normalizedLocation = (locationRaw: string | null | undefined): string => {
    const location = (locationRaw ?? '').trim();
    return location ? location.toLowerCase() : 'sin ubicacion';
  };

  const totalStock = useMemo(() => {
    return stock.reduce((acc, row) => acc + Number(row.stock), 0);
  }, [stock]);

  const productLocationById = useMemo(() => {
    const map = new Map<number, string>();
    products.forEach((product) => {
      const location = (product.location_name ?? '').trim();
      if (location) {
        map.set(product.id, location);
      }
    });
    return map;
  }, [products]);

  const productNatureById = useMemo(() => {
    const map = new Map<number, 'PRODUCT' | 'SUPPLY'>();
    products.forEach((product) => {
      map.set(product.id, product.product_nature);
    });
    return map;
  }, [products]);

  const filteredStock = useMemo(() => {
    const query = stockQuickSearch.trim().toLowerCase();
    return stock.filter((row) => {
      const nature = productNatureById.get(row.product_id);
      if (stockNatureFilter !== 'ALL' && nature !== stockNatureFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const productLocation = normalizedLocation(productLocationById.get(row.product_id));
      return [
        row.product_name,
        row.sku ?? '',
        row.warehouse_name ?? '',
        row.warehouse_code ?? '',
        productLocation,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [stock, stockQuickSearch, productLocationById, productNatureById, stockNatureFilter]);

  const filteredLots = useMemo(() => {
    const query = lotQuickSearch.trim().toLowerCase();
    return lots.filter((row) => {
      const nature = productNatureById.get(row.product_id);
      if (lotNatureFilter !== 'ALL' && nature !== lotNatureFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const productLocation = normalizedLocation(productLocationById.get(row.product_id));
      return [
        row.lot_code,
        row.product_name,
        row.sku ?? '',
        row.warehouse_name ?? '',
        row.warehouse_code ?? '',
        productLocation,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [lots, lotQuickSearch, productLocationById, productNatureById, lotNatureFilter]);

  const locationRows = useMemo(() => {
    const rows = new Map<string, {
      location: string;
      stockTotal: number;
      productIds: Set<number>;
      lotCount: number;
      warehouseCodes: Set<string>;
      skus: Set<string>;
      productNames: Set<string>;
    }>();

    const ensureLocation = (locationRaw: string | null | undefined) => {
      const location = (locationRaw ?? '').trim() || 'Sin ubicacion';
      if (!rows.has(location)) {
        rows.set(location, {
          location,
          stockTotal: 0,
          productIds: new Set<number>(),
          lotCount: 0,
          warehouseCodes: new Set<string>(),
          skus: new Set<string>(),
          productNames: new Set<string>(),
        });
      }
      return rows.get(location)!;
    };

    stock.forEach((row) => {
      const bucket = ensureLocation(productLocationById.get(row.product_id));
      bucket.stockTotal += Number(row.stock) || 0;
      bucket.productIds.add(row.product_id);
      if (row.sku) bucket.skus.add(row.sku);
      if (row.product_name) bucket.productNames.add(row.product_name);
      bucket.warehouseCodes.add(String(row.warehouse_code ?? row.warehouse_name ?? row.warehouse_id));
    });

    lots.forEach((row) => {
      const bucket = ensureLocation(productLocationById.get(row.product_id));
      bucket.lotCount += 1;
      bucket.productIds.add(row.product_id);
      if (row.sku) bucket.skus.add(row.sku);
      if (row.product_name) bucket.productNames.add(row.product_name);
      bucket.warehouseCodes.add(String(row.warehouse_code ?? row.warehouse_name ?? row.warehouse_id));
    });

    return Array.from(rows.values())
      .map((row) => ({
        location: row.location,
        stockTotal: row.stockTotal,
        productCount: row.productIds.size,
        lotCount: row.lotCount,
        warehouseList: Array.from(row.warehouseCodes).sort(),
        skuList: Array.from(row.skus).sort(),
        productNameList: Array.from(row.productNames).sort(),
      }))
      .sort((a, b) => {
        if (a.location === 'Sin ubicacion') return 1;
        if (b.location === 'Sin ubicacion') return -1;
        return a.location.localeCompare(b.location, 'es');
      });
  }, [stock, lots, productLocationById]);

  const filteredLocationRows = useMemo(() => {
    const query = locationQuickSearch.trim().toLowerCase();
    if (!query) return locationRows;

    return locationRows.filter((row) => {
      return [
        row.location,
        row.warehouseList.join(' '),
        row.skuList.join(' '),
        row.productNameList.join(' '),
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [locationRows, locationQuickSearch]);

  const stockTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredStock.length / stockPerPage)),
    [filteredStock.length, stockPerPage]
  );

  const paginatedStock = useMemo(() => {
    const start = (stockPage - 1) * stockPerPage;
    return filteredStock.slice(start, start + stockPerPage);
  }, [filteredStock, stockPage, stockPerPage]);

  useEffect(() => {
    setStockPage(1);
  }, [stockQuickSearch, stockNatureFilter, stock.length]);

  useEffect(() => {
    if (stockPage > stockTotalPages) {
      setStockPage(stockTotalPages);
    }
  }, [stockPage, stockTotalPages]);

  function openStockByLocation(location: string) {
    setStockQuickSearch(location);
    setStockPage(1);
    setActiveTab('stock');
  }

  function openLotsByLocation(location: string) {
    setLotQuickSearch(location);
    setActiveTab('lotes');
  }

  async function loadKardex(page = kardexPage) {
    setKardexLoading(true);
    setMessage('');

    try {
      const result = await fetchKardex(accessToken, {
        productId: kardexProductId,
        warehouseId,
        dateFrom: kardexDateFrom || undefined,
        dateTo: kardexDateTo || undefined,
        page,
        perPage: kardexPerPage,
      });

      setKardex(result.data);
      setKardexMeta(result.meta);
      setKardexPage(result.meta.current_page);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar kardex');
    } finally {
      setKardexLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'kardex') {
      void loadKardex(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, warehouseId]);

  async function loadDashboard() {
    setDashboardLoading(true);
    setMessage('');

    try {
      const data = await fetchInventoryProDashboard(accessToken, {
        days: dashboardDays,
        warehouseId,
      });
      setDashboardData(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar dashboard de inventario');
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadInventoryReports() {
    setDailySnapshotLoading(true);
    setLotExpiryLoading(true);
    setMessage('');

    try {
      const [daily, expiry] = await Promise.all([
        fetchInventoryProDailySnapshot(accessToken, {
          dateFrom: reportDateFrom || undefined,
          dateTo: reportDateTo || undefined,
          warehouseId,
          limit: 200,
        }),
        fetchInventoryProLotExpiry(accessToken, {
          warehouseId,
          limit: 200,
        }),
      ]);

      setDailySnapshotData(daily);
      setLotExpiryData(expiry);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar reportes de inventario');
    } finally {
      setDailySnapshotLoading(false);
      setLotExpiryLoading(false);
    }
  }

  async function loadReportRequests() {
    setLoadingReportRequests(true);

    try {
      const response = await fetchInventoryProReportRequests(accessToken, { limit: 30 });
      setReportRequests(response.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al listar solicitudes de reporte');
    } finally {
      setLoadingReportRequests(false);
    }
  }

  async function loadReportRequestDetail(requestId: number) {
    setLoadingReportRequestDetail(true);

    try {
      const response = await fetchInventoryProReportRequest(accessToken, requestId);
      setSelectedReportRequest(response);
      setSelectedReportRequestId(requestId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar detalle del reporte');
    } finally {
      setLoadingReportRequestDetail(false);
    }
  }

  async function loadImportBatches() {
    setImportBatchesLoading(true);
    setMessage('');

    try {
      const rows = await fetchInventoryProductImportBatches(accessToken, 40);
      setImportBatches(rows);
      setImportBatchesPage(1);

      if (rows.length === 0) {
        setSelectedImportBatchId(null);
        setSelectedImportBatchDetail(null);
        return;
      }

      const nextBatchId = selectedImportBatchId && rows.some((row) => row.id === selectedImportBatchId)
        ? selectedImportBatchId
        : rows[0].id;

      await loadImportBatchDetail(nextBatchId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar trazabilidad de importaciones');
    } finally {
      setImportBatchesLoading(false);
    }
  }

  async function loadImportBatchDetail(batchId: number) {
    setImportBatchDetailLoading(true);
    setMessage('');

    try {
      const detail = await fetchInventoryProductImportBatchDetail(accessToken, batchId, 800);
      setSelectedImportBatchId(batchId);
      setSelectedImportBatchDetail(detail);
      setImportBatchItemsPage(1);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar el detalle del lote de importación');
    } finally {
      setImportBatchDetailLoading(false);
    }
  }

  async function handleCreateReportRequest() {
    setCreatingReportRequest(true);
    setMessage('');

    try {
      const filters: Record<string, unknown> = {
        date_from: reportDateFrom || undefined,
        date_to: reportDateTo || undefined,
        warehouse_id: warehouseId || undefined,
      };

      const response = await createInventoryProReportRequest(accessToken, {
        reportCode,
        filters,
      });

      await loadReportRequests();
      await loadReportRequestDetail(response.request_id);
      setMessage(`Solicitud #${response.request_id} creada en cola.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la solicitud de reporte');
    } finally {
      setCreatingReportRequest(false);
    }
  }

  async function loadInventory() {
    setLoading(true);
    setMessage('');

    try {
      const [productRows, stockRows, lotRows] = await Promise.all([
        fetchInventoryProducts(accessToken),
        fetchInventoryStock(accessToken, { warehouseId }),
        fetchInventoryLots(accessToken, { warehouseId }),
      ]);

      setProducts(productRows);
      setStock(stockRows);
      setLots(lotRows);
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar Inventory';
      setMessage(text);
    } finally {
      setLoading(false);
    }
  }

  async function exportToXlsx(rows: Record<string, unknown>[], sheetName: string, filePrefix: string) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const fileName = `${filePrefix}_${fileNameTimestampLima()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  async function handleExportDashboard() {
    setExportingDashboard(true);
    setMessage('');

    try {
      const trendRows = (dashboardData?.movement_trend ?? []).map((row) => ({
        Seccion: 'Tendencia',
        Fecha: fmtDate(row.snapshot_date),
        Entradas: Number(row.qty_in),
        Salidas: Number(row.qty_out),
        ValorEntrada: Number(row.value_in),
        ValorSalida: Number(row.value_out),
      }));

      const topRows = (dashboardData?.top_products ?? []).map((row) => ({
        Seccion: 'TopProductos',
        Producto: `${row.product_sku ? `[${row.product_sku}] ` : ''}${row.product_name}`,
        Entradas: Number(row.qty_in),
        Salidas: Number(row.qty_out),
        ValorMovido: Number(row.movement_value),
      }));

      const expiryRows = (dashboardData?.expiry_buckets ?? []).map((row) => ({
        Seccion: 'Vencimientos',
        Bucket: EXPIRY_BUCKET_LABELS[row.bucket] ?? row.bucket,
        Lotes: Number(row.total_lots),
        Stock: Number(row.total_stock),
        Valor: Number(row.total_value),
      }));

      const rows = [...trendRows, ...topRows, ...expiryRows];
      if (rows.length === 0) {
        setMessage('No hay datos de dashboard para exportar.');
        return;
      }

      await exportToXlsx(rows, 'DashboardInv', 'inventory_dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar dashboard.');
    } finally {
      setExportingDashboard(false);
    }
  }

  async function handleExportDailySnapshot() {
    setExportingDailySnapshot(true);
    setMessage('');

    try {
      const rows = (dailySnapshotData?.data ?? []).map((row) => ({
        Fecha: fmtDate(row.snapshot_date),
        Almacen: row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id,
        Producto: `${row.product_sku ? `[${row.product_sku}] ` : ''}${row.product_name}`,
        Lote: row.lot_code ?? '',
        Entradas: Number(row.qty_in),
        Salidas: Number(row.qty_out),
        Neto: Number(row.qty_net),
        ValorEntrada: Number(row.value_in),
        ValorSalida: Number(row.value_out),
        ValorNeto: Number(row.value_net),
      }));

      if (rows.length === 0) {
        setMessage('No hay snapshot diario para exportar.');
        return;
      }

      await exportToXlsx(rows, 'DailySnapshot', 'inventory_daily_snapshot');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar snapshot.');
    } finally {
      setExportingDailySnapshot(false);
    }
  }

  async function handleExportLotExpiry() {
    setExportingLotExpiry(true);
    setMessage('');

    try {
      const rows = (lotExpiryData?.data ?? []).map((row) => ({
        Almacen: row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id,
        Producto: `${row.product_sku ? `[${row.product_sku}] ` : ''}${row.product_name}`,
        Lote: row.lot_code,
        Fabricacion: fmtDate(row.manufacture_at),
        Vencimiento: fmtDate(row.expires_at),
        DiasParaVencer: row.days_to_expire ?? '',
        Bucket: row.expiry_bucket ? (EXPIRY_BUCKET_LABELS[row.expiry_bucket] ?? row.expiry_bucket) : '',
        Stock: Number(row.stock),
        CostoUnitario: Number(row.unit_cost),
        ValorStock: Number(row.stock_value),
      }));

      if (rows.length === 0) {
        setMessage('No hay lotes por vencimiento para exportar.');
        return;
      }

      await exportToXlsx(rows, 'LotesVencimiento', 'inventory_lot_expiry');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar lotes por vencimiento.');
    } finally {
      setExportingLotExpiry(false);
    }
  }

  async function handleExportKardex() {
    setExportingKardex(true);
    setMessage('');

    try {
      const perPage = 200;
      const first = await fetchKardex(accessToken, {
        productId: kardexProductId,
        warehouseId,
        dateFrom: kardexDateFrom || undefined,
        dateTo: kardexDateTo || undefined,
        page: 1,
        perPage,
      });

      const totalPages = Math.max(1, Number(first.meta?.total_pages ?? 1));
      let allRows = [...(first.data ?? [])];

      for (let page = 2; page <= totalPages; page += 1) {
        const next = await fetchKardex(accessToken, {
          productId: kardexProductId,
          warehouseId,
          dateFrom: kardexDateFrom || undefined,
          dateTo: kardexDateTo || undefined,
          page,
          perPage,
        });
        allRows = allRows.concat(next.data ?? []);
      }

      if (allRows.length === 0) {
        setMessage('No hay movimientos de kardex para exportar.');
        return;
      }

      const rows = allRows.map((row) => ({
        FechaHora: fmtDateTime(row.moved_at),
        Producto: `${row.product_sku ? `[${row.product_sku}] ` : ''}${row.product_name}`,
        Lote: row.lot_code ?? '-',
        Almacen: row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id,
        Movimiento: MOVEMENT_TYPE_LABELS[row.movement_type] ?? row.movement_type,
        Cantidad: Number(row.quantity),
        StockFinal: Number(row.stock_balance ?? 0),
        CostoUnitario: Number(row.unit_cost),
        TotalLinea: Number(row.line_total),
        Referencia: row.ref_type === 'STOCK_ENTRY' && row.stock_entry_type
          ? `${STOCK_ENTRY_TYPE_LABELS[row.stock_entry_type] ?? row.stock_entry_type}${row.ref_id ? ` #${row.ref_id}` : ''}`
          : `${REF_TYPE_LABELS[row.ref_type ?? ''] ?? row.ref_type ?? '-'}${row.ref_id ? ` #${row.ref_id}` : ''}`,
        Nota: humanizeInventoryNote(row.notes),
      }));

      await exportToXlsx(rows, 'Kardex', 'inventory_kardex');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar kardex.');
    } finally {
      setExportingKardex(false);
    }
  }

  async function handleExportSelectedRequestResult() {
    setExportingRequestResult(true);
    setMessage('');

    try {
      const rawRows = (selectedReportRequest?.result_json?.rows ?? []) as Array<Record<string, unknown>>;

      if (rawRows.length === 0) {
        setMessage('La solicitud seleccionada no tiene filas para exportar.');
        return;
      }

      const rows = rawRows.map((row) => {
        const output: Record<string, unknown> = {};
        Object.entries(row).forEach(([key, value]) => {
          output[EXPORT_KEY_LABELS[key] ?? key] = formatExportCell(key, value);
        });
        return output;
      });

      const requestId = selectedReportRequest?.id ?? 'x';
      await exportToXlsx(rows, 'SolicitudReporte', `inventory_report_request_${requestId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar la solicitud de reporte.');
    } finally {
      setExportingRequestResult(false);
    }
  }

  useEffect(() => {
    void loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, warehouseId]);

  useEffect(() => {
    if (activeTab !== 'dashboard') {
      return;
    }

    void loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, accessToken, warehouseId, dashboardDays]);

  useEffect(() => {
    if (activeTab !== 'reportes') {
      return;
    }

    void loadInventoryReports();
    void loadReportRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, accessToken, warehouseId]);

  useEffect(() => {
    if (activeTab !== 'importaciones') {
      return;
    }

    void loadImportBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, accessToken]);

  const dashboardProfileLabel = useMemo(() => {
    if (!dashboardData?.profile) {
      return 'Sin perfil';
    }

    return dashboardData.profile.inventory_pro ? 'Perfil avanzado' : 'Perfil basico';
  }, [dashboardData]);

  const dashboardProfileChips = useMemo(() => {
    const profile = dashboardData?.profile;
    if (!profile) {
      return [] as string[];
    }

    return [
      profile.inventory_pro ? 'Inventory Pro: ON' : 'Inventory Pro: BASICO',
      profile.advanced_reporting ? 'Reporte avanzado' : 'Reporte base',
      profile.graphical_dashboard ? 'Dashboard grafico' : 'Dashboard base',
      profile.expiry_tracking ? 'Vencimiento activo' : 'Sin vencimiento',
    ];
  }, [dashboardData]);

  const reportProfileChips = useMemo(() => {
    const profile = dailySnapshotData?.profile ?? lotExpiryData?.profile;
    if (!profile) {
      return [] as string[];
    }

    return [
      profile.source ? `Fuente: ${profile.source}` : 'Fuente: n/a',
      profile.mode ? `Perfil: ${profile.mode}` : 'Perfil: auto',
      profile.expiry_tracking ? 'Vencimiento activo' : 'Sin vencimiento',
    ];
  }, [dailySnapshotData, lotExpiryData]);

  const importBatchesTotalPages = useMemo(
    () => Math.max(1, Math.ceil(importBatches.length / importBatchesPerPage)),
    [importBatches.length, importBatchesPerPage]
  );

  const paginatedImportBatches = useMemo(() => {
    const start = (importBatchesPage - 1) * importBatchesPerPage;
    return importBatches.slice(start, start + importBatchesPerPage);
  }, [importBatches, importBatchesPage, importBatchesPerPage]);

  const importBatchItems = selectedImportBatchDetail?.items ?? [];

  const importBatchItemsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(importBatchItems.length / importBatchItemsPerPage)),
    [importBatchItems.length, importBatchItemsPerPage]
  );

  const paginatedImportBatchItems = useMemo(() => {
    const start = (importBatchItemsPage - 1) * importBatchItemsPerPage;
    return importBatchItems.slice(start, start + importBatchItemsPerPage);
  }, [importBatchItems, importBatchItemsPage, importBatchItemsPerPage]);

  useEffect(() => {
    if (importBatchesPage > importBatchesTotalPages) {
      setImportBatchesPage(importBatchesTotalPages);
    }
  }, [importBatchesPage, importBatchesTotalPages]);

  useEffect(() => {
    if (importBatchItemsPage > importBatchItemsTotalPages) {
      setImportBatchItemsPage(importBatchItemsTotalPages);
    }
  }, [importBatchItemsPage, importBatchItemsTotalPages]);

  return (
    <section className="module-panel inventory-module">
      <div className="module-header inventory-module-header">
        <h3>{isRestaurant ? 'Bodega e Insumos' : 'Inventario'}</h3>
        <button
          className="inventory-refresh-btn"
          type="button"
          onClick={() => {
            if (activeTab === 'kardex') {
              void loadKardex();
              return;
            }

            if (activeTab === 'importaciones') {
              void loadImportBatches();
              return;
            }

            if (activeTab === 'dashboard') {
              void loadDashboard();
              return;
            }

            if (activeTab === 'reportes') {
              void loadInventoryReports();
              return;
            }

            void loadInventory();
          }}
          disabled={
            activeTab === 'kardex'
              ? kardexLoading
              : activeTab === 'importaciones'
                ? (importBatchesLoading || importBatchDetailLoading)
              : activeTab === 'dashboard'
                ? dashboardLoading
                : activeTab === 'reportes'
                  ? (dailySnapshotLoading || lotExpiryLoading)
                  : loading
          }
        >
          {activeTab === 'kardex'
            ? 'Refrescar Kardex'
            : activeTab === 'importaciones'
              ? 'Refrescar Importaciones'
            : activeTab === 'dashboard'
              ? 'Refrescar Dashboard'
              : activeTab === 'reportes'
                ? 'Refrescar Reportes'
                : 'Refrescar'}
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <nav className="sub-tabs inventory-sub-tabs" role="tablist" aria-label="Pestanas de inventario">
        <button type="button" className={activeTab === 'stock' ? 'inventory-tab-btn active' : 'inventory-tab-btn'} onClick={() => setActiveTab('stock')}>
          <span className="inventory-tab-icon" aria-hidden="true">📦</span>
          <span className="inventory-tab-label">Stock</span>
        </button>
        <button type="button" className={activeTab === 'lotes' ? 'inventory-tab-btn active' : 'inventory-tab-btn'} onClick={() => setActiveTab('lotes')}>
          <span className="inventory-tab-icon" aria-hidden="true">🏷️</span>
          <span className="inventory-tab-label">Lotes</span>
        </button>
        <button type="button" className={activeTab === 'ubicaciones' ? 'inventory-tab-btn active' : 'inventory-tab-btn'} onClick={() => setActiveTab('ubicaciones')}>
          <span className="inventory-tab-icon" aria-hidden="true">📍</span>
          <span className="inventory-tab-label">Ubicaciones</span>
        </button>
        <button
          type="button"
          className={activeTab === 'kardex' ? 'inventory-tab-btn active' : 'inventory-tab-btn'}
          onClick={() => { setActiveTab('kardex'); void loadKardex(); }}
        >
          <span className="inventory-tab-icon" aria-hidden="true">📒</span>
          <span className="inventory-tab-label">Kardex</span>
        </button>
        <button
          type="button"
          className={activeTab === 'importaciones' ? 'inventory-tab-btn active' : 'inventory-tab-btn'}
          onClick={() => { setActiveTab('importaciones'); void loadImportBatches(); }}
        >
          <span className="inventory-tab-icon" aria-hidden="true">📥</span>
          <span className="inventory-tab-label">Importaciones</span>
        </button>
        <button
          type="button"
          className={activeTab === 'dashboard' ? 'inventory-tab-btn active' : 'inventory-tab-btn'}
          onClick={() => { setActiveTab('dashboard'); void loadDashboard(); }}
        >
          <span className="inventory-tab-icon" aria-hidden="true">📈</span>
          <span className="inventory-tab-label">Dashboard</span>
        </button>
        <button
          type="button"
          className={activeTab === 'reportes' ? 'inventory-tab-btn active' : 'inventory-tab-btn'}
          onClick={() => { setActiveTab('reportes'); void loadInventoryReports(); }}
        >
          <span className="inventory-tab-icon" aria-hidden="true">📊</span>
          <span className="inventory-tab-label">Reportes</span>
        </button>
      </nav>

      {/* ── STOCK ── */}
      {activeTab === 'stock' && (
        <>
          <div className="form-card inventory-search-card">
            <h4>Buscador rapido de stock</h4>
            <div className="grid-form">
              <label>
                {isRestaurant ? 'Insumo/Producto / SKU / Bodega / Ubicacion' : 'Producto / SKU / Almacen / Ubicacion'}
                <input
                  value={stockQuickSearch}
                  onChange={(e) => setStockQuickSearch(e.target.value)}
                  placeholder="Ej. arroz, SKU001, principal, estante A1"
                />
              </label>
              <label>
                Tipo
                <select value={stockNatureFilter} onChange={(e) => setStockNatureFilter(e.target.value as 'ALL' | 'PRODUCT' | 'SUPPLY')}>
                  <option value="ALL">Todos</option>
                  <option value="SUPPLY">Insumos</option>
                  <option value="PRODUCT">Producto/Carta</option>
                </select>
              </label>
            </div>
            <div className="inventory-search-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" onClick={() => setStockQuickSearch('')} disabled={!stockQuickSearch.trim()}>
                Limpiar filtro
              </button>
            </div>
            <small className="inventory-search-results">Resultados: {filteredStock.length}</small>
          </div>
          <div className="stat-grid">
            <article>
              <span>Productos</span>
              <strong>{products.length}</strong>
            </article>
            <article>
              <span>Lotes activos</span>
              <strong>{lots.length}</strong>
            </article>
            <article>
              <span>Stock total</span>
              <strong>{totalStock.toFixed(3)}</strong>
            </article>
          </div>
          <div className="table-wrap">
            <h4>Stock por producto y almacen</h4>
            <table className="inventory-table inventory-stock-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Almacen</th>
                  <th>Ubicacion</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin datos</td></tr>
                )}
                {paginatedStock.map((row) => (
                  <tr key={`${row.product_id}-${row.warehouse_id}`}>
                    <td className="inventory-cell-product" title={row.product_name}>{row.product_name}</td>
                    <td>{row.sku ?? '-'}</td>
                    <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                    <td>{productLocationById.get(row.product_id) ?? '-'}</td>
                    <td>{row.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredStock.length > 0 && (
              <div className="module-header" style={{ marginTop: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setStockPage((p) => Math.max(1, p - 1))}
                  disabled={stockPage <= 1}
                >
                  Anterior
                </button>
                <p style={{ margin: 0 }}>
                  Página {stockPage} de {stockTotalPages} — {filteredStock.length} registros
                </p>
                <button
                  type="button"
                  onClick={() => setStockPage((p) => Math.min(stockTotalPages, p + 1))}
                  disabled={stockPage >= stockTotalPages}
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── LOTES ── */}
      {activeTab === 'lotes' && (
        <div className="table-wrap inventory-lot-search-wrap">
          <h4>{isRestaurant ? 'Lotes de insumos/productos con stock' : 'Lotes con stock'}</h4>
          <div className="grid-form inventory-search-grid" style={{ marginBottom: '0.6rem' }}>
            <label>
              Buscar por lote, producto, SKU, almacen o ubicacion
              <input
                value={lotQuickSearch}
                onChange={(e) => setLotQuickSearch(e.target.value)}
                placeholder="Ej. L001, PRODUCTO2, principal, rack B2"
              />
            </label>
            <label>
              Tipo
              <select value={lotNatureFilter} onChange={(e) => setLotNatureFilter(e.target.value as 'ALL' | 'PRODUCT' | 'SUPPLY')}>
                <option value="ALL">Todos</option>
                <option value="SUPPLY">Insumos</option>
                <option value="PRODUCT">Producto/Carta</option>
              </select>
            </label>
          </div>
          <div className="inventory-search-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
            <button type="button" onClick={() => setLotQuickSearch('')} disabled={!lotQuickSearch.trim()}>
              Limpiar filtro
            </button>
          </div>
          <small className="inventory-search-results" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>Resultados: {filteredLots.length}</small>
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Lote</th>
                <th>Producto</th>
                <th>Almacen</th>
                <th>Ubicacion</th>
                <th>Vence</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin lotes</td></tr>
              )}
              {filteredLots.map((row) => (
                <tr key={row.id}>
                  <td>{row.lot_code}</td>
                  <td>{row.product_name}</td>
                  <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                  <td>{productLocationById.get(row.product_id) ?? '-'}</td>
                  <td>{fmtDate(row.expires_at)}</td>
                  <td>{row.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── UBICACIONES ── */}
      {activeTab === 'ubicaciones' && (
        <>
          <div className="form-card inventory-search-card">
            <h4>Localizador por ubicacion fisica</h4>
            <div className="grid-form">
              <label>
                Buscar por ubicacion, producto, SKU o almacen
                <input
                  value={locationQuickSearch}
                  onChange={(e) => setLocationQuickSearch(e.target.value)}
                  placeholder="Ej. estante A1, rack frio, SKU001, principal"
                />
              </label>
            </div>
            <small className="inventory-search-results">Ubicaciones encontradas: {filteredLocationRows.length}</small>
          </div>

          <div className="stat-grid">
            <article>
              <span>Ubicaciones</span>
              <strong>{filteredLocationRows.length}</strong>
            </article>
            <article>
              <span>Productos (agregados)</span>
              <strong>{filteredLocationRows.reduce((acc, row) => acc + row.productCount, 0)}</strong>
            </article>
            <article>
              <span>Stock total</span>
              <strong>{filteredLocationRows.reduce((acc, row) => acc + row.stockTotal, 0).toFixed(3)}</strong>
            </article>
          </div>

          <div className="table-wrap">
            <h4>Mapa rapido por ubicacion</h4>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Ubicacion</th>
                  <th>Productos</th>
                  <th>Lotes</th>
                  <th>Stock</th>
                  <th>Almacenes</th>
                  <th>SKUs (muestra)</th>
                  <th>Productos (muestra)</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocationRows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center' }}>Sin coincidencias</td></tr>
                )}
                {filteredLocationRows.map((row) => (
                  <tr key={row.location}>
                    <td>{row.location}</td>
                    <td>{row.productCount}</td>
                    <td>{row.lotCount}</td>
                    <td>{row.stockTotal.toFixed(3)}</td>
                    <td>{row.warehouseList.join(', ') || '-'}</td>
                    <td>{row.skuList.slice(0, 4).join(', ') || '-'}</td>
                    <td>{row.productNameList.slice(0, 3).join(', ') || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" style={{ marginRight: '0.35rem' }} onClick={() => openStockByLocation(row.location)}>
                        Ver stock
                      </button>
                      <button type="button" onClick={() => openLotsByLocation(row.location)}>
                        Ver lotes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── KARDEX ── */}
      {activeTab === 'kardex' && (
        <>
          <div className="form-card inventory-search-card">
            <h4>Filtros de Trazabilidad</h4>
            <div className="grid-form">
              <label>
                Producto
                <select
                  value={kardexProductId ?? ''}
                  onChange={(e) => setKardexProductId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Todos los productos</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku ? `[${p.sku}] ` : ''}{p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Desde
                <input
                  type="date"
                  value={kardexDateFrom}
                  onChange={(e) => setKardexDateFrom(e.target.value)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={kardexDateTo}
                  onChange={(e) => setKardexDateTo(e.target.value)}
                />
              </label>
            </div>
            <button type="button" onClick={() => { setKardexPage(1); void loadKardex(1); }} disabled={kardexLoading}>
              {kardexLoading ? 'Cargando...' : 'Buscar'}
            </button>
            <button type="button" onClick={() => void handleExportKardex()} disabled={kardexLoading || exportingKardex} style={{ marginLeft: '0.5rem' }}>
              {exportingKardex ? 'Exportando...' : 'Exportar Excel'}
            </button>
          </div>

          <div className="table-wrap">
            <h4>Movimientos de inventario ({kardexMeta.total})</h4>
            <table className="inventory-table inventory-kardex-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th>Almacen</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Stock final</th>
                  <th>Costo unit.</th>
                  <th>Total</th>
                  <th>Referencia</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {kardex.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: 'center' }}>Sin movimientos</td></tr>
                )}
                {kardex.map((row) => (
                  <tr key={row.id}>
                    <td className="inventory-cell-datetime" title={fmtDateTime(row.moved_at)}>{fmtDateTime(row.moved_at)}</td>
                    <td className="inventory-cell-product" title={`${row.product_sku ? `[${row.product_sku}] ` : ''}${row.product_name}`}>{row.product_sku ? `[${row.product_sku}] ` : ''}{row.product_name}</td>
                    <td>{row.lot_code ?? '-'}</td>
                    <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                    <td style={{ color: row.movement_type === 'IN' ? 'var(--color-ok)' : 'var(--color-err)', fontWeight: 600 }}>
                      {MOVEMENT_TYPE_LABELS[row.movement_type] ?? row.movement_type}
                    </td>
                    <td>{`${row.movement_type === 'OUT' ? '-' : '+'}${Number(row.quantity).toFixed(4)}`}</td>
                    <td>{Number(row.stock_balance ?? 0).toFixed(4)}</td>
                    <td>{Number(row.unit_cost).toFixed(4)}</td>
                    <td>{Number(row.line_total).toFixed(2)}</td>
                    <td>
                      {row.ref_type === 'STOCK_ENTRY' && row.stock_entry_type
                        ? `${STOCK_ENTRY_TYPE_LABELS[row.stock_entry_type] ?? row.stock_entry_type}${row.ref_id ? ` #${row.ref_id}` : ''}`
                        : `${REF_TYPE_LABELS[row.ref_type ?? ''] ?? row.ref_type ?? '-'}${row.ref_id ? ` #${row.ref_id}` : ''}`}
                      {(row.stock_entry_reference_no ?? '').trim() !== '' ? ` | Ref: ${row.stock_entry_reference_no}` : ''}
                    </td>
                    <td className="inventory-cell-notes" title={humanizeInventoryNote(row.notes)} style={{ fontSize: '0.8rem' }}>{humanizeInventoryNote(row.notes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="module-header" style={{ marginTop: '0.8rem' }}>
              <button
                type="button"
                onClick={() => { const p = Math.max(1, kardexPage - 1); setKardexPage(p); void loadKardex(p); }}
                disabled={kardexPage <= 1 || kardexLoading}
              >
                Anterior
              </button>
              <p style={{ margin: 0 }}>
                Página {kardexMeta.current_page} de {Math.max(1, kardexMeta.total_pages)} — {kardexMeta.total} registros
              </p>
              <button
                type="button"
                onClick={() => { const p = Math.min(kardexMeta.total_pages || 1, kardexPage + 1); setKardexPage(p); void loadKardex(p); }}
                disabled={kardexPage >= (kardexMeta.total_pages || 1) || kardexLoading}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── IMPORTACIONES MASIVAS ── */}
      {activeTab === 'importaciones' && (
        <>
          <div className="form-card">
            <h4>Trazabilidad de Carga Masiva de Productos</h4>
            <p style={{ marginTop: '-0.2rem', color: '#6b7280', fontSize: '0.9rem' }}>
              Aquí se registra cada lote importado desde Excel y el resultado por fila (creado, actualizado u omitido).
            </p>
          </div>

          <div className="table-wrap">
            <h4>Lotes recientes ({importBatches.length})</h4>
            <table className="inventory-table inventory-import-table">
              <thead>
                <tr>
                  <th>Lote</th>
                  <th>Archivo</th>
                  <th>Usuario</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Creados</th>
                  <th>Actualizados</th>
                  <th>Omitidos</th>
                  <th>Errores</th>
                  <th>Inicio</th>
                </tr>
              </thead>
              <tbody>
                {importBatchesLoading && (
                  <tr><td colSpan={10} style={{ textAlign: 'center' }}>Cargando lotes...</td></tr>
                )}
                {!importBatchesLoading && importBatches.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center' }}>Aún no hay trazabilidad de importaciones.</td></tr>
                )}
                {!importBatchesLoading && paginatedImportBatches.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => void loadImportBatchDetail(row.id)}
                    className={selectedImportBatchId === row.id ? 'inventory-import-row is-selected' : 'inventory-import-row'}
                  >
                    <td>#{row.id}</td>
                    <td>{row.filename ?? '-'}</td>
                    <td>{row.imported_by_name?.trim() || row.imported_by_username || `Usuario #${row.imported_by}`}</td>
                    <td>{IMPORT_BATCH_STATUS_LABELS[row.status] ?? row.status}</td>
                    <td>{row.total_rows}</td>
                    <td>{row.created_count}</td>
                    <td>{row.updated_count}</td>
                    <td>{row.skipped_count}</td>
                    <td>{row.error_count}</td>
                    <td>{fmtDateTime(row.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!importBatchesLoading && importBatches.length > 0 && (
              <div className="module-header" style={{ marginTop: '0.65rem' }}>
                <button
                  type="button"
                  onClick={() => setImportBatchesPage((p) => Math.max(1, p - 1))}
                  disabled={importBatchesPage <= 1}
                >
                  Anterior
                </button>
                <p style={{ margin: 0 }}>
                  Página {importBatchesPage} de {importBatchesTotalPages} — {importBatches.length} lotes
                </p>
                <button
                  type="button"
                  onClick={() => setImportBatchesPage((p) => Math.min(importBatchesTotalPages, p + 1))}
                  disabled={importBatchesPage >= importBatchesTotalPages}
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>

          {selectedImportBatchDetail && (
            <div className="table-wrap">
              <h4>
                Detalle lote #{selectedImportBatchDetail.batch.id}
                {selectedImportBatchDetail.batch.filename ? ` - ${selectedImportBatchDetail.batch.filename}` : ''}
              </h4>
              {importBatchDetailLoading && <p>Cargando detalle...</p>}

              <table className="inventory-table inventory-import-detail-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Acción</th>
                    <th>Producto ID</th>
                    <th>SKU</th>
                    <th>Código barras</th>
                    <th>Nombre</th>
                    <th>Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {importBatchItems.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center' }}>Sin filas registradas en este lote.</td></tr>
                  )}
                  {paginatedImportBatchItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.row_number}</td>
                      <td>{item.action_status}</td>
                      <td>{item.product_id ?? '-'}</td>
                      <td>{item.sku ?? '-'}</td>
                      <td>{item.barcode ?? '-'}</td>
                      <td>{item.name ?? '-'}</td>
                      <td>{item.message ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {importBatchItems.length > 0 && (
                <div className="module-header" style={{ marginTop: '0.65rem' }}>
                  <button
                    type="button"
                    onClick={() => setImportBatchItemsPage((p) => Math.max(1, p - 1))}
                    disabled={importBatchItemsPage <= 1}
                  >
                    Anterior
                  </button>
                  <p style={{ margin: 0 }}>
                    Página {importBatchItemsPage} de {importBatchItemsTotalPages} — {importBatchItems.length} filas
                  </p>
                  <button
                    type="button"
                    onClick={() => setImportBatchItemsPage((p) => Math.min(importBatchItemsTotalPages, p + 1))}
                    disabled={importBatchItemsPage >= importBatchItemsTotalPages}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === 'dashboard' && (
        <>
          <div className="form-card">
            <h4>Dashboard de Inventario</h4>
            <div className="grid-form">
              <label>
                Ventana (dias)
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={dashboardDays}
                  onChange={(e) => setDashboardDays(Math.max(1, Math.min(180, Number(e.target.value) || 30)))}
                />
              </label>
              <label>
                Perfil
                <input type="text" value={dashboardProfileLabel} disabled />
              </label>
            </div>
            {dashboardProfileChips.length > 0 && (
              <div className="inventory-profile-chips">
                {dashboardProfileChips.map((chip) => (
                  <span key={chip} className="inventory-profile-chip">{chip}</span>
                ))}
              </div>
            )}
            <button type="button" onClick={() => void handleExportDashboard()} disabled={exportingDashboard || dashboardLoading}>
              {exportingDashboard ? 'Exportando...' : 'Exportar dashboard XLSX'}
            </button>
          </div>

          <div className="stat-grid">
            <article>
              <span>Filas de stock</span>
              <strong>{dashboardData?.summary.stock_rows ?? 0}</strong>
            </article>
            <article>
              <span>Cantidad total</span>
              <strong>{Number(dashboardData?.summary.total_qty ?? 0).toFixed(3)}</strong>
            </article>
            <article>
              <span>Valor total</span>
              <strong>{Number(dashboardData?.summary.total_value ?? 0).toFixed(2)}</strong>
            </article>
          </div>

          <div className="table-wrap">
            <h4>Tendencia de movimientos ({dashboardData?.movement_trend.length ?? 0})</h4>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Entradas</th>
                  <th>Salidas</th>
                  <th>Valor Entrada</th>
                  <th>Valor Salida</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.movement_trend ?? []).length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin movimientos en el periodo</td></tr>
                )}
                {(dashboardData?.movement_trend ?? []).map((row) => (
                  <tr key={row.snapshot_date}>
                    <td>{fmtDate(row.snapshot_date)}</td>
                    <td>{Number(row.qty_in).toFixed(3)}</td>
                    <td>{Number(row.qty_out).toFixed(3)}</td>
                    <td>{Number(row.value_in).toFixed(2)}</td>
                    <td>{Number(row.value_out).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <h4>Top productos por movimiento ({dashboardData?.top_products.length ?? 0})</h4>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Entradas</th>
                  <th>Salidas</th>
                  <th>Valor Movido</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.top_products ?? []).length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin datos para ranking</td></tr>
                )}
                {(dashboardData?.top_products ?? []).map((row) => (
                  <tr key={row.product_id}>
                    <td>{row.product_sku ? `[${row.product_sku}] ` : ''}{row.product_name}</td>
                    <td>{Number(row.qty_in).toFixed(3)}</td>
                    <td>{Number(row.qty_out).toFixed(3)}</td>
                    <td>{Number(row.movement_value).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <h4>Resumen de vencimientos ({dashboardData?.expiry_buckets.length ?? 0})</h4>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Lotes</th>
                  <th>Stock</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.expiry_buckets ?? []).length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center' }}>No aplica o no hay datos de vencimiento</td></tr>
                )}
                {(dashboardData?.expiry_buckets ?? []).map((row) => (
                  <tr key={row.bucket}>
                    <td>{EXPIRY_BUCKET_LABELS[row.bucket] ?? row.bucket}</td>
                    <td>{row.total_lots}</td>
                    <td>{Number(row.total_stock).toFixed(3)}</td>
                    <td>{Number(row.total_value).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'reportes' && (
        <>
          <div className="form-card">
            <h4>Reportes de Inventario</h4>
            <div className="grid-form">
              <label>
                Desde
                <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} />
              </label>
              <label>
                Fuente
                <input type="text" value={dailySnapshotData?.profile?.source ?? '-'} disabled />
              </label>
              <label>
                Tipo de reporte
                <select value={reportCode} onChange={(e) => setReportCode(e.target.value as ReportsApiReportCode)}>
                  <option value="INVENTORY_STOCK_SNAPSHOT">Stock Snapshot</option>
                  <option value="INVENTORY_KARDEX_PHYSICAL">Kardex Fisico</option>
                  <option value="INVENTORY_KARDEX_VALUED">Kardex Valorizado</option>
                  <option value="INVENTORY_LOT_EXPIRY">Lotes por Vencimiento</option>
                  <option value="INVENTORY_CUT">Corte de Inventario</option>
                  <option value="SALES_DOCUMENTS_SUMMARY">Ventas: Resumen de Comprobantes</option>
                  <option value="SALES_SUNAT_MONITOR">Ventas: Monitoreo SUNAT</option>
                </select>
              </label>
            </div>
            {reportProfileChips.length > 0 && (
              <div className="inventory-profile-chips">
                {reportProfileChips.map((chip) => (
                  <span key={chip} className="inventory-profile-chip">{chip}</span>
                ))}
              </div>
            )}
            <div className="inventory-actions-row">
              <button type="button" onClick={() => void loadInventoryReports()} disabled={dailySnapshotLoading || lotExpiryLoading}>
                {dailySnapshotLoading || lotExpiryLoading ? 'Cargando...' : 'Actualizar reportes'}
              </button>
              <button type="button" onClick={() => void handleCreateReportRequest()} disabled={creatingReportRequest}>
                {creatingReportRequest ? 'Generando...' : 'Generar solicitud'}
              </button>
              <button type="button" onClick={() => void loadReportRequests()} disabled={loadingReportRequests}>
                {loadingReportRequests ? 'Actualizando...' : 'Actualizar solicitudes'}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <div className="inventory-table-head">
              <h4>Solicitudes ({reportRequests.length})</h4>
            </div>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Solicitado</th>
                  <th>Finalizado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reportRequests.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin solicitudes de reporte</td></tr>
                )}
                {reportRequests.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{REPORT_TYPE_LABELS[row.report_code] ?? row.report_code}</td>
                    <td>{REPORT_STATUS_LABELS[row.status] ?? row.status}</td>
                    <td>{fmtDateTime(row.requested_at)}</td>
                    <td>{fmtDateTime(row.finished_at)}</td>
                    <td>
                      <button type="button" onClick={() => void loadReportRequestDetail(row.id)} disabled={loadingReportRequestDetail && selectedReportRequestId === row.id}>
                        {loadingReportRequestDetail && selectedReportRequestId === row.id ? 'Cargando...' : 'Ver'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedReportRequest && (
            <div className="form-card">
              <h4>Detalle solicitud #{selectedReportRequest.id}</h4>
              <div className="inventory-detail-grid">
                <article><span>Tipo</span><strong>{REPORT_TYPE_LABELS[selectedReportRequest.report_code] ?? selectedReportRequest.report_code}</strong></article>
                <article><span>Estado</span><strong>{REPORT_STATUS_LABELS[selectedReportRequest.status] ?? selectedReportRequest.status}</strong></article>
                <article><span>Solicitado</span><strong>{fmtDateTime(selectedReportRequest.requested_at)}</strong></article>
                <article><span>Finalizado</span><strong>{fmtDateTime(selectedReportRequest.finished_at)}</strong></article>
              </div>
              {selectedReportRequest.error_message && (
                <p className="notice">{selectedReportRequest.error_message}</p>
              )}
              {selectedReportRequest.status === 'COMPLETED' && selectedReportRequest.result_json?.summary && (() => {
                const s = selectedReportRequest.result_json.summary;
                const type = selectedReportRequest.report_type;
                const items: Array<{ label: string; value: string }> = [];
                if ('warehouses' in s)
                  items.push({ label: 'Almacenes', value: String(s.warehouses) });
                if ('total_rows' in s)
                  items.push({ label: 'Registros generados', value: String(s.total_rows) });
                if ('expired_rows' in s)
                  items.push({ label: 'Lotes vencidos', value: String(s.expired_rows) });
                if ('total_qty' in s)
                  items.push({ label: type === 'KARDEX_PHYSICAL' || type === 'KARDEX_VALUED' ? 'Cantidad total movida' : 'Cantidad total en stock', value: Number(s.total_qty).toFixed(3) });
                if ('total_value' in s)
                  items.push({ label: 'Valor total (S/.)', value: Number(s.total_value).toFixed(2) });
                if (selectedReportRequest.result_json.generated_at)
                  items.push({ label: 'Generado el', value: fmtDateTime(String(selectedReportRequest.result_json.generated_at)) });
                return (
                  <div className="stat-grid" style={{ marginTop: '0.75rem' }}>
                    {items.map((item) => (
                      <article key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </article>
                    ))}
                  </div>
                );
              })()}
              {selectedReportRequest.status === 'COMPLETED' && selectedReportRequest.result_json?.rows && (
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-muted)' }}>
                    El reporte contiene {(selectedReportRequest.result_json.rows as unknown[]).length} fila(s).
                  </p>
                  <button type="button" onClick={() => void handleExportSelectedRequestResult()} disabled={exportingRequestResult}>
                    {exportingRequestResult ? 'Exportando...' : 'Exportar solicitud XLSX'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="table-wrap">
            <div className="inventory-table-head">
              <h4>Movimientos por dia ({dailySnapshotData?.summary.rows ?? 0})</h4>
              <button type="button" onClick={() => void handleExportDailySnapshot()} disabled={exportingDailySnapshot || dailySnapshotLoading}>
                {exportingDailySnapshot ? 'Exportando...' : 'Exportar XLSX'}
              </button>
            </div>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th>Entradas</th>
                  <th>Salidas</th>
                  <th>Neto</th>
                  <th>Valor Neto</th>
                </tr>
              </thead>
              <tbody>
                {(dailySnapshotData?.data ?? []).length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center' }}>Sin datos para el periodo</td></tr>
                )}
                {(dailySnapshotData?.data ?? []).map((row, idx) => (
                  <tr key={`${row.snapshot_date}-${row.product_id}-${row.lot_id ?? 0}-${idx}`}>
                    <td>{fmtDate(row.snapshot_date)}</td>
                    <td>{row.product_sku ? `[${row.product_sku}] ` : ''}{row.product_name}</td>
                    <td>{row.lot_code ?? '-'}</td>
                    <td>{Number(row.qty_in).toFixed(3)}</td>
                    <td>{Number(row.qty_out).toFixed(3)}</td>
                    <td>{Number(row.qty_net).toFixed(3)}</td>
                    <td>{Number(row.value_net).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <div className="inventory-table-head">
              <h4>Lotes por vencimiento ({lotExpiryData?.summary.rows ?? 0})</h4>
              <button type="button" onClick={() => void handleExportLotExpiry()} disabled={exportingLotExpiry || lotExpiryLoading}>
                {exportingLotExpiry ? 'Exportando...' : 'Exportar XLSX'}
              </button>
            </div>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th>Vence</th>
                  <th>Dias</th>
                  <th>Bucket</th>
                  <th>Stock</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {(lotExpiryData?.data ?? []).length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center' }}>No aplica o no hay control de vencimiento</td></tr>
                )}
                {(lotExpiryData?.data ?? []).map((row) => (
                  <tr key={`${row.product_id}-${row.lot_id}`}>
                    <td>{row.product_sku ? `[${row.product_sku}] ` : ''}{row.product_name}</td>
                    <td>{row.lot_code}</td>
                    <td>{fmtDate(row.expires_at)}</td>
                    <td>{row.days_to_expire ?? '-'}</td>
                    <td>{row.expiry_bucket ?? '-'}</td>
                    <td>{Number(row.stock).toFixed(3)}</td>
                    <td>{Number(row.stock_value).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
