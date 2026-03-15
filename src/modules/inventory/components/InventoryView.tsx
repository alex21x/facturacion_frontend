import { useEffect, useMemo, useState } from 'react';
import { fetchInventoryLots, fetchInventoryProducts, fetchInventoryStock, fetchKardex } from '../api';
import type { InventoryLotRow, InventoryProduct, InventoryStockRow, KardexRow } from '../types';

type InvTab = 'stock' | 'lotes' | 'kardex';

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

  useEffect(() => {
    void loadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, warehouseId]);

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

            void loadInventory();
          }}
          disabled={activeTab === 'kardex' ? kardexLoading : loading}
        >
          {activeTab === 'kardex' ? 'Refrescar Kardex' : 'Refrescar'}
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
    </section>
  );
}
