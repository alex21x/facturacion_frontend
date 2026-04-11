import { apiClient } from '../../shared/api/client';
import type {
  CreateAdminCompanyPayload,
  CreateAdminCompanyResponse,
  CompanyOperationalLimitMatrixResponse,
  CompanyRateLimitMatrixResponse,
  CompanyVerticalAdminMatrixResponse,
  CompanyVerticalSettingsResponse,
  CommerceSettingsResponse,
  FeatureToggleRow,
  IgvSettingsResponse,
  ModuleRow,
  OperationalContextResponse,
  OperationalLimitsResponse,
  ReconcileStatsResponse,
  ResetAdminPasswordResponse,
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

export async function fetchFeatureToggles(accessToken: string, branchId?: number | null): Promise<FeatureToggleRow[]> {
  const query = new URLSearchParams();
  if (branchId) {
    query.set('branch_id', String(branchId));
  }

  const path = query.toString() ? `/api/appcfg/feature-toggles?${query.toString()}` : '/api/appcfg/feature-toggles';

  const response = await apiClient.request<{ features: FeatureToggleRow[] }>(path, {
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

export async function fetchReconcileStats(accessToken: string): Promise<ReconcileStatsResponse> {
  return apiClient.request<ReconcileStatsResponse>('/api/sales/sunat-exceptions/reconcile-stats', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCompanyVerticalSettings(accessToken: string): Promise<CompanyVerticalSettingsResponse> {
  return apiClient.request<CompanyVerticalSettingsResponse>('/api/appcfg/company-vertical-settings', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCompanyVerticalSettings(
  accessToken: string,
  payload: { vertical_code: string; effective_from?: string }
): Promise<CompanyVerticalSettingsResponse> {
  return apiClient.request<CompanyVerticalSettingsResponse>('/api/appcfg/company-vertical-settings', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchCompanyVerticalAdminMatrix(accessToken: string): Promise<CompanyVerticalAdminMatrixResponse> {
  return apiClient.request<CompanyVerticalAdminMatrixResponse>('/api/appcfg/company-vertical-admin-matrix', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCompanyVerticalAdminMatrix(
  accessToken: string,
  payload: {
    company_id: number;
    vertical_code: string;
    is_enabled: boolean;
    make_primary?: boolean;
    effective_from?: string;
  }
): Promise<CompanyVerticalAdminMatrixResponse> {
  return apiClient.request<CompanyVerticalAdminMatrixResponse>('/api/appcfg/company-vertical-admin-matrix', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCompanyVerticalAdminMatrixBulk(
  accessToken: string,
  payload: {
    company_ids: number[];
    vertical_code: string;
    is_enabled: boolean;
    make_primary?: boolean;
    effective_from?: string;
  }
): Promise<CompanyVerticalAdminMatrixResponse> {
  return apiClient.request<CompanyVerticalAdminMatrixResponse>('/api/appcfg/company-vertical-admin-matrix/bulk', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchCompanyRateLimitMatrix(accessToken: string): Promise<CompanyRateLimitMatrixResponse> {
  return apiClient.request<CompanyRateLimitMatrixResponse>('/api/appcfg/company-rate-limit-matrix', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCompanyRateLimitMatrix(
  accessToken: string,
  payload: {
    company_id: number;
    is_enabled: boolean;
    requests_per_minute_read: number;
    requests_per_minute_write: number;
    requests_per_minute_reports: number;
    plan_code?: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
    preset_code?: 'BASIC' | 'PRO' | 'ENTERPRISE';
  }
): Promise<CompanyRateLimitMatrixResponse> {
  return apiClient.request<CompanyRateLimitMatrixResponse>('/api/appcfg/company-rate-limit-matrix', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCompanyRateLimitMatrixBulk(
  accessToken: string,
  payload: {
    company_ids: number[];
    is_enabled: boolean;
    requests_per_minute_read: number;
    requests_per_minute_write: number;
    requests_per_minute_reports: number;
    plan_code?: 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
    preset_code?: 'BASIC' | 'PRO' | 'ENTERPRISE';
  }
): Promise<CompanyRateLimitMatrixResponse> {
  return apiClient.request<CompanyRateLimitMatrixResponse>('/api/appcfg/company-rate-limit-matrix/bulk', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function createAdminCompany(
  accessToken: string,
  payload: CreateAdminCompanyPayload
): Promise<CreateAdminCompanyResponse> {
  return apiClient.request<CreateAdminCompanyResponse>('/api/appcfg/admin-companies', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function resetAdminCompanyPassword(
  accessToken: string,
  companyId: number
): Promise<ResetAdminPasswordResponse> {
  return apiClient.request<ResetAdminPasswordResponse>(`/api/appcfg/admin-companies/${companyId}/reset-admin-password`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCompanyOperationalLimitMatrix(accessToken: string): Promise<CompanyOperationalLimitMatrixResponse> {
  return apiClient.request<CompanyOperationalLimitMatrixResponse>('/api/appcfg/company-operational-limit-matrix', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCompanyOperationalLimitMatrix(
  accessToken: string,
  payload: {
    company_id: number;
    max_branches_enabled: number;
    max_warehouses_enabled: number;
    max_cash_registers_enabled: number;
    max_cash_registers_per_warehouse: number;
  }
): Promise<CompanyOperationalLimitMatrixResponse> {
  return apiClient.request<CompanyOperationalLimitMatrixResponse>('/api/appcfg/company-operational-limit-matrix', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCompanyOperationalLimitMatrixBulk(
  accessToken: string,
  payload: {
    company_ids: number[];
    max_branches_enabled: number;
    max_warehouses_enabled: number;
    max_cash_registers_enabled: number;
    max_cash_registers_per_warehouse: number;
  }
): Promise<CompanyOperationalLimitMatrixResponse> {
  return apiClient.request<CompanyOperationalLimitMatrixResponse>('/api/appcfg/company-operational-limit-matrix/bulk', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
