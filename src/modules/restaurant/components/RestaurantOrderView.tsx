import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchInventoryProducts } from '../../inventory/api';
import type { InventoryProduct } from '../../inventory/types';
import {
  createRestaurantOrder,
  fetchRestaurantCustomerAutocomplete,
  fetchRestaurantBootstrap,
  fetchRestaurantOrders,
  fetchRestaurantTables,
  resolveRestaurantCustomerByDocument,
  updateRestaurantOrder,
} from '../api';
import type {
  RestaurantCustomerSuggestion,
  RestaurantBootstrapResponse,
  RestaurantOrderRow,
  RestaurantSeriesNumber,
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
  line_no?: number;
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
    timeZone: 'America/Lima',
  }).format(date);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  const [lookups, setLookups] = useState<RestaurantBootstrapResponse | null>(null);
  const [tables, setTables] = useState<RestaurantTableRow[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  // ── form stage & selected table ───────────────────────────────────────────
  const [stage, setStage] = useState<OrderStage>('SELECT_TABLE');
  const [selectedTable, setSelectedTable] = useState<RestaurantTableRow | null>(null);

  // ── customer autocomplete ─────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<RestaurantCustomerSuggestion[]>([]);
  const [resolvingCustomerDocument, setResolvingCustomerDocument] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<RestaurantCustomerSuggestion | null>(null);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── product search ────────────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [productSuggestions, setProductSuggestions] = useState<InventoryProduct[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<InventoryProduct[]>([]);
  const [productPreviewOpen, setProductPreviewOpen] = useState(false);
  const [featuredProductsLoaded, setFeaturedProductsLoaded] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const productDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productAutocompleteRequestSeqRef = useRef(0);
  const productPreviewRef = useRef<HTMLDivElement | null>(null);

  // ── cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);

  // ── form field overrides ──────────────────────────────────────────────────
  const [seriesId, setSeriesId] = useState<string>('');
  const [salesOrderSeriesList, setSalesOrderSeriesList] = useState<RestaurantSeriesNumber[]>([]);
  const [currencyId, setCurrencyId] = useState<string>('');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');

  // ── active orders ─────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<RestaurantOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderSearchDebounced, setOrderSearchDebounced] = useState('');
  const orderSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restaurantPriceIncludesIgv, setRestaurantPriceIncludesIgv] = useState(true);

  // ── feedback ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  // ── ready-order toasts (broadcast from ComandasView) ─────────────────────
  type ReadyAlert = { id: number; tableLabel: string; series: string; number: number; ts: number };
  const [readyAlerts, setReadyAlerts] = useState<ReadyAlert[]>([]);

  function dismissReadyAlert(orderId: number) {
    setReadyAlerts((prev) => prev.filter((a) => a.id !== orderId));
  }

  // ── init: load lookups + tables ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingInit(true);
      try {
        const [bootstrapRes, tablesRes] = await Promise.all([
          fetchRestaurantBootstrap(accessToken, { branchId, warehouseId }),
          fetchRestaurantTables(accessToken, { branchId }),
        ]);

        if (cancelled) return;

        setLookups(bootstrapRes);
        setTables(tablesRes.data ?? []);

        setRestaurantPriceIncludesIgv(Boolean(bootstrapRes.restaurant_price_includes_igv));

        const salesOrderSeries = (bootstrapRes.series_numbers ?? []).filter((s) => s.document_kind === 'SALES_ORDER' && Boolean(s.is_enabled));
        setSalesOrderSeriesList(salesOrderSeries);
        setSeriesId((prev) => {
          if (prev && salesOrderSeries.some((s) => s.series === prev)) {
            return prev;
          }
          return salesOrderSeries[0]?.series ?? '';
        });

        // Auto-select defaults
        const defaultCurrency = bootstrapRes.currencies.find((c) => c.is_default) ?? bootstrapRes.currencies[0];
        if (defaultCurrency) setCurrencyId(String(defaultCurrency.id));

        const defaultPm = bootstrapRes.payment_methods[0];
        if (defaultPm) setPaymentMethodId(String(defaultPm.id));
      } catch {
        if (!cancelled) setMessage('No se pudo cargar la configuración inicial.');
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    })();

    return () => { cancelled = true; };
  }, [accessToken, branchId, warehouseId]);

  // ── debounce orderSearch ─────────────────────────────────────────────────
  useEffect(() => {
    if (orderSearchDebounceRef.current) clearTimeout(orderSearchDebounceRef.current);
    orderSearchDebounceRef.current = setTimeout(() => {
      setOrderSearchDebounced(orderSearch);
    }, 350);
    return () => {
      if (orderSearchDebounceRef.current) clearTimeout(orderSearchDebounceRef.current);
    };
  }, [orderSearch]);

  // ── load active orders ────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetchRestaurantOrders(accessToken, {
        branchId,
        status: orderStatusFilter,
        search: orderSearchDebounced,
      });
      setOrders(res.data ?? []);
    } catch {
      // Silent — orders panel is secondary to the form
    } finally {
      setOrdersLoading(false);
    }
  }, [accessToken, branchId, orderStatusFilter, orderSearchDebounced]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // BroadcastChannel — listens for ORDER_READY from ComandasView
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('restaurant_orders');
      bc.onmessage = (ev: MessageEvent<{ type: string; orderId: number; tableLabel?: string; series?: string; number?: number }>) => {
        if (ev.data?.type === 'ORDER_READY') {
          const { orderId, tableLabel = '', series = '', number = 0 } = ev.data;
          setReadyAlerts((prev) => {
            // avoid duplicates
            if (prev.some((a) => a.id === orderId)) return prev;
            return [...prev, { id: orderId, tableLabel, series, number, ts: Date.now() }];
          });
          void loadOrders();
        }
      };
    } catch {
      // BroadcastChannel not supported
    }
    return () => { bc?.close(); };
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
          const results = await fetchRestaurantCustomerAutocomplete(accessToken, q);
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
      productAutocompleteRequestSeqRef.current += 1;
      return;
    }

    productDebounceRef.current = setTimeout(() => {
      setLoadingProducts(true);
      void (async () => {
        try {
          const requestSeq = productAutocompleteRequestSeqRef.current + 1;
          productAutocompleteRequestSeqRef.current = requestSeq;
          const results = await fetchInventoryProducts(accessToken, {
            search: q,
            warehouseId: warehouseId ?? undefined,
            status: 1,
            limit: 24,
            autocomplete: true,
          });
          if (requestSeq !== productAutocompleteRequestSeqRef.current) {
            return;
          }
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

  useEffect(() => {
    function handleDocumentPointerDown(event: MouseEvent) {
      if (!productPreviewRef.current) {
        return;
      }

      if (!productPreviewRef.current.contains(event.target as Node)) {
        setProductPreviewOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentPointerDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentPointerDown);
    };
  }, []);

  // Category filter chip for product panel
  const [productCategoryFilter, setProductCategoryFilter] = useState<string | null>(null);

  const productCategories = useMemo(() => {
    const base = productSearch.trim().length >= 2 ? productSuggestions : featuredProducts;
    const cats = Array.from(new Set(base.map((p) => p.category_name ?? 'General').filter(Boolean)));
    return cats.sort();
  }, [featuredProducts, productSuggestions, productSearch]);

  const productPreviewRows = useMemo(() => {
    const q = productSearch.trim();
    const base = q.length >= 2 ? productSuggestions : featuredProducts;
    const filtered = productCategoryFilter
      ? base.filter((p) => (p.category_name ?? 'General') === productCategoryFilter)
      : base;
    return filtered;
  }, [featuredProducts, productSearch, productSuggestions, productCategoryFilter]);

  // ── cart helpers ──────────────────────────────────────────────────────────
  const igvRate = lookups?.active_igv_rate_percent ?? 18;

  async function ensureFeaturedProductsLoaded() {
    if (featuredProductsLoaded || loadingProducts) {
      return;
    }

    setLoadingProducts(true);
    try {
      const results = await fetchInventoryProducts(accessToken, {
        warehouseId: warehouseId ?? undefined,
        status: 1,
        limit: 200,
      });
      setFeaturedProducts(results ?? []);
      setFeaturedProductsLoaded(true);
    } catch {
      setFeaturedProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  function computeLinePricing(quantity: number, displayedUnitPrice: number, taxRate: number) {
    const safeQty = Math.max(0.001, Number(quantity) || 0);
    const safeDisplayed = Math.max(0, Number(displayedUnitPrice) || 0);
    const safeRate = Math.max(0, Number(taxRate) || 0);

    if (restaurantPriceIncludesIgv) {
      const grossTotal = roundCurrency(safeQty * safeDisplayed);
      const netUnitPrice = safeRate > 0
        ? roundCurrency(safeDisplayed / (1 + safeRate / 100))
        : safeDisplayed;
      const subtotal = roundCurrency(safeQty * netUnitPrice);
      const taxTotal = roundCurrency(grossTotal - subtotal);

      return {
        unitPriceForDocument: netUnitPrice,
        subtotal,
        taxTotal,
        total: grossTotal,
      };
    }

    const subtotal = roundCurrency(safeQty * safeDisplayed);
    const taxTotal = roundCurrency(subtotal * (safeRate / 100));

    return {
      unitPriceForDocument: safeDisplayed,
      subtotal,
      taxTotal,
      total: roundCurrency(subtotal + taxTotal),
    };
  }

  function toDisplayedUnitPrice(unitPrice: number, taxTotal: number, total: number, quantity: number) {
    const safeQty = Math.max(0.001, Number(quantity) || 0);
    if (restaurantPriceIncludesIgv) {
      const safeUnit = Math.max(0, Number(unitPrice) || 0);
      const safeTax = Math.max(0, Number(taxTotal) || 0);
      const safeTotal = Math.max(0, Number(total) || 0);
      const impliedNetTotal = safeUnit * safeQty;
      const hasGrossStored = safeTotal > 0 && (safeTax > 0 || safeTotal > (impliedNetTotal + 0.009));

      const perUnitGross = hasGrossStored
        ? (safeTotal / safeQty)
        : (safeUnit * (1 + Math.max(0, igvRate) / 100));

      return roundCurrency(perUnitGross);
    }

    return roundCurrency(Number(unitPrice) || 0);
  }

  function addProductToCart(product: InventoryProduct) {
    productAutocompleteRequestSeqRef.current += 1;
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => (
        item.product_id === product.id
        && item.unit_id === (product.unit_id ?? null)
      ));

      if (existingIndex >= 0) {
        return prev.map((item, index) => {
          if (index !== existingIndex) {
            return item;
          }

          return {
            ...item,
            quantity: roundCurrency(item.quantity + 1),
          };
        });
      }

      const item: CartItem = {
        product_id: product.id,
        description: product.name,
        quantity: 1,
        unit_price: Number(product.sale_price) || 0,
        unit_id: product.unit_id ?? null,
        tax_type: 'IGV',
        tax_rate: igvRate,
      };

      return [...prev, item];
    });
    setProductSearch('');
    setProductSuggestions([]);
    setProductPreviewOpen(false);
  }

  function startEditOrder(order: RestaurantOrderRow) {
    const resolvedTable = tables.find((table) => String(table.id) === String(order.table_id))
      ?? {
        id: Number(order.table_id ?? 0),
        company_id: 0,
        branch_id: branchId ?? 0,
        code: order.table_label || 'MESA',
        name: order.table_label || 'Mesa',
        capacity: 0,
        status: 'OCCUPIED' as const,
      };

    setEditingOrderId(order.id);
    setSelectedTable(resolvedTable);
    setStage('BUILD_ORDER');
    setNotes(order.notes ?? '');
    setSelectedCustomer(order.customer_id ? {
      id: order.customer_id,
      name: order.customer_name || 'Cliente',
      doc_number: null,
      doc_type: null,
      trade_name: null,
      plate: null,
      address: null,
      default_tier_id: null,
    } : null);
    setCustomerQuery('');
    setCart((order.items ?? []).map((item) => ({
      line_no: item.line_no,
      product_id: item.product_id,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: toDisplayedUnitPrice(item.unit_price, item.tax_total, item.total, item.quantity),
      unit_id: item.unit_id,
      tax_type: 'IGV',
      tax_rate: igvRate,
    })));
    setMessage('');
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
      return acc + computeLinePricing(item.quantity, item.unit_price, item.tax_rate).total;
    }, 0);
  }, [cart, restaurantPriceIncludesIgv]);

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
    setEditingOrderId(null);
    setMessage('');
  }

  async function handleResolveCustomerDocument() {
    const document = (customerQuery ?? '').replace(/\D+/g, '').trim();

    if (document.length !== 8 && document.length !== 11) {
      setMessage('Ingrese un DNI (8) o RUC (11) para consultar.');
      return;
    }

    try {
      setResolvingCustomerDocument(true);
      setMessage('Consultando padron...');
      const resolved = await resolveRestaurantCustomerByDocument(accessToken, document);
      setSelectedCustomer(resolved.data);
      setCustomerQuery('');
      setCustomerSuggestions([]);
      setMessage(resolved.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo consultar el documento.');
    } finally {
      setResolvingCustomerDocument(false);
    }
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
      const itemsPayload = cart.map((item, index) => {
        const pricing = computeLinePricing(item.quantity, item.unit_price, item.tax_rate);

        return {
          line_no: item.line_no ?? index + 1,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          qty: item.quantity,
          unit_price: pricing.unitPriceForDocument,
          unit_id: item.unit_id,
          tax_type: item.tax_type,
          tax_rate: item.tax_rate,
          subtotal: pricing.subtotal,
          tax_total: pricing.taxTotal,
          total: pricing.total,
        };
      });

      if (editingOrderId) {
        await updateRestaurantOrder(accessToken, editingOrderId, {
          customer_id: selectedCustomer.id,
          payment_method_id: Number(paymentMethodId),
          notes: notes.trim(),
          items: itemsPayload.map((item) => ({
            line_no: item.line_no,
            product_id: item.product_id,
            unit_id: item.unit_id,
            description: item.description,
            qty: item.qty,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            tax_total: item.tax_total,
            total: item.total,
          })),
        });
        // Notify ComandasView (kitchen) that this order was modified
        try {
          const bc = new BroadcastChannel('restaurant_orders');
          bc.postMessage({ type: 'ORDER_MODIFIED', orderId: editingOrderId });
          bc.close();
        } catch {
          // BroadcastChannel unavailable — polling will catch up
        }
      } else {
        await createRestaurantOrder(accessToken, {
          branch_id: branchId!,
          warehouse_id: warehouseId,
          table_id: selectedTable.id,
          series: seriesId,
          currency_id: Number(currencyId),
          payment_method_id: Number(paymentMethodId),
          customer_id: selectedCustomer.id,
          notes: notes.trim() || undefined,
          items: itemsPayload.map((item) => ({
            product_id: item.product_id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit_id: item.unit_id,
            tax_type: item.tax_type,
            tax_rate: item.tax_rate,
          })),
        });
      }

      // Reset form and refresh
      cancelTable();
      setMessage('');
      void loadOrders();
      if (!editingOrderId) {
        setTables((prev) => prev.map((table) => (
          table.id === selectedTable.id ? { ...table, status: 'OCCUPIED' } : table
        )));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (editingOrderId ? 'No se pudo actualizar el pedido.' : 'No se pudo crear el pedido.'));
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

      {/* ── Ready-order toast alerts ── */}
      {readyAlerts.length > 0 && (
        <div className="ro-ready-alerts">
          {readyAlerts.map((alert) => (
            <div key={alert.id} className="ro-ready-alert">
              <span className="ro-ready-alert__icon">🛎</span>
              <div className="ro-ready-alert__body">
                <strong>¡Pedido listo para servir!</strong>
                <span>
                  {alert.tableLabel ? `Mesa ${alert.tableLabel} · ` : ''}
                  {alert.series}-{String(alert.number).padStart(6, '0')}
                </span>
              </div>
              <button
                type="button"
                className="ro-ready-alert__dismiss"
                onClick={() => dismissReadyAlert(alert.id)}
                aria-label="Entendido"
              >
                ✓ Entendido
              </button>
            </div>
          ))}
        </div>
      )}

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
                  {editingOrderId ? 'Cancelar edición' : 'Cambiar mesa'}
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
                    disabled={loadingInit || salesOrderSeriesList.length === 0}
                  >
                    {loadingInit && <option value="">Cargando series...</option>}
                    {!loadingInit && salesOrderSeriesList.length === 0 && (
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

              {!loadingInit && salesOrderSeriesList.length === 0 && (
                <p className="notice" style={{ marginTop: '0.25rem' }}>
                  No hay series activas para SALES_ORDER en esta sucursal/almacen. Configura una en Maestros &gt; Series.
                </p>
              )}

              {/* Customer */}
              <div className="ro-customer-row">
                <label className="ro-field ro-field--wide" style={{ position: 'relative' }}>
                  <div className="ro-customer-field-head">
                    <span>Cliente</span>
                    <button
                      type="button"
                      className="restaurant-ghost-btn ro-customer-resolve-btn"
                      onClick={() => void handleResolveCustomerDocument()}
                      disabled={submitting || resolvingCustomerDocument}
                    >
                      {resolvingCustomerDocument ? 'Consultando...' : 'Consultar DNI/RUC'}
                    </button>
                  </div>
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
              <div
                className="ro-product-row"
                ref={productPreviewRef}
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  setProductPreviewOpen(true);
                  void ensureFeaturedProductsLoaded();
                }}
                onMouseLeave={() => setProductPreviewOpen(false)}
              >
                <label className="ro-field ro-field--wide">
                  <span>Agregar producto</span>
                  <input
                    className="restaurant-input"
                    placeholder="Buscar por nombre o código..."
                    value={productSearch}
                    onFocus={() => {
                      setProductPreviewOpen(true);
                      void ensureFeaturedProductsLoaded();
                    }}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setProductPreviewOpen(true);
                    }}
                  />
                </label>
                <div className={`ro-product-preview-panel ${productPreviewOpen ? 'is-open' : ''}`}>
                    <div className="ro-product-preview-head">
                      <strong>{productSearch.trim().length >= 2 ? 'Resultados de búsqueda' : 'Catálogo de productos'}</strong>
                      <span>{restaurantPriceIncludesIgv ? 'IGV incluido' : 'IGV no incluido'}</span>
                    </div>

                    {/* Category filter chips */}
                    {productCategories.length > 1 && (
                      <div className="ro-product-cat-chips">
                        <button
                          type="button"
                          className={`ro-cat-chip ${productCategoryFilter === null ? 'ro-cat-chip--active' : ''}`}
                          onClick={() => setProductCategoryFilter(null)}
                        >
                          Todos
                        </button>
                        {productCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={`ro-cat-chip ${productCategoryFilter === cat ? 'ro-cat-chip--active' : ''}`}
                            onClick={() => setProductCategoryFilter(cat)}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}

                    {loadingProducts ? (
                      <div className="ro-suggest-item ro-suggest-item--hint">Buscando productos...</div>
                    ) : productPreviewRows.length > 0 ? (
                      <div className="ro-product-preview-list">
                        {productPreviewRows.map((p) => (
                          <button
                            type="button"
                            key={p.id}
                            className="ro-product-preview-item"
                            onClick={() => addProductToCart(p)}
                          >
                            <div>
                              <strong>{p.name}</strong>
                              <span>{p.sku ?? 'SIN-SKU'} · {p.category_name ?? 'General'}</span>
                            </div>
                            <em>
                              {formatCurrency(p.sale_price)}
                              <small>{restaurantPriceIncludesIgv ? ' inc. IGV' : ' + IGV'}</small>
                            </em>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="ro-suggest-item ro-suggest-item--hint">No se encontraron productos para esta búsqueda.</div>
                    )}
                  </div>
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
                        {formatCurrency(computeLinePricing(item.quantity, item.unit_price, item.tax_rate).total)}
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
                  disabled={submitting || cart.length === 0 || loadingInit || salesOrderSeriesList.length === 0}
                  onClick={() => void handleSubmit()}
                >
                  {submitting ? (editingOrderId ? 'Actualizando pedido...' : 'Enviando a cocina...') : (editingOrderId ? 'Guardar cambios del pedido' : 'Enviar pedido a cocina')}
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

                    {order.items && order.items.length > 0 && (
                      <div className="ro-order-card__preview ro-order-card__preview--compact">
                        <div className="ro-order-card__trigger-wrap">
                          <button type="button" className="ro-order-card__trigger" aria-label="Ver platos del pedido">
                            Platos ({order.items.length})
                          </button>

                          <div className="ro-order-card__popover">
                            <p className="ro-order-card__popover-title">Detalle completo del pedido</p>
                            <ul className="ro-order-card__popover-list">
                              {order.items.map((item) => (
                                <li key={`order-pop-${order.id}-${item.line_no}`}>
                                  <span>{item.description}</span>
                                  <strong>x {item.quantity}</strong>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {order.kitchen_status !== 'SERVED' && order.kitchen_status !== 'CANCELLED' && (
                      <div className="ro-order-card__actions">
                        <button
                          type="button"
                          className="restaurant-ghost-btn"
                          onClick={() => startEditOrder(order)}
                        >
                          Editar pedido
                        </button>
                      </div>
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
