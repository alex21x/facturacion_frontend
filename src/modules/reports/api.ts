import { apiClient } from '../../shared/api/client';
import type {
  ReportsCatalogResponse,
  ReportRequestCreateResponse,
  ReportRequestDetail,
  ReportRequestListResponse,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchReportsCatalog(accessToken: string): Promise<ReportsCatalogResponse> {
  return apiClient.request<ReportsCatalogResponse>('/api/reports/catalog', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchReportRequests(
  accessToken: string,
  params?: {
    status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    reportCode?: string;
    page?: number;
    perPage?: number;
  }
): Promise<ReportRequestListResponse> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set('status', params.status);
  }
  if (params?.reportCode) {
    query.set('report_code', params.reportCode);
  }
  if (params?.page && params.page > 0) {
    query.set('page', String(params.page));
  }
  if (params?.perPage && params.perPage > 0) {
    query.set('per_page', String(params.perPage));
  }

  const path = query.toString() ? `/api/reports/requests?${query.toString()}` : '/api/reports/requests';

  return apiClient.request<ReportRequestListResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createReportRequest(
  accessToken: string,
  payload: {
    reportCode: string;
    branchId?: number | null;
    filters?: Record<string, unknown>;
  }
): Promise<ReportRequestCreateResponse> {
  return apiClient.request<ReportRequestCreateResponse>('/api/reports/requests', {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      report_code: payload.reportCode,
      branch_id: payload.branchId ?? undefined,
      filters: payload.filters ?? {},
    }),
  });
}

export async function fetchReportRequestDetail(accessToken: string, requestId: number): Promise<ReportRequestDetail> {
  return apiClient.request<ReportRequestDetail>(`/api/reports/requests/${requestId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}
