import { useEffect, useMemo, useState } from 'react';
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
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
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
  const [previewDialog, setPreviewDialog] = useState<null | {
    title: string;
    subtitle: string;
    html: string;
    variant: 'compact' | 'wide';
  }>(null);
  const [closeResponse, setCloseResponse] = useState<CloseSessionResponse | null>(null);

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

  const soldProducts = useMemo(() => {
    const documents = sessionDetail?.documents ?? [];
    const grouped = new Map<string, {
      description: string;
      unitCode: string;
      paymentMethod: string;
      documentKind: string;
      documentNumber: string;
      quantity: number;
      amount: number;
    }>();

    for (const doc of documents) {
      for (const item of doc.items ?? []) {
        const description = (item.description || '').trim() || 'Producto sin descripcion';
        const unitCode = (item.unit_code || '').trim() || '-';
        const paymentMethod = (doc.payment_method_name || '').trim() || '-';
        const rawDocumentKind = (doc.document_kind || '').trim();
        const documentKind = rawDocumentKind
          ? ({'QUOTATION':'Cotizacion','SALES_ORDER':'Nota de Pedido','INVOICE':'Factura','RECEIPT':'Boleta','CREDIT_NOTE':'Nota de Credito','DEBIT_NOTE':'Nota de Debito'} as Record<string,string>)[rawDocumentKind] ?? rawDocumentKind
          : '-';
        const documentNumber = (doc.document_number || '').trim() || '-';
        const key = `${description.toLowerCase()}__${unitCode.toLowerCase()}__${paymentMethod.toLowerCase()}__${documentKind.toLowerCase()}__${documentNumber.toLowerCase()}`;
        const current = grouped.get(key);

        if (current) {
          current.quantity += Number(item.quantity || 0);
          current.amount += Number(item.line_total || 0);
        } else {
          grouped.set(key, {
            description,
            unitCode,
            paymentMethod,
            documentKind,
            documentNumber,
            quantity: Number(item.quantity || 0),
            amount: Number(item.line_total || 0),
          });
        }
      }
    }

    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [sessionDetail]);

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
          closedAt: new Date().toISOString(),
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
    <section className="module-panel">
      <div className="module-header">
        <h3>Caja</h3>
        <button
          type="button"
          onClick={() => {
            if (activeTab === 'sesion') void loadCurrentSession();
            else void loadHistory();
          }}
          disabled={loading}
        >
          Refrescar
        </button>
      </div>

      {message && <p className={isError ? 'error-box' : 'notice'}>{message}</p>}

      <nav className="sub-tabs">
        <button
          type="button"
          className={activeTab === 'sesion' ? 'active' : ''}
          onClick={() => { setActiveTab('sesion'); void loadCurrentSession(); }}
        >
          Sesion Activa
        </button>
        <button
          type="button"
          className={activeTab === 'historial' ? 'active' : ''}
          onClick={() => {
            setActiveTab('historial');
            setSessionsPage(1);
          }}
        >
          Historial
        </button>
      </nav>

      {/* ── SESION ACTIVA ── */}
      {activeTab === 'sesion' && (
        <>
          {!currentSession && (
            <div className="form-card">
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
              <button type="button" onClick={handleOpenSession} disabled={loading || !cashRegisterId}>
                Abrir Caja
              </button>
            </div>
          )}

          {currentSession && (
            <>
              <div className="stat-grid">
                <article>
                  <span>Estado</span>
                  <strong style={{ color: 'var(--color-ok)' }}>ABIERTA</strong>
                </article>
                <article>
                  <span>Apertura</span>
                  <strong>{Number(currentSession.opening_balance).toFixed(2)}</strong>
                </article>
                <article>
                  <span>Ingresos</span>
                  <strong style={{ color: 'var(--color-ok)' }}>+{totalIn.toFixed(2)}</strong>
                </article>
                <article>
                  <span>Egresos</span>
                  <strong style={{ color: 'var(--color-err)' }}>-{totalOut.toFixed(2)}</strong>
                </article>
                <article>
                  <span>Saldo esperado</span>
                  <strong>{Number(currentSession.expected_balance).toFixed(2)}</strong>
                </article>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
                Abierta: {currentSession.opened_at} · Caja: {currentSession.cash_register_name ?? currentSession.cash_register_code ?? currentSession.cash_register_id}
              </p>

              {/* Nuevo movimiento */}
              <div className="form-card">
                <h4>Registrar Movimiento</h4>
                <form onSubmit={(e) => void handleAddMovement(e)}>
                  <div className="grid-form">
                    <label>
                      Tipo
                      <select value={movType} onChange={(e) => setMovType(e.target.value as 'IN' | 'OUT')}>
                        <option value="IN">Ingreso (IN)</option>
                        <option value="OUT">Egreso (OUT)</option>
                      </select>
                    </label>
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
                    <label style={{ gridColumn: '1 / -1' }}>
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
                  <button type="submit" disabled={submittingMov || loading}>
                    {submittingMov ? 'Registrando...' : 'Agregar Movimiento'}
                  </button>
                </form>
              </div>

              {/* Movimientos de la sesion */}
              <div className="table-wrap">
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
                          {m.movement_type}
                        </td>
                        <td>{Number(m.amount).toFixed(2)}</td>
                        <td>{m.description}</td>
                        <td>{m.payment_method_name?.trim() ? m.payment_method_name : '-'}</td>
                        <td>{m.ref_type ?? 'MANUAL'}{m.ref_id ? ` #${m.ref_id}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cierre de caja */}
              {!showCloseForm && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => setShowCloseForm(true)}
                  style={{ marginTop: '1rem' }}
                >
                  Cerrar Caja
                </button>
              )}

              {showCloseForm && (
                <div className="form-card" style={{ borderColor: 'var(--color-err)' }}>
                  <h4>Cierre de Caja</h4>
                  <p>Saldo esperado: <strong>{Number(currentSession.expected_balance).toFixed(2)}</strong></p>
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
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => void handlePreviewBeforeClose()} disabled={loading || loadingDetail}>
                      {loadingDetail ? 'Generando vista previa...' : 'Previsualizar Cierre'}
                    </button>
                    <button type="button" className="danger" onClick={() => setShowConfirmClosePopup(true)} disabled={loading}>
                      Confirmar Cierre
                    </button>
                    <button type="button" onClick={() => setShowCloseForm(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {showConfirmClosePopup && (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.58)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 3000,
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      width: 'min(520px, 96vw)',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                      border: '1px solid #dbe4f0',
                      borderRadius: '14px',
                      boxShadow: '0 28px 70px rgba(15, 23, 42, 0.38)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '14px 16px 10px',
                        borderBottom: '1px solid #e5e7eb',
                        background: 'linear-gradient(120deg, #0f172a 0%, #1e3a8a 100%)',
                        color: '#fff',
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: '1rem', letterSpacing: '0.2px' }}>Confirmar cierre de caja</h4>
                    </div>
                    <div style={{ padding: '16px' }}>
                      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.95rem', lineHeight: 1.45 }}>
                        Esta accion cerrara la sesion actual y registrara el cierre en el sistema. ¿Estas seguro de proceder?
                      </p>
                      <div style={{ marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setShowConfirmClosePopup(false)}>
                          Cancelar
                        </button>
                        <button type="button" className="danger" onClick={() => void confirmAndCloseSession()} disabled={loading}>
                          Cerrar caja
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {closeResponse && (
                <div className="form-card" style={{ borderColor: 'var(--color-ok)' }}>
                  <h4>Resumen de Cierre</h4>
                  <div className="stat-grid">
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
                    <button type="button" onClick={handlePrintReport80mm}>
                      🖨 Imprimir 80mm (Térmica)
                    </button>
                    <button type="button" onClick={handlePrintReportA4}>
                      🖨 Imprimir A4
                    </button>
                    <button type="button" onClick={() => { setCloseResponse(null); void loadCurrentSession(); }}>
                      Nueva Sesión
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── HISTORIAL ── */}
      {activeTab === 'historial' && (
        <>
          <div className="table-wrap">
            <h4>Historial de Sesiones de Caja</h4>
            <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ minWidth: '1420px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '44px', padding: '10px 12px' }}></th>
                  <th style={{ minWidth: '180px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Fecha de Apertura</th>
                  <th style={{ minWidth: '320px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Caja / Punto de Caja</th>
                  <th style={{ minWidth: '170px', padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Saldo de Apertura</th>
                  <th style={{ minWidth: '170px', padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Saldo de Cierre</th>
                  <th style={{ minWidth: '170px', padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>Diferencia de Caja</th>
                  <th style={{ minWidth: '130px', padding: '10px 14px', whiteSpace: 'nowrap' }}>Estado</th>
                  <th style={{ minWidth: '220px', padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>Acciones / Vista Previa</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center' }}>Sin sesiones</td></tr>
                )}
                {sessions.map((s) => {
                  const difference = s.closing_balance != null ? Number(s.closing_balance) - Number(s.expected_balance) : null;
                  const isExpanded = expandedSessionId === s.id;
                  return (
                    <tbody key={`session-${s.id}`}>
                      <tr onClick={() => void handleExpandSession(s.id)} style={{ cursor: 'pointer', backgroundColor: isExpanded ? '#f0f0f0' : undefined }}>
                        <td style={{ textAlign: 'center', padding: '10px 12px' }}>{isExpanded ? '▼' : '▶'}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.opened_at ? new Date(s.opened_at).toLocaleString() : '-'}</td>
                        <td style={{ padding: '10px 14px', minWidth: '320px' }}>{s.cash_register_name ?? s.cash_register_code ?? s.cash_register_id}</td>
                        <td style={{ textAlign:'right', padding: '10px 14px', whiteSpace: 'nowrap' }}>{Number(s.opening_balance).toFixed(2)}</td>
                        <td style={{ textAlign: 'right', padding: '10px 14px', whiteSpace: 'nowrap' }}>{s.closing_balance != null ? Number(s.closing_balance).toFixed(2) : '-'}</td>
                        <td style={{  textAlign: 'right', padding: '10px 14px', whiteSpace: 'nowrap', color: difference != null && difference >= 0 ? 'var(--color-ok)' : difference != null ? 'var(--color-err)' : undefined }}>
                          {difference != null ? (difference >= 0 ? '+' : '') + difference.toFixed(2) : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: s.status === 'CLOSED' ? 'var(--color-ok)' : 'var(--color-info)' }}>
                          {s.status}
                        </td>
                        <td style={{ textAlign: 'center', padding: '10px 14px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          {s.status === 'CLOSED' && (
                            <>
                              <button type="button" style={{ marginRight: '4px', fontSize: '0.8rem', padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); void handleRowPrint(s, '80mm'); }}>80mm</button>
                              <button type="button" style={{ fontSize: '0.8rem', padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); void handleRowPrint(s, 'A4'); }}>A4</button>
                            </>
                          )}
                        </td>
                      </tr>
                      
                      {isExpanded && sessionDetail && (
                        <tr style={{ backgroundColor: '#fafafa' }}>
                          <td colSpan={8} style={{ padding: '16px', borderTop: '1px solid #ddd' }}>
                            {/* Resumen */}
                            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}>
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
                              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}>
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
                              <div style={{ padding: '12px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '6px' }}>
                                <h5 style={{ margin: '0 0 10px 0' }}>Productos vendidos ({soldProducts.length})</h5>
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', fontSize: '0.8rem' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '2px solid #ddd' }}>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Producto</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Tipo de pago</th>
                                        <th style={{ textAlign: 'center', padding: '6px' }}>Unidad</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>Cantidad</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Tipo comprobante</th>
                                        <th style={{ textAlign: 'left', padding: '6px' }}>Serie-correlativo</th>
                                        <th style={{ textAlign: 'right', padding: '6px' }}>Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {soldProducts.map((row) => (
                                        <tr key={`${row.description}-${row.unitCode}-${row.paymentMethod}-${row.documentKind}-${row.documentNumber}`} style={{ borderBottom: '1px solid #eee' }}>
                                          <td style={{ padding: '6px' }}>{row.description}</td>
                                          <td style={{ padding: '6px' }}>{row.paymentMethod}</td>
                                          <td style={{ padding: '6px', textAlign: 'center' }}>{row.unitCode}</td>
                                          <td style={{ padding: '6px', textAlign: 'right' }}>{row.quantity.toFixed(3)}</td>
                                          <td style={{ padding: '6px' }}>{row.documentKind}</td>
                                          <td style={{ padding: '6px' }}>{row.documentNumber}</td>
                                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{row.amount.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
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
                          <td colSpan={8} style={{ padding: '16px', textAlign: 'center' }}>Cargando detalles...</td>
                        </tr>
                      )}
                    </tbody>
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
                  type="button"
                  disabled={loading || sessionsMeta.page <= 1}
                  onClick={() => setSessionsPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={loading || sessionsMeta.page >= sessionsMeta.last_page}
                  onClick={() => setSessionsPage((prev) => Math.min(sessionsMeta.last_page, prev + 1))}
                >
                  Siguiente
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
