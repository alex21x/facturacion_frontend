import { useEffect, useRef, useState } from 'react';
import {
  createDailySummary,
  deleteDailySummary,
  fetchDailySummaryAuditAttemptDetail,
  fetchDailySummaryAuditAttempts,
  fetchDailySummaryDetail,
  fetchDailySummaries,
  fetchEligibleDocuments,
  removeDailySummaryDocument,
  sendDailySummary,
} from '../api/dailySummary';
import type {
  DailySummaryDetail,
  DailySummaryAuditAttempt,
  DailySummaryAuditAttemptDetail,
  DailySummaryEligibleDoc,
  DailySummaryListItem,
  DailySummaryStatus,
  DailySummaryType,
  PaginatedDailySummaries,
} from '../api/dailySummary';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  accessToken: string;
  branchId: number | null;
  traceabilityEnabled?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DailySummaryStatus, string> = {
  DRAFT: 'Borrador',
  SENDING: 'Enviando…',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  ERROR: 'Error',
};


function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';

  const trimmed = dateStr.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }

  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
}

function fmtDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString('es-PE', { timeZone: 'America/Lima' });
}

function formatDebugJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (raw === '') {
      return '""';
    }

    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return raw;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');

  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailySummaryView({ accessToken, branchId, traceabilityEnabled = false }: Props) {
  // ── Tab: 3=Anulación (RA), 1=Declaración (RC) ──────────────────────────────
  const [activeType, setActiveType] = useState<DailySummaryType>(3);

  // ── List state ──────────────────────────────────────────────────────────────
  const [listData, setListData] = useState<PaginatedDailySummaries | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<DailySummaryStatus | ''>('');
  const [page, setPage] = useState(1);

  // ── Detail panel ────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DailySummaryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Traceability by attempt (RA/RC audit logs) ─────────────────────────────
  const [summaryAuditLogs, setSummaryAuditLogs] = useState<DailySummaryAuditAttempt[]>([]);
  const [summaryAuditLoading, setSummaryAuditLoading] = useState(false);
  const [summaryAuditError, setSummaryAuditError] = useState('');
  const [summaryAuditSelectedLogId, setSummaryAuditSelectedLogId] = useState<number | null>(null);
  const [summaryAuditLoadingDetailLogId, setSummaryAuditLoadingDetailLogId] = useState<number | null>(null);
  const [summaryAuditDetails, setSummaryAuditDetails] = useState<Record<number, DailySummaryAuditAttemptDetail | null | undefined>>({});

  // ── New summary wizard ───────────────────────────────────────────────────────
  const [showWizard, setShowWizard] = useState(false);
  const [wizardDate, setWizardDate] = useState(todayIso);
  const [eligibleDocs, setEligibleDocs] = useState<DailySummaryEligibleDoc[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligibleError, setEligibleError] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [wizardNotes, setWizardNotes] = useState('');
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');

  // ── Send state ───────────────────────────────────────────────────────────────
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendResult, setSendResult] = useState<string>('');

  // ── Delete state ─────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [removingDocumentId, setRemovingDocumentId] = useState<number | null>(null);

  // ── Misc ─────────────────────────────────────────────────────────────────────
  const [actionError, setActionError] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  // ── Load list ────────────────────────────────────────────────────────────────

  const loadList = () => {
    setListLoading(true);
    setListError('');

    fetchDailySummaries(accessToken, {
      summary_type: activeType,
      date: filterDate || undefined,
      status: filterStatus || undefined,
      page,
      per_page: 25,
    })
      .then((res) => setListData(res))
      .catch((err: Error) => setListError(err.message))
      .finally(() => setListLoading(false));
  };

  // Reset page & reload when tab or filters change
  useEffect(() => {
    setPage(1);
    setSelectedId(null);
    setDetail(null);
    setSendResult('');
    setActionError('');
  }, [activeType, filterDate, filterStatus]);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, filterDate, filterStatus, page]);

  // ── Load detail ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      setSummaryAuditLogs([]);
      setSummaryAuditSelectedLogId(null);
      setSummaryAuditDetails({});
      setSummaryAuditError('');
      setSummaryAuditLoading(false);
      return;
    }

    setDetailLoading(true);
    fetchDailySummaryDetail(accessToken, selectedId)
      .then((res) => setDetail(res))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId, accessToken]);

  useEffect(() => {
    if (!traceabilityEnabled) {
      setSummaryAuditLogs([]);
      setSummaryAuditSelectedLogId(null);
      setSummaryAuditDetails({});
      setSummaryAuditError('');
      setSummaryAuditLoading(false);
      return;
    }

    if (!detail) {
      setSummaryAuditLogs([]);
      setSummaryAuditSelectedLogId(null);
      setSummaryAuditDetails({});
      setSummaryAuditError('');
      setSummaryAuditLoading(false);
      return;
    }

    setSummaryAuditLoading(true);
    setSummaryAuditError('');
    setSummaryAuditLogs([]);
    setSummaryAuditSelectedLogId(null);
    setSummaryAuditDetails({});

    fetchDailySummaryAuditAttempts(accessToken, {
      summary_type: detail.summary_type,
      summary_date: detail.summary_date,
      identifier: detail.identifier,
      branch_id: detail.branch_id,
      limit: 30,
    })
      .then((res) => {
        const logs = Array.isArray(res.logs) ? res.logs : [];
        setSummaryAuditLogs(logs);
        if (logs.length > 0) {
          const firstLogId = logs[0].id;
          setSummaryAuditSelectedLogId(firstLogId);
          void loadSummaryAuditAttemptDetail(firstLogId);
        }
      })
      .catch((err: Error) => {
        setSummaryAuditError(err.message || 'No se pudo cargar el historial de intentos.');
      })
      .finally(() => {
        setSummaryAuditLoading(false);
      });
  }, [detail, accessToken, traceabilityEnabled]);

  const loadSummaryAuditAttemptDetail = async (logId: number) => {
    setSummaryAuditSelectedLogId(logId);
    setSummaryAuditLoadingDetailLogId(logId);
    setSummaryAuditError('');

    try {
      const data = await fetchDailySummaryAuditAttemptDetail(accessToken, logId);
      setSummaryAuditDetails((prev) => ({
        ...prev,
        [logId]: data,
      }));
    } catch (err) {
      const text = err instanceof Error ? err.message : 'No se pudo cargar el intento seleccionado.';
      setSummaryAuditError(text);
      setSummaryAuditDetails((prev) => ({
        ...prev,
        [logId]: null,
      }));
    } finally {
      setSummaryAuditLoadingDetailLogId(null);
    }
  };

  // ── Load eligible docs when wizard opens ─────────────────────────────────────

  const loadEligible = () => {
    if (!wizardDate) return;
    setEligibleLoading(true);
    setEligibleError('');
    setEligibleDocs([]);
    setSelectedDocIds(new Set());

    fetchEligibleDocuments(accessToken, {
      summary_type: activeType,
      date: wizardDate,
      branch_id: branchId,
    })
      .then((res) => {
        setEligibleDocs(res.data);
        // pre-select all by default
        setSelectedDocIds(new Set(res.data.map((d) => d.id)));
      })
      .catch((err: Error) => setEligibleError(err.message))
      .finally(() => setEligibleLoading(false));
  };

  useEffect(() => {
    if (showWizard) {
      loadEligible();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWizard, wizardDate, activeType]);

  // ── Wizard submit ─────────────────────────────────────────────────────────────

  const handleCreateSummary = () => {
    if (selectedDocIds.size === 0) {
      setWizardError('Selecciona al menos un comprobante');
      return;
    }
    setWizardSaving(true);
    setWizardError('');

    createDailySummary(accessToken, {
      summary_type: activeType,
      summary_date: wizardDate,
      document_ids: Array.from(selectedDocIds),
      branch_id: branchId,
      notes: wizardNotes || undefined,
    })
      .then(() => {
        setShowWizard(false);
        setWizardNotes('');
        loadList();
      })
      .catch((err: Error) => setWizardError(err.message))
      .finally(() => setWizardSaving(false));
  };

  // ── Send ──────────────────────────────────────────────────────────────────────

  const handleSend = (id: number) => {
    setSendingId(id);
    setSendResult('');
    setActionError('');

    sendDailySummary(accessToken, id)
      .then((res) => {
        const codePart = res.sunat_error_code ? `Codigo SUNAT: ${res.sunat_error_code}` : '';
        const messagePart = res.sunat_error_message ? `Detalle: ${res.sunat_error_message}` : '';
        const detailPart = [codePart, messagePart].filter((value) => value !== '').join(' | ');
        setSendResult(detailPart ? `${res.label ?? res.message ?? 'Procesado'} | ${detailPart}` : (res.label ?? res.message ?? 'Procesado'));
        loadList();
        if (selectedId === id) {
          fetchDailySummaryDetail(accessToken, id)
            .then(setDetail)
            .catch(() => null);
        }
      })
      .catch((err: Error) => setActionError(err.message))
      .finally(() => setSendingId(null));
  };

  // ── Delete ────────────────────────────────────────────────────────────────────

  const handleDelete = (id: number) => {
    if (!confirm('¿Eliminar este resumen editable? Los comprobantes volveran a quedar libres.')) return;
    setDeletingId(id);
    setActionError('');

    deleteDailySummary(accessToken, id)
      .then(() => {
        if (selectedId === id) setSelectedId(null);
        loadList();
      })
      .catch((err: Error) => setActionError(err.message))
      .finally(() => setDeletingId(null));
  };

  const handleRemoveDocument = (summaryId: number, documentId: number) => {
    if (!confirm('¿Retirar este comprobante del resumen? Volvera a quedar disponible en Ventas.')) return;

    setRemovingDocumentId(documentId);
    setActionError('');

    removeDailySummaryDocument(accessToken, summaryId, documentId)
      .then((res) => {
        setSendResult(res.message);
        loadList();
        if (res.deleted) {
          setSelectedId(null);
          setDetail(null);
          return;
        }

        if (selectedId === summaryId) {
          fetchDailySummaryDetail(accessToken, summaryId)
            .then(setDetail)
            .catch(() => setDetail(null));
        }
      })
      .catch((err: Error) => setActionError(err.message))
      .finally(() => setRemovingDocumentId(null));
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const typeLabel = activeType === 3 ? 'Anulación (RA)' : 'Declaración (RC)';

  return (
    <div className="ds-root">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="ds-header">
        <h2 className="ds-title">Resumen Diario de Boletas</h2>
        <button className="ds-btn-primary" onClick={() => { setShowWizard(true); setWizardDate(todayIso()); }}>
          + Nuevo {typeLabel}
        </button>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="ds-tabs">
        {([3, 1] as DailySummaryType[]).map((t) => (
          <button
            key={t}
            className={`ds-tab${activeType === t ? ' is-active' : ''}`}
            onClick={() => setActiveType(t)}
          >
            <span className="ds-tab__kicker">{t === 3 ? 'PRIORIDAD' : 'DECLARACION'}</span>
            <span className="ds-tab__title">{t === 3 ? '🚫 Resumen Anuladas (RA)' : '📋 Resumen Declaración (RC)'}</span>
            <span className="ds-tab__hint">{t === 3 ? 'Boletas aceptadas por SUNAT para anular por resumen' : 'Boletas emitidas para declarar por resumen'}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="ds-filters">
        <label className="ds-field">
          Fecha
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
        </label>
        <label className="ds-field">
          Estado
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as DailySummaryStatus | '')}
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as DailySummaryStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <button className="ds-btn-secondary" onClick={() => { setFilterDate(''); setFilterStatus(''); }}>
          Limpiar
        </button>
      </div>

      {/* ── Feedback messages ─────────────────────────────────────────────── */}
      {sendResult && <div className="ds-msg ds-msg--success">{sendResult}</div>}
      {actionError && <div className="ds-msg ds-msg--error">{actionError}</div>}

      {/* ── Main content: list + detail panel ─────────────────────────────── */}
      <div className="ds-main">

        {/* ── List ─────────────────────────────────────────────────────────── */}
        <div className="ds-list">
          {listLoading && <p className="ds-hint">Cargando…</p>}
          {listError && <p className="ds-msg ds-msg--error">{listError}</p>}
          {!listLoading && listData && listData.data.length === 0 && (
            <p className="ds-hint">No hay resúmenes registrados.</p>
          )}

          {listData?.data.map((row) => (
            <SummaryRow
              key={row.id}
              row={row}
              isSelected={selectedId === row.id}
              isSending={sendingId === row.id}
              isDeleting={deletingId === row.id}
              onSelect={() => setSelectedId(selectedId === row.id ? null : row.id)}
              onSend={() => handleSend(row.id)}
              onDelete={() => handleDelete(row.id)}
            />
          ))}

          {/* Pagination */}
          {listData && listData.meta.last_page > 1 && (
            <div className="ds-pagination">
              <button
                className="ds-btn-secondary btn-mini"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Ant.
              </button>
              <span className="ds-hint">
                {page} / {listData.meta.last_page}
              </span>
              <button
                className="ds-btn-secondary btn-mini"
                disabled={page >= listData.meta.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                Sig. →
              </button>
            </div>
          )}
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        {selectedId !== null && (
          <div className="ds-detail">
            {detailLoading && <p className="ds-hint">Cargando detalle…</p>}
            {detail && (
              <SummaryDetail
                detail={detail}
                removingDocumentId={removingDocumentId}
                onRemoveDocument={handleRemoveDocument}
                traceabilityEnabled={traceabilityEnabled}
                summaryAuditLogs={summaryAuditLogs}
                summaryAuditLoading={summaryAuditLoading}
                summaryAuditError={summaryAuditError}
                summaryAuditSelectedLogId={summaryAuditSelectedLogId}
                summaryAuditLoadingDetailLogId={summaryAuditLoadingDetailLogId}
                summaryAuditDetails={summaryAuditDetails}
                onSelectAuditLog={(logId) => {
                  const hasDetail = Object.prototype.hasOwnProperty.call(summaryAuditDetails, logId);
                  if (!hasDetail) {
                    void loadSummaryAuditAttemptDetail(logId);
                    return;
                  }

                  setSummaryAuditSelectedLogId(logId);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Wizard modal ──────────────────────────────────────────────────── */}
      {showWizard && (
        <div className="ds-modal-overlay">
          <div className="ds-modal">
            <div className="ds-modal__header">
              <h3>Nuevo {typeLabel}</h3>
              <button className="ds-btn-close" onClick={() => setShowWizard(false)}>✕</button>
            </div>

            <div className="ds-modal__body">
              <label className="ds-field">
                Fecha del resumen
                <input
                  type="date"
                  value={wizardDate}
                  onChange={(e) => setWizardDate(e.target.value)}
                />
              </label>

              <div>
                <p className="ds-section-label">
                  Boletas elegibles{' '}
                  {activeType === 1
                    ? '(emitidas, pendientes de declarar)'
                    : '(aceptadas por SUNAT, pendientes de anulación por resumen)'}:
                </p>
                {eligibleLoading && <p className="ds-hint">Buscando…</p>}
                {eligibleError && <p className="ds-msg ds-msg--error">{eligibleError}</p>}
                {!eligibleLoading && eligibleDocs.length === 0 && !eligibleError && (
                  <p className="ds-hint">Sin boletas elegibles para esta fecha.</p>
                )}
                {eligibleDocs.length > 0 && (
                  <>
                    <div className="ds-select-bar">
                      <button
                        className="ds-btn-link"
                        onClick={() => setSelectedDocIds(new Set(eligibleDocs.map((d) => d.id)))}
                      >
                        Seleccionar todos
                      </button>
                      <button className="ds-btn-link" onClick={() => setSelectedDocIds(new Set())}>
                        Deseleccionar todos
                      </button>
                    </div>
                    <div className="ds-doc-list">
                      {eligibleDocs.map((doc) => (
                        <label key={doc.id} className="ds-doc-row">
                          <input
                            type="checkbox"
                            checked={selectedDocIds.has(doc.id)}
                            onChange={(e) => {
                              const next = new Set(selectedDocIds);
                              e.target.checked ? next.add(doc.id) : next.delete(doc.id);
                              setSelectedDocIds(next);
                            }}
                          />
                          <span className="ds-doc-info">
                            <strong>{doc.series}-{String(doc.number).padStart(8, '0')}</strong>
                            <span className="ds-doc-customer">{doc.customer_name || '—'}</span>
                            <span className="ds-doc-total">S/ {Number(doc.total).toFixed(2)}</span>
                            {doc.sunat_status && (
                              <span className="ds-doc-sunat">{doc.sunat_status}</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="ds-hint">
                      {selectedDocIds.size} de {eligibleDocs.length} seleccionados
                    </p>
                  </>
                )}
              </div>

              <label className="ds-field">
                Notas (opcional)
                <textarea
                  value={wizardNotes}
                  onChange={(e) => setWizardNotes(e.target.value)}
                  placeholder="Observaciones internas…"
                />
              </label>

              {wizardError && <p className="ds-msg ds-msg--error">{wizardError}</p>}
            </div>

            <div className="ds-modal__footer">
              <button className="ds-btn-secondary" onClick={() => setShowWizard(false)}>
                Cancelar
              </button>
              <button
                className="ds-btn-primary"
                disabled={wizardSaving || selectedDocIds.size === 0}
                onClick={handleCreateSummary}
              >
                {wizardSaving ? 'Guardando…' : 'Crear borrador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<DailySummaryStatus, string> = {
  DRAFT: 'ds-badge ds-badge--draft',
  SENDING: 'ds-badge ds-badge--sending',
  SENT: 'ds-badge ds-badge--sent',
  ACCEPTED: 'ds-badge ds-badge--accepted',
  REJECTED: 'ds-badge ds-badge--rejected',
  ERROR: 'ds-badge ds-badge--error',
};

type SummaryRowProps = {
  row: DailySummaryListItem;
  isSelected: boolean;
  isSending: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onSend: () => void;
  onDelete: () => void;
};

function SummaryRow({ row, isSelected, isSending, isDeleting, onSelect, onSend, onDelete }: SummaryRowProps) {
  const canSend = ['DRAFT', 'ERROR', 'REJECTED'].includes(row.status);
  const canDelete = ['DRAFT', 'ERROR', 'REJECTED'].includes(row.status);

  return (
    <div
      className={`ds-row${isSelected ? ' is-selected' : ''}`}
      onClick={onSelect}
    >
      <div className="ds-row__left">
        <span className="ds-row__identifier">{row.identifier}</span>
        <span className={STATUS_BADGE_CLASS[row.status]}>
          {STATUS_LABELS[row.status]}
        </span>
      </div>
      <div className="ds-row__meta">
        <span>{fmtDate(row.summary_date)}</span>
        <span>{row.item_count} boleta{row.item_count !== 1 ? 's' : ''}</span>
        {row.sunat_ticket && <span title="Ticket SUNAT">🎟 {row.sunat_ticket}</span>}
      </div>
      <div className="ds-row__actions" onClick={(e) => e.stopPropagation()}>
        {canSend && (
          <button
            className="ds-btn-send"
            disabled={isSending}
            onClick={() => onSend()}
          >
            {isSending ? '…' : '▶ Enviar'}
          </button>
        )}
        {canDelete && (
          <button
            className="ds-btn-danger"
            disabled={isDeleting}
            onClick={() => onDelete()}
          >
            {isDeleting ? '…' : 'Eliminar'}
          </button>
        )}
      </div>
    </div>
  );
}

type SummaryDetailProps = {
  detail: DailySummaryDetail;
  removingDocumentId: number | null;
  onRemoveDocument: (summaryId: number, documentId: number) => void;
  traceabilityEnabled: boolean;
  summaryAuditLogs: DailySummaryAuditAttempt[];
  summaryAuditLoading: boolean;
  summaryAuditError: string;
  summaryAuditSelectedLogId: number | null;
  summaryAuditLoadingDetailLogId: number | null;
  summaryAuditDetails: Record<number, DailySummaryAuditAttemptDetail | null | undefined>;
  onSelectAuditLog: (logId: number) => void;
};

function SummaryDetail({
  detail,
  removingDocumentId,
  onRemoveDocument,
  traceabilityEnabled,
  summaryAuditLogs,
  summaryAuditLoading,
  summaryAuditError,
  summaryAuditSelectedLogId,
  summaryAuditLoadingDetailLogId,
  summaryAuditDetails,
  onSelectAuditLog,
}: SummaryDetailProps) {
  const canEditItems = ['DRAFT', 'ERROR', 'REJECTED'].includes(detail.status);

  return (
    <div>
      <h4 className="ds-detail-title">{detail.identifier}</h4>
      <table className="ds-meta-table">
        <tbody>
          <tr><td className="ds-meta-key">Tipo</td><td>{detail.summary_type === 1 ? 'RC – Declaración' : 'RA – Anulación'}</td></tr>
          <tr><td className="ds-meta-key">Fecha</td><td>{fmtDate(detail.summary_date)}</td></tr>
          <tr>
            <td className="ds-meta-key">Estado</td>
            <td><span className={STATUS_BADGE_CLASS[detail.status]}>{STATUS_LABELS[detail.status]}</span></td>
          </tr>
          {detail.sunat_ticket && <tr><td className="ds-meta-key">Ticket</td><td>{detail.sunat_ticket}</td></tr>}
          {detail.sunat_cdr_code && <tr><td className="ds-meta-key">CDR</td><td>{detail.sunat_cdr_code} {detail.sunat_cdr_desc}</td></tr>}
          {detail.sunat_error_code && <tr><td className="ds-meta-key">Codigo SUNAT</td><td>{detail.sunat_error_code}</td></tr>}
          {detail.sunat_error_message && <tr><td className="ds-meta-key">Detalle error</td><td>{detail.sunat_error_message}</td></tr>}
          {detail.sent_at && <tr><td className="ds-meta-key">Enviado</td><td>{fmtDateTime(detail.sent_at)}</td></tr>}
          {detail.notes && <tr><td className="ds-meta-key">Notas</td><td>{detail.notes}</td></tr>}
        </tbody>
      </table>

      <h5 style={{ marginBottom: 6, marginTop: 14 }}>Comprobantes ({detail.items.length})</h5>
      <table className="ds-item-table">
        <thead>
          <tr>
            <th>Serie-Número</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Estado SUNAT</th>
            {canEditItems && <th>Acción</th>}
          </tr>
        </thead>
        <tbody>
          {detail.items.map((item) => (
            <tr key={item.item_id}>
              <td>{item.series}-{String(item.number).padStart(8, '0')}</td>
              <td>{item.customer_name || '—'}</td>
              <td>S/ {Number(item.total).toFixed(2)}</td>
              <td>{detail.summary_type === 3 ? (item.sunat_void_status ?? '—') : (item.sunat_status ?? '—')}</td>
              {canEditItems && (
                <td>
                  <button
                    type="button"
                    className="ds-btn-danger"
                    disabled={removingDocumentId === item.document_id}
                    onClick={() => onRemoveDocument(detail.id, item.document_id)}
                  >
                    {removingDocumentId === item.document_id ? 'Quitando…' : 'Quitar'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {detail.raw_response && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Respuesta del puente</summary>
          <pre className="ds-response-box">{JSON.stringify(detail.raw_response, null, 2)}</pre>
        </details>
      )}

      {detail.request_debug && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Payload enviado al puente</summary>
          <pre className="ds-response-box">{JSON.stringify(detail.request_debug, null, 2)}</pre>
        </details>
      )}

      <section style={{ marginTop: 14 }}>
        <h5 style={{ marginBottom: 6 }}>Trazabilidad de intentos (RA/RC)</h5>
        {!traceabilityEnabled ? (
          <p className="ds-hint">La trazabilidad de intentos está deshabilitada por configuración.</p>
        ) : summaryAuditLoading ? (
          <p className="ds-hint">Cargando historial de intentos…</p>
        ) : summaryAuditError ? (
          <p className="ds-msg ds-msg--error">{summaryAuditError}</p>
        ) : summaryAuditLogs.length === 0 ? (
          <p className="ds-hint">Aún no hay intentos registrados para este resumen.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.95fr) 1.35fr', gap: '0.7rem' }}>
            <div style={{ border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.8rem' }}>
                Intentos
              </div>
              <div style={{ maxHeight: '48vh', overflow: 'auto' }}>
                {summaryAuditLogs.map((log) => {
                  const isSelected = summaryAuditSelectedLogId === log.id;
                  return (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => onSelectAuditLog(log.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: 'none',
                        borderBottom: '1px solid #e2e8f0',
                        padding: '9px 10px',
                        background: isSelected ? '#ecfeff' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem' }}>
                        <strong style={{ fontSize: '0.78rem', color: '#0f172a' }}>Intento #{log.attempt_number}</strong>
                        <span style={{ fontSize: '0.72rem', color: '#334155' }}>{STATUS_LABELS[(String(log.status || '').toUpperCase() as DailySummaryStatus)] ?? log.status}</span>
                      </div>
                      <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: '#64748b' }}>{fmtDateTime(log.sent_at)}</div>
                      <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: '#475569' }}>
                        {log.http_code ? `HTTP ${log.http_code}` : 'Sin HTTP'}
                        {log.response_time_ms !== null && log.response_time_ms !== undefined ? ` · ${Number(log.response_time_ms).toFixed(2)} ms` : ''}
                        {log.is_retry ? ' · Reintento' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.8rem' }}>
                Payload y respuesta por intento
              </div>
              <div style={{ padding: '10px' }}>
                {summaryAuditSelectedLogId === null ? (
                  <p className="ds-hint">Selecciona un intento para ver detalle.</p>
                ) : summaryAuditLoadingDetailLogId === summaryAuditSelectedLogId ? (
                  <p className="ds-hint">Cargando detalle del intento…</p>
                ) : !summaryAuditDetails[summaryAuditSelectedLogId] ? (
                  <p className="ds-msg ds-msg--error">No se pudo cargar el detalle del intento seleccionado.</p>
                ) : (
                  (() => {
                    const detailLog = summaryAuditDetails[summaryAuditSelectedLogId] as DailySummaryAuditAttemptDetail;
                    return (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.55rem', marginBottom: '0.65rem' }}>
                          <article><strong>Modo</strong><div>{detailLog.bridge.mode || '—'}</div></article>
                          <article><strong>Estado SUNAT</strong><div>{detailLog.sunat.status || '—'}</div></article>
                          <article><strong>HTTP</strong><div>{detailLog.response.status_code ? `HTTP ${detailLog.response.status_code}` : '—'}</div></article>
                          <article><strong>Ticket</strong><div>{detailLog.sunat.ticket || '—'}</div></article>
                          <article><strong>CDR</strong><div>{detailLog.sunat.cdr_code || '—'}</div></article>
                          <article><strong>SHA1 payload</strong><div>{detailLog.request.sha1 || '—'}</div></article>
                        </div>

                        <div style={{ marginBottom: '0.55rem', color: '#334155', fontSize: '0.8rem' }}>
                          <strong>Endpoint:</strong> {detailLog.bridge.method || 'POST'} {detailLog.bridge.endpoint || '—'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                          <section style={{ border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden' }}>
                            <header style={{ padding: '7px 9px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.76rem' }}>
                              Payload enviado
                            </header>
                            <pre style={{ margin: 0, padding: '9px', maxHeight: '32vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.72rem', lineHeight: 1.45 }}>
                              {formatDebugJson(detailLog.request.payload)}
                            </pre>
                          </section>
                          <section style={{ border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden' }}>
                            <header style={{ padding: '7px 9px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.76rem' }}>
                              Respuesta del puente
                            </header>
                            <pre style={{ margin: 0, padding: '9px', maxHeight: '32vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.72rem', lineHeight: 1.45 }}>
                              {formatDebugJson(detailLog.response.body)}
                            </pre>
                          </section>
                        </div>

                        {(detailLog.error?.message || detailLog.sunat.message) && (
                          <p style={{ margin: '9px 0 0', color: '#b91c1c', fontWeight: 600 }}>
                            Detalle: {detailLog.error?.message || detailLog.sunat.message}
                          </p>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
