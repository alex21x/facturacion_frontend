import { apiClient } from '../../shared/api/client';
import type {
  CommerceSettingsResponse,
  FeatureToggleRow,
  IgvSettingsResponse,
  ModuleRow,
  OperationalContextResponse,
  OperationalLimitsResponse,
  UpdateCommerceSettingsPayload,
  UpdateOperationalLimitsPayload,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchModules(accessToken: string): Promise<ModuleRow[]> {
  const response = await apiClient.request<{ modules: ModuleRow[] }>('/api/appcfg/modules', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.modules;
}

export async function fetchFeatureToggles(accessToken: string): Promise<FeatureToggleRow[]> {
  const response = await apiClient.request<{ features: FeatureToggleRow[] }>('/api/appcfg/feature-toggles', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.features;
}

export async function fetchOperationalContext(
  accessToken: string,
  params?: { branchId?: number | null; warehouseId?: number | null; cashRegisterId?: number | null }
): Promise<OperationalContextResponse> {
  const query = new URLSearchParams();

  if (params?.branchId) {
    query.set('branch_id', String(params.branchId));
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }
  if (params?.cashRegisterId) {
    query.set('cash_register_id', String(params.cashRegisterId));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/appcfg/operational-context?${suffix}` : '/api/appcfg/operational-context';

  return apiClient.request<OperationalContextResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchOperationalLimits(accessToken: string): Promise<OperationalLimitsResponse> {
  return apiClient.request<OperationalLimitsResponse>('/api/appcfg/operational-limits', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateOperationalLimits(
  accessToken: string,
  payload: UpdateOperationalLimitsPayload
): Promise<OperationalLimitsResponse> {
  return apiClient.request<OperationalLimitsResponse>('/api/appcfg/operational-limits', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchCommerceSettings(
  accessToken: string,
  branchId?: number | null
): Promise<CommerceSettingsResponse> {
  const query = new URLSearchParams();
  if (branchId) {
    query.set('branch_id', String(branchId));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/appcfg/commerce-settings?${suffix}` : '/api/appcfg/commerce-settings';

  return apiClient.request<CommerceSettingsResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCommerceSettings(
  accessToken: string,
  payload: UpdateCommerceSettingsPayload,
  branchId?: number | null
): Promise<CommerceSettingsResponse> {
  const body = {
    ...payload,
    ...(branchId ? { branch_id: branchId } : {}),
  };

  return apiClient.request<CommerceSettingsResponse>('/api/appcfg/commerce-settings', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export async function fetchIgvSettings(accessToken: string): Promise<IgvSettingsResponse> {
  return apiClient.request<IgvSettingsResponse>('/api/appcfg/igv-settings', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateIgvSettings(accessToken: string, activeIgvRatePercent: number): Promise<IgvSettingsResponse> {
  return apiClient.request<IgvSettingsResponse>('/api/appcfg/igv-settings', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ active_igv_rate_percent: activeIgvRatePercent }),
  });
}
