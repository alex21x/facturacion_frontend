import { useEffect, useMemo, useState } from 'react';
import { fetchInventoryLots, fetchInventoryProducts, fetchInventoryStock } from '../api';
import type { InventoryLotRow, InventoryProduct, InventoryStockRow } from '../types';

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

  const totalStock = useMemo(() => {
    return stock.reduce((acc, row) => acc + Number(row.stock), 0);
  }, [stock]);

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
        <button type="button" onClick={() => void loadInventory()} disabled={loading}>
          Refrescar
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <p>
        Vista conectada al backend con productos, stock actual y lotes con stock.
      </p>

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
    </section>
  );
}
