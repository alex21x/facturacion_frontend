import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../shared/api/client';
import { fmtDateTimeFullLima } from '../../../shared/utils/lima';
import './TaxBridgeAuditView.css';

interface AuditLog {
  id: number;
  document: string;
  document_kind: string;
  tributary_type: string;
  status: string;
  http_code: number;
  response_time_ms: number;
  attempt_number: number;
  is_retry: boolean;
  error_kind: string | null;
  message: string;
  sent_at: string;
  initiated_by: string;
}

interface AuditLogDetails {
  id: number;
  document: {
    id: number;
    kind: string;
    series: string;
    number: string;
    full_number: string;
  };
  tributary_type: string;
  attempt: {
    number: number;
    is_retry: boolean;
    is_manual: boolean;
  };
  bridge: {
    mode: string;
    endpoint: string;
    method: string;
    content_type: string;
  };
  request: {
    size_bytes: number;
    sha1: string;
    payload: Record<string, any>;
  };
  response: {
    status_code: number;
    size_bytes: number;
    time_ms: number;
    body: Record<string, any> | null;
  };
  sunat: {
    status: string;
    code: string;
    message: string;
    ticket: string;
    cdr_code: string;
  };
  error: {
    kind: string;
    message: string;
  } | null;
  audit: {
    initiated_by_user_id: number;
    initiated_by_username: string;
    sent_at: string;
    received_at: string;
  };
}

interface TaxBridgeAuditViewProps {
  accessToken: string;
  companyId?: number;
  branchId?: number;
}

const TRIBUTARY_TYPES = [
  { value: '', label: 'Todos' },
  { value: 'SUNAT_DIRECT', label: 'SUNAT Directo' },
  { value: 'DETRACCION', label: 'Detracciones (GRD)' },
  { value: 'RETENCION', label: 'Retenciones (GRR)' },
  { value: 'PERCEPCION', label: 'Percepciones (GRP)' },
  { value: 'SUMMARY_RA', label: 'Resumen Almacén (RA)' },
  { value: 'SUMMARY_RC', label: 'Resumen Compras (RC)' },
  { value: 'RESUMEN_BOLETAS', label: 'Resumen de Boletas (RB)' },
  { value: 'REMISION_GUIA', label: 'Remisión/Guía' },
];

const STATUS_COLORS: Record<string, string> = {
  'ACCEPTED': '#10b981',
  'REJECTED': '#ef4444',
  'PENDING_CONFIRMATION': '#f59e0b',
  'UNKNOWN': '#6b7280',
};

export function TaxBridgeAuditView({ accessToken, companyId, branchId }: TaxBridgeAuditViewProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<AuditLogDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const [filters, setFilters] = useState({
    tributary_type: '',
    sunat_status: '',
    start_date: '',
    end_date: '',
    document_series: '',
    document_number: '',
    only_errors: false,
  });

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        ...(typeof companyId === 'number' ? { company_id: companyId.toString() } : {}),
        ...(branchId && { branch_id: branchId.toString() }),
        ...(filters.tributary_type && { tributary_type: filters.tributary_type }),
        ...(filters.sunat_status && { sunat_status: filters.sunat_status }),
        ...(filters.start_date && { start_date: filters.start_date }),
        ...(filters.end_date && { end_date: filters.end_date }),
        ...(filters.document_series && { document_series: filters.document_series }),
        ...(filters.document_number && { document_number: filters.document_number }),
        ...(filters.only_errors && { only_errors: 'true' }),
        limit: '200',
      });

      const response = await apiClient.request<{ logs: AuditLog[] }>(
        `/api/tax-bridge/audit/branch?${query.toString()}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      setLogs(response.logs || []);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [accessToken, companyId, branchId, filters]);

  // Fetch log details
  const openLogDetails = useCallback(async (logId: number) => {
    try {
      const response = await apiClient.request<AuditLogDetails>(
        `/api/tax-bridge/audit/${logId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      setSelectedLog(response);
      setShowDrawer(true);
    } catch (error) {
      console.error('Error fetching log details:', error);
    }
  }, [accessToken]);

  // Load logs on mount and filter change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      tributary_type: '',
      sunat_status: '',
      start_date: '',
      end_date: '',
      document_series: '',
      document_number: '',
      only_errors: false,
    });
  };

  return (
    <div className="tax-bridge-audit-view">
      <div className="audit-header">
        <h2>Auditoría Tributaria - Histórico de Envíos</h2>
        <p className="subtitle">Trazabilidad completa de payloads y respuestas SUNAT</p>
      </div>

      {/* Filtros */}
      <div className="audit-filters">
        <div className="filter-group">
          <label>Tipo Tributario</label>
          <select
            value={filters.tributary_type}
            onChange={(e) => setFilters({ ...filters, tributary_type: e.target.value })}
          >
            {TRIBUTARY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Estado</label>
          <select
            value={filters.sunat_status}
            onChange={(e) => setFilters({ ...filters, sunat_status: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="ACCEPTED">Aceptado</option>
            <option value="REJECTED">Rechazado</option>
            <option value="PENDING_CONFIRMATION">Pendiente</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Series</label>
          <input
            type="text"
            placeholder="B001"
            value={filters.document_series}
            onChange={(e) => setFilters({ ...filters, document_series: e.target.value })}
          />
        </div>

        <div className="filter-group">
          <label>Número</label>
          <input
            type="text"
            placeholder="00001"
            value={filters.document_number}
            onChange={(e) => setFilters({ ...filters, document_number: e.target.value })}
          />
        </div>

        <div className="filter-group checkbox">
          <label>
            <input
              type="checkbox"
              checked={filters.only_errors}
              onChange={(e) => setFilters({ ...filters, only_errors: e.target.checked })}
            />
            Solo errores
          </label>
        </div>

        <button className="btn-secondary" onClick={handleResetFilters}>
          Limpiar
        </button>
        <button className="btn-primary" onClick={fetchLogs} disabled={loading}>
          {loading ? 'Cargando...' : 'Filtrar'}
        </button>
      </div>

      {/* Tabla de logs */}
      <div className="audit-table-container">
        {logs.length === 0 ? (
          <div className="empty-state">
            <p>No hay registros de auditoría para los filtros seleccionados</p>
          </div>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Tipo Tributario</th>
                <th>Estado</th>
                <th>HTTP</th>
                <th>Respuesta (ms)</th>
                <th>Intento</th>
                <th>Enviado</th>
                <th>Usuario</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className={`status-${log.status.toLowerCase()}`}>
                  <td className="doc-col">
                    <strong>{log.document}</strong>
                    <small>{log.document_kind}</small>
                  </td>
                  <td>{log.tributary_type}</td>
                  <td>
                    <span
                      className="status-badge"
                      style={{ backgroundColor: STATUS_COLORS[log.status] || '#6b7280' }}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="center">{log.http_code || '-'}</td>
                  <td className="center">{log.response_time_ms?.toFixed(0) || '-'}</td>
                  <td className="center">
                    {log.attempt_number}
                    {log.is_retry && <span className="badge-retry">Reintento</span>}
                  </td>
                  <td className="date">{fmtDateTimeFullLima(log.sent_at)}</td>
                  <td className="user">{log.initiated_by || 'Sistema'}</td>
                  <td className="actions">
                    <button
                      className="btn-link"
                      onClick={() => openLogDetails(log.id)}
                      title="Ver detalles completos"
                    >
                      Detalles
                    </button>
                    {log.error_kind && (
                      <button
                        className="btn-link error"
                        title={log.error_kind}
                      >
                        Error
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer de detalles */}
      {showDrawer && selectedLog && (
        <div className="audit-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="audit-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>
                Detalles - {selectedLog.document.full_number}
                <span className="status-badge" style={{
                  backgroundColor: STATUS_COLORS[selectedLog.sunat.status] || '#6b7280'
                }}>
                  {selectedLog.sunat.status}
                </span>
              </h3>
              <button className="btn-close" onClick={() => setShowDrawer(false)}>×</button>
            </div>

            <div className="drawer-tabs">
              <input type="radio" id="tab-request" name="tabs" defaultChecked />
              <input type="radio" id="tab-response" name="tabs" />
              <input type="radio" id="tab-metrics" name="tabs" />
              <input type="radio" id="tab-audit" name="tabs" />

              <label htmlFor="tab-request" className="tab-label">Request</label>
              <label htmlFor="tab-response" className="tab-label">Response</label>
              <label htmlFor="tab-metrics" className="tab-label">Métricas</label>
              <label htmlFor="tab-audit" className="tab-label">Auditoría</label>

              {/* Tab: Request */}
              <div className="tab-content">
                <div className="code-block">
                  <pre>{JSON.stringify(selectedLog.request.payload, null, 2)}</pre>
                </div>
                <p className="meta">SHA1: {selectedLog.request.sha1}</p>
              </div>

              {/* Tab: Response */}
              <div className="tab-content">
                {selectedLog.response.body ? (
                  <div className="code-block">
                    <pre>{JSON.stringify(selectedLog.response.body, null, 2)}</pre>
                  </div>
                ) : (
                  <p className="empty">Sin respuesta recibida</p>
                )}
              </div>

              {/* Tab: Métricas */}
              <div className="tab-content">
                <div className="metrics-grid">
                  <div className="metric">
                    <label>Código HTTP</label>
                    <strong>{selectedLog.response.status_code || 'N/A'}</strong>
                  </div>
                  <div className="metric">
                    <label>Tiempo (ms)</label>
                    <strong>{selectedLog.response.time_ms?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div className="metric">
                    <label>Tamaño Request</label>
                    <strong>{(selectedLog.request.size_bytes / 1024).toFixed(2)} KB</strong>
                  </div>
                  <div className="metric">
                    <label>Tamaño Response</label>
                    <strong>{selectedLog.response.size_bytes ? (selectedLog.response.size_bytes / 1024).toFixed(2) + ' KB' : 'N/A'}</strong>
                  </div>
                  <div className="metric full">
                    <label>Estado SUNAT</label>
                    <strong>{selectedLog.sunat.status}</strong>
                  </div>
                  <div className="metric full">
                    <label>Código SUNAT</label>
                    <strong>{selectedLog.sunat.code || 'N/A'}</strong>
                  </div>
                  <div className="metric full">
                    <label>Ticket</label>
                    <strong>{selectedLog.sunat.ticket || 'N/A'}</strong>
                  </div>
                  <div className="metric full">
                    <label>Mensaje</label>
                    <strong>{selectedLog.sunat.message || 'N/A'}</strong>
                  </div>
                </div>
              </div>

              {/* Tab: Auditoría */}
              <div className="tab-content">
                <div className="audit-info">
                  <div className="info-row">
                    <label>Usuario</label>
                    <strong>{selectedLog.audit.initiated_by_username || 'Sistema'}</strong>
                  </div>
                  <div className="info-row">
                    <label>Enviado</label>
                    <time>{fmtDateTimeFullLima(selectedLog.audit.sent_at)}</time>
                  </div>
                  <div className="info-row">
                    <label>Recibido</label>
                    <time>{selectedLog.audit.received_at ? fmtDateTimeFullLima(selectedLog.audit.received_at) : 'N/A'}</time>
                  </div>
                  <div className="info-row">
                    <label>Intento</label>
                    <strong>#{selectedLog.attempt.number} {selectedLog.attempt.is_retry ? '(Reintento)' : ''}</strong>
                  </div>
                  {selectedLog.error && (
                    <>
                      <div className="info-row error">
                        <label>Error Type</label>
                        <strong>{selectedLog.error.kind}</strong>
                      </div>
                      <div className="info-row error">
                        <label>Error Message</label>
                        <p>{selectedLog.error.message}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
