import { useEffect, useMemo, useState } from 'react';
import { checkoutRestaurantOrder, fetchComandas, updateComandaStatus } from '../api';
import type { CheckoutRestaurantOrderPayload, ComandaKitchenStatus, ComandaRow } from '../types';
import { fetchSalesLookups, fetchSeriesNumbers } from '../../sales/api';
import type { SalesLookups, SeriesNumber } from '../../sales/types';

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
  { status: 'IN_PREP', title: 'En preparacion', hint: 'Produccion activa', tone: 'prep' },
  { status: 'READY', title: 'Listas', hint: 'Esperando pase', tone: 'ready' },
  { status: 'SERVED', title: 'Entregadas', hint: 'Cierre de atencion', tone: 'served' },
];

function kitchenBadgeClass(status: ComandaKitchenStatus): string {
  if (status === 'READY') return 'sales-sunat-badge is-ok';
  if (status === 'IN_PREP') return 'sales-sunat-badge is-progress';
  if (status === 'SERVED') return 'sales-sunat-badge is-neutral';
  if (status === 'CANCELLED') return 'sales-sunat-badge is-bad';
  return 'sales-sunat-badge is-warn';
}

function formatIssueAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatTotal(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function ComandasView({ accessToken, branchId, warehouseId, cashRegisterId }: Props) {
  const [rows, setRows] = useState<ComandaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComandaKitchenStatus | ''>('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  // Checkout modal state
  const [checkoutTarget, setCheckoutTarget] = useState<ComandaRow | null>(null);
  const [checkoutDocKind, setCheckoutDocKind] = useState<'INVOICE' | 'RECEIPT'>('RECEIPT');
  const [checkoutSeries, setCheckoutSeries] = useState('');
  const [checkoutPaymentMethodId, setCheckoutPaymentMethodId] = useState<number | ''>('');
  const [checkoutSeriesOptions, setCheckoutSeriesOptions] = useState<SeriesNumber[]>([]);
  const [checkoutSeriesLoading, setCheckoutSeriesLoading] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [lookups, setLookups] = useState<SalesLookups | null>(null);

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

  async function load() {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetchComandas(accessToken, {
        branchId,
        status: statusFilter,
        search,
      });
      setRows(res.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo cargar comandas');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId, statusFilter]);

  // Prefetch lookups (payment methods + series) for the checkout modal
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchSalesLookups(accessToken, { branchId });
        if (!cancelled) setLookups(res);
      } catch {
        // silently; checkout modal will still work without prefetched lookups
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, branchId]);

  async function moveStatus(row: ComandaRow, nextStatus: ComandaKitchenStatus) {
    setBusyId(row.id);
    setMessage('');
    try {
      await updateComandaStatus(accessToken, row.id, {
        status: nextStatus,
        table_label: row.table_label || undefined,
      });
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, kitchen_status: nextStatus } : item)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo actualizar estado');
    } finally {
      setBusyId(null);
    }
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
      setCheckoutMessage(error instanceof Error ? error.message : 'Error al registrar cobro');
    } finally {
      setCheckoutBusy(false);
    }
  }

  const statusOptions: Array<{ value: ComandaKitchenStatus | ''; label: string }> = [
    { value: '', label: 'Todos los estados' },
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'IN_PREP', label: 'En preparacion' },
    { value: 'READY', label: 'Listo' },
    { value: 'SERVED', label: 'Entregado' },
    { value: 'CANCELLED', label: 'Cancelado' },
  ];

  useEffect(() => {
    if (!checkoutTarget) return;

    let cancelled = false;
    setCheckoutSeriesLoading(true);
    setCheckoutMessage('');

    void (async () => {
      try {
        const options = await fetchSeriesNumbers(accessToken, {
          documentKind: checkoutDocKind,
          branchId,
          warehouseId,
        });

        if (cancelled) return;

        const enabled = (options ?? []).filter((s) => Boolean(s.is_enabled));
        setCheckoutSeriesOptions(enabled);
        setCheckoutSeries((prev) => {
          if (prev && enabled.some((s) => s.series === prev)) {
            return prev;
          }
          return enabled[0]?.series ?? '';
        });
      } catch {
        if (!cancelled) {
          setCheckoutSeriesOptions([]);
          setCheckoutSeries('');
        }
      } finally {
        if (!cancelled) setCheckoutSeriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [checkoutTarget, checkoutDocKind, accessToken, branchId, warehouseId]);

  return (
    <>
    <section className="module-panel restaurant-panel">
      <div className="restaurant-toolbar">
        <div className="restaurant-toolbar__intro">
          <p className="restaurant-toolbar__eyebrow">Restaurante</p>
          <h3>Comandas</h3>
          <p className="restaurant-toolbar__copy">Vista operativa para cocina, pase y entrega en sala.</p>
        </div>
        <div className="restaurant-toolbar__actions">
          <span className="restaurant-toolbar__context">Sucursal: {branchId ?? 'Todas'}</span>
          <button type="button" className="restaurant-ghost-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Actualizando...' : 'Refrescar'}
          </button>
        </div>
      </div>

      <div className="restaurant-stats restaurant-stats--three">
        <article className="restaurant-stat">
          <span>Pendientes</span>
          <strong>{summary.pending}</strong>
          <small>Ordenes recien registradas</small>
        </article>
        <article className="restaurant-stat">
          <span>En preparacion</span>
          <strong>{summary.inPrep}</strong>
          <small>Produccion activa</small>
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void load();
              }
            }}
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
          <p>No hay ordenes que coincidan con los filtros seleccionados.</p>
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
                ) : column.rows.map((row) => (
                  <article key={row.id} className="comanda-card">
                    <div className="comanda-card__head">
                      <div>
                        <p className="comanda-card__kicker">Comanda #{row.id}</p>
                        <h4>{row.series}-{String(row.number).padStart(6, '0')}</h4>
                      </div>
                      <span className={kitchenBadgeClass(row.kitchen_status)}>{STATUS_LABELS[row.kitchen_status]}</span>
                    </div>

                    <div className="comanda-card__body">
                      <div className="comanda-card__meta">
                        <span>Cliente</span>
                        <strong>{row.customer_name || 'Cliente rapido'}</strong>
                      </div>
                      <div className="comanda-card__meta">
                        <span>Mesa</span>
                        <strong>{row.table_label || 'Sin mesa'}</strong>
                      </div>
                      <div className="comanda-card__meta">
                        <span>Emision</span>
                        <strong>{formatIssueAt(row.issue_at)}</strong>
                      </div>
                      <div className="comanda-card__meta comanda-card__meta--accent">
                        <span>Total</span>
                        <strong>{formatTotal(row.total)}</strong>
                      </div>
                    </div>

                    <div className="comanda-card__actions">
                      <button
                        type="button"
                        className="restaurant-stage-btn restaurant-stage-btn--prep"
                        disabled={busyId === row.id || row.kitchen_status === 'IN_PREP'}
                        onClick={() => void moveStatus(row, 'IN_PREP')}
                      >
                        Preparar
                      </button>
                      <button
                        type="button"
                        className="restaurant-stage-btn restaurant-stage-btn--ready"
                        disabled={busyId === row.id || row.kitchen_status === 'READY'}
                        onClick={() => void moveStatus(row, 'READY')}
                      >
                        Marcar listo
                      </button>
                      <button
                        type="button"
                        className="restaurant-stage-btn restaurant-stage-btn--served"
                        disabled={busyId === row.id || row.kitchen_status === 'SERVED'}
                        onClick={() => void moveStatus(row, 'SERVED')}
                      >
                        Entregar
                      </button>
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
                ))}
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

            {lookups != null && (
              <label className="cko-field">
                <span>Medio de pago <em>(opcional)</em></span>
                <select
                  className="cko-select"
                  value={checkoutPaymentMethodId}
                  onChange={(e) => setCheckoutPaymentMethodId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Mantener del pedido</option>
                  {(lookups.payment_methods ?? []).map((pm) => (
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
    </>
  );
}
