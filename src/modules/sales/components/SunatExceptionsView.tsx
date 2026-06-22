import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchSunatExceptions,
  fetchSunatExceptionsAudit,
  manualConfirmSunatException,
} from '../api';
import { SummaryExceptionsPanel } from './SummaryExceptionsPanel';
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

const DOCUMENT_KIND_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'INVOICE', label: 'Factura' },
  { value: 'RECEIPT', label: 'Boleta' },
  { value: 'CREDIT_NOTE', label: 'Nota de credito' },
  { value: 'DEBIT_NOTE', label: 'Nota de debito' },
];

const SUNAT_CONSULTA_LIBRE_URL = 'https://ww1.sunat.gob.pe/ol-ti-itconsultaunificadalibre/consultaUnificadaLibre/consulta';

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
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Lima',
  }).format(date);
}

function buildSunatConsultaLibreUrl(item: Pick<SunatExceptionItem, 'document_kind' | 'series' | 'number'>): string {
  const query = new URLSearchParams();
  query.set('tipo', String(item.document_kind ?? '').trim().toUpperCase());
  query.set('serie', String(item.series ?? '').trim().toUpperCase());
  query.set('numero', String(item.number ?? '').trim());

  return `${SUNAT_CONSULTA_LIBRE_URL}?${query.toString()}`;
}

function normalizeDocTypeLabel(code?: string | null): string {
  const normalized = String(code ?? '').trim().toUpperCase();
  if (normalized === '') return '-';
  if (normalized === '6') return 'RUC';
  if (normalized === '1') return 'DNI';
  if (normalized === '4') return 'CARNET DE EXTRANJERIA';
  if (normalized === '7') return 'PASAPORTE';
  return normalized;
}

function formatMoney(value?: string | number | null): string {
  if (value === null || value === undefined || String(value).trim() === '') {
    return '-';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function SunatExceptionsView({ accessToken, branchId = null }: Props) {
  const [activeTab, setActiveTab] = useState<'documents' | 'summaries'>('documents');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [documentFilter, setDocumentFilter] = useState('');
  const [documentKind, setDocumentKind] = useState('');
  const [minAgeHours, setMinAgeHours] = useState(0);
  const [minAttempts, setMinAttempts] = useState(0);
  const [onlyManualNeeded, setOnlyManualNeeded] = useState(false);
  const [queue, setQueue] = useState<PaginatedSunatExceptions>({
    data: [],
    meta: { page: 1, per_page: 20, total: 0, last_page: 1 },
  });
  const [audit, setAudit] = useState<SunatExceptionsAuditResponse | null>(null);
  const [selected, setSelected] = useState<SunatExceptionItem | null>(null);
  const [clickedDocument, setClickedDocument] = useState<SunatExceptionItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Ref so loadData can read the current selection without being in its deps array
  const selectedRef = useRef<SunatExceptionItem | null>(null);
  selectedRef.current = selected;

  const [resolution, setResolution] = useState<ManualSunatConfirmPayload['resolution']>('ACCEPTED');
  const [evidenceType, setEvidenceType] = useState<ManualSunatConfirmPayload['evidence_type']>('OTHER');
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
          document: documentFilter,
          documentKind,
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
      setSelectedIds((prev) => prev.filter((id) => queueResponse.data.some((row) => row.id === id)));
      setClickedDocument((prev) => (prev && queueResponse.data.some((row) => row.id === prev.id) ? prev : null));

      if (queueResponse.data.length === 0) {
        setSelected(null);
      } else if (!selectedRef.current || !queueResponse.data.some((row) => row.id === selectedRef.current!.id)) {
        setSelected(queueResponse.data[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la bandeja de excepciones SUNAT.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, branchId, status, documentFilter, documentKind, minAgeHours, minAttempts, onlyManualNeeded, page]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleManualConfirm = useCallback(async () => {
    const targetIds = selectedIds.length > 0
      ? selectedIds
      : (selected ? [selected.id] : []);

    if (targetIds.length === 0) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setResultMessage(null);
    try {
      let okCount = 0;
      const failedDocs: number[] = [];

      for (const documentId of targetIds) {
        try {
          await manualConfirmSunatException(accessToken, documentId, {
            resolution,
            evidence_type: evidenceType,
            evidence_ref: evidenceRef.trim() || undefined,
            evidence_note: evidenceNote.trim() || undefined,
          });
          okCount += 1;
        } catch (_error) {
          failedDocs.push(documentId);
        }
      }

      setEvidenceRef('');
      setEvidenceNote('');
      setSelectedIds([]);
      await loadData();

      if (failedDocs.length > 0) {
        setError(`Se procesaron ${okCount} comprobante(s). Fallaron ${failedDocs.length}: ${failedDocs.join(', ')}`);
      } else {
        setResultMessage(`Se confirmaron ${okCount} comprobante(s) correctamente.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la confirmacion manual.');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, selectedIds, selected, resolution, evidenceType, evidenceRef, evidenceNote, loadData]);

  const allPageSelected = queue.data.length > 0 && queue.data.every((row) => selectedIds.includes(row.id));

  const toggleRowSelection = useCallback((documentId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(documentId)) {
          return prev;
        }

        return [...prev, documentId];
      }

      return prev.filter((id) => id !== documentId);
    });
  }, []);

  const toggleSelectAllCurrentPage = useCallback((checked: boolean) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(queue.data.map((row) => row.id));
  }, [queue.data]);

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

  const quickViewDocument = clickedDocument ?? selected;

  if (activeTab === 'summaries') {
    return (
      <section className="sunat-exceptions">
        <header className="sunat-exceptions__header">
          <div>
            <h2 className="sunat-exceptions__title">Excepciones SUNAT</h2>
            <p className="sunat-exceptions__subtitle">
              Control unificado para documentos y resumenes RC/RA en un solo lugar.
            </p>
          </div>
        </header>

        <div className="sunat-exceptions__card" style={{ marginBottom: 12 }}>
          <div className="sunat-exceptions__pager" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="btn-mini"
              style={{ fontWeight: 500 }}
              onClick={() => setActiveTab('documents')}
            >
              Excepciones de Documentos
            </button>
            <button
              type="button"
              className="btn-mini"
              style={{ fontWeight: 700 }}
              onClick={() => setActiveTab('summaries')}
            >
              Excepciones de Resumenes
            </button>
          </div>
        </div>

        <SummaryExceptionsPanel accessToken={accessToken} />
      </section>
    );
  }

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

      <section className="sunat-exceptions__card" style={{ marginBottom: 12 }}>
        <div className="sunat-exceptions__pager" style={{ justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="btn-mini"
            style={{ fontWeight: 700 }}
            onClick={() => setActiveTab('documents')}
          >
            Excepciones de Documentos
          </button>
          <button
            type="button"
            className="btn-mini"
            style={{ fontWeight: 500 }}
            onClick={() => setActiveTab('summaries')}
          >
            Excepciones de Resumenes
          </button>
        </div>
      </section>

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
            <span>Tipo comprobante</span>
            <select value={documentKind} onChange={(e) => { setPage(1); setDocumentKind(e.target.value); }}>
              {DOCUMENT_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="sunat-exceptions__field">
            <span>Comprobante</span>
            <input
              type="text"
              placeholder="Ej: F001-123 o 123"
              value={documentFilter}
              onChange={(e) => { setPage(1); setDocumentFilter(e.target.value); }}
            />
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

        {resultMessage && (
          <div className="sunat-exceptions__chip sunat-exceptions__chip--ok" style={{ marginBottom: 12 }}>
            {resultMessage}
          </div>
        )}

        <div className="sunat-exceptions__layout">
          <div className="sunat-exceptions__table-wrap">
            {quickViewDocument && (
              <div className="sunat-exceptions__hover-preview" role="status" aria-live="polite">
                <div className="sunat-exceptions__hover-preview-header">
                  <strong>Detalle rapido (clic en comprobante)</strong>
                  <a
                    href={buildSunatConsultaLibreUrl(quickViewDocument)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sunat-exceptions__hover-preview-link"
                  >
                    Validar en SUNAT
                  </a>
                </div>
                <div className="sunat-exceptions__hover-preview-body">
                  <span>RUC emision: {String(quickViewDocument.issuer_ruc ?? '').trim() || '-'}</span>
                  <span>Tipo comprobante: {String(quickViewDocument.document_kind_label ?? quickViewDocument.document_kind).trim() || '-'}</span>
                  <span>Serie numero: {quickViewDocument.series}-{quickViewDocument.number}</span>
                  <span>{normalizeDocTypeLabel(quickViewDocument.customer_doc_type_code)} cliente: {String(quickViewDocument.customer_doc_number ?? '').trim() || '-'}</span>
                  <span>Cliente: {quickViewDocument.customer_name}</span>
                  <span>Fecha emision: {formatDateTime(quickViewDocument.issue_at)}</span>
                  <span>Monto: {formatMoney(quickViewDocument.total)}</span>                  
                </div>
              </div>
            )}
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={(e) => toggleSelectAllCurrentPage(e.target.checked)}
                      title="Seleccionar todos los comprobantes visibles"
                    />
                  </th>
                  <th>Documento</th>
                  <th>SUNAT</th>
                  <th>Horas</th>
                  <th>Recon / Bridge</th>
                  <th>Inventario</th>
                </tr>
              </thead>
              <tbody>
                {queue.data.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      {loading ? 'Cargando excepciones...' : 'Sin excepciones con los filtros actuales'}
                    </td>
                  </tr>
                ) : queue.data.map((row) => {
                  const isSelected = selected?.id === row.id;
                  const isChecked = selectedIds.includes(row.id);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelected(row)}
                      className={isSelected ? 'sunat-exceptions__row is-selected' : 'sunat-exceptions__row'}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelected(row);
                            }
                            toggleRowSelection(row.id, e.target.checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          title={`Seleccionar comprobante ${row.series}-${row.number}`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="sunat-exceptions__doc-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setClickedDocument(row);
                            setSelected(row);
                          }}
                        >
                        <strong>{row.document_kind}</strong> {row.series}-{row.number}
                        <div className="sunat-exceptions__customer">{row.customer_name}</div>
                        </button>
                      </td>
                      <td>
                        <span className={`sales-sunat-badge ${row.sunat_status === 'PENDING_CONFIRMATION' ? 'is-warn' : 'is-progress'}`}>
                          {row.sunat_label}
                        </span>
                      </td>
                      <td>{row.pending_hours}</td>
                      <td>{row.reconcile_attempts} / {row.bridge_attempts ?? row.effective_attempts ?? row.reconcile_attempts}</td>
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
                {selectedIds.length > 0 && (
                  <p className="sunat-exceptions__aside-meta">
                    Seleccionados para accion masiva: <strong>{selectedIds.length}</strong>
                  </p>
                )}
                <p className="sunat-exceptions__aside-doc">
                  Documento #{selected.id} · {selected.document_kind} {selected.series}-{selected.number}
                </p>
                <p className="sunat-exceptions__aside-meta">
                  Emision: {formatDateTime(selected.issue_at)} · Ult. sync: {formatDateTime(selected.sunat_reconcile_next_at)}
                </p>
                <p className="sunat-exceptions__aside-meta" style={{ marginTop: 6 }}>
                  <a
                    href={buildSunatConsultaLibreUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Validar comprobante en SUNAT
                  </a>
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
                  {submitting
                    ? 'Registrando...'
                    : (selectedIds.length > 0
                      ? `Confirmar ${selectedIds.length} seleccionados`
                      : 'Confirmar manual con evidencia')}
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
            <button type="button" className="btn-mini" disabled={loading || page <= 1} onClick={() => setPage(1)}>Inicio</button>
            <button type="button" className="btn-mini" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <button type="button" className="btn-mini" disabled={loading || page >= queue.meta.last_page} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
            <button type="button" className="btn-mini" disabled={loading || page >= queue.meta.last_page} onClick={() => setPage(queue.meta.last_page)}>Última</button>
          </div>
        </div>
      </section>
    </section>
  );
}
