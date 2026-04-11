import { apiClient } from '../../../shared/api/client';

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export type GreGuideStatus =
  | 'DRAFT'
  | 'SENDING'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'ERROR'
  | 'CANCELLED';

export type GreParty = {
  doc_type?: string;
  doc_number?: string;
  name?: string;
  address?: string;
};

export type GreItem = {
  code?: string;
  description: string;
  qty: number;
  unit?: string;
};

export type GreGuide = {
  id: number;
  company_id: number;
  branch_id: number | null;
  guide_type: 'REMITENTE' | 'TRANSPORTISTA';
  issue_date: string;
  transfer_date: string | null;
  series: string;
  number: number;
  identifier: string;
  status: GreGuideStatus;
  notes: string | null;
  motivo_traslado: string;
  transport_mode_code: string;
  weight_kg: number;
  packages_count: number;
  partida_ubigeo: string | null;
  punto_partida: string;
  llegada_ubigeo: string | null;
  punto_llegada: string;
  related_document_id: number | null;
  destinatario: GreParty | null;
  transporter: GreParty | null;
  vehicle: Record<string, unknown> | null;
  driver: Record<string, unknown> | null;
  items: GreItem[];
  bridge_method: string | null;
  bridge_endpoint: string | null;
  bridge_http_code: number | null;
  sunat_ticket: string | null;
  sunat_cdr_code: string | null;
  sunat_cdr_desc: string | null;
  sunat_status?: 'ACEPTADO' | 'RECHAZADO' | 'PENDIENTE_TICKET' | 'SIN_ENVIO' | null;
  raw_response: Record<string, unknown> | null;
  sent_at: string | null;
  cancelled_at: string | null;
  cancelled_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type PaginatedGreGuides = {
  data: Array<GreGuide & { item_count?: number }>;
  meta: { page: number; per_page: number; total: number; last_page: number };
};

export type GreGuidePayload = {
  branch_id?: number | null;
  guide_type: 'REMITENTE' | 'TRANSPORTISTA';
  series: string;
  issue_date: string;
  transfer_date?: string | null;
  motivo_traslado: string;
  transport_mode_code: string;
  weight_kg: number;
  packages_count: number;
  partida_ubigeo?: string | null;
  punto_partida: string;
  llegada_ubigeo?: string | null;
  punto_llegada: string;
  related_document_id?: number | null;
  notes?: string;
  destinatario: GreParty;
  transporter?: GreParty;
  vehicle?: Record<string, unknown>;
  driver?: Record<string, unknown>;
  items: GreItem[];
};

export type GreLookupOption = {
  code: string;
  name: string;
  sunat_code?: string;
};

export type GreUbigeoOption = {
  ubigeo: string;
  label: string;
  department?: string;
  province?: string;
  district?: string;
};

export type GreLookups = {
  guide_types: GreLookupOption[];
  transfer_reasons: GreLookupOption[];
  transport_modes: GreLookupOption[];
  document_types: GreLookupOption[];
  series: Array<{ id: number; series: string; name: string }>;
  runtime_features?: Array<{
    feature_code: string;
    is_enabled: boolean;
    vertical_source?: 'COMPANY_VERTICAL_OVERRIDE' | 'VERTICAL_TEMPLATE' | null;
  }>;
};

export type GrePrefillResponse = {
  related_document: {
    id: number;
    document_kind: string;
    series: string;
    number: number;
    issue_at: string;
  };
  draft: Partial<GreGuidePayload>;
};

export async function fetchGreGuides(
  accessToken: string,
  params?: {
    status?: GreGuideStatus;
    issue_date?: string;
    search?: string;
    page?: number;
    per_page?: number;
  }
): Promise<PaginatedGreGuides> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.issue_date) q.set('issue_date', params.issue_date);
  if (params?.search && params.search.trim() !== '') q.set('search', params.search.trim());
  if (params?.page) q.set('page', String(params.page));
  if (params?.per_page) q.set('per_page', String(params.per_page));

  const suffix = q.toString();
  return apiClient.request<PaginatedGreGuides>(`/api/sales/gre-guides${suffix ? `?${suffix}` : ''}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchGreGuideDetail(accessToken: string, id: number): Promise<GreGuide> {
  return apiClient.request<GreGuide>(`/api/sales/gre-guides/${id}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchGreLookups(accessToken: string): Promise<GreLookups> {
  return apiClient.request<GreLookups>('/api/sales/gre/lookups', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function searchGreUbigeos(accessToken: string, q: string, limit = 30): Promise<GreUbigeoOption[]> {
  const query = new URLSearchParams();
  query.set('q', q);
  query.set('limit', String(limit));

  const response = await apiClient.request<{ data: GreUbigeoOption[] }>(`/api/sales/gre/ubigeos?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function prefillGreFromDocument(
  accessToken: string,
  input: { documentId?: number; series?: string; number?: number; documentKind?: 'INVOICE' | 'RECEIPT' }
): Promise<GrePrefillResponse> {
  const query = new URLSearchParams();

  if (input.documentId && input.documentId > 0) {
    query.set('document_id', String(input.documentId));
  }
  if (input.series && input.series.trim() !== '') {
    query.set('series', input.series.trim().toUpperCase());
  }
  if (input.number && input.number > 0) {
    query.set('number', String(input.number));
  }
  if (input.documentKind) {
    query.set('document_kind', input.documentKind);
  }

  return apiClient.request<GrePrefillResponse>(`/api/sales/gre/prefill-document?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createGreGuide(accessToken: string, payload: GreGuidePayload): Promise<{ message: string; data: GreGuide }> {
  return apiClient.request<{ message: string; data: GreGuide }>('/api/sales/gre-guides', {
    method: 'POST',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateGreGuide(accessToken: string, id: number, payload: Partial<GreGuidePayload>): Promise<{ message: string; data: GreGuide }> {
  return apiClient.request<{ message: string; data: GreGuide }>(`/api/sales/gre-guides/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function sendGreGuide(accessToken: string, id: number): Promise<{
  message: string;
  guide_id: number;
  status: GreGuideStatus;
  label: string;
  bridge_http_code: number | null;
  sunat_ticket: string | null;
  sunat_cdr_code: string | null;
  sunat_cdr_desc: string | null;
  response?: Record<string, unknown>;
  debug?: Record<string, unknown>;
}> {
  return apiClient.request(`/api/sales/gre-guides/${id}/send`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
  });
}

export async function queryGreTicketStatus(accessToken: string, id: number): Promise<{
  message: string;
  guide_id: number;
  status: GreGuideStatus;
  label: string;
  bridge_http_code: number | null;
  sunat_ticket: string | null;
  sunat_cdr_code: string | null;
  sunat_cdr_desc: string | null;
  response?: Record<string, unknown>;
  debug?: Record<string, unknown>;
}> {
  return apiClient.request(`/api/sales/gre-guides/${id}/status-ticket`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
  });
}

export async function cancelGreGuide(accessToken: string, id: number, reason: string): Promise<{ message: string; data: GreGuide }> {
  return apiClient.request<{ message: string; data: GreGuide }>(`/api/sales/gre-guides/${id}/cancel`, {
    method: 'PUT',
    headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export function buildGrePrintUrl(id: number, format: 'ticket' | 'a4' = 'a4'): string {
  return `${apiClient.baseUrl}/api/sales/gre-guides/${id}/print?format=${format}`;
}

export async function fetchGrePrintHtml(
  accessToken: string,
  id: number,
  format: 'ticket' | 'a4' = 'a4'
): Promise<string> {
  const res = await fetch(`${apiClient.baseUrl}/api/sales/gre-guides/${id}/print?format=${format}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Error al obtener vista previa (HTTP ${res.status})`);
  return res.text();
}
