import { useEffect, useMemo, useState } from 'react';
import { HtmlPreviewDialog } from '../../../shared/components/HtmlPreviewDialog';
import {
  cancelGreGuide,
  createGreGuide,
  fetchGreGuideDetail,
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
} from '../api/gre';

type Props = {
  accessToken: string;
  branchId: number | null;
};

type Mode = 'create' | 'edit';

const EMPTY_PAYLOAD: GreGuidePayload = {
  guide_type: 'REMITENTE',
  series: 'T001',
  issue_date: new Date().toISOString().slice(0, 10),
  transfer_date: new Date().toISOString().slice(0, 10),
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

export function GreGuidesView({ accessToken, branchId }: Props) {
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
  const [actionMessage, setActionMessage] = useState('');
  const [lookups, setLookups] = useState<GreLookups>(DEFAULT_LOOKUPS);

  const [sunatToast, setSunatToast] = useState<{ tone: 'ok' | 'warn' | 'bad'; title: string; detail: string } | null>(null);
  const [bridgeDebugGuide, setBridgeDebugGuide] = useState<GreGuide | null>(null);
  const [rowActionLoading, setRowActionLoading] = useState<number | null>(null);
  const [autoSend, setAutoSend] = useState(false);
  const [printPreview, setPrintPreview] = useState<{ title: string; subtitle: string; html: string; variant: 'compact' | 'wide' } | null>(null);

  const [prefillReference, setPrefillReference] = useState('');
  const [ubigeoSearchPartida, setUbigeoSearchPartida] = useState('');
  const [ubigeoSearchLlegada, setUbigeoSearchLlegada] = useState('');
  const [ubigeoResultsPartida, setUbigeoResultsPartida] = useState<GreUbigeoOption[]>([]);
  const [ubigeoResultsLlegada, setUbigeoResultsLlegada] = useState<GreUbigeoOption[]>([]);

  const canEdit = useMemo(() => {
    if (!detail) return true;
    return ['DRAFT', 'ERROR', 'REJECTED'].includes(detail.status);
  }, [detail]);

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

  const emittedRows = useMemo(() => {
    if (status) {
      return rows;
    }

    const nonDraft = rows.filter((row) => row.status !== 'DRAFT');
    return nonDraft.length > 0 ? nonDraft : rows;
  }, [rows, status]);

  const taxBridgeRuntime = useMemo(() => {
    return (lookups.runtime_features ?? []).find((row) => row.feature_code === 'SALES_TAX_BRIDGE') ?? null;
  }, [lookups.runtime_features]);

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
    fetchGreLookups(accessToken)
      .then((res) => {
        setLookups({
          guide_types: res.guide_types.length > 0 ? res.guide_types : DEFAULT_LOOKUPS.guide_types,
          transfer_reasons: res.transfer_reasons.length > 0 ? res.transfer_reasons : DEFAULT_LOOKUPS.transfer_reasons,
          transport_modes: res.transport_modes.length > 0 ? res.transport_modes : DEFAULT_LOOKUPS.transport_modes,
          document_types: res.document_types.length > 0 ? res.document_types : DEFAULT_LOOKUPS.document_types,
          series: res.series.length > 0 ? res.series : DEFAULT_LOOKUPS.series,
        });
        const firstSeries = res.series[0]?.series;
        setPayload((prev) => ({ ...prev, series: firstSeries ?? prev.series }));
      })
      .catch(() => {
        setLookups(DEFAULT_LOOKUPS);
      });
  };

  useEffect(() => {
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

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
        setMode('edit');
        setPayload(toPayload(res.data));
        loadList();
        if (autoSend) {
          doSendById(id);
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

  const sendGuide = () => {
    if (!selectedId) return;

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

    doSendById(selectedId);
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

  const openBridgeDebug = (row: GreGuide & { item_count?: number }) => {
    fetchGreGuideDetail(accessToken, row.id)
      .then(setBridgeDebugGuide)
      .catch(() => setBridgeDebugGuide(row as GreGuide));
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

  const checkTicketStatus = () => {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    setActionMessage('');
    queryGreTicketStatus(accessToken, selectedId)
      .then((res) => {
        console.info('GRE ticket status response (editor)', res);
        const detailText = [res.sunat_ticket, res.sunat_cdr_code, res.sunat_cdr_desc].filter(Boolean).join(' | ');
        setActionMessage(`${res.label}${detailText ? ` | ${detailText}` : ''}`);
        loadList();
        return fetchGreGuideDetail(accessToken, selectedId).then(setDetail);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const cancelGuide = () => {
    if (!selectedId) return;
    const reason = window.prompt('Motivo de anulacion');
    if (!reason || reason.trim() === '') return;

    setSaving(true);
    setError('');
    setActionMessage('');
    cancelGreGuide(accessToken, selectedId, reason.trim())
      .then((res) => {
        setActionMessage(res.message);
        setDetail(res.data);
        loadList();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="ds-root gre-root">
      <div className="gre-tabs">
        <button className={`gre-tab-btn ${activeTab === 'editor' ? 'is-active' : ''}`} type="button" onClick={() => setActiveTab('editor')}>
          Nueva Guia
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
              <button className="ds-btn-secondary" type="button" onClick={loadList}>Recargar</button>
              <button className="ds-btn-primary" type="button" onClick={onCreateNew}>+ Nueva guia</button>
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
              <option value="">Emitidas (SENT + ACCEPTED)</option>
              <option value="SENT">Enviadas</option>
              <option value="ACCEPTED">Aceptadas</option>
              <option value="REJECTED">Rechazadas</option>
              <option value="ERROR">Con error</option>
              <option value="CANCELLED">Anuladas</option>
            </select>
            <button className="ds-btn-secondary" type="button" onClick={() => { setPage(1); loadList(); }}>Buscar</button>
          </div>

          <div className="gre-filter-chips">
            <button className={`gre-chip ${status === '' ? 'is-active' : ''}`} type="button" onClick={() => { setStatus(''); setPage(1); }}>Emitidas</button>
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
                  const isLocked = !canSend && !canTicket;
                  return (
                    <tr key={`emitted-${row.id}`}>
                      <td>{row.identifier}</td>
                      <td>{row.issue_date}</td>
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
                            onClick={() => { setSelectedId(row.id); setMode('edit'); setActiveTab('editor'); }}
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}>{row.sunat_ticket ?? '-'}</code>
                      </td>
                      <td>
                        <details className={`gre-sunat-dropdown ${isLocked ? 'is-locked' : ''}`}>
                          <summary className={`sales-sunat-badge ${sunatBadgeClass}`}>{sunatLabel}</summary>
                          <div className="sales-sunat-dropdown-menu">
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
                            {canSend && (
                              <>
                                <p className="sunat-menu-section-label">Envio</p>
                                <button
                                  type="button"
                                  className="sunat-menu-btn"
                                  disabled={rowActionLoading === row.id}
                                  onClick={() => handleRowSend(row)}
                                >
                                  <span className="sunat-menu-btn__icon">🚀</span>
                                  <span className="sunat-menu-btn__text">{rowActionLoading === row.id ? 'Enviando...' : 'Enviar a SUNAT'}</span>
                                </button>
                              </>
                            )}
                            {canTicket && (
                              <>
                                <p className="sunat-menu-section-label">Consulta</p>
                                <button
                                  type="button"
                                  className="sunat-menu-btn"
                                  disabled={rowActionLoading === row.id}
                                  onClick={() => handleRowTicket(row)}
                                >
                                  <span className="sunat-menu-btn__icon">🔍</span>
                                  <span className="sunat-menu-btn__text">{rowActionLoading === row.id ? 'Consultando...' : 'Consultar Ticket'}</span>
                                </button>
                              </>
                            )}
                            {(canSend || canTicket) && <div className="sunat-menu-divider" />}
                            <button
                              type="button"
                              className="sunat-menu-btn"
                              onClick={() => openBridgeDebug(row)}
                            >
                              <span className="sunat-menu-btn__icon">🔎</span>
                              <span className="sunat-menu-btn__text">Ver puente / raw</span>
                            </button>
                          </div>
                        </details>
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
            <button className="ds-btn-secondary" type="button" disabled={!selectedId || !canEdit || saving} onClick={onEditSelected}>Cargar en editor</button>
            <button className="ds-btn-secondary" type="button" disabled={!selectedId || saving} onClick={sendGuide}>Enviar SUNAT</button>
            <button className="ds-btn-secondary" type="button" disabled={!selectedId || saving} onClick={checkTicketStatus}>Consultar ticket</button>
            <button className="ds-btn-secondary" type="button" disabled={!selectedId || saving} onClick={cancelGuide}>Anular</button>
            {selectedId && (
              <>
                <button className="ds-btn-secondary" type="button" onClick={() => openPrintPreview(selectedId, 'ticket', detail?.identifier ?? String(selectedId))}>🖨️ Ticket</button>
                <button className="ds-btn-secondary" type="button" onClick={() => openPrintPreview(selectedId, 'a4', detail?.identifier ?? String(selectedId))}>📄 A4</button>
              </>
            )}
            <label className="gre-autosend-check">
              <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
              Auto-enviar al guardar
            </label>
          </div>

          {detail && (
            <div className="gre-status-box">
              <strong>Seguimiento SUNAT</strong>
              <p><b>Ticket:</b> {detail.sunat_ticket ?? '—'}</p>
              <p><b>CDR:</b> {detail.sunat_cdr_code ?? '—'} {detail.sunat_cdr_desc ? `| ${detail.sunat_cdr_desc}` : ''}</p>
            </div>
          )}
        </section>
      )}

      {bridgeDebugGuide && (
        <div className="gre-bridge-debug">
          <div className="gre-bridge-debug-head">
            <strong>Detalles SUNAT — {bridgeDebugGuide.identifier}</strong>
            <button type="button" className="gre-bridge-debug-close" onClick={() => setBridgeDebugGuide(null)} aria-label="Cerrar">✕ Cerrar</button>
          </div>
          <div className="gre-bridge-debug-body">
            <div className="gre-bridge-debug-grid">
              <div>
                <p className="gre-bridge-debug-label">Estado interno</p>
                <span className={`gre-status-badge gre-status-badge--${bridgeDebugGuide.status.toLowerCase()}`}>{STATUS_LABEL[bridgeDebugGuide.status]}</span>
              </div>
              <div>
                <p className="gre-bridge-debug-label">Estado SUNAT</p>
                <span>{bridgeDebugGuide.sunat_status ?? 'SIN_ENVIO'}</span>
              </div>
              <div>
                <p className="gre-bridge-debug-label">Método puente</p>
                <code>{bridgeDebugGuide.bridge_method ?? '—'}</code>
              </div>
              <div>
                <p className="gre-bridge-debug-label">HTTP</p>
                <span>{bridgeDebugGuide.bridge_http_code ?? '—'}</span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="gre-bridge-debug-label">Endpoint</p>
                <code className="gre-bridge-debug-endpoint">{normalizeGreBridgeEndpoint(bridgeDebugGuide.bridge_endpoint)}</code>
              </div>
              {bridgeDebugGuide.sunat_ticket && (
                <div>
                  <p className="gre-bridge-debug-label">Ticket SUNAT</p>
                  <code>{bridgeDebugGuide.sunat_ticket}</code>
                </div>
              )}
              {bridgeDebugGuide.sunat_cdr_code && (
                <div>
                  <p className="gre-bridge-debug-label">CDR / Descripción</p>
                  <span>{bridgeDebugGuide.sunat_cdr_code} {bridgeDebugGuide.sunat_cdr_desc ?? ''}</span>
                </div>
              )}
            </div>
            <details className="gre-bridge-debug-details">
              <summary>{isGreStatusBridgeMethod(bridgeDebugGuide.bridge_method)
                ? 'Payload GRE status-ticket (empresa, cabecera.ticket)'
                : 'Payload GRE oficial (empresa, cabecera, detalle)'}</summary>
              <pre className="gre-bridge-debug-pre">{JSON.stringify(buildBridgePayloadPreview(bridgeDebugGuide, lookups), null, 2)}</pre>
            </details>
            <details open={!!bridgeDebugGuide.raw_response} className="gre-bridge-debug-details">
              <summary>Respuesta del puente (ticket actual + raw_response)</summary>
              <pre className="gre-bridge-debug-pre">{JSON.stringify(buildBridgeResponseView(bridgeDebugGuide), null, 2)}</pre>
            </details>
          </div>
        </div>
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
