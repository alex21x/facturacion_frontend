import { apiClient } from '../../shared/api/client';
import type { CompanyProfile } from '../company/types';
import type { SalesLookups } from '../sales/types';
import type {
  CashMovement,
  CashSession,
  CloseSessionPayload,
  CreateMovementPayload,
  OpenSessionPayload,
  PaginatedCashSessions,
  SessionDetailResponse,
  UpdateMovementPayload,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function normalizeLocalLoopbackHost(rawUrl: string): string {
  if (typeof window === 'undefined') {
    return rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isLoopback = host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost';
    if (!isLoopback) {
      return rawUrl;
    }

    const currentHost = window.location.hostname.toLowerCase();
    const replacementHost = currentHost === '0.0.0.0' ? 'localhost' : currentHost;
    if (!replacementHost) {
      return rawUrl;
    }

    parsed.hostname = replacementHost;
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function toAbsoluteAssetUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
    return raw.startsWith('data:') ? raw : normalizeLocalLoopbackHost(raw);
  }

  const base = normalizeLocalLoopbackHost(apiClient.baseUrl.replace(/\/+$/, ''));
  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }

  return `${base}/${raw}`;
}

export async function fetchCashSessions(
  accessToken: string,
  params?: {
    cashRegisterId?: number | null;
    status?: string;
    limit?: number;
    page?: number;
    perPage?: number;
  }
): Promise<PaginatedCashSessions> {
  const query = new URLSearchParams();
  if (params?.cashRegisterId) query.set('cash_register_id', String(params.cashRegisterId));
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.page) query.set('page', String(params.page));
  if (params?.perPage) query.set('per_page', String(params.perPage));

  const path = `/api/cash/sessions${query.toString() ? '?' + query.toString() : ''}`;
  return apiClient.request<PaginatedCashSessions>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCurrentSession(
  accessToken: string,
  cashRegisterId?: number | null
): Promise<CashSession | null> {
  const query = new URLSearchParams();
  if (cashRegisterId) query.set('cash_register_id', String(cashRegisterId));

  const path = `/api/cash/sessions/current${query.toString() ? '?' + query.toString() : ''}`;
  const res = await apiClient.request<{ session: CashSession | null }>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
  return res.session;
}

export async function fetchCashMovements(
  accessToken: string,
  params?: { sessionId?: number | null; cashRegisterId?: number | null; limit?: number }
): Promise<CashMovement[]> {
  const query = new URLSearchParams();
  if (params?.sessionId) query.set('session_id', String(params.sessionId));
  if (params?.cashRegisterId) query.set('cash_register_id', String(params.cashRegisterId));
  if (params?.limit) query.set('limit', String(params.limit));

  const path = `/api/cash/movements${query.toString() ? '?' + query.toString() : ''}`;
  const res = await apiClient.request<{ data: CashMovement[] }>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
  return res.data;
}

export async function openCashSession(
  accessToken: string,
  payload: OpenSessionPayload
): Promise<{ message: string; session: CashSession }> {
  return apiClient.request('/api/cash/sessions', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function closeCashSession(
  accessToken: string,
  sessionId: number,
  payload: CloseSessionPayload
): Promise<{ message: string; session: CashSession; summary: Record<string, number> }> {
  return apiClient.request(`/api/cash/sessions/${sessionId}/close`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function createCashMovement(
  accessToken: string,
  payload: CreateMovementPayload
): Promise<{ message: string; movement: CashMovement }> {
  return apiClient.request('/api/cash/movements', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCashMovement(
  accessToken: string,
  movementId: number,
  payload: UpdateMovementPayload
): Promise<{ message: string; movement: CashMovement }> {
  return apiClient.request(`/api/cash/movements/${movementId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchSessionDetail(
  accessToken: string,
  sessionId: number
): Promise<SessionDetailResponse> {
  return apiClient.request(`/api/cash/sessions/${sessionId}/detail`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCashCompanyProfile(accessToken: string): Promise<CompanyProfile> {
  try {
    const profile = await apiClient.request<CompanyProfile>('/api/appcfg/company-profile', {
      method: 'GET',
      headers: authHeaders(accessToken),
    });

    return {
      ...profile,
      logo_url: toAbsoluteAssetUrl(profile.logo_data_uri ?? profile.logo_url),
    };
  } catch {
    const lookups = await apiClient.request<SalesLookups>('/api/sales/lookups', {
      method: 'GET',
      headers: authHeaders(accessToken),
    });

    const company = lookups.company_profile;
    if (!company) {
      throw new Error('No se pudo obtener el perfil de empresa para el reporte de caja.');
    }

    return {
      company_id: 0,
      tax_id: company.tax_id ?? null,
      legal_name: company.legal_name ?? '',
      trade_name: company.trade_name ?? null,
      status: 1,
      address: company.address ?? null,
      phone: company.phone ?? null,
      email: company.email ?? null,
      website: null,
      logo_url: toAbsoluteAssetUrl(company.logo_url),
      has_cert: false,
      bank_accounts: [],
      show_payment_brand_icons: true,
    };
  }
}

export async function fetchCashSalesFeatureFlags(
  accessToken: string,
): Promise<{ workshopMultiVehicleEnabled: boolean }> {
  const lookups = await apiClient.request<{
    commerce_features?: Array<{ feature_code?: string | null; is_enabled?: boolean | null }>;
  }>('/api/sales/lookups', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  const workshopMultiVehicleEnabled = Boolean(
    (lookups.commerce_features ?? []).find((row) => row.feature_code === 'SALES_WORKSHOP_MULTI_VEHICLE')?.is_enabled,
  );

  return {
    workshopMultiVehicleEnabled,
  };
}
