import { apiClient } from '../../../shared/api/client';

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

// ── Types ──────────────────────────────────────────────────────────────────

export type DailySummaryType = 1 | 3; // 1=RC declaration, 3=RA cancellation

export type DailySummaryStatus =
  | 'DRAFT'
  | 'SENDING'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'ERROR';

export type DailySummaryListItem = {
  id: number;
  summary_type: DailySummaryType;
  summary_date: string;
  correlation_number: number;
  identifier: string;
  status: DailySummaryStatus;
  sunat_ticket: string | null;
  sunat_cdr_code: string | null;
  sunat_cdr_desc: string | null;
  notes: string | null;
  item_count: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DailySummaryItem = {
  item_id: number;
  document_id: number;
  item_status: 1 | 3;
  document_kind: string;
  series: string;
  number: number;
  issue_at: string;
  doc_status: string;
  total: string;
  sunat_status: string | null;
  sunat_void_status: string | null;
  customer_name: string;
};

export type DailySummaryDetail = DailySummaryListItem & {
  company_id: number;
  branch_id: number | null;
  bridge_endpoint: string | null;
  bridge_http_code: number | null;
  sunat_error_code: string | null;
  sunat_error_message: string | null;
  request_debug: Record<string, unknown> | null;
  raw_response: Record<string, unknown> | null;
  items: DailySummaryItem[];
};

export type DailySummaryEligibleDoc = {
  id: number;
  series: string;
  number: number;
  issue_at: string;
  status: string;
  total: string;
  sunat_status: string | null;
  customer_name: string;
};

export type PaginatedDailySummaries = {
  data: DailySummaryListItem[];
  meta: { page: number; per_page: number; total: number; last_page: number };
};

export type DailySummarySendResult = {
  message: string;
  summary_id: number;
  status: DailySummaryStatus;
  label: string;
  bridge_http_code: number | null;
  sunat_ticket: string | null;
  sunat_cdr_code: string | null;
  sunat_cdr_desc: string | null;
  sunat_error_code: string | null;
  sunat_error_message: string | null;
  response: Record<string, unknown> | null;
  debug: Record<string, unknown> | null;
};

export type DailySummaryAuditAttempt = {
  id: number;
  document: string;
  document_kind: string;
  tributary_type: string;
  status: string;
  http_code: number | null;
  response_time_ms: number | null;
  attempt_number: number;
  is_retry: boolean;
  error_kind: string | null;
  message: string | null;
  sent_at: string | null;
  initiated_by: string | null;
};

export type DailySummaryAuditAttemptDetail = {
  id: number;
  document: {
    id: number | null;
    kind: string | null;
    series: string | null;
    number: string | null;
    full_number: string | null;
  };
  tributary_type: string;
  attempt: {
    number: number;
    is_retry: boolean;
    is_manual: boolean;
  };
  bridge: {
    mode: string | null;
    endpoint: string | null;
    method: string | null;
    content_type: string | null;
  };
  request: {
    size_bytes: number | null;
    sha1: string | null;
    payload: unknown;
  };
  response: {
    status_code: number | null;
    size_bytes: number | null;
    time_ms: number | null;
    body: unknown;
  };
  sunat: {
    status: string | null;
    code: string | null;
    message: string | null;
    ticket: string | null;
    cdr_code: string | null;
  };
  error: {
    kind: string;
    message: string | null;
  } | null;
  audit: {
    initiated_by_user_id: number | null;
    initiated_by_username: string | null;
    sent_at: string | null;
    received_at: string | null;
  };
};

// ── API functions ──────────────────────────────────────────────────────────

export async function fetchDailySummaries(
  accessToken: string,
  params: {
    summary_type: DailySummaryType;
    date?: string;
    status?: DailySummaryStatus;
    page?: number;
    per_page?: number;
    company_id?: number;
  }
): Promise<PaginatedDailySummaries> {
  const q = new URLSearchParams();
  q.set('summary_type', String(params.summary_type));
  if (params.date) q.set('date', params.date);
  if (params.status) q.set('status', params.status);
  if (params.page) q.set('page', String(params.page));
  if (params.per_page) q.set('per_page', String(params.per_page));
  if (params.company_id) q.set('company_id', String(params.company_id));

  return apiClient.request<PaginatedDailySummaries>(
    `/api/sales/daily-summaries?${q.toString()}`,
    { method: 'GET', headers: authHeaders(accessToken) }
  );
}

export async function fetchDailySummaryDetail(
  accessToken: string,
  id: number,
  companyId?: number
): Promise<DailySummaryDetail> {
  const q = companyId ? `?company_id=${companyId}` : '';
  return apiClient.request<DailySummaryDetail>(
    `/api/sales/daily-summaries/${id}${q}`,
    { method: 'GET', headers: authHeaders(accessToken) }
  );
}

export async function fetchEligibleDocuments(
  accessToken: string,
  params: {
    summary_type: DailySummaryType;
    date: string;
    branch_id?: number | null;
    company_id?: number;
  }
): Promise<{ data: DailySummaryEligibleDoc[] }> {
  const q = new URLSearchParams();
  q.set('summary_type', String(params.summary_type));
  q.set('date', params.date);
  if (params.branch_id != null) q.set('branch_id', String(params.branch_id));
  if (params.company_id) q.set('company_id', String(params.company_id));

  return apiClient.request<{ data: DailySummaryEligibleDoc[] }>(
    `/api/sales/daily-summaries/eligible-documents?${q.toString()}`,
    { method: 'GET', headers: authHeaders(accessToken) }
  );
}

export async function createDailySummary(
  accessToken: string,
  payload: {
    summary_type: DailySummaryType;
    summary_date: string;
    document_ids: number[];
    branch_id?: number | null;
    notes?: string;
    company_id?: number;
  }
): Promise<{ message: string; data: DailySummaryDetail }> {
  return apiClient.request<{ message: string; data: DailySummaryDetail }>(
    '/api/sales/daily-summaries',
    {
      method: 'POST',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export async function sendDailySummary(
  accessToken: string,
  id: number,
  companyId?: number
): Promise<DailySummarySendResult> {
  const q = companyId ? `?company_id=${companyId}` : '';
  return apiClient.request<DailySummarySendResult>(
    `/api/sales/daily-summaries/${id}/send${q}`,
    { method: 'PUT', headers: authHeaders(accessToken) }
  );
}

export async function deleteDailySummary(
  accessToken: string,
  id: number,
  companyId?: number
): Promise<{ message: string }> {
  const q = companyId ? `?company_id=${companyId}` : '';
  return apiClient.request<{ message: string }>(
    `/api/sales/daily-summaries/${id}${q}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );
}

export async function removeDailySummaryDocument(
  accessToken: string,
  summaryId: number,
  documentId: number,
  companyId?: number
): Promise<{ message: string; deleted: boolean; summary_id: number; remaining_items: number }> {
  const q = companyId ? `?company_id=${companyId}` : '';
  return apiClient.request<{ message: string; deleted: boolean; summary_id: number; remaining_items: number }>(
    `/api/sales/daily-summaries/${summaryId}/documents/${documentId}${q}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );
}

export async function fetchDailySummaryAuditAttempts(
  accessToken: string,
  params: {
    summary_type: DailySummaryType;
    summary_date: string;
    identifier: string;
    branch_id?: number | null;
    company_id?: number;
    limit?: number;
  }
): Promise<{ count: number; logs: DailySummaryAuditAttempt[] }> {
  const q = new URLSearchParams();
  q.set('tributary_type', params.summary_type === 1 ? 'SUMMARY_RC' : 'SUMMARY_RA');
  q.set('document_series', params.summary_date);
  q.set('document_number', params.identifier);
  q.set('limit', String(params.limit ?? 30));
  if (params.branch_id != null) q.set('branch_id', String(params.branch_id));
  if (params.company_id) q.set('company_id', String(params.company_id));

  return apiClient.request<{ count: number; logs: DailySummaryAuditAttempt[] }>(
    `/api/tax-bridge/audit/branch?${q.toString()}`,
    { method: 'GET', headers: authHeaders(accessToken) }
  );
}

export async function fetchDailySummaryAuditAttemptDetail(
  accessToken: string,
  logId: number,
  companyId?: number
): Promise<DailySummaryAuditAttemptDetail> {
  const q = new URLSearchParams();
  if (companyId) q.set('company_id', String(companyId));

  return apiClient.request<DailySummaryAuditAttemptDetail>(
    q.toString() ? `/api/tax-bridge/audit/${logId}?${q.toString()}` : `/api/tax-bridge/audit/${logId}`,
    { method: 'GET', headers: authHeaders(accessToken) }
  );
}
