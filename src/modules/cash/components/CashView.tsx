import { useEffect, useMemo, useState } from 'react';
import {
  closeCashSession,
  createCashMovement,
  fetchCashMovements,
  fetchCashSessions,
  fetchCurrentSession,
  openCashSession,
} from '../api';
import type { CashMovement, CashSession } from '../types';

type CashViewProps = {
  accessToken: string;
  cashRegisterId: number | null;
};

export function CashView({ accessToken, cashRegisterId }: CashViewProps) {
  const [activeTab, setActiveTab] = useState<'sesion' | 'historial'>('sesion');
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Form: apertura de caja
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [openNotes, setOpenNotes] = useState('');

  // Form: cierre de caja
  const [closingBalance, setClosingBalance] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);

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
        limit: 30,
      });
      setSessions(rows);
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
      await closeCashSession(accessToken, currentSession.id, {
        closing_balance: parseFloat(closingBalance) || 0,
        notes: closeNotes || undefined,
      });
      setShowCloseForm(false);
      setCloseNotes('');
      await loadCurrentSession();
      setMessage('Caja cerrada correctamente');
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : 'Error al cerrar sesion');
    } finally {
      setLoading(false);
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
          onClick={() => { setActiveTab('historial'); void loadHistory(); }}
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
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center' }}>Sin movimientos</td></tr>
                    )}
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td>{m.movement_at}</td>
                        <td style={{ color: m.movement_type === 'IN' ? 'var(--color-ok)' : 'var(--color-err)' }}>
                          {m.movement_type}
                        </td>
                        <td>{Number(m.amount).toFixed(2)}</td>
                        <td>{m.description}</td>
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
                    <button type="button" className="danger" onClick={handleCloseSession} disabled={loading}>
                      Confirmar Cierre
                    </button>
                    <button type="button" onClick={() => setShowCloseForm(false)}>
                      Cancelar
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
        <div className="table-wrap">
          <h4>Historial de sesiones</h4>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Caja</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Saldo apertura</th>
                <th>Saldo esperado</th>
                <th>Saldo fisico</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>Sin sesiones</td></tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.cash_register_name ?? s.cash_register_code ?? s.cash_register_id}</td>
                  <td>{s.opened_at}</td>
                  <td>{s.closed_at ?? '-'}</td>
                  <td>{Number(s.opening_balance).toFixed(2)}</td>
                  <td>{Number(s.expected_balance).toFixed(2)}</td>
                  <td>{s.closing_balance != null ? Number(s.closing_balance).toFixed(2) : '-'}</td>
                  <td style={{ color: s.status === 'OPEN' ? 'var(--color-ok)' : undefined }}>
                    {s.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
