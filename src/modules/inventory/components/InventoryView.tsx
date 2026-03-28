import { useEffect, useMemo, useState } from 'react';
import {
  fetchInventoryLots,
  fetchInventoryProducts,
  fetchInventoryStock,
  fetchKardex,
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
  InventoryProDashboardResponse,
  InventoryProDailySnapshotResponse,
  InventoryProLotExpiryResponse,
  InventoryProReportType,
  InventoryProReportRequestListItem,
  InventoryProReportRequestDetail,
} from '../types';

type InvTab = 'stock' | 'lotes' | 'kardex' | 'dashboard' | 'reportes';

type InventoryViewProps = {
  accessToken: string;
  warehouseId: number | null;
};

export function InventoryView({ accessToken, warehouseId }: InventoryViewProps) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stock, setStock] = useState<InventoryStockRow[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<InvTab>('stock');

  // Kardex state
  const [kardex, setKardex] = useState<KardexRow[]>([]);
  const [kardexProductId, setKardexProductId] = useState<number | null>(null);
  const [kardexDateFrom, setKardexDateFrom] = useState('');
  const [kardexDateTo, setKardexDateTo] = useState('');
  const [kardexLoading, setKardexLoading] = useState(false);

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
  const [creatingReportRequest, setCreatingReportRequest] = useState(false);
  const [loadingReportRequests, setLoadingReportRequests] = useState(false);
  const [loadingReportRequestDetail, setLoadingReportRequestDetail] = useState(false);
  const [reportType, setReportType] = useState<InventoryProReportType>('STOCK_SNAPSHOT');
  const [reportRunAsync, setReportRunAsync] = useState(true);
  const [reportRequests, setReportRequests] = useState<InventoryProReportRequestListItem[]>([]);
  const [selectedReportRequestId, setSelectedReportRequestId] = useState<number | null>(null);
  const [selectedReportRequest, setSelectedReportRequest] = useState<InventoryProReportRequestDetail | null>(null);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');

  const totalStock = useMemo(() => {
    return stock.reduce((acc, row) => acc + Number(row.stock), 0);
  }, [stock]);

  async function loadKardex() {
    setKardexLoading(true);
    setMessage('');

    try {
      const rows = await fetchKardex(accessToken, {
        productId: kardexProductId,
        warehouseId,
        dateFrom: kardexDateFrom || undefined,
        dateTo: kardexDateTo || undefined,
        limit: 200,
      });

      setKardex(rows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar kardex');
    } finally {
      setKardexLoading(false);
    }
  }

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
      setSelectedReportRequest(response.data);
      setSelectedReportRequestId(requestId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar detalle del reporte');
    } finally {
      setLoadingReportRequestDetail(false);
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
        reportType,
        runAsync: reportRunAsync,
        filters,
      });

      await loadReportRequests();
      await loadReportRequestDetail(response.data.id);
      setMessage(`Solicitud #${response.data.id} creada en modo ${response.mode}.`);
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
    const fileName = `${filePrefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  async function handleExportDashboard() {
    setExportingDashboard(true);
    setMessage('');

    try {
      const trendRows = (dashboardData?.movement_trend ?? []).map((row) => ({
        Seccion: 'Tendencia',
        Fecha: row.snapshot_date,
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
        Bucket: row.bucket,
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
        Fecha: row.snapshot_date,
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
        Fabricacion: row.manufacture_at ?? '',
        Vencimiento: row.expires_at ?? '',
        DiasParaVencer: row.days_to_expire ?? '',
        Bucket: row.expiry_bucket ?? '',
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

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Inventory</h3>
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'kardex') {
              void loadKardex();
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
              : activeTab === 'dashboard'
                ? dashboardLoading
                : activeTab === 'reportes'
                  ? (dailySnapshotLoading || lotExpiryLoading)
                  : loading
          }
        >
          {activeTab === 'kardex'
            ? 'Refrescar Kardex'
            : activeTab === 'dashboard'
              ? 'Refrescar Dashboard'
              : activeTab === 'reportes'
                ? 'Refrescar Reportes'
                : 'Refrescar'}
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <nav className="sub-tabs">
        <button type="button" className={activeTab === 'stock' ? 'active' : ''} onClick={() => setActiveTab('stock')}>
          Stock
        </button>
        <button type="button" className={activeTab === 'lotes' ? 'active' : ''} onClick={() => setActiveTab('lotes')}>
          Lotes
        </button>
        <button
          type="button"
          className={activeTab === 'kardex' ? 'active' : ''}
          onClick={() => { setActiveTab('kardex'); void loadKardex(); }}
        >
          Kardex
        </button>
        <button
          type="button"
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => { setActiveTab('dashboard'); void loadDashboard(); }}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={activeTab === 'reportes' ? 'active' : ''}
          onClick={() => { setActiveTab('reportes'); void loadInventoryReports(); }}
        >
          Reportes
        </button>
      </nav>

      {/* ── STOCK ── */}
      {activeTab === 'stock' && (
        <>
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
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>SKU</th>
                  <th>Almacen</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {stock.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center' }}>Sin datos</td></tr>
                )}
                {stock.map((row) => (
                  <tr key={`${row.product_id}-${row.warehouse_id}`}>
                    <td>{row.product_name}</td>
                    <td>{row.sku ?? '-'}</td>
                    <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                    <td>{row.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── LOTES ── */}
      {activeTab === 'lotes' && (
        <div className="table-wrap">
          <h4>Lotes con stock</h4>
          <table>
            <thead>
              <tr>
                <th>Lote</th>
                <th>Producto</th>
                <th>Almacen</th>
                <th>Vence</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin lotes</td></tr>
              )}
              {lots.map((row) => (
                <tr key={row.id}>
                  <td>{row.lot_code}</td>
                  <td>{row.product_name}</td>
                  <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                  <td>{row.expires_at ?? '-'}</td>
                  <td>{row.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── KARDEX ── */}
      {activeTab === 'kardex' && (
        <>
          <div className="form-card">
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
            <button type="button" onClick={() => void loadKardex()} disabled={kardexLoading}>
              {kardexLoading ? 'Cargando...' : 'Buscar'}
            </button>
          </div>

          <div className="table-wrap">
            <h4>Movimientos de inventario ({kardex.length})</h4>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Lote</th>
                  <th>Almacen</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Costo unit.</th>
                  <th>Total</th>
                  <th>Referencia</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {kardex.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center' }}>Sin movimientos</td></tr>
                )}
                {kardex.map((row) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{row.moved_at}</td>
                    <td>{row.product_sku ? `[${row.product_sku}] ` : ''}{row.product_name}</td>
                    <td>{row.lot_code ?? '-'}</td>
                    <td>{row.warehouse_name ?? row.warehouse_code ?? row.warehouse_id}</td>
                    <td style={{ color: row.movement_type === 'IN' ? 'var(--color-ok)' : 'var(--color-err)', fontWeight: 600 }}>
                      {row.movement_type}
                    </td>
                    <td>{Number(row.quantity).toFixed(4)}</td>
                    <td>{Number(row.unit_cost).toFixed(4)}</td>
                    <td>{Number(row.line_total).toFixed(2)}</td>
                    <td>{row.ref_type ?? '-'}{row.ref_id ? ` #${row.ref_id}` : ''}</td>
                    <td style={{ fontSize: '0.8rem' }}>{row.notes ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
            <table>
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
                    <td>{row.snapshot_date}</td>
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
            <table>
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
            <table>
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
                    <td>{row.bucket}</td>
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
                <select value={reportType} onChange={(e) => setReportType(e.target.value as InventoryProReportType)}>
                  <option value="STOCK_SNAPSHOT">Stock Snapshot</option>
                  <option value="KARDEX_PHYSICAL">Kardex Fisico</option>
                  <option value="KARDEX_VALUED">Kardex Valorizado</option>
                  <option value="LOT_EXPIRY">Lotes por Vencimiento</option>
                  <option value="INVENTORY_CUT">Corte de Inventario</option>
                </select>
              </label>
              <label>
                Modo de ejecucion
                <select value={reportRunAsync ? 'ASYNC' : 'INLINE'} onChange={(e) => setReportRunAsync(e.target.value === 'ASYNC')}>
                  <option value="ASYNC">Asincrono</option>
                  <option value="INLINE">En linea</option>
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
            <table>
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
                    <td>{row.report_type}</td>
                    <td>{row.status}</td>
                    <td>{row.requested_at}</td>
                    <td>{row.finished_at ?? '-'}</td>
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
                <article><span>Tipo</span><strong>{selectedReportRequest.report_type}</strong></article>
                <article><span>Estado</span><strong>{selectedReportRequest.status}</strong></article>
                <article><span>Solicitado</span><strong>{selectedReportRequest.requested_at}</strong></article>
                <article><span>Finalizado</span><strong>{selectedReportRequest.finished_at ?? '-'}</strong></article>
              </div>
              {selectedReportRequest.error_message && (
                <p className="notice">{selectedReportRequest.error_message}</p>
              )}
              <div className="table-wrap">
                <h4>Resumen resultado</h4>
                <pre className="inventory-result-json">
                  {JSON.stringify(selectedReportRequest.result?.summary ?? selectedReportRequest.result ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <div className="inventory-table-head">
              <h4>Snapshot diario ({dailySnapshotData?.summary.rows ?? 0})</h4>
              <button type="button" onClick={() => void handleExportDailySnapshot()} disabled={exportingDailySnapshot || dailySnapshotLoading}>
                {exportingDailySnapshot ? 'Exportando...' : 'Exportar XLSX'}
              </button>
            </div>
            <table>
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
                    <td>{row.snapshot_date}</td>
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
            <table>
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
                    <td>{row.expires_at ?? '-'}</td>
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
