import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchSunatExceptions,
  fetchSunatExceptionsAudit,
  manualConfirmSunatException,
} from '../api';
import type {
  ManualSunatConfirmPayload,
  PaginatedSunatExceptions,
  SunatExceptionItem,
  SunatExceptionsAuditResponse,
} from '../types';

type Props = {
  accessToken: string;
  branchId?: number | null;
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING_CONFIRMATION', label: 'Pendiente confirmacion' },
  { value: 'PENDING_MANUAL', label: 'Pendiente manual' },
  { value: 'PENDING_SUMMARY', label: 'Pendiente resumen RC' },
  { value: 'PENDING', label: 'Pendiente envio' },
  { value: 'NOT_SENT', label: 'No enviado' },
  { value: 'EXPIRED_WINDOW', label: 'Fuera de plazo' },
  { value: 'HTTP_ERROR', label: 'Error HTTP' },
  { value: 'NETWORK_ERROR', label: 'Error de red' },
  { value: 'CONFIG_INCOMPLETE', label: 'Config incompleta' },
  { value: 'ERROR', label: 'Error general' },
  { value: 'SENDING', label: 'Enviando' },
  { value: 'REJECTED', label: 'Rechazado' },
];

const EVIDENCE_OPTIONS: Array<{ value: ManualSunatConfirmPayload['evidence_type']; label: string }> = [
  { value: 'TICKET', label: 'Ticket' },
  { value: 'CDR', label: 'CDR' },
  { value: 'WHATSAPP', label: 'WhatsApp interno' },
  { value: 'EMAIL', label: 'Correo interno' },
  { value: 'OBSERVATION', label: 'Observacion operativa' },
  { value: 'OTHER', label: 'Otro' },
];

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  }).format(date);
}

export function SunatExceptionsView({ accessToken, branchId = null }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [minAgeHours, setMinAgeHours] = useState(6);
  const [minAttempts, setMinAttempts] = useState(0);
  const [onlyManualNeeded, setOnlyManualNeeded] = useState(false);
  const [queue, setQueue] = useState<PaginatedSunatExceptions>({
    data: [],
    meta: { page: 1, per_page: 20, total: 0, last_page: 1 },
  });
  const [audit, setAudit] = useState<SunatExceptionsAuditResponse | null>(null);
  const [selected, setSelected] = useState<SunatExceptionItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [resolution, setResolution] = useState<ManualSunatConfirmPayload['resolution']>('ACCEPTED');
  const [evidenceType, setEvidenceType] = useState<ManualSunatConfirmPayload['evidence_type']>('WHATSAPP');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queueResponse, auditResponse] = await Promise.all([
        fetchSunatExceptions(accessToken, {
          branchId,
          status,
          minAgeHours,
          minAttempts,
          onlyManualNeeded,
          page,
          perPage: 20,
        }),
        fetchSunatExceptionsAudit(accessToken, {
          branchId,
          limit: 250,
        }),
      ]);

      setQueue(queueResponse);
      setAudit(auditResponse);

      if (queueResponse.data.length === 0) {
        setSelected(null);
      } else if (!selected || !queueResponse.data.some((row) => row.id === selected.id)) {
        setSelected(queueResponse.data[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la bandeja de excepciones SUNAT.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, branchId, status, minAgeHours, minAttempts, onlyManualNeeded, page, selected]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleManualConfirm = useCallback(async () => {
    if (!selected) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await manualConfirmSunatException(accessToken, selected.id, {
        resolution,
        evidence_type: evidenceType,
        evidence_ref: evidenceRef.trim() || undefined,
        evidence_note: evidenceNote.trim() || undefined,
      });
      setEvidenceRef('');
      setEvidenceNote('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la confirmacion manual.');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, selected, resolution, evidenceType, evidenceRef, evidenceNote, loadData]);

  const stats = useMemo(() => {
    return audit?.summary ?? {
      total_issued: 0,
      pending_sunat: 0,
      inventory_settled: 0,
      mismatch_count: 0,
    };
  }, [audit]);

  const mismatchChipClass = stats.mismatch_count > 0
    ? 'sunat-exceptions__chip sunat-exceptions__chip--danger'
    : 'sunat-exceptions__chip sunat-exceptions__chip--ok';

  return (
    <section className="sunat-exceptions">
      <header className="sunat-exceptions__header">
        <div>
          <h2 className="sunat-exceptions__title">Excepciones SUNAT</h2>
          <p className="sunat-exceptions__subtitle">
            Control operativo de pendientes SUNAT, conciliacion automatica y riesgo de inventario liquidado.
          </p>
        </div>
        <div className="sunat-exceptions__chips">
          <span className="sunat-exceptions__chip">Emitidos: {stats.total_issued}</span>
          <span className="sunat-exceptions__chip">Pendientes SUNAT (global): {stats.pending_sunat}</span>
          <span className="sunat-exceptions__chip">En bandeja (filtros): {queue.meta.total}</span>
          <span className="sunat-exceptions__chip">Inventario consolidado: {stats.inventory_settled}</span>
          <span className={mismatchChipClass}>
            Descuadres: {stats.mismatch_count}
          </span>
        </div>
      </header>

      <section className="sunat-exceptions__card">
        <div className="sunat-exceptions__filters">
          <label className="sunat-exceptions__field">
            <span>Estado SUNAT</span>
            <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="sunat-exceptions__field">
            <span>Min horas</span>
            <input type="number" min={0} value={minAgeHours} onChange={(e) => { setPage(1); setMinAgeHours(Number(e.target.value || 0)); }} />
          </label>
          <label className="sunat-exceptions__field">
            <span>Min intentos</span>
            <input type="number" min={0} value={minAttempts} onChange={(e) => { setPage(1); setMinAttempts(Number(e.target.value || 0)); }} />
          </label>
          <label className="sunat-exceptions__manual-toggle">
            <input
              type="checkbox"
              checked={onlyManualNeeded}
              onChange={(e) => {
                setPage(1);
                setOnlyManualNeeded(e.target.checked);
              }}
            />
            Solo requiere gestion manual
          </label>
        </div>

        {error && (
          <div className="sunat-exceptions__error">
            {error}
          </div>
        )}

        <div className="sunat-exceptions__layout">
          <div className="sunat-exceptions__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>SUNAT</th>
                  <th>Horas</th>
                  <th>Intentos</th>
                  <th>Inventario</th>
                </tr>
              </thead>
              <tbody>
                {queue.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="sunat-exceptions__empty-cell">
                      {loading ? 'Cargando excepciones...' : 'Sin excepciones con los filtros actuales'}
                    </td>
                  </tr>
                ) : queue.data.map((row) => {
                  const isSelected = selected?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className={isSelected ? 'sunat-exceptions__row is-selected' : 'sunat-exceptions__row'}
                    >
                      <td>
                        <strong>{row.document_kind}</strong> {row.series}-{row.number}
                        <div className="sunat-exceptions__customer">{row.customer_name}</div>
                      </td>
                      <td>
                        <span className={`sales-sunat-badge ${row.sunat_status === 'PENDING_CONFIRMATION' ? 'is-warn' : 'is-progress'}`}>
                          {row.sunat_label}
                        </span>
                      </td>
                      <td>{row.pending_hours}</td>
                      <td>{row.reconcile_attempts}</td>
                      <td>
                        {row.inventory_mismatch ? (
                          <span className="sunat-exceptions__inventory-alert">Descuadre</span>
                        ) : row.inventory_sunat_settled ? 'Consolidado' : 'Pendiente'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="sunat-exceptions__aside">
            {!selected ? (
              <p className="sunat-exceptions__aside-empty">Selecciona una excepcion para gestionar confirmacion manual.</p>
            ) : (
              <div className="sunat-exceptions__aside-content">
                <h3 className="sunat-exceptions__aside-title">Gestion manual con evidencia</h3>
                <p className="sunat-exceptions__aside-doc">
                  Documento #{selected.id} · {selected.document_kind} {selected.series}-{selected.number}
                </p>
                <p className="sunat-exceptions__aside-meta">
                  Emision: {formatDateTime(selected.issue_at)} · Ult. sync: {formatDateTime(selected.sunat_reconcile_next_at)}
                </p>

                {(selected.sunat_error_code || selected.sunat_error_message) && (
                  <div className="sunat-exceptions__error" style={{ marginBottom: 12 }}>
                    {selected.sunat_error_code && <div><strong>Codigo SUNAT:</strong> {selected.sunat_error_code}</div>}
                    {selected.sunat_error_message && <div><strong>Detalle:</strong> {selected.sunat_error_message}</div>}
                  </div>
                )}

                <label className="sunat-exceptions__field">
                  <span>Resolucion</span>
                  <select value={resolution} onChange={(e) => setResolution(e.target.value as ManualSunatConfirmPayload['resolution'])}>
                    <option value="ACCEPTED">Confirmar aceptado</option>
                    <option value="REJECTED">Confirmar rechazado</option>
                  </select>
                </label>

                <label className="sunat-exceptions__field">
                  <span>Tipo evidencia</span>
                  <select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value as ManualSunatConfirmPayload['evidence_type'])}>
                    {EVIDENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="sunat-exceptions__field">
                  <span>Referencia</span>
                  <input
                    type="text"
                    placeholder="Ticket, URL, numero de caso"
                    value={evidenceRef}
                    onChange={(e) => setEvidenceRef(e.target.value)}
                  />
                </label>

                <label className="sunat-exceptions__field">
                  <span>Nota operativa</span>
                  <textarea
                    rows={3}
                    placeholder="Detalle breve de la validacion manual"
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className="sunat-exceptions__primary-btn"
                  disabled={submitting}
                  onClick={() => void handleManualConfirm()}
                >
                  {submitting ? 'Registrando...' : 'Confirmar manual con evidencia'}
                </button>
              </div>
            )}
          </aside>
        </div>

        <div className="sunat-exceptions__footer">
          <small className="sunat-exceptions__meta">
            Pagina {queue.meta.page} de {queue.meta.last_page} · Total {queue.meta.total}
          </small>
          <div className="sunat-exceptions__pager">
            <button type="button" className="btn-mini" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <button type="button" className="btn-mini" disabled={loading || page >= queue.meta.last_page} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
          </div>
        </div>
      </section>
    </section>
  );
}
