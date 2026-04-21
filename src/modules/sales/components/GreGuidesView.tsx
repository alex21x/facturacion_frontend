import { useEffect, useMemo, useState } from 'react';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
import { fmtDateTimeFullLima } from '../../../shared/utils/lima';
import {
  cancelGreGuide,
  createGreGuide,
  fetchGreGuideDetail,
  fetchGreTaxBridgeAuditAttemptDetail,
  fetchGreTaxBridgeAuditHistory,
  fetchGreGuides,
  fetchGreLookups,
  fetchGrePrintHtml,
  prefillGreFromDocument,
  queryGreTicketStatus,
  searchGreUbigeos,
  sendGreGuide,
  updateGreGuide,
  type GreGuide,
  type GreLookups,
  type GreGuidePayload,
  type GreGuideStatus,
  type GreUbigeoOption,
  type TaxBridgeAuditAttempt,
  type TaxBridgeAuditAttemptDetail,
} from '../api/gre';

type Props = {
  accessToken: string;
  branchId: number | null;
  traceabilityEnabled?: boolean;
};

type Mode = 'create' | 'edit';

const EMPTY_PAYLOAD: GreGuidePayload = {
  guide_type: 'REMITENTE',
  series: 'T001',
  issue_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  transfer_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  motivo_traslado: '01',
  transport_mode_code: '02',
  weight_kg: 1,
  packages_count: 1,
  partida_ubigeo: '',
  punto_partida: '',
  llegada_ubigeo: '',
  punto_llegada: '',
  related_document_id: null,
  destinatario: { doc_type: '6', doc_number: '', name: '', address: '' },
  transporter: { doc_type: '6', doc_number: '', name: '', address: '' },
  vehicle: { placa: '' },
  driver: { doc_type: '1', doc_number: '', name: '', license: '' },
  items: [{ code: '', description: '', qty: 1, unit: 'NIU' }],
};

const STATUS_LABEL: Record<GreGuideStatus, string> = {
  DRAFT: 'Borrador',
  SENDING: 'Enviando',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  ERROR: 'Error',
  CANCELLED: 'Anulado',
};

const DEFAULT_LOOKUPS: GreLookups = {
  guide_types: [
    { code: 'REMITENTE', sunat_code: '01', name: 'Guia de remitente' },
    { code: 'TRANSPORTISTA', sunat_code: '02', name: 'Guia de transportista' },
  ],
  transfer_reasons: [
    { code: '01', name: 'Venta' },
    { code: '14', name: 'Venta sujeta a confirmacion del comprador' },
    { code: '02', name: 'Compra' },
    { code: '04', name: 'Traslado entre establecimientos de la misma empresa' },
    { code: '18', name: 'Traslado emisor itinerante CP' },
    { code: '08', name: 'Importacion' },
    { code: '09', name: 'Exportacion' },
    { code: '19', name: 'Traslado a zona primaria' },
    { code: '13', name: 'Otros' },
  ],
  transport_modes: [
    { code: '01', name: 'Transporte publico' },
    { code: '02', name: 'Transporte privado' },
  ],
  document_types: [
    { code: '0', name: 'DOC.TRIB.NO.DOM.SIN.RUC' },
    { code: '1', name: 'DNI' },
    { code: '4', name: 'Carnet de extranjeria' },
    { code: '6', name: 'RUC' },
    { code: '7', name: 'Pasaporte' },
  ],
  series: [{ id: 0, series: 'T001', name: 'Serie por defecto' }],
  runtime_features: [],
};

function featureSourceLabel(source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'Override empresa/rubro';
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return 'Template rubro';
  }

  return 'Fallback company/sucursal';
}

function featureSourceBadgeClass(source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null): string {
  if (source === 'COMPANY_VERTICAL_OVERRIDE') {
    return 'appcfg-source-badge appcfg-source-badge--override';
  }

  if (source === 'VERTICAL_TEMPLATE') {
    return 'appcfg-source-badge appcfg-source-badge--template';
  }

  return 'appcfg-source-badge appcfg-source-badge--fallback';
}

function toPayload(detail: GreGuide): GreGuidePayload {
  return {
    branch_id: detail.branch_id,
    guide_type: detail.guide_type,
    series: detail.series,
    issue_date: detail.issue_date,
    transfer_date: detail.transfer_date,
    motivo_traslado: detail.motivo_traslado,
    transport_mode_code: detail.transport_mode_code,
    weight_kg: detail.weight_kg,
    packages_count: detail.packages_count,
    partida_ubigeo: detail.partida_ubigeo ?? '',
    punto_partida: detail.punto_partida,
    llegada_ubigeo: detail.llegada_ubigeo ?? '',
    punto_llegada: detail.punto_llegada,
    related_document_id: detail.related_document_id,
    notes: detail.notes ?? undefined,
    destinatario: detail.destinatario ?? {},
    transporter: detail.transporter ?? {},
    vehicle: detail.vehicle ?? {},
    driver: detail.driver ?? {},
    items: (detail.items ?? []).map((item) => ({
      code: item.code ?? '',
      description: item.description,
      qty: item.qty,
      unit: item.unit ?? 'NIU',
    })),
  };
}

function normalizeGreBridgeEndpoint(endpoint: string | null | undefined): string {
  const value = String(endpoint ?? '').trim();
  if (value === '') {
    return '—';
  }
  return value
    .replace(/send_xmlGuiaRemisionGRE/gi, 'send_guiaRemision')
    .replace(/send_statusTicketGuiaRemisionGRE/gi, 'send_statusTicketGRE');
}

function isGreStatusBridgeMethod(method: string | null | undefined): boolean {
  return /(send_statusTicketGRE|send_statusTicketGuiaRemisionGRE)/i.test(String(method ?? '').trim());
}

function buildBridgePayloadPreview(detail: GreGuide, lookups: GreLookups): Record<string, unknown> {
  if (isGreStatusBridgeMethod(detail.bridge_method)) {
    return {
      empresa: {
        ruc: '(servidor)',
        user: '(servidor)',
        pass: '(servidor)',
        client_id: '(servidor)',
        client_secret: '(servidor)',
        razon_social: '(servidor)',
        nombre_comercial: '(servidor)',
        direccion: '(servidor)',
        urbanizacion: '(servidor)',
        ubigeo: '(servidor)',
        departamento: '(servidor)',
        provincia: '(servidor)',
        distrito: '(servidor)',
      },
      cabecera: {
        ticket: detail.sunat_ticket ?? '(ticket requerido)',
        tipo_documento: '09',
        guia_serie: detail.series,
        guia_numero: String(detail.number).padStart(8, '0'),
      },
    };
  }

  const motivoCodigo = String(detail.motivo_traslado ?? '').trim();
  const motivoDescripcion = lookups.transfer_reasons.find((row) => String(row.code) === motivoCodigo)?.name ?? motivoCodigo;
  const modalidad = String(detail.transport_mode_code ?? '02');

  const destinatario = (detail.destinatario ?? {}) as Record<string, unknown>;
  const transporter = (detail.transporter ?? {}) as Record<string, unknown>;
  const vehicle = (detail.vehicle ?? {}) as Record<string, unknown>;
  const driver = (detail.driver ?? {}) as Record<string, unknown>;

  const cabecera: Record<string, unknown> = {
    tipo_documento: '09',
    guia_serie: detail.series,
    guia_numero: String(detail.number).padStart(8, '0'),
    fecha_emision: detail.issue_date,
    fecha_traslado: detail.transfer_date ?? detail.issue_date,
    motivo_codigo: motivoCodigo,
    motivo_descripcion: motivoDescripcion,
    modalidad_codigo: modalidad,
    peso_total: Number(detail.weight_kg ?? 0),
    numero_bultos: Number(detail.packages_count ?? 0),
    ubigeo_partida: detail.partida_ubigeo ?? '',
    partida_direccion: detail.punto_partida ?? '',
    ubigeo_llegada: detail.llegada_ubigeo ?? '',
    llegada_direccion: detail.punto_llegada ?? '',
    destinatario_codigo: String(destinatario.doc_type ?? ''),
    destinatario_ruc: String(destinatario.doc_number ?? ''),
    destinatario_razon_social: String(destinatario.name ?? ''),
  };

  if (modalidad === '02') {
    cabecera.vehiculo_placa = String(vehicle.placa ?? '');
    cabecera.conductor_codigo = String(driver.doc_type ?? '');
    cabecera.conductor_ruc = String(driver.doc_number ?? '');
    cabecera.conductor_licencia = String(driver.license ?? driver.licencia ?? '');
    cabecera.conductor_razon_social = String(driver.name ?? '');
  } else {
    cabecera.transporte_codigo = String(transporter.doc_type ?? '6');
    cabecera.transporte_ruc = String(transporter.doc_number ?? '');
    cabecera.transporte_razon_social = String(transporter.name ?? '');
    const nroMtc = String(transporter.nro_mtc ?? transporter.mtc ?? '').trim();
    if (nroMtc !== '') {
      cabecera.nro_mtc = nroMtc;
    }
  }

  return {
    empresa: {
      ruc: '(servidor)',
      user: '(servidor)',
      pass: '(servidor)',
      razon_social: '(servidor)',
      nombre_comercial: '(servidor)',
      direccion: '(servidor)',
      urbanizacion: '(servidor)',
      ubigeo: '(servidor)',
      departamento: '(servidor)',
      provincia: '(servidor)',
      distrito: '(servidor)',
    },
    cabecera,
    detalle: (detail.items ?? []).map((item) => ({
      codigo: item.code ?? '',
      descripcion: item.description ?? '',
      cantidad: Number(item.qty ?? 0),
      unidad: item.unit ?? 'NIU',
    })),
  };
}

function buildBridgeResponseView(detail: GreGuide): Record<string, unknown> {
  const raw = (detail.raw_response ?? {}) as Record<string, unknown>;
  return {
    ticket_actual: detail.sunat_ticket ?? null,
    cdr_code_actual: detail.sunat_cdr_code ?? null,
    cdr_desc_actual: detail.sunat_cdr_desc ?? null,
    raw_response: raw,
  };
}

function buildBridgeAlertDetail(res: {
  sunat_ticket?: string | null;
  sunat_cdr_code?: string | null;
  sunat_cdr_desc?: string | null;
  response?: Record<string, unknown>;
}): string {
  const response = (res.response ?? {}) as Record<string, unknown>;
  const ticket = String(res.sunat_ticket ?? response.ticket ?? '').trim();
  const code = String(res.sunat_cdr_code ?? response.codRespuesta ?? response.code ?? response.errorCode ?? '').trim();
  const msg = String(res.sunat_cdr_desc ?? response.desRespuesta ?? response.msg ?? response.errorMessage ?? '').trim();
  const link = String(response.link ?? response.reference ?? response.cdrReference ?? '').trim();

  const parts: string[] = [];
  if (ticket !== '') parts.push(`Ticket: ${ticket}`);
  if (code !== '') parts.push(`Codigo: ${code}`);
  if (link !== '') parts.push(`Link: ${link}`);
  if (msg !== '') parts.push(`Mensaje: ${msg}`);

  return parts.length > 0 ? parts.join(' | ') : 'Sin detalle adicional del puente.';
}

type SunatBridgeDebugState = {
  guideId: number;
  title: string;
  loading: boolean;
  error: string;
  attempts: TaxBridgeAuditAttempt[];
  selectedLogId: number | null;
  loadingDetailLogId: number | null;
  attemptDetails: Record<number, TaxBridgeAuditAttemptDetail | null | undefined>;
};

function formatDebugJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return '""';
    }

    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function sunatStatusLabel(status: string | null | undefined): string {
  const normalized = String(status ?? '').trim().toUpperCase();

  if (normalized === 'ACCEPTED' || normalized === 'ACEPTADO') return 'Aceptado';
  if (normalized === 'REJECTED' || normalized === 'RECHAZADO') return 'Rechazado';
  if (normalized === 'PENDING_CONFIRMATION' || normalized === 'PENDIENTE' || normalized === 'PENDIENTE_TICKET') return 'Pendiente';
  if (normalized === 'ERROR') return 'Error';
  if (normalized === '') return '-';

  return normalized;
}

export function GreGuidesView({ accessToken, branchId, traceabilityEnabled = false }: Props) {
  const [activeTab, setActiveTab] = useState<'editor' | 'emitted'>('editor');
  const [kpisOpen, setKpisOpen] = useState(true);
  const [prefillOpen, setPrefillOpen] = useState(false);
  const [rows, setRows] = useState<Array<GreGuide & { item_count?: number }>>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [status, setStatus] = useState<GreGuideStatus | ''>('');
  const [issueDate, setIssueDate] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GreGuide | null>(null);

  const [mode, setMode] = useState<Mode>('create');
  const [payload, setPayload] = useState<GreGuidePayload>({ ...EMPTY_PAYLOAD });
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [lookups, setLookups] = useState<GreLookups>(DEFAULT_LOOKUPS);

  const [sunatToast, setSunatToast] = useState<{ tone: 'ok' | 'warn' | 'bad'; title: string; detail: string } | null>(null);
  const [sunatBridgeDebugState, setSunatBridgeDebugState] = useState<SunatBridgeDebugState | null>(null);
  const [rowActionLoading, setRowActionLoading] = useState<number | null>(null);
  const [autoSend, setAutoSend] = useState(false);
  const [printPreview, setPrintPreview] = useState<{ title: string; subtitle: string; html: string; variant: 'compact' | 'wide' } | null>(null);

  const [prefillReference, setPrefillReference] = useState('');
  const [ubigeoSearchPartida, setUbigeoSearchPartida] = useState('');
  const [ubigeoSearchLlegada, setUbigeoSearchLlegada] = useState('');
  const [ubigeoResultsPartida, setUbigeoResultsPartida] = useState<GreUbigeoOption[]>([]);
  const [ubigeoResultsLlegada, setUbigeoResultsLlegada] = useState<GreUbigeoOption[]>([]);

  const isPublicTransport = payload.transport_mode_code === '01';
  const isPrivateTransport = payload.transport_mode_code === '02';

  const summary = useMemo(() => {
    const total = rows.length;
    const draft = rows.filter((row) => row.status === 'DRAFT').length;
    const sent = rows.filter((row) => row.status === 'SENT' || row.status === 'ACCEPTED').length;
    const rejected = rows.filter((row) => row.status === 'REJECTED' || row.status === 'ERROR').length;
    return { total, draft, sent, rejected };
  }, [rows]);

  const isPrefillFormatValid = useMemo(
    () => /^([A-Z0-9]{1,4})-(\d{1,8})$/.test(prefillReference.trim().toUpperCase()),
    [prefillReference]
  );

  const emittedRows = useMemo(() => rows, [rows]);

  const taxBridgeRuntime = useMemo(() => {
    return (lookups.runtime_features ?? []).find((row) => row.feature_code === 'SALES_TAX_BRIDGE') ?? null;
  }, [lookups.runtime_features]);

  const taxBridgeDebugRuntime = useMemo(() => {
    return (lookups.runtime_features ?? []).find((row) => row.feature_code === 'SALES_TAX_BRIDGE_DEBUG_VIEW') ?? null;
  }, [lookups.runtime_features]);

  const canViewTaxBridgeDebug = Boolean(
    taxBridgeRuntime?.is_enabled
    && (traceabilityEnabled || taxBridgeDebugRuntime?.is_enabled)
  );

  const loadList = () => {
    setLoading(true);
    setError('');
    fetchGreGuides(accessToken, {
      page,
      per_page: 20,
      status: status || undefined,
      issue_date: issueDate || undefined,
      search: search || undefined,
    })
      .then((res) => {
        setRows(res.data);
        setLastPage(res.meta.last_page || 1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadEmittedDefaults = () => {
    setLoading(true);
    setError('');
    fetchGreGuides(accessToken, {
      page: 1,
      per_page: 20,
    })
      .then((res) => {
        setRows(res.data);
        setLastPage(res.meta.last_page || 1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadLookups = () => {
    fetchGreLookups(accessToken, { branchId })
      .then((res) => {
        setLookups({
          guide_types: res.guide_types.length > 0 ? res.guide_types : DEFAULT_LOOKUPS.guide_types,
          transfer_reasons: res.transfer_reasons.length > 0 ? res.transfer_reasons : DEFAULT_LOOKUPS.transfer_reasons,
          transport_modes: res.transport_modes.length > 0 ? res.transport_modes : DEFAULT_LOOKUPS.transport_modes,
          document_types: res.document_types.length > 0 ? res.document_types : DEFAULT_LOOKUPS.document_types,
          series: res.series.length > 0 ? res.series : DEFAULT_LOOKUPS.series,
          runtime_features: res.runtime_features ?? [],
        });
        const firstSeries = res.series[0]?.series;
        setPayload((prev) => ({ ...prev, series: firstSeries ?? prev.series }));
      })
      .catch(() => {
        setLookups(DEFAULT_LOOKUPS);
      });
  };

  const fileNameTimestampLima = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${pick('year')}-${pick('month')}-${pick('day')}_${pick('hour')}-${pick('minute')}-${pick('second')}`;
  };

  const handleExportExcel = async () => {
    setExporting(true);
    setError('');

    try {
      const XLSX = await import('xlsx');

      const perPage = 100;
      const first = await fetchGreGuides(accessToken, {
        page: 1,
        per_page: perPage,
        status: status || undefined,
        issue_date: issueDate || undefined,
        search: search || undefined,
      });

      const totalPages = Math.max(1, Number(first.meta.last_page || 1));
      let allRows: Array<GreGuide & { item_count?: number }> = [...(first.data ?? [])];

      for (let p = 2; p <= totalPages; p += 1) {
        const next = await fetchGreGuides(accessToken, {
          page: p,
          per_page: perPage,
          status: status || undefined,
          issue_date: issueDate || undefined,
          search: search || undefined,
        });
        allRows = allRows.concat(next.data ?? []);
      }

      if (allRows.length === 0) {
        setActionMessage('No hay guias para exportar en Excel.');
        return;
      }

      const rows = allRows.map((row) => {
        const emittedAt = row.created_at ?? row.updated_at ?? row.issue_date;

        return {
          Guia: row.identifier,
          FechaEmision: fmtDateTimeFullLima(emittedAt),
          FechaTraslado: row.transfer_date ?? '',
          EstadoInterno: row.status,
          EstadoSUNAT: row.sunat_status ?? 'SIN_ENVIO',
          Ticket: row.sunat_ticket ?? '',
          CDRCodigo: row.sunat_cdr_code ?? '',
          CDRDescripcion: row.sunat_cdr_desc ?? '',
          Destinatario: row.destinatario?.name ?? '',
          DestinatarioDocumento: row.destinatario?.doc_number ?? '',
          PuntoPartida: row.punto_partida ?? '',
          PuntoLlegada: row.punto_llegada ?? '',
          PesoKg: Number(row.weight_kg ?? 0),
          Bultos: Number(row.packages_count ?? 0),
          Items: Number(row.item_count ?? row.items?.length ?? 0),
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'GuiasEmitidas');
      XLSX.writeFile(wb, `gre_guias_emitidas_${fileNameTimestampLima()}.xlsx`);
      setActionMessage(`Excel generado (${rows.length} guias).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar las guias en Excel.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, branchId]);

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, issueDate]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }

    fetchGreGuideDetail(accessToken, selectedId)
      .then((res) => {
        setDetail(res);
        if (mode === 'edit') {
          setPayload(toPayload(res));
        }
      })
      .catch(() => setDetail(null));
  }, [selectedId, accessToken, mode]);

  useEffect(() => {
    const query = ubigeoSearchPartida.trim();
    if (query.length < 2) {
      setUbigeoResultsPartida([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      searchGreUbigeos(accessToken, query, 12)
        .then((rows) => {
          if (active) setUbigeoResultsPartida(rows);
        })
        .catch(() => {
          if (active) setUbigeoResultsPartida([]);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, ubigeoSearchPartida]);

  useEffect(() => {
    const query = ubigeoSearchLlegada.trim();
    if (query.length < 2) {
      setUbigeoResultsLlegada([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      searchGreUbigeos(accessToken, query, 12)
        .then((rows) => {
          if (active) setUbigeoResultsLlegada(rows);
        })
        .catch(() => {
          if (active) setUbigeoResultsLlegada([]);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [accessToken, ubigeoSearchLlegada]);

  const onCreateNew = () => {
    setActiveTab('editor');
    setMode('create');
    setSelectedId(null);
    setDetail(null);
    setPayload({ ...EMPTY_PAYLOAD, branch_id: branchId });
    setActionMessage('');
    setError('');
  };

  const onEditSelected = () => {
    if (!detail) return;
    setActiveTab('editor');
    setMode('edit');
    setPayload(toPayload(detail));
    setActionMessage('');
    setError('');
  };

  const setItem = (index: number, key: 'code' | 'description' | 'qty' | 'unit', value: string) => {
    setPayload((prev) => {
      const next = { ...prev, items: [...prev.items] };
      const current = { ...next.items[index] };
      if (key === 'qty') {
        current.qty = Number(value || 0);
      } else {
        current[key] = value;
      }
      next.items[index] = current;
      return next;
    });
  };

  const validatePayload = (candidate: GreGuidePayload): string | null => {
    if (!/^\d{6}$/.test(String(candidate.partida_ubigeo ?? ''))) {
      return 'Ubigeo de partida invalido (6 digitos).';
    }
    if (!/^\d{6}$/.test(String(candidate.llegada_ubigeo ?? ''))) {
      return 'Ubigeo de llegada invalido (6 digitos).';
    }
    if ((candidate.weight_kg ?? 0) <= 0) {
      return 'Peso bruto debe ser mayor a 0.';
    }
    if ((candidate.packages_count ?? 0) <= 0) {
      return 'Numero de bultos debe ser mayor a 0.';
    }
    if (!candidate.destinatario?.doc_type || !candidate.destinatario?.doc_number || !candidate.destinatario?.name) {
      return 'Completa tipo doc, numero y nombre del destinatario.';
    }
    if (['01', '02', '14'].includes(candidate.motivo_traslado) && !(candidate.related_document_id && candidate.related_document_id > 0)) {
      return 'Para este motivo debes indicar comprobante relacionado.';
    }
    if (candidate.transport_mode_code === '01') {
      const transporterDocType = String((candidate.transporter as Record<string, unknown> | undefined)?.doc_type ?? '').trim();
      const transporterDoc = String((candidate.transporter as Record<string, unknown> | undefined)?.doc_number ?? '').trim();
      const transporterName = String((candidate.transporter as Record<string, unknown> | undefined)?.name ?? '').trim();
      if (transporterDocType === '' || transporterDoc === '' || transporterName === '') {
        return 'Transporte publico requiere tipo y datos de transportista.';
      }
    }
    if (candidate.transport_mode_code === '02') {
      const plate = String((candidate.vehicle as Record<string, unknown> | undefined)?.placa ?? '').trim();
      const driverDocType = String((candidate.driver as Record<string, unknown> | undefined)?.doc_type ?? '').trim();
      const driverDoc = String((candidate.driver as Record<string, unknown> | undefined)?.doc_number ?? '').trim();
      const driverName = String((candidate.driver as Record<string, unknown> | undefined)?.name ?? '').trim();
      const driverLicense = String((candidate.driver as Record<string, unknown> | undefined)?.license ?? '').trim();
      if (plate === '') {
        return 'Transporte privado requiere placa de vehiculo.';
      }
      if (driverDocType === '' || driverDoc === '' || driverName === '') {
        return 'Transporte privado requiere tipo y datos del conductor.';
      }
      if (driverLicense === '') {
        return 'Transporte privado requiere licencia del conductor.';
      }
    }

    const validItems = candidate.items.filter((row) => row.description.trim() !== '' && row.qty > 0);
    if (validItems.length === 0) {
      return 'Agrega al menos un item valido.';
    }

    return null;
  };

  const doPrefillFromDocument = () => {
    const normalized = prefillReference.trim().toUpperCase();
    const match = normalized.match(/^([A-Z0-9]{1,4})-(\d{1,8})$/);
    if (!match) {
      setError('Ingresa el comprobante como Serie-Numero. Ejemplo: F001-15');
      return;
    }

    const series = match[1];
    const number = Number(match[2]);
    const documentKind: 'INVOICE' | 'RECEIPT' = series.startsWith('B') ? 'RECEIPT' : 'INVOICE';

    setSaving(true);
    setError('');
    prefillGreFromDocument(accessToken, {
      series,
      number,
      documentKind,
    })
      .then((res) => {
        setPayload((prev) => ({
          ...prev,
          ...res.draft,
          branch_id: branchId,
          series: prev.series,
          items: res.draft.items && res.draft.items.length > 0 ? res.draft.items : prev.items,
          destinatario: { ...prev.destinatario, ...(res.draft.destinatario ?? {}) },
          transporter: { ...prev.transporter, ...(res.draft.transporter ?? {}) },
          vehicle: { ...prev.vehicle, ...(res.draft.vehicle ?? {}) },
          driver: { ...prev.driver, ...(res.draft.driver ?? {}) },
        }));
        setActionMessage(`Datos precargados desde ${res.related_document.series}-${res.related_document.number}.`);
        setPrefillOpen(false);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const applyUbigeo = (target: 'partida' | 'llegada', item: GreUbigeoOption) => {
    const legacyLabel = `${item.ubigeo} - ${item.label}`;
    if (target === 'partida') {
      setPayload((prev) => ({ ...prev, partida_ubigeo: item.ubigeo, punto_partida: prev.punto_partida || item.label }));
      setUbigeoSearchPartida(legacyLabel);
      setUbigeoResultsPartida([]);
      return;
    }

    setPayload((prev) => ({ ...prev, llegada_ubigeo: item.ubigeo, punto_llegada: prev.punto_llegada || item.label }));
    setUbigeoSearchLlegada(legacyLabel);
    setUbigeoResultsLlegada([]);
  };

  const saveForm = () => {
    const body: GreGuidePayload = {
      ...payload,
      branch_id: branchId,
      items: payload.items.filter((row) => row.description.trim() !== '' && row.qty > 0),
    };

    const validationMessage = validatePayload(body);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    setError('');
    setActionMessage('');

    const operation = mode === 'create' || !selectedId
      ? createGreGuide(accessToken, body)
      : updateGreGuide(accessToken, selectedId, body);

    operation
      .then((res) => {
        setActionMessage(res.message);
        const id = res.data.id;
        setSelectedId(id);
        setDetail(res.data);
        setMode('edit');
        setPayload(toPayload(res.data));
        if (autoSend) {
          doSendById(id);
        } else {
          setStatus('');
          setIssueDate('');
          setSearch('');
          setPage(1);
          setActiveTab('emitted');
          loadEmittedDefaults();
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => { if (!autoSend) setSaving(false); });
  };

  const doSendById = (id: number) => {
    setSaving(true);
    setError('');
    setActionMessage('');
    sendGreGuide(accessToken, id)
      .then((res) => {
        console.info('GRE send response', res);
        const detail = buildBridgeAlertDetail(res);
        setSunatToast({
          tone: res.status === 'ACCEPTED' ? 'ok' : (res.status === 'SENT' || res.status === 'SENDING') ? 'warn' : 'bad',
          title: `GRE: ${res.label}`,
          detail,
        });
        setActionMessage(`${res.label} | ${detail}`);
        setStatus('');
        setIssueDate('');
        setSearch('');
        setPage(1);
        setActiveTab('emitted');
        loadEmittedDefaults();
        return fetchGreGuideDetail(accessToken, id).then(setDetail);
      })
      .catch((err: Error) => {
        setError(err.message);
        setSunatToast({ tone: 'bad', title: 'GRE: Error de envio', detail: err.message });
      })
      .finally(() => setSaving(false));
  };

  const handleRowSend = (row: GreGuide & { item_count?: number }) => {
    if (rowActionLoading) return;
    setRowActionLoading(row.id);
    sendGreGuide(accessToken, row.id)
      .then((res) => {
        console.info('GRE row send response', { guide: row.identifier, ...res });
        const detail = buildBridgeAlertDetail(res);
        setSunatToast({
          tone: res.status === 'ACCEPTED' ? 'ok' : res.status === 'SENT' ? 'warn' : 'bad',
          title: `GRE ${row.identifier}: ${res.label}`,
          detail,
        });
        loadEmittedDefaults();
      })
      .catch((err: Error) => setSunatToast({ tone: 'bad', title: `GRE ${row.identifier}: Error`, detail: err.message }))
      .finally(() => setRowActionLoading(null));
  };

  const handleRowTicket = (row: GreGuide & { item_count?: number }) => {
    if (rowActionLoading) return;
    setRowActionLoading(row.id);
    queryGreTicketStatus(accessToken, row.id)
      .then((res) => {
        console.info('GRE ticket status response', { guide: row.identifier, ...res });
        const detail = buildBridgeAlertDetail(res);
        setSunatToast({
          tone: res.status === 'ACCEPTED' ? 'ok' : res.status === 'SENT' ? 'warn' : 'bad',
          title: `Ticket GRE ${row.identifier}: ${res.label}`,
          detail,
        });
        loadEmittedDefaults();
      })
      .catch((err: Error) => setSunatToast({ tone: 'bad', title: `Ticket ${row.identifier}: Error`, detail: err.message }))
      .finally(() => setRowActionLoading(null));
  };

  const handleRowCancel = (row: GreGuide & { item_count?: number }) => {
    if (rowActionLoading || row.status === 'CANCELLED') return;
    const reason = window.prompt(`Motivo de anulacion para ${row.identifier}`);
    if (!reason || reason.trim() === '') return;

    setRowActionLoading(row.id);
    cancelGreGuide(accessToken, row.id, reason.trim())
      .then((res) => {
        setSunatToast({ tone: 'warn', title: `GRE ${row.identifier}: Anulada`, detail: res.message });
        loadEmittedDefaults();
      })
      .catch((err: Error) => setSunatToast({ tone: 'bad', title: `GRE ${row.identifier}: Error`, detail: err.message }))
      .finally(() => setRowActionLoading(null));
  };

  const handleRowLoadEditor = (row: GreGuide & { item_count?: number }) => {
    setSelectedId(row.id);
    setMode('edit');
    setActiveTab('editor');
  };

  const handleToggleSunatBridgeDebug = async (row: GreGuide & { item_count?: number }) => {
    if (!canViewTaxBridgeDebug) {
      return;
    }

    if (sunatBridgeDebugState?.guideId === row.id) {
      setSunatBridgeDebugState(null);
      return;
    }

    setSunatBridgeDebugState({
      guideId: row.id,
      title: row.identifier,
      loading: true,
      error: '',
      attempts: [],
      selectedLogId: null,
      loadingDetailLogId: null,
      attemptDetails: {},
    });

    try {
      const history = await fetchGreTaxBridgeAuditHistory(accessToken, row.id, 50);
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.guideId !== row.id) {
          return prev;
        }

        const firstLogId = history.logs.length > 0 ? history.logs[0].id : null;
        return {
          ...prev,
          loading: false,
          error: '',
          attempts: history.logs,
          selectedLogId: firstLogId,
        };
      });

      if (history.logs.length > 0) {
        await loadSunatAuditAttemptDetail(row.id, history.logs[0].id);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo obtener el historico de intentos SUNAT';
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.guideId !== row.id) {
          return prev;
        }

        return {
          ...prev,
          loading: false,
          error: text,
        };
      });
    }
  };

  const loadSunatAuditAttemptDetail = async (guideId: number, logId: number) => {
    setSunatBridgeDebugState((prev) => {
      if (!prev || prev.guideId !== guideId) {
        return prev;
      }

      return {
        ...prev,
        selectedLogId: logId,
        loadingDetailLogId: logId,
        error: '',
      };
    });

    try {
      const detail = await fetchGreTaxBridgeAuditAttemptDetail(accessToken, logId);
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.guideId !== guideId) {
          return prev;
        }

        return {
          ...prev,
          loadingDetailLogId: null,
          attemptDetails: {
            ...prev.attemptDetails,
            [logId]: detail,
          },
        };
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'No se pudo cargar el detalle tecnico';
      setSunatBridgeDebugState((prev) => {
        if (!prev || prev.guideId !== guideId) {
          return prev;
        }

        return {
          ...prev,
          loadingDetailLogId: null,
          error: text,
          attemptDetails: {
            ...prev.attemptDetails,
            [logId]: null,
          },
        };
      });
    }
  };

  const openPrintPreview = (id: number, format: 'ticket' | 'a4', label: string) => {
    fetchGrePrintHtml(accessToken, id, format)
      .then((html) =>
        setPrintPreview({
          title: `GRE — ${label}`,
          subtitle: format === 'ticket' ? 'Vista de ticket 80mm' : 'Vista previa A4',
          html,
          variant: format === 'ticket' ? 'compact' : 'wide',
        })
      )
      .catch((err: Error) => setError(err.message));
  };

  return (
    <div className="ds-root gre-root">
      <div className="gre-tabs">
        <button
          className={`gre-tab-btn ${activeTab === 'editor' ? 'is-active' : ''}`}
          type="button"
          onClick={onCreateNew}
        >
          {activeTab === 'editor' && mode === 'edit' && detail
            ? `Editando ${detail.identifier}`
            : 'Nueva Guia'}
        </button>
        <button
          className={`gre-tab-btn ${activeTab === 'emitted' ? 'is-active' : ''}`}
          type="button"
          onClick={() => {
            setActiveTab('emitted');
            setStatus('');
            setIssueDate('');
            setSearch('');
            setPage(1);
            loadEmittedDefaults();
          }}
        >
          Guias emitidas
        </button>
      </div>

      {activeTab === 'emitted' && (
        <section className="gre-emitted-panel">
          <div className="ds-header gre-header">
            <div>
              <h2 className="ds-title">Guia GRE SUNAT</h2>
            </div>
            <div className="gre-header-actions">
              <button className="ds-btn-secondary" type="button" onClick={() => setKpisOpen((v) => !v)}>
                {kpisOpen ? 'Ocultar resumen' : 'Mostrar resumen'}
              </button>
              <button className="ds-btn-secondary" type="button" onClick={() => void handleExportExcel()} disabled={exporting || loading}>
                {exporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
              <button className="ds-btn-secondary" type="button" onClick={loadList}>Recargar</button>
            </div>
          </div>

          {kpisOpen && (
            <div className="gre-kpis">
              <article><span>Total visibles</span><strong>{summary.total}</strong></article>
              <article><span>Borrador</span><strong>{summary.draft}</strong></article>
              <article><span>Enviadas/Aceptadas</span><strong>{summary.sent}</strong></article>
              <article><span>Con observaciones</span><strong>{summary.rejected}</strong></article>
            </div>
          )}

          <div className="gre-list-header">
            <h3>Reporte de guias emitidas</h3>
            <span>{emittedRows.length} registro(s)</span>
          </div>

          {sunatToast && (
            <div className="gre-sunat-toast-anchor">
              <div className={`gre-sunat-toast ${sunatToast.tone}`} role="status" aria-live="polite">
                <strong>{sunatToast.title}</strong>
                <span>{sunatToast.detail}</span>
                <button type="button" onClick={() => setSunatToast(null)} aria-label="Cerrar notificacion">Cerrar</button>
              </div>
            </div>
          )}

          <div className="gre-report-filters">
            <input
              className="ds-input"
              placeholder="Buscar por guia, ticket o destinatario"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  loadList();
                }
              }}
            />
            <input className="ds-input" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); setPage(1); }} />
            <select className="ds-input" value={status} onChange={(e) => { setStatus(e.target.value as GreGuideStatus | ''); setPage(1); }}>
              <option value="">Todas</option>
              <option value="SENT">Enviadas</option>
              <option value="ACCEPTED">Aceptadas</option>
              <option value="REJECTED">Rechazadas</option>
              <option value="ERROR">Con error</option>
              <option value="CANCELLED">Anuladas</option>
            </select>
            <button className="ds-btn-secondary" type="button" onClick={() => { setPage(1); loadList(); }}>Buscar</button>
          </div>

          <div className="gre-filter-chips">
            <button className={`gre-chip ${status === '' ? 'is-active' : ''}`} type="button" onClick={() => { setStatus(''); setPage(1); }}>Todas</button>
            <button className={`gre-chip ${status === 'SENT' ? 'is-active' : ''}`} type="button" onClick={() => { setStatus('SENT'); setPage(1); }}>Enviadas</button>
            <button className={`gre-chip ${status === 'ACCEPTED' ? 'is-active' : ''}`} type="button" onClick={() => { setStatus('ACCEPTED'); setPage(1); }}>Aceptadas</button>
            <button className={`gre-chip ${status === 'REJECTED' ? 'is-active' : ''}`} type="button" onClick={() => { setStatus('REJECTED'); setPage(1); }}>Rechazadas</button>
            <button className="gre-chip" type="button" onClick={() => { setSearch(''); setIssueDate(''); setStatus(''); setPage(1); loadList(); }}>Limpiar filtros</button>
          </div>

          <div className="gre-emitted-wrap">
            <table className="gre-emitted-table">
              <colgroup>
                <col className="col-id" />
                <col className="col-date" />
                <col className="col-dest" />
                <col className="col-status" />
                <col className="col-actions" />
                <col className="col-ticket" />
                <col className="col-sunat" />
              </colgroup>
              <thead>
                <tr>
                  <th>Guia</th>
                  <th>Fecha</th>
                  <th>Destinatario</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                  <th>Ticket</th>
                  <th>SUNAT</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7}>Cargando...</td>
                  </tr>
                )}
                {!loading && emittedRows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      No hay guias para los filtros seleccionados.
                      <div style={{ marginTop: '8px' }}>
                        <button
                          className="ds-btn-secondary"
                          type="button"
                          onClick={() => {
                            setStatus('');
                            setIssueDate('');
                            setSearch('');
                            setPage(1);
                            loadEmittedDefaults();
                          }}
                        >
                          Mostrar todas
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && emittedRows.map((row) => {
                  const emittedAt = row.created_at ?? row.updated_at ?? row.issue_date;
                  const sunatStatus = (row.sunat_status ?? 'SIN_ENVIO').toUpperCase();
                  const sunatBadgeClass =
                    sunatStatus === 'ACEPTADO'          ? 'is-ok' :
                    sunatStatus === 'RECHAZADO'         ? 'is-bad' :
                    sunatStatus === 'PENDIENTE_TICKET'  ? 'is-progress' :
                    sunatStatus === 'SIN_ENVIO'         ? 'is-neutral' : 'is-warn';
                  const sunatLabel =
                    sunatStatus === 'ACEPTADO'          ? 'Aceptado' :
                    sunatStatus === 'RECHAZADO'         ? 'Rechazado' :
                    sunatStatus === 'PENDIENTE_TICKET'  ? 'Ticket pendiente' :
                    sunatStatus === 'SIN_ENVIO'         ? 'Sin envio' : sunatStatus;
                  const canSend = ['DRAFT', 'ERROR', 'REJECTED'].includes(row.status);
                  const canTicket = row.status === 'SENT' || (!!row.sunat_ticket && !['ACCEPTED', 'CANCELLED'].includes(row.status));
                  const canEditRow = !['ACCEPTED', 'CANCELLED'].includes(row.status);
                  return (
                    <tr
                      key={`emitted-${row.id}`}
                      className={selectedId === row.id ? 'is-selected' : ''}
                      onClick={() => {
                        setSelectedId(row.id);
                        setMode('edit');
                      }}
                    >
                      <td>{row.identifier}</td>
                      <td title={String(emittedAt ?? '')}>{fmtDateTimeFullLima(emittedAt)}</td>
                      <td>{row.destinatario?.name ?? '-'}</td>
                      <td>
                        <span className={`gre-status-badge gre-status-badge--${row.status.toLowerCase()}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td>
                        <div className="gre-icon-actions">
                          <button
                            className="btn-mini gre-icon-btn"
                            type="button"
                            title="Vista previa Ticket 80mm"
                            onClick={() => openPrintPreview(row.id, 'ticket', row.identifier)}
                          >
                            🖨️
                          </button>
                          <button
                            className="btn-mini gre-icon-btn"
                            type="button"
                            title="Vista previa A4"
                            onClick={() => openPrintPreview(row.id, 'a4', row.identifier)}
                          >
                            📄
                          </button>
                          <button
                            className="btn-mini gre-icon-btn"
                            type="button"
                            title="Editar guia"
                            disabled={!canEditRow}
                            onClick={() => handleRowLoadEditor(row)}
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{row.sunat_ticket ?? '-'}</code>
                      </td>
                      <td>
                        <div className="sales-sunat-dropdown" onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}>
                            <button
                              type="button"
                              className={`sales-sunat-badge ${sunatBadgeClass}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              {sunatLabel}
                            </button>
                            {canViewTaxBridgeDebug && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void handleToggleSunatBridgeDebug(row);
                                }}
                                title="Ver historial de intentos SUNAT"
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '9999px',
                                  border: sunatBridgeDebugState?.guideId === row.id ? '1px solid #0f766e' : '1px solid #cbd5e1',
                                  background: sunatBridgeDebugState?.guideId === row.id ? '#ecfeff' : '#f8fafc',
                                  color: '#0f172a',
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                              >
                                i
                              </button>
                            )}
                          </div>
                          <div className="sales-sunat-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                            {(row.sunat_ticket || row.sunat_cdr_code) && (
                              <>
                                <p className="sunat-menu-section-label">Referencia</p>
                                {row.sunat_ticket && (
                                  <div className="gre-sunat-ref">
                                    <span className="sunat-menu-section-label" style={{ margin: 0 }}>Ticket:</span>
                                    <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{row.sunat_ticket}</code>
                                  </div>
                                )}
                                {row.sunat_cdr_code && (
                                  <div className="gre-sunat-ref">
                                    <span className="sunat-menu-section-label" style={{ margin: 0 }}>CDR:</span>
                                    <code style={{ fontSize: '0.7rem' }}>{row.sunat_cdr_code}</code>
                                  </div>
                                )}
                                <div className="sunat-menu-divider" />
                              </>
                            )}

                            <button
                              type="button"
                              className="sunat-menu-btn"
                              disabled={rowActionLoading === row.id || !canSend}
                              onClick={() => handleRowSend(row)}
                            >
                              <span className="sunat-menu-btn__icon">🚀</span>
                              <span className="sunat-menu-btn__text">{rowActionLoading === row.id && canSend ? 'Enviando...' : 'Enviar SUNAT'}</span>
                            </button>

                            <button
                              type="button"
                              className="sunat-menu-btn"
                              disabled={rowActionLoading === row.id || !canTicket}
                              onClick={() => handleRowTicket(row)}
                            >
                              <span className="sunat-menu-btn__icon">🔍</span>
                              <span className="sunat-menu-btn__text">{rowActionLoading === row.id && canTicket ? 'Consultando...' : 'Consultar ticket'}</span>
                            </button>

                            <button
                              type="button"
                              className="sunat-menu-btn sunat-menu-btn--danger"
                              disabled={rowActionLoading === row.id || row.status === 'CANCELLED'}
                              onClick={() => handleRowCancel(row)}
                            >
                              <span className="sunat-menu-btn__icon">⛔</span>
                              <span className="sunat-menu-btn__text">Anular guia</span>
                            </button>

                            <button
                              type="button"
                              className="sunat-menu-btn"
                              disabled={rowActionLoading === row.id || !canEditRow}
                              onClick={() => handleRowLoadEditor(row)}
                            >
                              <span className="sunat-menu-btn__icon">✏️</span>
                              <span className="sunat-menu-btn__text">Cargar en editor</span>
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ds-pagination">
            <button className="ds-btn-secondary" type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
            <span>Pagina {page} de {lastPage}</span>
            <button className="ds-btn-secondary" type="button" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))}>Siguiente</button>
          </div>
        </section>
      )}

      {activeTab === 'editor' && (
        <section className="gre-form-panel gre-form-panel--wide">
          <div className="gre-form-header">
            <h3>{mode === 'create' ? 'Nueva GRE' : `Editando ${detail?.identifier ?? ''}`}</h3>
            <div className="gre-form-header-actions">
              <button className="ds-btn-secondary" type="button" onClick={() => setPrefillOpen((v) => !v)}>
                {prefillOpen ? 'Cerrar precarga' : 'Precargar comprobante'}
              </button>
              {detail && (
                <span className={`ds-badge ds-badge--${detail.status.toLowerCase()}`}>{STATUS_LABEL[detail.status]}</span>
              )}
            </div>

            {prefillOpen && (
              <div className="gre-prefill-popover" role="dialog" aria-label="Precargar comprobante">
                <p className="gre-section-title">Precargar comprobante</p>
                <div className="gre-prefill-row">
                  <input
                    className="ds-input"
                    placeholder="Comprobante (Ej. F001-15)"
                    value={prefillReference}
                    onChange={(e) => setPrefillReference(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !saving && isPrefillFormatValid) {
                        doPrefillFromDocument();
                      }
                    }}
                  />
                  <button className="ds-btn-secondary" type="button" disabled={saving || !isPrefillFormatValid} onClick={doPrefillFromDocument}>Precargar</button>
                </div>
                <div className="gre-prefill-help">
                  <span className={isPrefillFormatValid || prefillReference.trim() === '' ? '' : 'is-error'}>
                    Formato: SERIE-NUMERO. Ejemplos: F001-15 o B001-120.
                  </span>
                  <div>
                    <button type="button" className="gre-chip" onClick={() => setPrefillReference('F001-')}>Factura</button>
                    <button type="button" className="gre-chip" onClick={() => setPrefillReference('B001-')}>Boleta</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="error-box" style={{ marginTop: 0 }}>{error}</p>}
          {actionMessage && <p className="notice">{actionMessage}</p>}
          {taxBridgeRuntime && (
            <p className="notice" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="sales-mode-chip" style={{ background: taxBridgeRuntime.is_enabled ? '#dbeafe' : '#f3f4f6', color: taxBridgeRuntime.is_enabled ? '#1e3a8a' : '#374151' }}>
                GRE bridge: {taxBridgeRuntime.is_enabled ? 'Habilitado' : 'Deshabilitado'}
              </span>
              <span className={featureSourceBadgeClass(taxBridgeRuntime.vertical_source)}>
                Fuente GRE bridge: {featureSourceLabel(taxBridgeRuntime.vertical_source)}
              </span>
            </p>
          )}

          <div className="gre-form-grid">
          <div className="gre-section">
            <p className="gre-section-title">Paso 1: Datos de la guia</p>
            <div className="gre-grid-2">
              <label className="ds-field">
                <span>Tipo</span>
                <select className="ds-input" value={payload.guide_type} onChange={(e) => setPayload((p) => ({ ...p, guide_type: e.target.value as 'REMITENTE' | 'TRANSPORTISTA' }))}>
                  {lookups.guide_types.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.name}</option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span>Serie</span>
                <select className="ds-input" value={payload.series} onChange={(e) => setPayload((p) => ({ ...p, series: e.target.value.toUpperCase() }))}>
                  {lookups.series.map((row) => (
                    <option key={row.id} value={row.series}>{row.series} - {row.name}</option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span>Fecha emision</span>
                <input type="date" className="ds-input" value={payload.issue_date} onChange={(e) => setPayload((p) => ({ ...p, issue_date: e.target.value }))} />
              </label>
              <label className="ds-field">
                <span>Fecha traslado</span>
                <input type="date" className="ds-input" value={payload.transfer_date ?? ''} onChange={(e) => setPayload((p) => ({ ...p, transfer_date: e.target.value || null }))} />
              </label>
              <label className="ds-field">
                <span>Motivo traslado</span>
                <select className="ds-input" value={payload.motivo_traslado} onChange={(e) => setPayload((p) => ({ ...p, motivo_traslado: e.target.value }))}>
                  {lookups.transfer_reasons.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.code} - {opt.name}</option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span>Tipo transporte</span>
                <select className="ds-input" value={payload.transport_mode_code} onChange={(e) => setPayload((p) => ({ ...p, transport_mode_code: e.target.value }))}>
                  {lookups.transport_modes.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.code} - {opt.name}</option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span>Peso kg</span>
                <input type="number" step="0.001" className="ds-input" value={payload.weight_kg} onChange={(e) => setPayload((p) => ({ ...p, weight_kg: Number(e.target.value || 0) }))} />
              </label>
              <label className="ds-field">
                <span>Bultos</span>
                <input type="number" className="ds-input" value={payload.packages_count} onChange={(e) => setPayload((p) => ({ ...p, packages_count: Number(e.target.value || 1) }))} />
              </label>
            </div>
          </div>

          <div className="gre-section">
            <p className="gre-section-title">Paso 2: Traslado y destinatario</p>
            <div className="gre-grid-2">
              <label className="ds-field">
                <span>Tipo documento SUNAT</span>
                <select className="ds-input" value={payload.destinatario.doc_type ?? '6'} onChange={(e) => setPayload((p) => ({ ...p, destinatario: { ...p.destinatario, doc_type: e.target.value } }))}>
                  {lookups.document_types.map((opt) => (
                    <option key={opt.code} value={opt.code}>{opt.code} - {opt.name}</option>
                  ))}
                </select>
              </label>
              <label className="ds-field">
                <span>Doc destinatario</span>
                <input className="ds-input" value={payload.destinatario.doc_number ?? ''} onChange={(e) => setPayload((p) => ({ ...p, destinatario: { ...p.destinatario, doc_number: e.target.value } }))} />
              </label>
            </div>

            <div className="gre-grid-2">
              <label className="ds-field">
                <span>Nombre destinatario</span>
                <input className="ds-input" value={payload.destinatario.name ?? ''} onChange={(e) => setPayload((p) => ({ ...p, destinatario: { ...p.destinatario, name: e.target.value } }))} />
              </label>
              <label className="ds-field gre-field-compact">
                <span>Direccion destinatario</span>
                <input className="ds-input" value={payload.destinatario.address ?? ''} onChange={(e) => setPayload((p) => ({ ...p, destinatario: { ...p.destinatario, address: e.target.value } }))} />
              </label>
            </div>

            <div className="gre-grid-2">
              <label className="ds-field">
                <span>Ubigeo partida</span>
                <div className="gre-autocomplete">
                  <input
                    className="ds-input"
                    value={ubigeoSearchPartida}
                    onChange={(e) => setUbigeoSearchPartida(e.target.value)}
                    placeholder="Escribe ubigeo o distrito (autocomplete)"
                  />
                  {ubigeoResultsPartida.length > 0 && (
                    <div className="gre-autocomplete-list">
                      {ubigeoResultsPartida.map((row) => (
                        <button key={row.ubigeo} type="button" className="gre-autocomplete-item" onClick={() => applyUbigeo('partida', row)}>
                          {row.ubigeo} - {row.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
              <label className="ds-field">
                <span>Ubigeo llegada</span>
                <div className="gre-autocomplete">
                  <input
                    className="ds-input"
                    value={ubigeoSearchLlegada}
                    onChange={(e) => setUbigeoSearchLlegada(e.target.value)}
                    placeholder="Escribe ubigeo o distrito (autocomplete)"
                  />
                  {ubigeoResultsLlegada.length > 0 && (
                    <div className="gre-autocomplete-list">
                      {ubigeoResultsLlegada.map((row) => (
                        <button key={row.ubigeo} type="button" className="gre-autocomplete-item" onClick={() => applyUbigeo('llegada', row)}>
                          {row.ubigeo} - {row.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            </div>

            <div className="gre-grid-2">
              <label className="ds-field">
                <span>Punto partida</span>
                <input className="ds-input" value={payload.punto_partida} onChange={(e) => setPayload((p) => ({ ...p, punto_partida: e.target.value }))} />
              </label>
              <label className="ds-field">
                <span>Punto llegada</span>
                <input className="ds-input" value={payload.punto_llegada} onChange={(e) => setPayload((p) => ({ ...p, punto_llegada: e.target.value }))} />
              </label>
            </div>

            {isPublicTransport && (
              <>
                <div className="gre-grid-2">
                  <label className="ds-field">
                    <span>Tipo documento transportista</span>
                    <select
                      className="ds-input"
                      value={String((payload.transporter?.doc_type as string) ?? '6')}
                      onChange={(e) => setPayload((p) => ({ ...p, transporter: { ...(p.transporter ?? {}), doc_type: e.target.value } }))}
                    >
                      {lookups.document_types.map((opt) => (
                        <option key={`transporter-doc-${opt.code}`} value={opt.code}>{opt.code} - {opt.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ds-field">
                    <span>Transportista RUC</span>
                    <input className="ds-input" value={(payload.transporter?.doc_number as string) ?? ''} onChange={(e) => setPayload((p) => ({ ...p, transporter: { ...(p.transporter ?? {}), doc_number: e.target.value } }))} />
                  </label>
                </div>

                <div className="gre-grid-2">
                  <label className="ds-field">
                    <span>Razon social transportista</span>
                    <input className="ds-input" value={(payload.transporter?.name as string) ?? ''} onChange={(e) => setPayload((p) => ({ ...p, transporter: { ...(p.transporter ?? {}), name: e.target.value } }))} />
                  </label>
                </div>
              </>
            )}

            {isPrivateTransport && (
              <>
                <div className="gre-grid-2">
                  <label className="ds-field">
                    <span>Vehiculo placa</span>
                    <input className="ds-input" value={String((payload.vehicle?.placa as string) ?? '')} onChange={(e) => setPayload((p) => ({ ...p, vehicle: { ...(p.vehicle ?? {}), placa: e.target.value } }))} />
                  </label>
                  <label className="ds-field">
                    <span>Tipo documento conductor</span>
                    <select
                      className="ds-input"
                      value={String((payload.driver?.doc_type as string) ?? '1')}
                      onChange={(e) => setPayload((p) => ({ ...p, driver: { ...(p.driver ?? {}), doc_type: e.target.value } }))}
                    >
                      {lookups.document_types.map((opt) => (
                        <option key={`driver-doc-${opt.code}`} value={opt.code}>{opt.code} - {opt.name}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="gre-grid-2">
                  <label className="ds-field">
                    <span>Conductor doc</span>
                    <input className="ds-input" value={String((payload.driver?.doc_number as string) ?? '')} onChange={(e) => setPayload((p) => ({ ...p, driver: { ...(p.driver ?? {}), doc_number: e.target.value } }))} />
                  </label>
                  <label className="ds-field">
                    <span>Conductor nombre</span>
                    <input className="ds-input" value={String((payload.driver?.name as string) ?? '')} onChange={(e) => setPayload((p) => ({ ...p, driver: { ...(p.driver ?? {}), name: e.target.value } }))} />
                  </label>
                </div>

                <div className="gre-grid-2">
                  <label className="ds-field">
                    <span>Licencia conductor</span>
                    <input className="ds-input" value={String((payload.driver?.license as string) ?? '')} onChange={(e) => setPayload((p) => ({ ...p, driver: { ...(p.driver ?? {}), license: e.target.value } }))} />
                  </label>
                </div>

                <div className="gre-grid-2">
                  <label className="ds-field">
                    <span>Comprobante relacionado</span>
                    <input className="ds-input" value={payload.related_document_id ?? ''} onChange={(e) => setPayload((p) => ({ ...p, related_document_id: e.target.value ? Number(e.target.value) : null }))} />
                  </label>
                </div>
              </>
            )}

            {!isPrivateTransport && (
              <label className="ds-field">
                <span>Comprobante relacionado</span>
                <input className="ds-input" value={payload.related_document_id ?? ''} onChange={(e) => setPayload((p) => ({ ...p, related_document_id: e.target.value ? Number(e.target.value) : null }))} />
              </label>
            )}
          </div>
          </div>

          <div className="gre-section">
            <div className="gre-items-head">
              <p className="gre-section-title">Paso 3: Mercaderia</p>
              <button className="ds-btn-secondary" type="button" onClick={() => setPayload((p) => ({ ...p, items: [...p.items, { code: '', description: '', qty: 1, unit: 'NIU' }] }))}>
                + Agregar item
              </button>
            </div>
            {payload.items.map((item, idx) => (
              <div key={idx} className="gre-item-row">
                <input className="ds-input" placeholder="Codigo" value={item.code ?? ''} onChange={(e) => setItem(idx, 'code', e.target.value)} />
                <input className="ds-input" placeholder="Descripcion" value={item.description} onChange={(e) => setItem(idx, 'description', e.target.value)} />
                <input className="ds-input" type="number" step="0.01" placeholder="Cantidad" value={item.qty} onChange={(e) => setItem(idx, 'qty', e.target.value)} />
                <button className="ds-btn-secondary" type="button" onClick={() => setPayload((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}>Quitar</button>
              </div>
            ))}
          </div>

          <div className="gre-actions-bar">
            <button className="ds-btn-primary" type="button" disabled={saving} onClick={saveForm}>{saving ? 'Guardando...' : 'Guardar'}</button>
            <label className="gre-autosend-check">
              <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
              Auto-enviar al guardar
            </label>
          </div>


        </section>
      )}

      {sunatBridgeDebugState && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 3349,
              background: 'rgba(15, 23, 42, 0.52)',
            }}
            onClick={() => setSunatBridgeDebugState(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSunatBridgeDebugState(null);
              }
            }}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 3350,
              width: 'min(1080px, 96vw)',
              maxHeight: '90vh',
              overflow: 'auto',
              background: '#ffffff',
              border: '1px solid #dbe4f0',
              borderRadius: '14px',
              boxShadow: '0 28px 70px rgba(15, 23, 42, 0.42)',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: 'linear-gradient(120deg, #0f172a 0%, #0f766e 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Detalle tecnico SUNAT bridge</h3>
                <p style={{ margin: '4px 0 0', opacity: 0.88, fontSize: '0.84rem' }}>{sunatBridgeDebugState.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSunatBridgeDebugState(null)}
                style={{ border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(15,23,42,0.2)', color: '#fff', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ padding: '14px 16px' }}>
              {sunatBridgeDebugState.loading ? (
                <p style={{ margin: 0, color: '#64748b' }}>Consultando trazabilidad tecnica del envio...</p>
              ) : sunatBridgeDebugState.error ? (
                <p style={{ margin: 0, color: '#dc2626' }}>{sunatBridgeDebugState.error}</p>
              ) : sunatBridgeDebugState.attempts.length > 0 ? (
                <>
                  <div style={{ marginBottom: '0.8rem', color: '#334155', fontSize: '0.85rem' }}>
                    Se encontraron {sunatBridgeDebugState.attempts.length} intento(s) para este comprobante.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 0.95fr) 1.4fr', gap: '0.75rem' }}>
                    <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                        Intentos del puente
                      </header>
                      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        {sunatBridgeDebugState.attempts.map((attempt) => {
                          const isSelected = sunatBridgeDebugState.selectedLogId === attempt.id;
                          return (
                            <button
                              key={attempt.id}
                              type="button"
                              onClick={() => {
                                const hasDetail = Object.prototype.hasOwnProperty.call(sunatBridgeDebugState.attemptDetails, attempt.id);
                                if (!hasDetail) {
                                  void loadSunatAuditAttemptDetail(sunatBridgeDebugState.guideId, attempt.id);
                                  return;
                                }

                                setSunatBridgeDebugState((prev) => {
                                  if (!prev) {
                                    return prev;
                                  }

                                  return {
                                    ...prev,
                                    selectedLogId: attempt.id,
                                  };
                                });
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                border: 'none',
                                borderBottom: '1px solid #e2e8f0',
                                background: isSelected ? '#ecfeff' : '#fff',
                                padding: '10px',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                                <strong style={{ color: '#0f172a', fontSize: '0.8rem' }}>Intento #{attempt.attempt_number}</strong>
                                <span style={{ fontSize: '0.72rem', color: '#334155' }}>{sunatStatusLabel(attempt.status)}</span>
                              </div>
                              <div style={{ marginTop: '0.25rem', color: '#64748b', fontSize: '0.74rem' }}>
                                {attempt.sent_at ? fmtDateTimeFullLima(attempt.sent_at) : 'Sin fecha'}
                              </div>
                              <div style={{ marginTop: '0.22rem', color: '#475569', fontSize: '0.72rem' }}>
                                {attempt.http_code ? `HTTP ${attempt.http_code}` : 'Sin HTTP'}
                                {attempt.response_time_ms !== null && attempt.response_time_ms !== undefined ? ` · ${Number(attempt.response_time_ms).toFixed(2)} ms` : ''}
                                {attempt.is_retry ? ' · Reintento' : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                      <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                        Detalle por intento
                      </header>
                      <div style={{ padding: '10px' }}>
                        {sunatBridgeDebugState.selectedLogId === null ? (
                          <p style={{ margin: 0, color: '#64748b' }}>Selecciona un intento para ver payload y respuesta.</p>
                        ) : sunatBridgeDebugState.loadingDetailLogId === sunatBridgeDebugState.selectedLogId ? (
                          <p style={{ margin: 0, color: '#64748b' }}>Cargando detalle del intento...</p>
                        ) : !sunatBridgeDebugState.attemptDetails[sunatBridgeDebugState.selectedLogId] ? (
                          <p style={{ margin: 0, color: '#b91c1c' }}>No se pudo cargar el detalle de este intento.</p>
                        ) : (
                          (() => {
                            const detail = sunatBridgeDebugState.attemptDetails[sunatBridgeDebugState.selectedLogId!] as TaxBridgeAuditAttemptDetail;
                            return (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem', marginBottom: '0.9rem' }}>
                                  <article><strong>Modo</strong><div>{detail.bridge.mode || '-'}</div></article>
                                  <article><strong>Estado SUNAT</strong><div>{sunatStatusLabel(detail.sunat.status || '')}</div></article>
                                  <article><strong>HTTP bridge</strong><div>{detail.response.status_code ? `HTTP ${detail.response.status_code}` : '-'}</div></article>
                                  <article><strong>Ticket</strong><div>{detail.sunat.ticket || '-'}</div></article>
                                  <article><strong>Código SUNAT</strong><div>{detail.sunat.code || '-'}</div></article>
                                  <article><strong>SHA1 payload</strong><div>{detail.request.sha1 || '-'}</div></article>
                                </div>

                                <div style={{ marginBottom: '0.8rem', color: '#334155', fontSize: '0.85rem' }}>
                                  <strong>Endpoint:</strong> {detail.bridge.method || 'POST'} {detail.bridge.endpoint || '-'}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                  <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                                    <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                                      Payload enviado
                                    </header>
                                    <pre style={{ margin: 0, padding: '10px', maxHeight: '36vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: 1.45 }}>
                                      {formatDebugJson(detail.request.payload)}
                                    </pre>
                                  </section>

                                  <section style={{ border: '1px solid #dbe4f0', borderRadius: '10px', overflow: 'hidden' }}>
                                    <header style={{ padding: '8px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#0f172a', fontSize: '0.83rem' }}>
                                      Respuesta del bridge
                                    </header>
                                    <pre style={{ margin: 0, padding: '10px', maxHeight: '36vh', overflow: 'auto', background: '#0b1220', color: '#e2e8f0', fontSize: '0.75rem', lineHeight: 1.45 }}>
                                      {formatDebugJson(detail.response.body)}
                                    </pre>
                                  </section>
                                </div>

                                {(detail.error?.message || detail.sunat.message) && (
                                  <p style={{ margin: '10px 0 0', color: '#b91c1c', fontWeight: 600 }}>
                                    Detalle: {detail.error?.message || detail.sunat.message}
                                  </p>
                                )}
                              </>
                            );
                          })()
                        )}
                      </div>
                    </section>
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: '#64748b' }}>No existe histórico de intentos para este comprobante.</p>
              )}
            </div>
          </div>
        </>
      )}

      {printPreview && (
        <HtmlPreviewDialog
          title={printPreview.title}
          subtitle={printPreview.subtitle}
          html={printPreview.html}
          variant={printPreview.variant}
          onClose={() => setPrintPreview(null)}
        />
      )}
    </div>
  );
}
