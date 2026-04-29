import { useEffect, useMemo, useRef, useState } from 'react';
import { checkoutRestaurantOrder, fetchComandas, fetchOrderPreparationRequirements, fetchRestaurantBootstrap, updateComandaStatus } from '../api';
import type {
  CheckoutRestaurantOrderPayload,
  ComandaKitchenStatus,
  ComandaRow,
  PreparationRequirementsResponse,
  PreparationShortage,
  RestaurantBootstrapResponse,
  RestaurantSeriesNumber,
} from '../types';

const POLLING_INTERVAL_MS = 30_000;

type Props = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
  cashRegisterId: number | null;
};

const STATUS_LABELS: Record<ComandaKitchenStatus, string> = {
  PENDING: 'Pendiente',
  IN_PREP: 'En preparacion',
  READY: 'Listo',
  SERVED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const BOARD_COLUMNS: Array<{
  status: ComandaKitchenStatus;
  title: string;
  hint: string;
  tone: 'pending' | 'prep' | 'ready' | 'served' | 'cancelled';
}> = [
  { status: 'PENDING', title: 'Pendientes', hint: 'Ingresan a cocina', tone: 'pending' },
  { status: 'IN_PREP', title: 'En preparación', hint: 'Producción activa', tone: 'prep' },
  { status: 'READY', title: 'Listas para servir', hint: 'Esperando pase', tone: 'ready' },
  { status: 'SERVED', title: 'Entregadas', hint: 'Cierre de atención', tone: 'served' },
];

function kitchenBadgeClass(status: ComandaKitchenStatus): string {
  if (status === 'READY') return 'sales-sunat-badge is-ok';
  if (status === 'IN_PREP') return 'sales-sunat-badge is-progress';
  if (status === 'SERVED') return 'sales-sunat-badge is-neutral';
  if (status === 'CANCELLED') return 'sales-sunat-badge is-bad';
  return 'sales-sunat-badge is-warn';
}

function formatTotal(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value));
  return value.toFixed(2);
}

function timeAgo(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  if (diffMs < 0) return 'Ahora';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function ComandasView({ accessToken, branchId, warehouseId, cashRegisterId }: Props) {
  const [rows, setRows] = useState<ComandaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComandaKitchenStatus | ''>('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [modifiedOrderIds, setModifiedOrderIds] = useState<Set<number>>(new Set());
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Checkout modal state
  const [checkoutTarget, setCheckoutTarget] = useState<ComandaRow | null>(null);
  const [checkoutDocKind, setCheckoutDocKind] = useState<'INVOICE' | 'RECEIPT'>('RECEIPT');
  const [checkoutSeries, setCheckoutSeries] = useState('');
  const [checkoutPaymentMethodId, setCheckoutPaymentMethodId] = useState<number | ''>('');
  const [checkoutSeriesOptions, setCheckoutSeriesOptions] = useState<RestaurantSeriesNumber[]>([]);
  const [checkoutSeriesLoading, setCheckoutSeriesLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [bootstrap, setBootstrap] = useState<RestaurantBootstrapResponse | null>(null);

  // Preparation requirements modal (shortage warning + detailed view)
  const [reqsModal, setReqsModal] = useState<{
    row: ComandaRow;
    requirements: PreparationRequirementsResponse;
    shortages: PreparationShortage[];
    allowStart: boolean;
  } | null>(null);

  // Ticker for time-ago refresh (every minute)
  const [tick, setTick] = useState(0);
  const loadRef = useRef<() => void>(() => {});

  const summary = useMemo(() => {
    return {
      pending: rows.filter((r) => r.kitchen_status === 'PENDING').length,
      inPrep: rows.filter((r) => r.kitchen_status === 'IN_PREP').length,
      ready: rows.filter((r) => r.kitchen_status === 'READY').length,
    };
  }, [rows]);

  const boardRows = useMemo(() => {
    return BOARD_COLUMNS.map((column) => ({
      ...column,
      rows: rows.filter((row) => row.kitchen_status === column.status),
    }));
  }, [rows]);

  async function load(silent = false) {
    if (!branchId) {
      setRows([]);
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    if (!silent) setLoading(true);
    setMessage('');
    try {
      const res = await fetchComandas(accessToken, {
        branchId,
        status: statusFilter,
        search,
      });
      setRows(res.data ?? []);
      setLastRefreshed(new Date());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar comandas');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Keep loadRef current so interval always calls latest version
  loadRef.current = () => void load(true);

  // Initial load + reload when filters change
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, statusFilter]);

  // Silent auto-polling every 30 s
  useEffect(() => {
    const id = setInterval(() => loadRef.current(), POLLING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Tick every 60 s to re-render time-ago labels
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // BroadcastChannel — receives ORDER_MODIFIED from RestaurantOrderView in same browser
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('restaurant_orders');
      bc.onmessage = (ev: MessageEvent<{ type: string; orderId: number }>) => {
        if (ev.data?.type === 'ORDER_MODIFIED') {
          const modifiedId = Number(ev.data.orderId);
          setModifiedOrderIds((prev) => new Set(prev).add(modifiedId));
          // Immediate silent reload so the card shows updated items
          loadRef.current();
        }
      };
    } catch {
      // BroadcastChannel not supported — polling covers it
    }
    return () => { bc?.close(); };
  }, []);

  async function moveStatus(row: ComandaRow, nextStatus: ComandaKitchenStatus) {
    setBusyId(row.id);
    setMessage('');
    try {
      await updateComandaStatus(accessToken, row.id, {
        status: nextStatus,
        table_label: row.table_label || undefined,
      });
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, kitchen_status: nextStatus } : item)));
      // Acknowledge modification badge when staff acts on the order
      setModifiedOrderIds((prev) => { const s = new Set(prev); s.delete(row.id); return s; });
      // Notify RestaurantOrderView (waiter screen) when a comanda is ready to serve
      if (nextStatus === 'READY') {
        try {
          const bc = new BroadcastChannel('restaurant_orders');
          bc.postMessage({
            type: 'ORDER_READY',
            orderId: row.id,
            tableLabel: row.table_label || '',
            series: row.series,
            number: row.number,
          });
          bc.close();
        } catch {
          // BroadcastChannel unavailable
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar estado');
    } finally {
      setBusyId(null);
    }
  }

  // Check preparation requirements before moving to IN_PREP; show warning if stock shortage
  async function startPrep(row: ComandaRow) {
    setBusyId(row.id);
    try {
      const reqs = await fetchOrderPreparationRequirements(accessToken, row.id);

      const shortages: PreparationShortage[] = (reqs.ingredients_summary ?? [])
        .filter((line) => Number(line.shortfall_base) > 0)
        .map((line) => ({
          ingredient_product_id: line.ingredient_product_id,
          name: line.ingredient_name || line.ingredient_code || `#${line.ingredient_product_id}`,
          required: Number(line.required_base),
          available: Number(line.available_base),
          unit: 'BASE',
        }));

      if (shortages.length > 0) {
        setReqsModal({ row, requirements: reqs, shortages, allowStart: true });
        setBusyId(null);
        return;
      }
    } catch {
      // If requirements check fails (e.g. no recipe defined), proceed anyway
    }
    void moveStatus(row, 'IN_PREP');
  }

  async function viewRequirements(row: ComandaRow) {
    setBusyId(row.id);
    setMessage('');
    try {
      const reqs = await fetchOrderPreparationRequirements(accessToken, row.id);
      const shortages: PreparationShortage[] = (reqs.ingredients_summary ?? [])
        .filter((line) => Number(line.shortfall_base) > 0)
        .map((line) => ({
          ingredient_product_id: line.ingredient_product_id,
          name: line.ingredient_name || line.ingredient_code || `#${line.ingredient_product_id}`,
          required: Number(line.required_base),
          available: Number(line.available_base),
          unit: 'BASE',
        }));

      setReqsModal({ row, requirements: reqs, shortages, allowStart: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo obtener requerimientos de preparación');
    } finally {
      setBusyId(null);
    }
  }

  function dismissModified(orderId: number) {
    setModifiedOrderIds((prev) => { const s = new Set(prev); s.delete(orderId); return s; });
  }

  function openCheckout(row: ComandaRow) {
    setCheckoutTarget(row);
    setCheckoutDocKind('RECEIPT');
    setCheckoutSeries('');
    setCheckoutSeriesOptions([]);
    setCheckoutPaymentMethodId('');
    setCheckoutMessage('');
  }

  function closeCheckout() {
    setCheckoutTarget(null);
    setCheckoutBusy(false);
    setCheckoutMessage('');
  }

  async function submitCheckout() {
    if (!checkoutTarget) return;
    setCheckoutBusy(true);
    setCheckoutMessage('');

    if (!checkoutSeries.trim()) {
      setCheckoutMessage('Selecciona una serie activa para emitir el comprobante.');
      setCheckoutBusy(false);
      return;
    }

    const payload: CheckoutRestaurantOrderPayload = {
      target_document_kind: checkoutDocKind,
      series: checkoutSeries.trim() || null,
      payment_method_id: checkoutPaymentMethodId !== '' ? Number(checkoutPaymentMethodId) : null,
      cash_register_id: cashRegisterId,
    };

    try {
      const result = await checkoutRestaurantOrder(accessToken, checkoutTarget.id, payload);
      // Remove the order from the board (it is now ISSUED)
      setRows((prev) => prev.filter((r) => r.id !== checkoutTarget.id));
      closeCheckout();
      setMessage(`Cobro registrado: ${result.document_kind} ${result.series}-${String(result.number).padStart(6, '0')} · S/ ${Number(result.total).toFixed(2)}`);
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Error al registrar cobro';
      const stockMatch = raw.match(/Insufficient stock for product #(\d+)/i);
      if (stockMatch) {
        const productId = stockMatch[1];
        setCheckoutMessage(`Stock insuficiente para el producto #${productId}. Revisa inventario o ajusta el pedido antes de cobrar.`);
      } else {
        setCheckoutMessage(raw);
      }
    } finally {
      setCheckoutBusy(false);
    }
  }

  useEffect(() => {
    if (!reqsModal) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setReqsModal(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reqsModal]);

  // Resolve series options from restaurant bootstrap when checkout opens/doc kind changes
  useEffect(() => {
    if (!checkoutTarget) return;
    setCheckoutMessage('');

    let cancelled = false;

    const resolveCheckoutSeries = async () => {
      setCheckoutSeriesLoading(true);

      let currentBootstrap = bootstrap;
      if (!currentBootstrap) {
        try {
          currentBootstrap = await fetchRestaurantBootstrap(accessToken, { branchId });
          if (!cancelled) {
            setBootstrap(currentBootstrap);
          }
        } catch {
          if (!cancelled) {
            setCheckoutSeriesOptions([]);
            setCheckoutSeries('');
            setCheckoutSeriesLoading(false);
          }
          return;
        }
      }

      if (cancelled) return;

      const enabled = (currentBootstrap.series_numbers ?? []).filter((s) => s.document_kind === checkoutDocKind && Boolean(s.is_enabled));
      setCheckoutSeriesOptions(enabled);
      setCheckoutSeries((prev) => {
        if (prev && enabled.some((s) => s.series === prev)) return prev;
        return enabled[0]?.series ?? '';
      });
      setCheckoutSeriesLoading(false);
    };

    void resolveCheckoutSeries();

    return () => {
      cancelled = true;
    };
  }, [checkoutTarget, checkoutDocKind, bootstrap, accessToken, branchId]);

  const statusOptions: Array<{ value: ComandaKitchenStatus | ''; label: string }> = [
    { value: '', label: 'Todos los estados' },
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'IN_PREP', label: 'En preparación' },
    { value: 'READY', label: 'Listo' },
    { value: 'SERVED', label: 'Entregado' },
    { value: 'CANCELLED', label: 'Cancelado' },
  ];

  // Suppress unused-variable warning for tick (used to trigger re-render)
  void tick;

  return (
    <>
    <section className="module-panel restaurant-panel restaurant-panel--comandas">
      <div className="restaurant-toolbar">
        <div className="restaurant-toolbar__intro">
          <p className="restaurant-toolbar__eyebrow">Restaurante</p>
          <h3>Comandas</h3>
          <p className="restaurant-toolbar__copy">Vista operativa para cocina, pase y entrega en sala.</p>
        </div>
        <div className="restaurant-toolbar__actions">
          <span className="restaurant-toolbar__context" style={{ fontSize: '0.76rem', color: '#7a6f63' }}>
            Actualizado {lastRefreshed.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
          </span>
          <button type="button" className="restaurant-ghost-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Actualizando...' : '↻ Refrescar'}
          </button>
        </div>
      </div>

      <div className="restaurant-stats restaurant-stats--three">
        <article className="restaurant-stat">
          <span>Pendientes</span>
          <strong>{summary.pending}</strong>
          <small>Órdenes recién registradas</small>
        </article>
        <article className="restaurant-stat">
          <span>En preparación</span>
          <strong>{summary.inPrep}</strong>
          <small>Producción activa</small>
        </article>
        <article className="restaurant-stat">
          <span>Listas</span>
          <strong>{summary.ready}</strong>
          <small>Esperando despacho</small>
        </article>
      </div>

      <div className="restaurant-filters">
        <label className="restaurant-field restaurant-field--wide">
          <span>Buscar</span>
          <input
            className="restaurant-input"
            placeholder="Serie, cliente o mesa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void load(); }}
          />
        </label>
        <label className="restaurant-field">
          <span>Estado</span>
          <select className="restaurant-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ComandaKitchenStatus | '')}>
            {statusOptions.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="restaurant-primary-btn restaurant-primary-btn--soft" onClick={() => void load()} disabled={loading}>
          Aplicar
        </button>
      </div>

      {message && <p className="notice restaurant-notice">{message}</p>}

      {rows.length === 0 ? (
        <div className="restaurant-empty-state">
          <strong>{loading ? 'Cargando comandas...' : 'Sin comandas en esta vista'}</strong>
          <p>No hay órdenes que coincidan con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="comandas-board">
          {boardRows.map((column) => (
            <section key={column.status} className={`comandas-column comandas-column--${column.tone}`}>
              <header className="comandas-column__head">
                <div>
                  <p>{column.title}</p>
                  <small>{column.hint}</small>
                </div>
                <strong>{column.rows.length}</strong>
              </header>

              <div className="comandas-column__body">
                {column.rows.length === 0 ? (
                  <div className="comandas-column__empty">Sin comandas en esta etapa.</div>
                ) : column.rows.map((row) => {
                  const isModified = modifiedOrderIds.has(row.id);
                  const items = row.items_preview ?? [];
                  const previewItems = items.slice(0, 2);
                  const hiddenItems = Math.max(0, items.length - previewItems.length);
                  return (
                  <article key={row.id} className={`comanda-card comanda-card--${column.tone}${isModified ? ' comanda-card--modified' : ''}`}>

                    {/* ── Modified alert banner ── */}
                    {isModified && (
                      <div className="comanda-card__modified-banner">
                        <span>⚡ Pedido modificado</span>
                        <button
                          type="button"
                          className="comanda-card__modified-dismiss"
                          onClick={() => dismissModified(row.id)}
                          aria-label="Entendido"
                        >
                          ✓ Entendido
                        </button>
                      </div>
                    )}

                    {/* ── Header: ID + serie + tiempo ── */}
                    <div className="comanda-card__head">
                      <div className="comanda-card__head-left">
                        <p className="comanda-card__kicker">#{row.id}</p>
                        <h4 className="comanda-card__serie">{row.series}-{String(row.number).padStart(6, '0')}</h4>
                      </div>
                      <div className="comanda-card__head-right">
                        <span className="comanda-card__time-ago">{timeAgo(row.issue_at)}</span>
                        <span className={kitchenBadgeClass(row.kitchen_status)}>{STATUS_LABELS[row.kitchen_status]}</span>
                      </div>
                    </div>

                    {/* ── Info strip: Mesa · Cliente · Total ── */}
                    <div className="comanda-card__meta-line">
                      <span className="comanda-meta-pill">
                        <span className="comanda-meta-pill__label">Mesa</span>
                        <strong>{row.table_label || '—'}</strong>
                      </span>
                      <span className="comanda-meta-pill comanda-meta-pill--customer">
                        <span className="comanda-meta-pill__label">Cliente</span>
                        <strong>{row.customer_name || 'Rapido'}</strong>
                      </span>
                      <span className="comanda-meta-pill comanda-meta-pill--total">
                        <span className="comanda-meta-pill__label">Total</span>
                        <strong>{formatTotal(row.total)}</strong>
                      </span>
                    </div>

                    {/* ── Items inline ── */}
                    <div className="comanda-card__items-inline">
                      <p className="comanda-card__items-label">
                        Platos
                        <span className="comanda-card__items-count">{items.length}</span>
                      </p>
                      {items.length === 0 ? (
                        <p className="comanda-items-empty">Sin detalle de platos</p>
                      ) : (
                        <ul className="comanda-items-inline-list">
                          {previewItems.map((item, idx) => (
                            <li key={`item-${row.id}-${idx}`} className="comanda-items-inline-list__row">
                              <span className="comanda-items-inline-list__name">{item.description || 'Ítem sin descripción'}</span>
                              <strong className="comanda-items-inline-list__qty">✕ {formatQty(Number(item.qty))}</strong>
                            </li>
                          ))}
                          {hiddenItems > 0 && (
                            <li className="comanda-items-inline-list__row comanda-items-inline-list__row--more">
                              <span className="comanda-items-inline-list__name">+{hiddenItems} platos mas</span>
                              <strong className="comanda-items-inline-list__qty">ver</strong>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    {/* ── Actions ── */}
                    <div className="comanda-card__actions comanda-card__actions--compact">
                      <button
                        type="button"
                        className="restaurant-stage-btn"
                        disabled={busyId === row.id}
                        onClick={() => void viewRequirements(row)}
                      >
                        Ver requerimientos
                      </button>
                      {row.kitchen_status === 'PENDING' && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--prep"
                          disabled={busyId === row.id}
                          onClick={() => void startPrep(row)}
                        >
                          Iniciar
                        </button>
                      )}
                      {row.kitchen_status === 'IN_PREP' && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--ready"
                          disabled={busyId === row.id}
                          onClick={() => void moveStatus(row, 'READY')}
                        >
                          Marcar listo
                        </button>
                      )}
                      {(row.kitchen_status === 'READY' || row.kitchen_status === 'SERVED') && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--served"
                          disabled={busyId === row.id || row.kitchen_status === 'SERVED'}
                          onClick={() => void moveStatus(row, 'SERVED')}
                        >
                          Entregar
                        </button>
                      )}
                      {(row.kitchen_status === 'READY' || row.kitchen_status === 'SERVED') && (
                        <button
                          type="button"
                          className="restaurant-stage-btn restaurant-stage-btn--checkout"
                          disabled={busyId === row.id}
                          onClick={() => openCheckout(row)}
                        >
                          Cobrar
                        </button>
                      )}
                    </div>
                  </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>

    {/* ── Checkout modal ───────────────────────────────────────────────── */}
    {checkoutTarget && (() => {
      const target = checkoutTarget;
      return (
      <div className="cko-backdrop" role="dialog" aria-modal="true" aria-label="Cobrar pedido">
        <div className="cko-dialog">
          <header className="cko-dialog__head">
            <div>
              <p className="cko-dialog__eyebrow">Cobrar pedido</p>
              <h3>{target.series}-{String(target.number).padStart(6, '0')}</h3>
              <p className="cko-dialog__sub">
                {target.table_label ? `Mesa: ${target.table_label} · ` : ''}
                {target.customer_name || 'Cliente rapido'}
              </p>
            </div>
            <button type="button" className="cko-dialog__close" onClick={closeCheckout} aria-label="Cerrar">&times;</button>
          </header>

          <div className="cko-dialog__total">
            <span>Total</span>
            <strong>{formatTotal(target.total)}</strong>
          </div>
          {cashRegisterId && (
            <div style={{ margin: '0 20px', padding: '8px 14px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.8rem', color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
              <span>Caja activa</span>
              <strong>Caja #{cashRegisterId}</strong>
            </div>
          )}
          <div className="cko-dialog__body">
            <label className="cko-field">
              <span>Tipo de comprobante</span>
              <div className="cko-doc-kind-row">
                <button
                  type="button"
                  className={`cko-kind-btn ${checkoutDocKind === 'RECEIPT' ? 'cko-kind-btn--active' : ''}`}
                  onClick={() => setCheckoutDocKind('RECEIPT')}
                >
                  Boleta
                </button>
                <button
                  type="button"
                  className={`cko-kind-btn ${checkoutDocKind === 'INVOICE' ? 'cko-kind-btn--active' : ''}`}
                  onClick={() => setCheckoutDocKind('INVOICE')}
                >
                  Factura
                </button>
              </div>
            </label>

            {bootstrap != null && (
              <label className="cko-field">
                <span>Medio de pago <em>(opcional)</em></span>
                <select
                  className="cko-select"
                  value={checkoutPaymentMethodId}
                  onChange={(e) => setCheckoutPaymentMethodId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Mantener del pedido</option>
                  {(bootstrap.payment_methods ?? []).map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </label>
            )}

            <label className="cko-field">
              <span>Serie <em>(desde Maestros &gt; Series)</em></span>
              <select
                className="cko-select"
                value={checkoutSeries}
                onChange={(e) => setCheckoutSeries(e.target.value)}
                disabled={checkoutSeriesLoading || checkoutSeriesOptions.length === 0}
              >
                {checkoutSeriesLoading && <option value="">Cargando series...</option>}
                {!checkoutSeriesLoading && checkoutSeriesOptions.length === 0 && (
                  <option value="">Sin series activas</option>
                )}
                {checkoutSeriesOptions.map((s) => (
                  <option key={s.id ?? s.series} value={s.series}>
                    {s.series}
                  </option>
                ))}
              </select>
            </label>

            {!checkoutSeriesLoading && checkoutSeriesOptions.length === 0 && (
              <p className="cko-error">
                No hay series activas para {checkoutDocKind === 'RECEIPT' ? 'boleta' : 'factura'} en la sucursal/almacen seleccionado.
                Configura una en Maestros &gt; Series.
              </p>
            )}

            {checkoutMessage && <p className="cko-error">{checkoutMessage}</p>}
          </div>

          <footer className="cko-dialog__foot">
            <button type="button" className="restaurant-ghost-btn" onClick={closeCheckout} disabled={checkoutBusy}>
              Cancelar
            </button>
            <button
              type="button"
              className="restaurant-primary-btn"
              disabled={checkoutBusy || checkoutSeriesLoading || checkoutSeriesOptions.length === 0}
              onClick={() => void submitCheckout()}
            >
              {checkoutBusy ? 'Procesando...' : `Emitir ${checkoutDocKind === 'RECEIPT' ? 'Boleta' : 'Factura'}`}
            </button>
          </footer>
        </div>
      </div>
      );
    })()}

    {/* ── Preparation requirements warning modal ───────────────────────── */}
    {reqsModal && (
      <div
        className="cko-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Stock insuficiente"
        onClick={() => setReqsModal(null)}
      >
        <div className="cko-dialog cko-dialog--requirements" onClick={(e) => e.stopPropagation()}>
          <header className="cko-dialog__head">
            <div>
              <p className="cko-dialog__eyebrow">Requerimientos de preparación</p>
              <h3>{reqsModal.shortages.length > 0 ? 'Insumos insuficientes' : 'Stock suficiente para preparar'}</h3>
              <p className="cko-dialog__sub">
                Orden #{reqsModal.row.id} · {reqsModal.row.series}-{String(reqsModal.row.number).padStart(6, '0')}
              </p>
            </div>
            <button
              type="button"
              className="cko-dialog__close"
              onClick={() => setReqsModal(null)}
              aria-label="Cerrar"
            >
              &times;
            </button>
          </header>

          <div className="cko-dialog__body">
            <p style={{ fontSize: '0.83rem', color: '#7a6f63', marginBottom: 12 }}>
              Esta vista ya considera la merma de la receta en el cálculo del requerido.
            </p>
            <div style={{ width: '100%', maxHeight: '44vh', overflow: 'auto', border: '1px solid #efe7dc', borderRadius: 10 }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#7a6f63', textAlign: 'left', borderBottom: '1px solid #ede8e1' }}>
                  <th style={{ padding: '4px 6px', fontWeight: 600 }}>Ingrediente</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Requerido</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Disponible</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'right' }}>Faltante</th>
                </tr>
              </thead>
              <tbody>
                {(reqsModal.requirements.ingredients_summary ?? []).map((line) => (
                  <tr key={line.ingredient_product_id} style={{ borderBottom: '1px solid #f3ede6' }}>
                    <td style={{ padding: '5px 6px', color: '#3d3530' }}>
                      {line.ingredient_name || line.ingredient_code || `#${line.ingredient_product_id}`}
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#3d3530' }}>{formatQty(Number(line.required_base))}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: '#166534' }}>{formatQty(Number(line.available_base))}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', color: Number(line.shortfall_base) > 0 ? '#b91c1c' : '#3d3530', fontWeight: Number(line.shortfall_base) > 0 ? 700 : 500 }}>
                      {formatQty(Number(line.shortfall_base))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {reqsModal.shortages.length > 0 && (
              <p style={{ marginTop: 12, fontSize: '0.8rem', color: '#9a3412' }}>
                Puedes iniciar la preparación igual y ajustar el inventario después, o cancelar para revisar stock primero.
              </p>
            )}
          </div>

          <footer className="cko-dialog__foot">
            <button
              type="button"
              className="restaurant-ghost-btn"
              onClick={() => setReqsModal(null)}
            >
              Cerrar
            </button>
            {reqsModal.allowStart && reqsModal.shortages.length > 0 && (
              <button
                type="button"
                className="restaurant-primary-btn"
                style={{ background: '#d97706' }}
                onClick={() => {
                  const row = reqsModal.row;
                  setReqsModal(null);
                  void moveStatus(row, 'IN_PREP');
                }}
              >
                Iniciar de todas formas
              </button>
            )}
          </footer>
        </div>
      </div>
    )}
    </>
  );
}
