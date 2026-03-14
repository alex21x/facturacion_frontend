import { useEffect, useMemo, useState } from 'react';
import { fetchInventoryProducts, fetchInventoryStock } from '../../inventory/api';
import type { InventoryProduct, InventoryStockRow } from '../../inventory/types';
import { createStockEntry, fetchStockEntries } from '../api';
import type { CreateStockEntryItemPayload, StockEntryRow, StockEntryType } from '../types';

type PurchasesViewProps = {
  accessToken: string;
  warehouseId: number | null;
};

type EntryRowDraft = {
  key: string;
  product_id: number | null;
  qty: string;
  unit_cost: string;
  lot_code: string;
  notes: string;
};

function buildEmptyRow(seed: number): EntryRowDraft {
  return {
    key: `row-${seed}-${Date.now()}`,
    product_id: null,
    qty: '',
    unit_cost: '',
    lot_code: '',
    notes: '',
  };
}

export function PurchasesView({ accessToken, warehouseId }: PurchasesViewProps) {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [stockRows, setStockRows] = useState<InventoryStockRow[]>([]);
  const [entries, setEntries] = useState<StockEntryRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const [entryType, setEntryType] = useState<StockEntryType>('PURCHASE');
  const [referenceNo, setReferenceNo] = useState('');
  const [supplierReference, setSupplierReference] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<EntryRowDraft[]>([buildEmptyRow(1)]);

  const totalQty = useMemo(() => {
    return rows.reduce((acc, row) => acc + (Number(row.qty) || 0), 0);
  }, [rows]);

  const totalAmount = useMemo(() => {
    return rows.reduce((acc, row) => acc + (Number(row.qty) || 0) * (Number(row.unit_cost) || 0), 0);
  }, [rows]);

  const productNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const product of products) {
      map.set(product.id, product.name);
    }
    return map;
  }, [products]);

  async function loadData() {
    setIsLoading(true);
    setMessage('');

    try {
      const [productData, stockData, entryData] = await Promise.all([
        fetchInventoryProducts(accessToken, { status: 1 }),
        fetchInventoryStock(accessToken, { warehouseId }),
        fetchStockEntries(accessToken, { warehouseId, limit: 40 }),
      ]);

      setProducts(productData.filter((row) => row.is_stockable));
      setStockRows(stockData);
      setEntries(entryData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar compras y stock');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, warehouseId]);

  function updateRow(key: string, patch: Partial<EntryRowDraft>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, buildEmptyRow(prev.length + 1)]);
  }

  function removeRow(key: string) {
    setRows((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((row) => row.key !== key);
    });
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
        lot_code: row.lot_code.trim() !== '' ? row.lot_code.trim() : undefined,
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
        notes: notes.trim() || undefined,
        items: payloadItems,
      });

      setRows([buildEmptyRow(1)]);
      setReferenceNo('');
      setSupplierReference('');
      setNotes('');
      setMessage('Ingreso registrado correctamente.');
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar el ingreso');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Compras e Ingresos</h3>
        <button type="button" onClick={() => void loadData()} disabled={isLoading || isSubmitting}>
          Refrescar
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <p>
        Registra ingresos por compra o ajustes de stock. El stock impacta en inventario y queda disponible para venta.
      </p>

      <form className="grid-form" onSubmit={handleSubmit}>
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
          Notas
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Detalle general del ingreso" />
        </label>

        <div className="table-wrap" style={{ gridColumn: '1 / -1' }}>
          <h4>Lineas</h4>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Costo unitario</th>
                <th>Lote (opcional)</th>
                <th>Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <select
                      value={row.product_id ?? ''}
                      onChange={(e) => updateRow(row.key, { product_id: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Seleccionar</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      value={row.qty}
                      onChange={(e) => updateRow(row.key, { qty: e.target.value })}
                      placeholder={entryType === 'ADJUSTMENT' ? 'Ej: -2 o 5' : 'Ej: 10'}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={row.unit_cost}
                      onChange={(e) => updateRow(row.key, { unit_cost: e.target.value })}
                      placeholder="0.00"
                    />
                  </td>
                  <td>
                    <input value={row.lot_code} onChange={(e) => updateRow(row.key, { lot_code: e.target.value })} placeholder="Lote nuevo" />
                  </td>
                  <td>
                    <input value={row.notes} onChange={(e) => updateRow(row.key, { notes: e.target.value })} placeholder="Observacion" />
                  </td>
                  <td>
                    <button type="button" onClick={() => removeRow(row.key)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="module-header" style={{ marginTop: '0.8rem' }}>
            <button type="button" onClick={addRow}>
              Agregar linea
            </button>
            <button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting ? 'Registrando...' : 'Registrar ingreso'}
            </button>
          </div>

          <p>
            <strong>Total cantidad:</strong> {totalQty.toFixed(3)} | <strong>Total valorizado:</strong> {totalAmount.toFixed(2)}
          </p>
        </div>
      </form>

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

      <div className="table-wrap">
        <h4>Ultimos ingresos y ajustes</h4>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Referencia</th>
              <th>Items</th>
              <th>Cantidad total</th>
              <th>Importe total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.id}</td>
                <td>{entry.entry_type === 'PURCHASE' ? 'Compra' : 'Ajuste'}</td>
                <td>{entry.issue_at}</td>
                <td>{entry.reference_no ?? entry.supplier_reference ?? '-'}</td>
                <td>{entry.total_items}</td>
                <td>{Number(entry.total_qty).toFixed(3)}</td>
                <td>{Number(entry.total_amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
