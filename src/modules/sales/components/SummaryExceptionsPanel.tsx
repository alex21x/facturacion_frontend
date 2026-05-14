import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchDailySummaries,
  fetchDailySummaryDetail,
  queryDailySummaryTicketStatus,
  sendDailySummary,
} from '../api/dailySummary';
import type {
  DailySummaryDetail,
  DailySummaryListItem,
  DailySummaryStatus,
  DailySummaryType,
  PaginatedDailySummaries,
} from '../api/dailySummary';

type Props = {
  accessToken: string;
};

const SUMMARY_STATUS_LABELS: Record<DailySummaryStatus, string> = {
  DRAFT: 'Borrador',
  SENDING: 'Enviando',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  ERROR: 'Error',
};

const SUMMARY_EXCEPTION_STATUS_OPTIONS: Array<{ value: DailySummaryStatus | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'SENT', label: 'Enviado (pendiente)' },
  { value: 'ERROR', label: 'Error' },
  { value: 'REJECTED', label: 'Rechazado' },
  { value: 'SENDING', label: 'Enviando' },
];

function normalizeSunatTicket(ticket: string | null | undefined): string | null {
  const value = String(ticket ?? '').trim();
  if (!value) return null;

  const normalized = value.toUpperCase();
  if (['NULL', 'NONE', 'N/A', 'NA', '-', 'S/T', 'SIN TICKET'].includes(normalized)) {
    return null;
  }

  return value;
}

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

function canResendSummary(summary: DailySummaryListItem): boolean {
  const base = ['DRAFT', 'ERROR', 'REJECTED'].includes(summary.status);
  if (base) return true;

  return summary.status === 'SENT' && normalizeSunatTicket(summary.sunat_ticket) === null;
}

export function SummaryExceptionsPanel({ accessToken }: Props) {
  const [summaryType, setSummaryType] = useState<DailySummaryType>(1);
  const [status, setStatus] = useState<DailySummaryStatus | ''>('SENT');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const [list, setList] = useState<PaginatedDailySummaries>({
    data: [],
    meta: { page: 1, per_page: 20, total: 0, last_page: 1 },
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DailySummaryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [sendingId, setSendingId] = useState<number | null>(null);
  const [queryingId, setQueryingId] = useState<number | null>(null);

  const selectedSummary = useMemo(() => {
    if (selectedId === null) return null;
    return list.data.find((row) => row.id === selectedId) ?? null;
  }, [list.data, selectedId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchDailySummaries(accessToken, {
        summary_type: summaryType,
        status: status || undefined,
        page,
        per_page: 20,
      });

      setList(response);

      if (response.data.length === 0) {
        setSelectedId(null);
        setDetail(null);
      } else if (selectedId === null || !response.data.some((row) => row.id === selectedId)) {
        setSelectedId(response.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar excepciones de resumenes.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, summaryType, status, page, selectedId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }

    setDetailLoading(true);
    fetchDailySummaryDetail(accessToken, selectedId)
      .then(setDetail)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle del resumen.');
      })
      .finally(() => setDetailLoading(false));
  }, [accessToken, selectedId]);

  const handleResend = useCallback(async (summaryId: number) => {
    setSendingId(summaryId);
    setError(null);
    setResultMessage(null);

    try {
      const response = await sendDailySummary(accessToken, summaryId);
      setResultMessage(response.label || response.message || 'Resumen procesado.');
      await loadList();
      if (selectedId === summaryId) {
        const refreshed = await fetchDailySummaryDetail(accessToken, summaryId);
        setDetail(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el resumen.');
    } finally {
      setSendingId(null);
    }
  }, [accessToken, loadList, selectedId]);

  const handleQueryTicket = useCallback(async (summaryId: number) => {
    setQueryingId(summaryId);
    setError(null);
    setResultMessage(null);

    try {
      const response = await queryDailySummaryTicketStatus(accessToken, summaryId);
      setResultMessage(response.label || response.message || 'Ticket procesado.');
      await loadList();
      if (selectedId === summaryId) {
        const refreshed = await fetchDailySummaryDetail(accessToken, summaryId);
        setDetail(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el ticket SUNAT.');
    } finally {
      setQueryingId(null);
    }
  }, [accessToken, loadList, selectedId]);

  return (
    <section className="sunat-exceptions__card">
      <div className="sunat-exceptions__filters">
        <label className="sunat-exceptions__field">
          <span>Tipo resumen</span>
          <select
            value={String(summaryType)}
            onChange={(e) => {
              setPage(1);
              setSummaryType(Number(e.target.value) as DailySummaryType);
            }}
          >
            <option value="1">RC - Declaracion</option>
            <option value="3">RA - Anulacion</option>
          </select>
        </label>

        <label className="sunat-exceptions__field">
          <span>Estado</span>
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as DailySummaryStatus | '');
            }}
          >
            {SUMMARY_EXCEPTION_STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="sunat-exceptions__error">{error}</div>}
      {resultMessage && <div className="sunat-exceptions__chip sunat-exceptions__chip--ok" style={{ marginBottom: 10 }}>{resultMessage}</div>}

      <div className="sunat-exceptions__layout">
        <div className="sunat-exceptions__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Resumen</th>
                <th>Estado</th>
                <th>Ticket</th>
                <th>Actualizado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="sunat-exceptions__empty-cell">
                    {loading ? 'Cargando resumenes...' : 'Sin resumenes en excepcion para este filtro'}
                  </td>
                </tr>
              ) : list.data.map((row) => {
                const ticket = normalizeSunatTicket(row.sunat_ticket);
                const canSend = canResendSummary(row);
                const canQuery = Boolean(ticket);
                const isSelected = row.id === selectedId;

                return (
                  <tr
                    key={row.id}
                    className={isSelected ? 'sunat-exceptions__row is-selected' : 'sunat-exceptions__row'}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td>
                      <strong>{row.identifier}</strong>
                      <div className="sunat-exceptions__customer">{row.summary_type === 1 ? 'RC - Declaracion' : 'RA - Anulacion'}</div>
                    </td>
                    <td>
                      <span className={`ds-badge ds-badge--${row.status.toLowerCase()}`}>{SUMMARY_STATUS_LABELS[row.status]}</span>
                    </td>
                    <td>{ticket ?? '-'}</td>
                    <td>{formatDateTime(row.updated_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canSend && (
                          <button
                            type="button"
                            className="btn-mini"
                            disabled={sendingId === row.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleResend(row.id);
                            }}
                          >
                            {sendingId === row.id ? 'Enviando...' : 'Reenviar'}
                          </button>
                        )}
                        {canQuery && (
                          <button
                            type="button"
                            className="btn-mini"
                            disabled={queryingId === row.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleQueryTicket(row.id);
                            }}
                          >
                            {queryingId === row.id ? 'Consultando...' : 'Consultar ticket'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside className="sunat-exceptions__aside">
          {!selectedSummary ? (
            <p className="sunat-exceptions__aside-empty">Selecciona un resumen para ver su detalle tecnico.</p>
          ) : detailLoading ? (
            <p className="sunat-exceptions__aside-empty">Cargando detalle del resumen...</p>
          ) : detail ? (
            <div className="sunat-exceptions__aside-content">
              <h3 className="sunat-exceptions__aside-title">{detail.identifier}</h3>
              <p className="sunat-exceptions__aside-meta">
                Estado: {SUMMARY_STATUS_LABELS[detail.status]} · Ticket: {normalizeSunatTicket(detail.sunat_ticket) ?? '-'}
              </p>
              {detail.sunat_cdr_code && (
                <p className="sunat-exceptions__aside-meta">
                  CDR: {detail.sunat_cdr_code} {detail.sunat_cdr_desc ?? ''}
                </p>
              )}
              {detail.sunat_error_code && (
                <p className="sunat-exceptions__aside-meta">
                  Error SUNAT: {detail.sunat_error_code} {detail.sunat_error_message ?? ''}
                </p>
              )}
              {detail.raw_response && (
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.75rem' }}>Respuesta puente</summary>
                  <pre className="ds-response-box">{JSON.stringify(detail.raw_response, null, 2)}</pre>
                </details>
              )}
            </div>
          ) : (
            <p className="sunat-exceptions__aside-empty">Sin detalle disponible para este resumen.</p>
          )}
        </aside>
      </div>

      <div className="sunat-exceptions__footer">
        <small className="sunat-exceptions__meta">
          Pagina {list.meta.page} de {list.meta.last_page} · Total {list.meta.total}
        </small>
        <div className="sunat-exceptions__pager">
          <button type="button" className="btn-mini" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
          <button type="button" className="btn-mini" disabled={loading || page >= list.meta.last_page} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
        </div>
      </div>
    </section>
  );
}
