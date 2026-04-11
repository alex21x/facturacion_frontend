import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchInventoryProducts } from '../../inventory/api';
import type { InventoryProduct } from '../../inventory/types';
import { fetchCustomerAutocomplete, fetchSalesLookups, fetchSeriesNumbers } from '../../sales/api';
import type { SalesCustomerSuggestion, SalesLookups, SeriesNumber } from '../../sales/types';
import {
  createRestaurantOrder,
  fetchRestaurantOrders,
  fetchRestaurantTables,
} from '../api';
import type {
  RestaurantOrderRow,
  RestaurantTableRow,
} from '../types';

// ---------------------------------------------------------------------------
// Types local to this view
// ---------------------------------------------------------------------------

type CartItem = {
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit_id: number | null;
  tax_type: string;
  tax_rate: number;
};

type OrderStage = 'SELECT_TABLE' | 'BUILD_ORDER';

type Props = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KITCHEN_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PREP: 'En preparación',
  READY: 'Lista',
  SERVED: 'Entregada',
  CANCELLED: 'Cancelada',
};

function kitchenBadgeClass(status: string): string {
  if (status === 'READY') return 'sales-sunat-badge is-ok';
  if (status === 'IN_PREP') return 'sales-sunat-badge is-progress';
  if (status === 'SERVED') return 'sales-sunat-badge is-neutral';
  if (status === 'CANCELLED') return 'sales-sunat-badge is-bad';
  return 'sales-sunat-badge is-warn';
}

function formatCurrency(value: string | number): string {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

// ---------------------------------------------------------------------------
// Sub-component: table selector card
// ---------------------------------------------------------------------------

function TableCard({
  table,
  selected,
  onSelect,
}: {
  table: RestaurantTableRow;
  selected: boolean;
  onSelect: (table: RestaurantTableRow) => void;
}) {
  const isDisabled = table.status === 'DISABLED';
  const statusClass = table.status.toLowerCase();

  return (
    <button
      type="button"
      className={`ro-table-card ro-table-card--${statusClass} ${selected ? 'ro-table-card--selected' : ''}`}
      disabled={isDisabled}
      onClick={() => !isDisabled && onSelect(table)}
      title={isDisabled ? 'Mesa fuera de servicio' : `${table.name} — ${table.capacity} pax`}
    >
      <span className="ro-table-card__code">{table.code}</span>
      <span className="ro-table-card__name">{table.name}</span>
      <span className={`ro-table-card__status ro-table-card__status--${statusClass}`}>
        {table.status === 'AVAILABLE' ? 'Libre' :
         table.status === 'OCCUPIED' ? 'Ocupada' :
         table.status === 'RESERVED' ? 'Reservada' : 'Inactiva'}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RestaurantOrderView({ accessToken, branchId, warehouseId }: Props) {
  // ── lookups & tables ──────────────────────────────────────────────────────
  const [lookups, setLookups] = useState<SalesLookups | null>(null);
  const [tables, setTables] = useState<RestaurantTableRow[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  // ── form stage & selected table ───────────────────────────────────────────
  const [stage, setStage] = useState<OrderStage>('SELECT_TABLE');
  const [selectedTable, setSelectedTable] = useState<RestaurantTableRow | null>(null);

  // ── customer autocomplete ─────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<SalesCustomerSuggestion[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomerSuggestion | null>(null);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── product search ────────────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [productSuggestions, setProductSuggestions] = useState<InventoryProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const productDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');

  // ── form field overrides ──────────────────────────────────────────────────
  const [seriesId, setSeriesId] = useState<string>('');
  const [salesOrderSeriesList, setSalesOrderSeriesList] = useState<SeriesNumber[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [currencyId, setCurrencyId] = useState<string>('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');

  // ── active orders ─────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<RestaurantOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('');
  const [orderSearch, setOrderSearch] = useState('');

  // ── feedback ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // ── init: load lookups + tables ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingInit(true);
      try {
        const [lookupsRes, tablesRes] = await Promise.all([
          fetchSalesLookups(accessToken, { branchId }),
          fetchRestaurantTables(accessToken, { branchId }),
        ]);

        if (cancelled) return;

        setLookups(lookupsRes);
        setTables(tablesRes.data ?? []);

        // Auto-select defaults
        const defaultSeries = lookupsRes.document_kinds.find((dk) => dk.code === 'SALES_ORDER');
        if (defaultSeries) {
          // We'll pick the series from the series_numbers in lookups when available
        }

        const defaultCurrency = lookupsRes.currencies.find((c) => c.is_default) ?? lookupsRes.currencies[0];
        if (defaultCurrency) setCurrencyId(String(defaultCurrency.id));

        const defaultPm = lookupsRes.payment_methods[0];
        if (defaultPm) setPaymentMethodId(String(defaultPm.id));
      } catch {
        if (!cancelled) setMessage('No se pudo cargar la configuración inicial.');
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, branchId]);

  // ── series lookup for SALES_ORDER by branch/warehouse context ─────────────
  useEffect(() => {
    let cancelled = false;

    setSeriesLoading(true);
    void (async () => {
      try {
        const rows = await fetchSeriesNumbers(accessToken, {
          documentKind: 'SALES_ORDER',
          branchId,
          warehouseId,
        });

        if (cancelled) return;

        const enabled = (rows ?? []).filter((s) => Boolean(s.is_enabled));
        setSalesOrderSeriesList(enabled);
        setSeriesId((prev) => {
          if (prev && enabled.some((s) => s.series === prev)) {
            return prev;
          }
          return enabled[0]?.series ?? '';
        });
      } catch {
        if (!cancelled) {
          setSalesOrderSeriesList([]);
          setSeriesId('');
        }
      } finally {
        if (!cancelled) setSeriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, branchId, warehouseId]);

  // ── load active orders ────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetchRestaurantOrders(accessToken, {
        branchId,
        status: orderStatusFilter,
        search: orderSearch,
      });
      setOrders(res.data ?? []);
    } catch {
      // Silent — orders panel is secondary to the form
    } finally {
      setOrdersLoading(false);
    }
  }, [accessToken, branchId, orderStatusFilter, orderSearch]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // ── customer autocomplete ─────────────────────────────────────────────────
  useEffect(() => {
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    const q = customerQuery.trim();

    if (q.length < 2) {
      setCustomerSuggestions([]);
      return;
    }

    customerDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await fetchCustomerAutocomplete(accessToken, q);
          setCustomerSuggestions(results);
        } catch {
          setCustomerSuggestions([]);
        }
      })();
    }, 300);

    return () => {
      if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    };
  }, [accessToken, customerQuery]);

  // ── product search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    const q = productSearch.trim();

    if (q.length < 2) {
      setProductSuggestions([]);
      return;
    }

    productDebounceRef.current = setTimeout(() => {
      setLoadingProducts(true);
      void (async () => {
        try {
          const results = await fetchInventoryProducts(accessToken, {
            search: q,
            warehouseId: warehouseId ?? undefined,
            status: 1,
          });
          setProductSuggestions(results);
        } catch {
          setProductSuggestions([]);
        } finally {
          setLoadingProducts(false);
        }
      })();
    }, 300);

    return () => {
      if (productDebounceRef.current) clearTimeout(productDebounceRef.current);
    };
  }, [accessToken, productSearch, warehouseId]);

  // ── cart helpers ──────────────────────────────────────────────────────────
  const igvRate = lookups?.active_igv_rate_percent ?? 18;

  function addProductToCart(product: InventoryProduct) {
    const item: CartItem = {
      product_id: product.id,
      description: product.name,
      quantity: 1,
      unit_price: Number(product.sale_price) || 0,
      unit_id: product.unit_id ?? null,
      tax_type: 'IGV',
      tax_rate: igvRate,
    };
    setCart((prev) => [...prev, item]);
    setProductSearch('');
    setProductSuggestions([]);
  }

  function removeCartItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCartItem(index: number, field: 'quantity' | 'unit_price' | 'description', value: string) {
    setCart((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      if (field === 'quantity') return { ...item, quantity: Math.max(0.001, Number(value) || 0) };
      if (field === 'unit_price') return { ...item, unit_price: Math.max(0, Number(value) || 0) };
      return { ...item, description: value };
    }));
  }

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const base = item.quantity * item.unit_price;
      const tax = base * (item.tax_rate / 100);
      return acc + base + tax;
    }, 0);
  }, [cart]);

  // ── table selection ───────────────────────────────────────────────────────
  function selectTable(table: RestaurantTableRow) {
    setSelectedTable(table);
    setStage('BUILD_ORDER');
    setMessage('');
  }

  function cancelTable() {
    setSelectedTable(null);
    setStage('SELECT_TABLE');
    setCart([]);
    setNotes('');
    setSelectedCustomer(null);
    setCustomerQuery('');
    setMessage('');
  }

  // ── submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedTable) {
      setMessage('Selecciona una mesa para continuar.');
      return;
    }
    if (cart.length === 0) {
      setMessage('Agrega al menos un producto al pedido.');
      return;
    }
    if (!seriesId) {
      setMessage('Configura una serie para pedidos (SALES_ORDER) en maestros.');
      return;
    }
    if (!currencyId || !paymentMethodId) {
      setMessage('Configura moneda y método de pago.');
      return;
    }

    // Requires a customer — show error if none selected
    if (!selectedCustomer) {
      setMessage('Selecciona un cliente para continuar (busca "Consumidor Final" para ventas rápidas).');
      return;
    }

    setSubmitting(true);
    setMessage('');

    try {
      await createRestaurantOrder(accessToken, {
        branch_id: branchId!,
        warehouse_id: warehouseId,
        table_id: selectedTable.id,
        table_label: selectedTable.name,
        series: seriesId,
        currency_id: Number(currencyId),
        payment_method_id: Number(paymentMethodId),
        customer_id: selectedCustomer.id,
        notes: notes.trim() || undefined,
        items: cart.map((item) => ({
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit_id: item.unit_id,
          tax_type: item.tax_type,
          tax_rate: item.tax_rate,
        })),
      });

      // Reset form and refresh
      cancelTable();
      setMessage('');
      void loadOrders();
      // Refresh table statuses
      const tablesRes = await fetchRestaurantTables(accessToken, { branchId });
      setTables(tablesRes.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <section className="module-panel restaurant-panel">
        <div className="restaurant-empty-state">
          <strong>Cargando módulo de pedidos...</strong>
        </div>
      </section>
    );
  }

  return (
    <section className="module-panel restaurant-panel">

      {/* Toolbar */}
      <div className="restaurant-toolbar">
        <div className="restaurant-toolbar__intro">
          <p className="restaurant-toolbar__eyebrow">Restaurante</p>
          <h3>Pedidos de Salón</h3>
          <p className="restaurant-toolbar__copy">
            Crea órdenes por mesa. La facturación se emite al cobrar en el módulo Comercial.
          </p>
        </div>
        <div className="restaurant-toolbar__actions">
          <span className="restaurant-toolbar__context">
            Sucursal: {branchId ?? 'General'}
          </span>
          <button
            type="button"
            className="restaurant-ghost-btn"
            onClick={() => {
              void loadOrders();
              void fetchRestaurantTables(accessToken, { branchId }).then((r) => setTables(r.data ?? []));
            }}
          >
            Actualizar
          </button>
        </div>
      </div>

      {message && <p className="notice restaurant-notice">{message}</p>}

      {/* Main layout: form (left) + orders list (right) */}
      <div className="ro-layout">

        {/* ── Left: New Order Form ─────────────────────────────────────────── */}
        <div className="ro-form-panel">

          {stage === 'SELECT_TABLE' ? (
            <>
              <p className="ro-form-panel__heading">Selecciona una mesa</p>

              {tables.length === 0 ? (
                <div className="restaurant-empty-state">
                  <strong>Sin mesas registradas</strong>
                  <p>Ve a "Mesas" para crear las mesas del salón.</p>
                </div>
              ) : (
                <div className="ro-tables-grid">
                  {tables.map((table) => (
                    <TableCard
                      key={table.id}
                      table={table}
                      selected={false}
                      onSelect={selectTable}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Stage: BUILD_ORDER */
            <div className="ro-order-form">
              <div className="ro-order-form__header">
                <div>
                  <p className="ro-form-panel__heading">
                    Mesa: {selectedTable?.code} — {selectedTable?.name}
                  </p>
                  <p className="ro-order-form__cap">{selectedTable?.capacity} pax</p>
                </div>
                <button type="button" className="restaurant-ghost-btn" onClick={cancelTable}>
                  Cambiar mesa
                </button>
              </div>

              {/* Series / Currency / Payment (collapsible row) */}
              <div className="ro-config-row">
                <label className="ro-field">
                  <span>Serie</span>
                  <select
                    className="restaurant-input"
                    value={seriesId}
                    onChange={(e) => setSeriesId(e.target.value)}
                    disabled={seriesLoading || salesOrderSeriesList.length === 0}
                  >
                    {seriesLoading && <option value="">Cargando series...</option>}
                    {!seriesLoading && salesOrderSeriesList.length === 0 && (
                      <option value="">Sin series activas</option>
                    )}
                    {salesOrderSeriesList.map((s) => (
                      <option key={s.id ?? s.series} value={s.series}>{s.series}</option>
                    ))}
                  </select>
                </label>

                <label className="ro-field">
                  <span>Moneda</span>
                  <select className="restaurant-input" value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}>
                    {lookups?.currencies.map((c) => (
                      <option key={c.id} value={c.id}>{c.symbol} {c.code}</option>
                    ))}
                  </select>
                </label>

                <label className="ro-field">
                  <span>Pago</span>
                  <select className="restaurant-input" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                    {lookups?.payment_methods.map((pm) => (
                      <option key={pm.id} value={pm.id}>{pm.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {!seriesLoading && salesOrderSeriesList.length === 0 && (
                <p className="notice" style={{ marginTop: '0.25rem' }}>
                  No hay series activas para SALES_ORDER en esta sucursal/almacen. Configura una en Maestros &gt; Series.
                </p>
              )}

              {/* Customer */}
              <div className="ro-customer-row">
                <label className="ro-field ro-field--wide" style={{ position: 'relative' }}>
                  <span>Cliente</span>
                  <input
                    className="restaurant-input"
                    placeholder='Busca o escribe "Consumidor Final"'
                    value={selectedCustomer ? selectedCustomer.name : customerQuery}
                    onChange={(e) => {
                      setSelectedCustomer(null);
                      setCustomerQuery(e.target.value);
                    }}
                  />
                  {customerSuggestions.length > 0 && !selectedCustomer && (
                    <div className="ro-suggest-box">
                      {customerSuggestions.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          className="ro-suggest-item"
                          onClick={() => {
                            setSelectedCustomer(s);
                            setCustomerQuery('');
                            setCustomerSuggestions([]);
                          }}
                        >
                          <strong>{s.name}</strong>
                          <span>{s.doc_number ?? '—'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
              </div>

              {/* Product search */}
              <div className="ro-product-row" style={{ position: 'relative' }}>
                <label className="ro-field ro-field--wide">
                  <span>Agregar producto</span>
                  <input
                    className="restaurant-input"
                    placeholder="Buscar por nombre o código..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </label>
                {(productSuggestions.length > 0 || loadingProducts) && (
                  <div className="ro-suggest-box ro-suggest-box--products">
                    {loadingProducts && (
                      <div className="ro-suggest-item ro-suggest-item--hint">Buscando...</div>
                    )}
                    {productSuggestions.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="ro-suggest-item"
                        onClick={() => addProductToCart(p)}
                      >
                        <strong>{p.name}</strong>
                        <span>{formatCurrency(p.sale_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cart */}
              {cart.length === 0 ? (
                <div className="ro-cart-empty">Aún no hay productos en este pedido.</div>
              ) : (
                <div className="ro-cart">
                  {cart.map((item, index) => (
                    <div key={`cart-${index}`} className="ro-cart-item">
                      <input
                        className="ro-cart-item__desc restaurant-input"
                        value={item.description}
                        onChange={(e) => updateCartItem(index, 'description', e.target.value)}
                      />
                      <input
                        className="ro-cart-item__qty restaurant-input"
                        type="number"
                        min="0.001"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => updateCartItem(index, 'quantity', e.target.value)}
                      />
                      <input
                        className="ro-cart-item__price restaurant-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unit_price}
                        onChange={(e) => updateCartItem(index, 'unit_price', e.target.value)}
                      />
                      <span className="ro-cart-item__subtotal">
                        {formatCurrency(item.quantity * item.unit_price * (1 + item.tax_rate / 100))}
                      </span>
                      <button
                        type="button"
                        className="ro-cart-item__remove"
                        onClick={() => removeCartItem(index)}
                        title="Quitar item"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <div className="ro-cart-footer">
                    <span>Total estimado (c/IGV)</span>
                    <strong>{formatCurrency(cartTotal)}</strong>
                  </div>
                </div>
              )}

              {/* Notes */}
              <label className="ro-field ro-field--wide">
                <span>Notas del pedido</span>
                <input
                  className="restaurant-input"
                  placeholder="Indicaciones especiales (opcional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>

              {/* Submit */}
              <div className="ro-form-actions">
                <button
                  type="button"
                  className="restaurant-primary-btn"
                  disabled={submitting || cart.length === 0 || seriesLoading || salesOrderSeriesList.length === 0}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? 'Enviando a cocina...' : 'Enviar pedido a cocina'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Active Orders ─────────────────────────────────────────── */}
        <div className="ro-orders-panel">
          <div className="ro-orders-panel__head">
            <p className="ro-form-panel__heading">Pedidos activos</p>
            <div className="ro-orders-filters">
              <select
                className="restaurant-input"
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="IN_PREP">En preparación</option>
                <option value="READY">Listo</option>
                <option value="SERVED">Entregado</option>
              </select>
              <input
                className="restaurant-input"
                placeholder="Buscar..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void loadOrders(); }}
              />
              <button type="button" className="restaurant-ghost-btn" onClick={() => void loadOrders()}>
                {ordersLoading ? '...' : 'Buscar'}
              </button>
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="restaurant-empty-state">
              <strong>{ordersLoading ? 'Cargando pedidos...' : 'Sin pedidos activos'}</strong>
              <p>Crea una orden seleccionando una mesa en el panel izquierdo.</p>
            </div>
          ) : (
            <div className="ro-orders-list">
              {orders.map((order) => (
                <article key={order.id} className="ro-order-card">
                  <div className="ro-order-card__head">
                    <div>
                      <p className="ro-order-card__ref">
                        {order.series}-{String(order.number).padStart(6, '0')}
                      </p>
                      {order.table_label && (
                        <strong className="ro-order-card__table">{order.table_label}</strong>
                      )}
                    </div>
                    <span className={kitchenBadgeClass(order.kitchen_status)}>
                      {KITCHEN_STATUS_LABELS[order.kitchen_status] ?? order.kitchen_status}
                    </span>
                  </div>

                  <div className="ro-order-card__body">
                    <div className="ro-order-card__row">
                      <span>Cliente</span>
                      <strong>{order.customer_name || '—'}</strong>
                    </div>
                    <div className="ro-order-card__row">
                      <span>Items</span>
                      <strong>{order.line_count} líneas · {order.total_qty} uds.</strong>
                    </div>
                    <div className="ro-order-card__row">
                      <span>Emitida</span>
                      <strong>{formatDateTime(order.issue_at)}</strong>
                    </div>
                    <div className="ro-order-card__row ro-order-card__row--accent">
                      <span>Total</span>
                      <strong>{formatCurrency(order.total)}</strong>
                    </div>
                    {order.notes && (
                      <div className="ro-order-card__notes">{order.notes}</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
