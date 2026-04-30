import { Fragment, useEffect, useMemo, useState } from 'react';
import './CashView.css';
import { fmtDateTimeLima } from '../../../shared/utils/lima';
import {
  closeCashSession,
  createCashMovement,
  fetchCashMovements,
  fetchCashSessions,
  fetchCurrentSession,
  openCashSession,
  fetchSessionDetail,
} from '../api';
import { buildCashReportHtml80mm, buildCashReportHtmlA4 } from '../../sales/print';
import { fetchSalesLookups } from '../../sales/api';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
import { fetchCompanyProfile } from '../../company/api';
import type { CompanyProfile } from '../../company/types';
import type {
  CashMovement,
  CashSession,
  CloseSessionResponse,
  PaginationMeta,
  PaymentMethodBreakdown,
  SessionDetailResponse,
  SessionDocument,
} from '../types';

type CashViewProps = {
  accessToken: string;
  cashRegisterId: number | null;
};

type MetricGlyphKind = 'status' | 'opening' | 'in' | 'out' | 'expected';

function MetricGlyph({ kind }: { kind: MetricGlyphKind }) {
  if (kind === 'status') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }

  if (kind === 'opening') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 4h10v16H5z" />
        <path d="M15 7l4-1v12l-4-1" />
        <path d="M9 12h.01" />
      </svg>
    );
  }

  if (kind === 'in') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 19V6" />
        <path d="M7.5 10.5L12 6l4.5 4.5" />
        <path d="M5 19h14" />
      </svg>
    );
  }

  if (kind === 'out') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 5v13" />
        <path d="M7.5 13.5L12 18l4.5-4.5" />
        <path d="M5 19h14" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v2" />
      <path d="M12 18v2" />
      <path d="M4 12h2" />
      <path d="M18 12h2" />
    </svg>
  );
}

export function CashView({ accessToken, cashRegisterId }: CashViewProps) {
  const [activeTab, setActiveTab] = useState<'sesion' | 'historial'>('sesion');
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [sessionsMeta, setSessionsMeta] = useState<PaginationMeta>({ page: 1, per_page: 10, total: 0, last_page: 1 });
  const [sessionsPage, setSessionsPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Historial expandible
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form: apertura de caja
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [openNotes, setOpenNotes] = useState('');

  // Form: cierre de caja
  const [closingBalance, setClosingBalance] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [showConfirmClosePopup, setShowConfirmClosePopup] = useState(false);
  const [showMovementPopup, setShowMovementPopup] = useState(false);
  const [previewDialog, setPreviewDialog] = useState<null | {
    title: string;
    subtitle: string;
    html: string;
    variant: 'compact' | 'wide';
  }>(null);
  const [closeResponse, setCloseResponse] = useState<CloseSessionResponse | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [workshopMultiVehicleEnabled, setWorkshopMultiVehicleEnabled] = useState(false);

  // Form: movimiento manual
  const [movType, setMovType] = useState<'IN' | 'OUT'>('IN');
  const [movAmount, setMovAmount] = useState('');
  const [movDescription, setMovDescription] = useState('');
  const [submittingMov, setSubmittingMov] = useState(false);

  const totalIn = useMemo(
    () => movements.filter((m) => m.movement_type === 'IN').reduce((a, m) => a + Number(m.amount), 0),
    [movements]
  );
  const totalOut = useMemo(
    () => movements.filter((m) => m.movement_type === 'OUT').reduce((a, m) => a + Number(m.amount), 0),
    [movements]
  );

  function formatMovementType(type: CashMovement['movement_type']): string {
    return type === 'IN' ? 'Ingreso' : 'Egreso';
  }

  function formatReferenceType(refType: string | null): string {
    if (!refType || refType.trim() === '') return 'Manual';
    const normalized = refType.trim().toUpperCase();
    const labels: Record<string, string> = {
      MANUAL: 'Manual',
      SALE: 'Venta',
      SALES: 'Venta',
      PURCHASE: 'Compra',
      OPENING: 'Apertura',
      OPENING_BALANCE: 'Apertura',
      CLOSING: 'Cierre',
      CLOSING_BALANCE: 'Cierre',
      ADJUSTMENT: 'Ajuste',
      TRANSFER: 'Traslado',
      PAYMENT: 'Pago',
      REFUND: 'Devolucion',
    };
    return labels[normalized] ?? 'Manual';
  }

  const soldProducts = useMemo(() => {
    const documents = sessionDetail?.documents ?? [];
    const grouped = new Map<string, {
      description: string;
      unitCode: string;
      paymentMethod: string;
      sellerName: string;
      documentKind: string;
      documentNumber: string;
      vehiclePlate: string;
      quantity: number;
      amount: number;
      costAmount: number;
      marginAmount: number;
      marginSource: 'REAL' | 'ESTIMATED' | 'MIXED';
    }>();

    for (const doc of documents) {
      for (const item of doc.items ?? []) {
        const description = (item.description || '').trim() || 'Producto sin descripcion';
        const unitCode = (item.unit_code || '').trim() || '-';
        const paymentMethod = (doc.payment_method_name || '').trim() || '-';
        const sellerName = (doc.user_name || '').trim() || 'N/A';
        const documentKind = (doc.document_kind_label || doc.document_kind || '').trim() || '-';
        const documentNumber = (doc.document_number || '').trim() || '-';
        const vehiclePlate = (doc.vehicle_plate_snapshot || '').trim() || '-';
        const key = `${description.toLowerCase()}__${unitCode.toLowerCase()}__${paymentMethod.toLowerCase()}__${sellerName.toLowerCase()}__${documentKind.toLowerCase()}__${documentNumber.toLowerCase()}__${workshopMultiVehicleEnabled ? vehiclePlate.toLowerCase() : ''}`;
        const current = grouped.get(key);

        if (current) {
          current.quantity += Number(item.quantity || 0);
          current.amount += Number(item.line_total || 0);
          current.costAmount += Number(item.cost_total || 0);
          current.marginAmount += Number(item.margin_total || 0);
          if ((item.margin_source || 'ESTIMATED') !== current.marginSource) {
            current.marginSource = 'MIXED';
          }
        } else {
          grouped.set(key, {
            description,
            unitCode,
            paymentMethod,
            sellerName,
            documentKind,
            documentNumber,
            vehiclePlate,
            quantity: Number(item.quantity || 0),
            amount: Number(item.line_total || 0),
            costAmount: Number(item.cost_total || 0),
            marginAmount: Number(item.margin_total || 0),
            marginSource: (item.margin_source || 'ESTIMATED') as 'REAL' | 'ESTIMATED',
          });
        }
      }
    }

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        marginPercent: row.amount > 0 ? (row.marginAmount / row.amount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [sessionDetail, workshopMultiVehicleEnabled]);

  async function loadCurrentSession() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const sess = await fetchCurrentSession(accessToken, cashRegisterId);
      setCurrentSession(sess);
      if (sess) {
        const movs = await fetchCashMovements(accessToken, {
          sessionId: sess.id,
          cashRegisterId: cashRegisterId ?? undefined,
        });
        setMovements(movs);
        setClosingBalance(Number(sess.expected_balance).toFixed(2));
      } else {
        setMovements([]);
      }
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al cargar sesion de caja');
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const rows = await fetchCashSessions(accessToken, {
        cashRegisterId: cashRegisterId ?? undefined,
        page: sessionsPage,
        perPage: sessionsMeta.per_page,
      });
      setSessions(rows.data);
      setSessionsMeta(rows.meta);
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCurrentSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, cashRegisterId]);

  useEffect(() => {
    if (activeTab !== 'sesion' || !cashRegisterId) {
      return;
    }

    const timer = setInterval(() => {
      void loadCurrentSession();
    }, 12000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, cashRegisterId]);

  useEffect(() => {
    if (activeTab !== 'historial') {
      return;
    }

    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sessionsPage]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const profile = await fetchCompanyProfile(accessToken);
        if (!cancelled) {
          setCompanyProfile(profile);
        }
      } catch {
        if (!cancelled) {
          setCompanyProfile(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const lookups = await fetchSalesLookups(accessToken);
        if (!cancelled) {
          const enabled = Boolean((lookups.commerce_features ?? []).find((row) => row.feature_code === 'SALES_WORKSHOP_MULTI_VEHICLE')?.is_enabled);
          setWorkshopMultiVehicleEnabled(enabled);
        }
      } catch {
        if (!cancelled) {
          setWorkshopMultiVehicleEnabled(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleOpenSession() {
    if (!cashRegisterId) {
      setMessage('Selecciona una caja antes de abrir sesion');
      setIsError(true);
      return;
    }
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      await openCashSession(accessToken, {
        cash_register_id: cashRegisterId,
        opening_balance: parseFloat(openingBalance) || 0,
        notes: openNotes || undefined,
      });
      setOpeningBalance('0.00');
      setOpenNotes('');
      await loadCurrentSession();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al abrir sesion');
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseSession() {
    if (!currentSession) return;
    setLoading(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await closeCashSession(accessToken, currentSession.id, {
        closing_balance: parseFloat(closingBalance) || 0,
        notes: closeNotes || undefined,
      });
      setCloseResponse(response as CloseSessionResponse);
      setShowCloseForm(false);
      setCloseNotes('');
      setMessage('Caja cerrada correctamente');
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al cerrar sesion');
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndCloseSession() {
    setShowConfirmClosePopup(false);
    await handleCloseSession();
  }

  function buildPrintData(
    session: { cash_register_code?: string | null; cash_register_name?: string | null; user_name?: string | null; opened_at: string; closed_at?: string | null; opening_balance: number | string; closing_balance?: number | string | null; expected_balance: number | string },
    summary: { total_in: number | string; total_out: number | string; difference?: number | string | null },
    paymentMethods: PaymentMethodBreakdown[],
    detail?: SessionDetailResponse | null,
    overrides?: { closingBalance?: number; difference?: number; closedAt?: string },
  ) {
    return {
      cashRegisterCode: session.cash_register_code || 'N/A',
      cashRegisterName: session.cash_register_name || 'N/A',
      userName: session.user_name || 'N/A',
      openedAt: session.opened_at,
      closedAt: overrides?.closedAt ?? (session.closed_at || ''),
      openingBalance: Number(session.opening_balance),
      closingBalance: overrides?.closingBalance ?? (session.closing_balance != null ? Number(session.closing_balance) : 0),
      expectedBalance: Number(session.expected_balance),
      totalIn: Number(summary.total_in),
      totalOut: Number(summary.total_out),
      difference: overrides?.difference ?? (summary.difference != null ? Number(summary.difference) : 0),
      paymentMethodBreakdown: paymentMethods as PaymentMethodBreakdown[],
      movements: (detail?.movements ?? []) as any,
      documents: (detail?.documents ?? []) as any,
      showVehicleInfo: workshopMultiVehicleEnabled,
      company: companyProfile
        ? {
            taxId: companyProfile.tax_id ?? null,
            legalName: companyProfile.legal_name ?? null,
            tradeName: companyProfile.trade_name ?? null,
            address: companyProfile.address ?? null,
            phone: companyProfile.phone ?? null,
            logoUrl: companyProfile.logo_url ?? null,
          }
        : null,
    };
  }

  function handlePrintReport80mm() {
    const data = closeResponse
      ? buildPrintData(closeResponse.session, closeResponse.summary, closeResponse.sales_by_payment_method || [], sessionDetail)
      : sessionDetail
        ? buildPrintData(sessionDetail.session, sessionDetail.summary, sessionDetail.payment_method_breakdown, sessionDetail)
        : null;
    if (!data) return;
    setPreviewDialog({
      title: 'Ticket 80mm de caja',
      subtitle: 'Vista compacta del reporte de caja',
      html: buildCashReportHtml80mm(data, { embedded: true }),
      variant: 'compact',
    });
  }

  function handlePrintReportA4() {
    const data = closeResponse
      ? buildPrintData(closeResponse.session, closeResponse.summary, closeResponse.sales_by_payment_method || [], sessionDetail)
      : sessionDetail
        ? buildPrintData(sessionDetail.session, sessionDetail.summary, sessionDetail.payment_method_breakdown, sessionDetail)
        : null;
    if (!data) return;
    setPreviewDialog({
      title: 'Reporte A4 de caja',
      subtitle: 'Vista detallada del reporte de caja',
      html: buildCashReportHtmlA4(data, { embedded: true }),
      variant: 'wide',
    });
  }

  async function handleRowPrint(s: CashSession, mode: '80mm' | 'A4') {
    let detail = (expandedSessionId === s.id && sessionDetail) ? sessionDetail : null;
    if (!detail) {
      setLoadingDetail(true);
      try {
        detail = await fetchSessionDetail(accessToken, s.id);
        setSessionDetail(detail);
        setExpandedSessionId(s.id);
      } catch {
        return;
      } finally {
        setLoadingDetail(false);
      }
    }
    const printData = buildPrintData(detail.session, detail.summary, detail.payment_method_breakdown, detail);
    setPreviewDialog({
      title: mode === '80mm' ? 'Ticket 80mm de historial' : 'Reporte A4 de historial',
      subtitle: 'Sesion cerrada de caja',
      html: mode === '80mm'
        ? buildCashReportHtml80mm(printData, { embedded: true })
        : buildCashReportHtmlA4(printData, { embedded: true }),
      variant: mode === '80mm' ? 'compact' : 'wide',
    });
  }

  async function handlePreviewBeforeClose() {
    if (!currentSession) {
      return;
    }

    setLoadingDetail(true);
    setMessage('');
    setIsError(false);

    try {
      const detail = await fetchSessionDetail(accessToken, currentSession.id);
      const countedBalance = parseFloat(closingBalance || String(currentSession.expected_balance)) || 0;
      const expectedBalance = Number(detail.session.expected_balance);
      const difference = countedBalance - expectedBalance;
      const printData = buildPrintData(
        detail.session,
        detail.summary,
        detail.payment_method_breakdown,
        detail,
        {
          closingBalance: countedBalance,
          difference,
          closedAt: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()).replace(' ', 'T') + '-05:00',
        },
      );
      setPreviewDialog({
        title: 'Previsualizacion de cierre de caja',
        subtitle: 'Revisa el reporte antes de confirmar el cierre.',
        html: buildCashReportHtmlA4(printData, { embedded: true }),
        variant: 'wide',
      });
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al generar la vista previa de cierre');
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!cashRegisterId) {
      setMessage('No hay caja seleccionada');
      setIsError(true);
      return;
    }
    setSubmittingMov(true);
    setMessage('');
    setIsError(false);
    try {
      await createCashMovement(accessToken, {
        cash_register_id: cashRegisterId,
        cash_session_id: currentSession?.id,
        movement_type: movType,
        amount: parseFloat(movAmount),
        description: movDescription,
      });
      setMovAmount('');
      setMovDescription('');
      setShowMovementPopup(false);
      await loadCurrentSession();
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al registrar movimiento');
    } finally {
      setSubmittingMov(false);
    }
  }

  async function handleExpandSession(sessionId: number) {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      setSessionDetail(null);
      return;
    }

    setLoadingDetail(true);
    try {
      const detail = await fetchSessionDetail(accessToken, sessionId);
      setSessionDetail(detail);
      setExpandedSessionId(sessionId);
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al cargar detalles de sesión');
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <section className="module-panel cash-module-panel">
      <div className="module-header cash-module-header">
        <h3>Caja</h3>
        <button
          className="cash-btn cash-btn-soft"
          type="button"
          onClick={() => {
            if (activeTab === 'sesion') void loadCurrentSession();
            else void loadHistory();
          }}
          disabled={loading}
        >
          ⟳ Refrescar
        </button>
      </div>

      {message && <p className={isError ? 'error-box' : 'notice'}>{message}</p>}

      <nav className="sub-tabs cash-sub-tabs cash-mode-tabs" role="tablist" aria-label="Vistas de caja">
        <button
          type="button"
          className={activeTab === 'sesion' ? 'cash-tab-btn mode-btn mode-btn-active active' : 'cash-tab-btn mode-btn'}
          onClick={() => { setActiveTab('sesion'); void loadCurrentSession(); }}
          aria-selected={activeTab === 'sesion'}
          role="tab"
        >
          <span className="cash-tab-icon" aria-hidden="true">🛒</span>
          <span className="cash-tab-copy">
            <span className="cash-tab-label">Sesion activa</span>
          </span>
        </button>
        <button
          type="button"
          className={activeTab === 'historial' ? 'cash-tab-btn mode-btn mode-btn-active active' : 'cash-tab-btn mode-btn'}
          onClick={() => {
            setActiveTab('historial');
            setSessionsPage(1);
          }}
          aria-selected={activeTab === 'historial'}
          role="tab"
        >
          <span className="cash-tab-icon" aria-hidden="true">📊</span>
          <span className="cash-tab-copy">
            <span className="cash-tab-label">Historial</span>
          </span>
        </button>
      </nav>

      {/* ── SESION ACTIVA ── */}
      {activeTab === 'sesion' && (
        <>
          {!currentSession && (
            <div className="form-card cash-form-card">
              <h4>Apertura de Caja</h4>
              {!cashRegisterId && (
                <p className="notice">Selecciona una caja en el panel superior para continuar.</p>
              )}
              <div className="grid-form">
                <label>
                  Saldo de apertura
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                </label>
                <label>
                  Notas (opcional)
                  <input
                    type="text"
                    maxLength={500}
                    value={openNotes}
                    onChange={(e) => setOpenNotes(e.target.value)}
                  />
                </label>
              </div>
              <button className="cash-btn cash-btn-primary" type="button" onClick={handleOpenSession} disabled={loading || !cashRegisterId}>
                🟢 Abrir caja
              </button>
            </div>
          )}

          {currentSession && (
            <div className="cash-session-shell">
              <div className="cash-session-overview">
                <div className="stat-grid cash-stat-grid">
                  <article className="cash-metric-card cash-metric-card-status">
                    <span className="cash-metric-label"><span className="cash-metric-icon" aria-hidden="true"><MetricGlyph kind="status" /></span>Estado</span>
                    <strong className="cash-value-emphasis">Abierta</strong>
                  </article>
                  <article className="cash-metric-card cash-metric-card-opening">
                    <span className="cash-metric-label"><span className="cash-metric-icon" aria-hidden="true"><MetricGlyph kind="opening" /></span>Apertura</span>
                    <strong>{Number(currentSession.opening_balance).toFixed(2)}</strong>
                  </article>
                  <article className="cash-metric-card cash-metric-card-in">
                    <span className="cash-metric-label"><span className="cash-metric-icon" aria-hidden="true"><MetricGlyph kind="in" /></span>Ingresos</span>
                    <strong className="cash-value-positive">+{totalIn.toFixed(2)}</strong>
                  </article>
                  <article className="cash-metric-card cash-metric-card-out">
                    <span className="cash-metric-label"><span className="cash-metric-icon" aria-hidden="true"><MetricGlyph kind="out" /></span>Egresos</span>
                    <strong className="cash-value-negative">-{totalOut.toFixed(2)}</strong>
                  </article>
                  <article className="cash-metric-card cash-metric-card-expected">
                    <span className="cash-metric-label"><span className="cash-metric-icon" aria-hidden="true"><MetricGlyph kind="expected" /></span>Saldo esperado</span>
                    <strong>{Number(currentSession.expected_balance).toFixed(2)}</strong>
                  </article>
                </div>

                <div className="cash-session-meta">
                  <span className="cash-session-meta-pill">Abierta: {currentSession.opened_at}</span>
                  <span className="cash-session-meta-pill">Caja: {currentSession.cash_register_name ?? currentSession.cash_register_code ?? currentSession.cash_register_id}</span>
                </div>
              </div>

              {/* Nuevo movimiento */}
              <div className="form-card cash-form-card">
                <div className="cash-section-head">
                  <div>
                    <h4>Registrar Movimiento</h4>
                    <p>Registra ingresos o egresos manuales desde un formulario rapido.</p>
                  </div>
                  <button className="cash-btn cash-btn-primary" type="button" onClick={() => setShowMovementPopup(true)}>
                    ➕ Nuevo movimiento
                  </button>
                </div>
                <div className="cash-movement-inline-summary">
                  <span className="cash-section-chip">Movimiento manual</span>
                  <small>El registro se hace en un pop up para no recargar la vista principal.</small>
                </div>
              </div>

              {showMovementPopup && (
                <div className="cash-modal-overlay">
                  <div className="cash-modal-surface cash-modal-surface-movement">
                    <div className="cash-modal-head">
                      <div>
                        <h4>Registrar Movimiento</h4>
                        <p>{movType === 'IN' ? 'Registra un ingreso manual para la sesion activa.' : 'Registra un egreso manual para la sesion activa.'}</p>
                      </div>
                      <button className="cash-btn cash-btn-soft cash-btn-compact" type="button" onClick={() => setShowMovementPopup(false)}>
                        ✖ Cerrar
                      </button>
                    </div>
                    <form onSubmit={(e) => void handleAddMovement(e)}>
                      <div className="cash-movement-type-switch" aria-label="Tipo de movimiento">
                        <button
                          type="button"
                          className={movType === 'IN' ? 'cash-movement-type is-active is-in' : 'cash-movement-type is-in'}
                          onClick={() => setMovType('IN')}
                        >
                          <span className="cash-movement-type__kicker">Entrada</span>
                          <strong>Ingreso manual</strong>
                        </button>
                        <button
                          type="button"
                          className={movType === 'OUT' ? 'cash-movement-type is-active is-out' : 'cash-movement-type is-out'}
                          onClick={() => setMovType('OUT')}
                        >
                          <span className="cash-movement-type__kicker">Salida</span>
                          <strong>Egreso manual</strong>
                        </button>
                      </div>
                      <div className="cash-movement-note-strip">
                        <span className={movType === 'IN' ? 'cash-movement-badge is-in' : 'cash-movement-badge is-out'}>
                          {movType === 'IN' ? 'Ingreso seleccionado' : 'Egreso seleccionado'}
                        </span>
                        <small>{movType === 'IN' ? 'Suma efectivo u otros ingresos a la sesion activa.' : 'Descuenta salida de efectivo u otro ajuste manual.'}</small>
                      </div>
                      <div className="grid-form cash-movement-grid">
                        <label>
                          Monto
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            value={movAmount}
                            onChange={(e) => setMovAmount(e.target.value)}
                          />
                        </label>
                        <label className="wide">
                          Descripcion
                          <input
                            type="text"
                            maxLength={300}
                            required
                            value={movDescription}
                            onChange={(e) => setMovDescription(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="cash-form-actions">
                        <button className="cash-btn cash-btn-primary" type="submit" disabled={submittingMov || loading}>
                          {submittingMov ? '⏳ Procesando...' : 'Guardar movimiento'}
                        </button>
                        <button className="cash-btn cash-btn-soft" type="button" onClick={() => setShowMovementPopup(false)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Movimientos de la sesion */}
              <div className="table-wrap cash-table-wrap">
                <h4>Movimientos de esta sesion</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Monto</th>
                      <th>Descripcion</th>
                      <th>Forma de pago</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center' }}>Sin movimientos</td></tr>
                    )}
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td>{m.movement_at}</td>
                        <td style={{ color: m.movement_type === 'IN' ? 'var(--color-ok)' : 'var(--color-err)' }}>
                          {formatMovementType(m.movement_type)}
                        </td>
                        <td>{Number(m.amount).toFixed(2)}</td>
                        <td>{m.description}</td>
                        <td>{m.payment_method_name?.trim() ? m.payment_method_name : '-'}</td>
                        <td>{formatReferenceType(m.ref_type)}{m.ref_id ? ` #${m.ref_id}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cierre de caja */}
              {!showCloseForm && (
                <button
                  type="button"
                  className="cash-btn cash-btn-accent"
                  onClick={() => setShowCloseForm(true)}
                  style={{ marginTop: '1rem' }}
                >
                  🛑 Cerrar caja
                </button>
              )}

              {showCloseForm && (
                <div className="form-card cash-form-card cash-close-card" style={{ borderColor: 'var(--color-err)' }}>
                  <div className="cash-section-head">
                    <div>
                      <h4>Cierre de Caja</h4>
                      <p>Confirma el monto contado y registra observaciones finales de la sesion.</p>
                    </div>
                    <span className="cash-section-chip cash-section-chip-muted">
                      Saldo esperado: <strong>{Number(currentSession.expected_balance).toFixed(2)}</strong>
                    </span>
                  </div>
                  <div className="grid-form">
                    <label>
                      Saldo fisico contado
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={closingBalance}
                        onChange={(e) => setClosingBalance(e.target.value)}
                      />
                    </label>
                    <label>
                      Notas de cierre
                      <input
                        type="text"
                        maxLength={500}
                        value={closeNotes}
                        onChange={(e) => setCloseNotes(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="cash-form-actions">
                    <button className="cash-btn cash-btn-soft" type="button" onClick={() => void handlePreviewBeforeClose()} disabled={loading || loadingDetail}>
                      {loadingDetail ? '⏳ Generando vista previa...' : '🧾 Vista previa cierre'}
                    </button>
                    <button type="button" className="cash-btn cash-btn-accent" onClick={() => setShowConfirmClosePopup(true)} disabled={loading}>
                      Confirmar cierre
                    </button>
                    <button className="cash-btn cash-btn-soft" type="button" onClick={() => setShowCloseForm(false)}>
                      ✖ Cancelar
                    </button>
                  </div>
                </div>
              )}

              {showConfirmClosePopup && (
                <div className="cash-modal-overlay">
                  <div className="cash-modal-surface cash-modal-surface-confirm">
                    <div className="cash-modal-head cash-modal-head-confirm">
                      <div>
                        <h4>Confirmar cierre de caja</h4>
                        <p>Revisa esta accion antes de registrar el cierre definitivo.</p>
                      </div>
                    </div>
                    <div className="cash-modal-body">
                      <p className="cash-modal-copy">
                        Esta accion cerrara la sesion actual y registrara el cierre en el sistema. ¿Estas seguro de proceder?
                      </p>
                      <div className="cash-form-actions cash-form-actions-end">
                        <button className="cash-btn cash-btn-soft" type="button" onClick={() => setShowConfirmClosePopup(false)}>
                          ✖ Cancelar
                        </button>
                        <button type="button" className="cash-btn cash-btn-accent" onClick={() => void confirmAndCloseSession()} disabled={loading}>
                          Cerrar caja
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {closeResponse && (
                <div className="form-card cash-form-card" style={{ borderColor: 'var(--color-ok)' }}>
                  <h4>Resumen de Cierre</h4>
                  <div className="stat-grid cash-stat-grid">
                    <article>
                      <span>Saldo Inicial</span>
                      <strong>{closeResponse.summary.opening_balance.toFixed(2)}</strong>
                    </article>
                    <article>
                      <span>Total Entrada</span>
                      <strong style={{ color: 'var(--color-ok)' }}>+{closeResponse.summary.total_in.toFixed(2)}</strong>
                    </article>
                    <article>
                      <span>Total Salida</span>
                      <strong style={{ color: 'var(--color-err)' }}>-{closeResponse.summary.total_out.toFixed(2)}</strong>
                    </article>
                    <article>
                      <span>Saldo Esperado</span>
                      <strong>{closeResponse.summary.expected_balance.toFixed(2)}</strong>
                    </article>
                    <article>
                      <span>Saldo Real</span>
                      <strong style={{ color: closeResponse.summary.difference >= 0 ? 'var(--color-ok)' : 'var(--color-err)' }}>
                        {closeResponse.summary.closing_balance.toFixed(2)}
                      </strong>
                    </article>
                    {closeResponse.summary.difference !== 0 && (
                      <article>
                        <span>Diferencia</span>
                        <strong style={{ color: closeResponse.summary.difference > 0 ? 'var(--color-ok)' : 'var(--color-err)' }}>
                          {closeResponse.summary.difference > 0 ? '+' : ''}{closeResponse.summary.difference.toFixed(2)}
                        </strong>
                      </article>
                    )}
                  </div>

                  {closeResponse.sales_by_payment_method && closeResponse.sales_by_payment_method.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                      <h5>Ventas por Tipo de Pago</h5>
                      <table style={{ width: '100%', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--color-muted)' }}>
                            <th style={{ textAlign: 'left' }}>Forma de Pago</th>
                            <th style={{ textAlign: 'center' }}>Cantidad</th>
                            <th style={{ textAlign: 'right' }}>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {closeResponse.sales_by_payment_method.map((pm) => (
                            <tr key={pm.payment_method_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td>{pm.payment_method_name?.trim() ? pm.payment_method_name : '-'}</td>
                              <td style={{ textAlign: 'center' }}>{pm.document_count}</td>
                              <td style={{ textAlign: 'right' }}>{pm.total_amount.toFixed(2)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '2px solid var(--color-muted)', fontWeight: 700 }}>
                            <td>TOTAL</td>
                            <td style={{ textAlign: 'center' }}>
                              {closeResponse.sales_by_payment_method.reduce((sum, pm) => sum + pm.document_count, 0)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {closeResponse.sales_by_payment_method.reduce((sum, pm) => sum + pm.total_amount, 0).toFixed(2)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button className="cash-btn cash-btn-soft" type="button" onClick={handlePrintReport80mm}>
                      🧾 Ticket 80mm
                    </button>
                    <button className="cash-btn cash-btn-soft" type="button" onClick={handlePrintReportA4}>
                      📄 Formato A4
                    </button>
                    <button className="cash-btn cash-btn-accent" type="button" onClick={() => { setCloseResponse(null); void loadCurrentSession(); }}>
                      🔄 Nueva sesion
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── HISTORIAL ── */}
      {activeTab === 'historial' && (
        <>
          <div className="table-wrap cash-table-wrap cash-history-table-wrap">
            <div className="cash-table-head">
              <div>
                <h4>Historial de Sesiones de Caja</h4>
                <p>Consulta aperturas, cierres y diferencias con una lectura mas clara.</p>
              </div>
              <span className="cash-section-chip cash-section-chip-muted">{sessions.length} sesiones</span>
            </div>
            <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="cash-history-table" style={{ minWidth: '1420px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '44px', padding: '10px 12px' }}></th>
                  <th style={{ minWidth: '90px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Sesion</th>
                  <th style={{ minWidth: '180px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Fecha de Apertura</th>
                  <th style={{ minWidth: '320px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Caja / Punto de Caja</th>
                  <th style={{ minWidth: '200px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Usuario</th>
                  <th style={{ minWidth: '170px', padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Saldo de Apertura</th>
                  <th style={{ minWidth: '170px', padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Saldo de Cierre</th>
                  <th style={{ minWidth: '170px', padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Diferencia de Caja</th>
                  <th style={{ minWidth: '130px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Estado</th>
                  <th style={{ minWidth: '220px', padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>Acciones / Vista Previa</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center' }}>Sin sesiones</td></tr>
                )}
                {sessions.map((s) => {
                  const difference = s.closing_balance != null ? Number(s.closing_balance) - Number(s.expected_balance) : null;
                  const isExpanded = expandedSessionId === s.id;
                  return (
                    <Fragment key={`session-${s.id}`}>
                      <tr className={isExpanded ? 'cash-history-row is-expanded' : 'cash-history-row'} onClick={() => void handleExpandSession(s.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                          <span className={isExpanded ? 'cash-row-toggle is-open' : 'cash-row-toggle'}>{isExpanded ? '▾' : '▸'}</span>
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: 600 }}>#{s.id}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.opened_at ? fmtDateTimeLima(s.opened_at) : '-'}</td>
                        <td style={{ padding: '10px 14px', minWidth: '320px' }}>{s.cash_register_name ?? s.cash_register_code ?? s.cash_register_id}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.user_name?.trim() || '-'}</td>
                        <td style={{ textAlign:'right', padding: '10px 14px', whiteSpace: 'nowrap' }}>{Number(s.opening_balance).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.closing_balance != null ? Number(s.closing_balance).toFixed(2) : '-'}</td>
                        <td style={{  textAlign: 'right', padding: '10px 14px', whiteSpace: 'nowrap', color: difference != null && difference >= 0 ? 'var(--color-ok)' : difference != null ? 'var(--color-err)' : undefined }}>
                          {difference != null ? (difference >= 0 ? '+' : '') + difference.toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span className={s.status === 'CLOSED' ? 'cash-status-pill cash-status-pill-closed' : 'cash-status-pill cash-status-pill-open'}>
                            {s.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          {s.status === 'CLOSED' && (
                            <>
                              <button className="cash-btn cash-btn-soft cash-btn-compact" type="button" style={{ marginRight: '4px' }} onClick={(e) => { e.stopPropagation(); void handleRowPrint(s, '80mm'); }}>🧾 Ticket</button>
                              <button className="cash-btn cash-btn-soft cash-btn-compact" type="button" onClick={(e) => { e.stopPropagation(); void handleRowPrint(s, 'A4'); }}>📄 A4</button>
                            </>
                          )}
                        </td>
                      </tr>
                      
                      {isExpanded && sessionDetail && (
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                          <td colSpan={10} style={{ padding: '16px', borderTop: '1px solid #ddd' }}>
                            {/* Resumen */}
                            <div className="cash-detail-card" style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}>
                              <h5 style={{ margin: '0 0 10px 0' }}>Resumen de Sesión</h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                                <div>
                                  <span style={{ color: 'var(--color-muted)' }}>Saldo Inicial</span><br/>
                                  <strong>{sessionDetail.session.opening_balance.toFixed(2)}</strong>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-muted)' }}>Entradas</span><br/>
                                  <strong style={{ color: 'var(--color-ok)' }}>+{sessionDetail.summary.total_in.toFixed(2)}</strong>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-muted)' }}>Salidas</span><br/>
                                  <strong style={{ color: 'var(--color-err)' }}>-{sessionDetail.summary.total_out.toFixed(2)}</strong>
                                </div>
                                <div>
                                  <span style={{ color: 'var(--color-muted)' }}>Saldo Real</span><br/>
                                  <strong>{sessionDetail.session.closing_balance?.toFixed(2) ?? '-'}</strong>
                                </div>
                              </div>
                            </div>

                            {/* Ventas por Tipo de Pago */}
                            {sessionDetail.payment_method_breakdown.length > 0 && (
                              <div className="cash-detail-card" style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}>
                                <h5 style={{ margin: '0 0 10px 0' }}>Ventas por Forma de Pago</h5>
                                <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                                      <th style={{ textAlign: 'left', padding: '6px' }}>Forma de Pago</th>
                                      <th style={{ textAlign: 'center', padding: '6px' }}>Cantidad</th>
                                      <th style={{ textAlign: 'right', padding: '6px' }}>Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sessionDetail.payment_method_breakdown.map((pm) => (
                                      <tr key={pm.payment_method_id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '6px' }}>{pm.payment_method_name?.trim() ? pm.payment_method_name : '-'}</td>
                                        <td style={{ textAlign: 'center', padding: '6px' }}>{pm.document_count}</td>
                                        <td style={{ textAlign: 'right', padding: '6px' }}>{pm.total_amount.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    <tr style={{ borderTop: '2px solid #ddd', fontWeight: 700 }}>
                                      <td style={{ padding: '6px' }}>TOTAL</td>
                                      <td style={{ textAlign: 'center', padding: '6px' }}>
                                        {sessionDetail.payment_method_breakdown.reduce((sum, pm) => sum + pm.document_count, 0)}
                                      </td>
                                      <td style={{ textAlign: 'right', padding: '6px' }}>
                                        {sessionDetail.payment_method_breakdown.reduce((sum, pm) => sum + pm.total_amount, 0).toFixed(2)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Productos vendidos */}
                            {soldProducts.length > 0 && (
                              <div className="cash-detail-card" style={{ padding: '12px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}>
                                <h5 style={{ margin: '0 0 10px 0' }}>Productos vendidos ({soldProducts.length})</h5>
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', fontSize: '0.8rem', tableLayout: 'fixed' }}>
                                    <colgroup>
                                      <col style={{ width: '26%' }} />
                                      <col style={{ width: '11%' }} />
                                      <col style={{ width: '11%' }} />
                                      <col style={{ width: '7%' }} />
                                      <col style={{ width: '8%' }} />
                                      <col style={{ width: '11%' }} />
                                      <col style={{ width: '11%' }} />
                                      <col style={{ width: '9%' }} />
                                      <col style={{ width: '6%' }} />
                                    </colgroup>
                                    <thead>
                                      <tr style={{ borderBottom: '2px solid #ddd' }}>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Producto</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Tipo de pago</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Vendedor</th>
                                        <th style={{ textAlign: 'center', padding: '6px' }}>Unidad</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>Cantidad</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Tipo comprobante</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Serie-correlativo</th>
                                        {workshopMultiVehicleEnabled && <th style={{ textAlign: 'left', padding: '6px' }}>Vehículo</th>}
                                        <th style={{ textAlign: 'center', padding: '6px' }}>Sesion</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>Total</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>Margen</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {soldProducts.map((row) => (
                                        <tr key={`${row.description}-${row.unitCode}-${row.paymentMethod}-${row.sellerName}-${row.documentKind}-${row.documentNumber}-${row.vehiclePlate}`} style={{ borderBottom: '1px solid #eee' }}>
                                          <td style={{ padding: '6px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.description}</td>
                                          <td style={{ padding: '6px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.paymentMethod}</td>
                                          <td style={{ padding: '6px', whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.sellerName}</td>
                                          <td style={{ padding: '6px', textAlign: 'center' }}>{row.unitCode}</td>
                                          <td style={{ padding: '6px', textAlign: 'right' }}>{row.quantity.toFixed(3)}</td>
                                          <td style={{ padding: '6px' }}>{row.documentKind}</td>
                                          <td style={{ padding: '6px' }}>{row.documentNumber}</td>
                                          {workshopMultiVehicleEnabled && <td style={{ padding: '6px' }}>{row.vehiclePlate}</td>}
                                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: 600 }}>#{sessionDetail.session.id}</td>
                                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{row.amount.toFixed(2)}</td>
                                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: row.marginAmount >= 0 ? '#0f766e' : '#b91c1c' }}>
                                            {row.marginAmount.toFixed(2)} ({row.marginPercent.toFixed(1)}%)
                                            <div style={{ fontWeight: 500, fontSize: '0.68rem', color: '#64748b' }}>
                                              {row.marginSource === 'REAL' ? 'Costo real' : row.marginSource === 'MIXED' ? 'Mixto' : 'Estimado'}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <p style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                  * Margen estimado usa un ratio conservador cuando el item no tiene costo trazable en inventario.
                                </p>
                              </div>
                            )}

                            {soldProducts.length === 0 && (
                              <p style={{ color: 'var(--color-muted)', textAlign: 'center' }}>No hay productos vendidos en esta sesion</p>
                            )}
                          </td>
                        </tr>
                      )}

                      {isExpanded && loadingDetail && (
                        <tr>
                          <td colSpan={10} style={{ padding: '16px', textAlign: 'center' }}>Cargando detalles...</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>  {/* end overflow-x:auto */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
              <small>
                Pagina {sessionsMeta.page} de {sessionsMeta.last_page} | Total sesiones: {sessionsMeta.total}
              </small>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="cash-btn cash-btn-soft"
                  type="button"
                  disabled={loading || sessionsMeta.page <= 1}
                  onClick={() => setSessionsPage((prev) => Math.max(1, prev - 1))}
                >
                  ← Anterior
                </button>
                <button
                  className="cash-btn cash-btn-soft"
                  type="button"
                  disabled={loading || sessionsMeta.page >= sessionsMeta.last_page}
                  onClick={() => setSessionsPage((prev) => Math.min(sessionsMeta.last_page, prev + 1))}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {previewDialog && (
        <HtmlPreviewDialog
          title={previewDialog.title}
          subtitle={previewDialog.subtitle}
          html={previewDialog.html}
          variant={previewDialog.variant}
          onClose={() => setPreviewDialog(null)}
        />
      )}
    </section>
  );
}
