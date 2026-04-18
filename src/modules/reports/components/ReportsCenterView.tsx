import { useEffect, useMemo, useState } from 'react';
import { fmtDateTimeLima } from '../../../shared/utils/lima';
import {
  createReportRequest,
  fetchReportRequestDetail,
  fetchReportRequests,
  fetchReportsCatalog,
} from '../api';
import type {
  ReportRequestDetail,
  ReportRequestListItem,
  ReportsCatalogItem,
} from '../types';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PROCESSING: 'En proceso',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
};

function fmtDateTime(value: string | null | undefined): string {
  return fmtDateTimeLima(value);
}

type ReportsCenterViewProps = {
  accessToken: string;
  branchId: number | null;
  warehouseId: number | null;
};

export function ReportsCenterView({ accessToken, branchId, warehouseId }: ReportsCenterViewProps) {
  const [catalog, setCatalog] = useState<ReportsCatalogItem[]>([]);
  const [requests, setRequests] = useState<ReportRequestListItem[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ReportRequestDetail | null>(null);

  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('ALL');
  const [moduleFilter, setModuleFilter] = useState<'ALL' | 'INVENTORY' | 'SALES'>('ALL');
  const [reportCode, setReportCode] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const availableCodes = useMemo(() => {
    return catalog
      .filter((item) => moduleFilter === 'ALL' || item.module === moduleFilter)
      .sort((a, b) => a.module.localeCompare(b.module, 'es') || a.label.localeCompare(b.label, 'es'));
  }, [catalog, moduleFilter]);

  useEffect(() => {
    if (!reportCode && availableCodes.length > 0) {
      setReportCode(availableCodes[0].code);
      return;
    }

    if (reportCode && availableCodes.every((item) => item.code !== reportCode)) {
      setReportCode(availableCodes[0]?.code ?? '');
    }
  }, [availableCodes, reportCode]);

  async function loadCatalog() {
    setLoadingCatalog(true);
    setMessage('');

    try {
      const response = await fetchReportsCatalog(accessToken);
      setCatalog(response.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar catalogo de reportes');
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function loadRequests() {
    setLoadingRequests(true);
    setMessage('');

    try {
      const response = await fetchReportRequests(accessToken, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        perPage: 40,
      });

      setRequests(response.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar solicitudes de reportes');
    } finally {
      setLoadingRequests(false);
    }
  }

  async function loadDetail(requestId: number) {
    setLoadingDetailId(requestId);

    try {
      const response = await fetchReportRequestDetail(accessToken, requestId);
      setSelectedRequest(response);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Error al cargar detalle de solicitud');
    } finally {
      setLoadingDetailId(null);
    }
  }

  async function handleCreateRequest() {
    if (!reportCode) {
      setMessage('Selecciona un tipo de reporte');
      return;
    }

    setCreating(true);
    setMessage('');

    try {
      const filters: Record<string, unknown> = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        warehouse_id: warehouseId || undefined,
      };

      const response = await createReportRequest(accessToken, {
        reportCode,
        branchId,
        filters,
      });

      await loadRequests();
      await loadDetail(response.request_id);
      setMessage(`Solicitud #${response.request_id} encolada correctamente.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la solicitud');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredRequests = useMemo(() => {
    return requests.filter((row) => {
      if (moduleFilter === 'ALL') return true;
      const code = String(row.report_code || '').toUpperCase();
      return moduleFilter === 'INVENTORY'
        ? code.startsWith('INVENTORY_')
        : code.startsWith('SALES_');
    });
  }, [requests, moduleFilter]);

  const selectedCodeMeta = useMemo(() => {
    return catalog.find((item) => item.code === reportCode) ?? null;
  }, [catalog, reportCode]);

  return (
    <section className="module-panel">
      <div className="module-header">
        <h3>Centro de Reportes</h3>
        <button
          type="button"
          onClick={() => {
            void loadCatalog();
            void loadRequests();
          }}
          disabled={loadingCatalog || loadingRequests}
        >
          {loadingCatalog || loadingRequests ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      <div className="form-card report-filters">
        <div className="report-filters-header">
          <h4 className="report-filters-title">Nueva Solicitud</h4>
          <small>Catalogo unificado Inventory + Sales</small>
        </div>

        <div className="report-filter-grid">
          <label>
            Modulo
            <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value as 'ALL' | 'INVENTORY' | 'SALES')}>
              <option value="ALL">Todos</option>
              <option value="INVENTORY">Inventario</option>
              <option value="SALES">Ventas</option>
            </select>
          </label>

          <label>
            Estado de lista
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED')}
            >
              <option value="ALL">Todos</option>
              <option value="PENDING">Pendiente</option>
              <option value="PROCESSING">En proceso</option>
              <option value="COMPLETED">Completado</option>
              <option value="FAILED">Fallido</option>
            </select>
          </label>

          <label>
            Tipo de reporte
            <select value={reportCode} onChange={(e) => setReportCode(e.target.value)}>
              {availableCodes.length === 0 && <option value="">Sin opciones</option>}
              {availableCodes.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.module} - {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Desde
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>

          <label>
            Hasta
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        {selectedCodeMeta && (
          <small style={{ display: 'block', marginBottom: '0.6rem' }}>
            {selectedCodeMeta.description}
          </small>
        )}

        <div className="inventory-actions-row">
          <button type="button" onClick={() => void handleCreateRequest()} disabled={creating || !reportCode}>
            {creating ? 'Encolando...' : 'Generar solicitud'}
          </button>
          <button type="button" onClick={() => void loadRequests()} disabled={loadingRequests}>
            {loadingRequests ? 'Cargando...' : 'Refrescar solicitudes'}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <div className="inventory-table-head">
          <h4>Solicitudes ({filteredRequests.length})</h4>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Modulo</th>
              <th>Codigo</th>
              <th>Estado</th>
              <th>Solicitado</th>
              <th>Finalizado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>Sin solicitudes</td>
              </tr>
            )}
            {filteredRequests.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{String(row.report_code).startsWith('SALES_') ? 'VENTAS' : 'INVENTARIO'}</td>
                <td>{row.report_code}</td>
                <td>{STATUS_LABELS[row.status] ?? row.status}</td>
                <td>{fmtDateTime(row.requested_at)}</td>
                <td>{fmtDateTime(row.finished_at)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => void loadDetail(row.id)}
                    disabled={loadingDetailId === row.id}
                  >
                    {loadingDetailId === row.id ? 'Cargando...' : 'Ver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRequest && (
        <div className="form-card">
          <h4>Detalle solicitud #{selectedRequest.id}</h4>
          <div className="inventory-detail-grid">
            <article><span>Codigo</span><strong>{selectedRequest.report_code}</strong></article>
            <article><span>Estado</span><strong>{STATUS_LABELS[selectedRequest.status] ?? selectedRequest.status}</strong></article>
            <article><span>Solicitado</span><strong>{fmtDateTime(selectedRequest.requested_at)}</strong></article>
            <article><span>Finalizado</span><strong>{fmtDateTime(selectedRequest.finished_at)}</strong></article>
          </div>
          {selectedRequest.error_message && <p className="notice">{selectedRequest.error_message}</p>}
          {selectedRequest.result_json?.summary && (
            <pre style={{ marginTop: '0.8rem', maxHeight: '240px', overflow: 'auto' }}>
              {JSON.stringify(selectedRequest.result_json.summary, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
