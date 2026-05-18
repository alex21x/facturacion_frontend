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
  HomeMetricsSummaryResponse,
  IgvSettingsResponse,
  ModuleRow,
  OperationalContextResponse,
  OperationalLimitsResponse,
  ReconcileStatsResponse,
  ResetAdminPasswordResponse,
  RevealAdminPasswordResponse,
  UpdateCommerceSettingsPayload,
  UpdateOperationalLimitsPayload,
  CompanyCommerceAdminMatrixResponse,
  CompanyInventorySettingsAdminMatrixResponse,
  InventorySettingsRecord,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchModules(accessToken: string, branchId?: number | null): Promise<ModuleRow[]> {
  const query = new URLSearchParams();
  if (branchId !== null && branchId !== undefined) {
    query.set('branch_id', String(branchId));
  }

  const path = query.toString() ? `/api/appcfg/modules?${query.toString()}` : '/api/appcfg/modules';

  const response = await apiClient.request<{ modules: ModuleRow[] }>(path, {
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

export async function fetchHomeMetricsSummary(
  accessToken: string,
  params?: {
    range?: 'DAY' | 'MONTH' | 'YEAR';
    branchId?: number | null;
    warehouseId?: number | null;
  }
): Promise<HomeMetricsSummaryResponse> {
  const query = new URLSearchParams();

  if (params?.range) {
    query.set('range', params.range);
  }
  if (params?.branchId) {
    query.set('branch_id', String(params.branchId));
  }
  if (params?.warehouseId) {
    query.set('warehouse_id', String(params.warehouseId));
  }

  const suffix = query.toString();
  const path = suffix ? `/api/appcfg/home-metrics-summary?${suffix}` : '/api/appcfg/home-metrics-summary';

  return apiClient.request<HomeMetricsSummaryResponse>(path, {
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

export async function revealAdminCompanyPassword(
  accessToken: string,
  companyId: number
): Promise<RevealAdminPasswordResponse> {
  return apiClient.request<RevealAdminPasswordResponse>(`/api/appcfg/admin-companies/${companyId}/reveal-admin-password`, {
    method: 'GET',
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

export async function fetchCompanyCommerceAdminMatrix(
  accessToken: string
): Promise<CompanyCommerceAdminMatrixResponse> {
  return apiClient.request<CompanyCommerceAdminMatrixResponse>('/api/appcfg/company-commerce-admin-matrix', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCompanyCommerceAdminMatrix(
  accessToken: string,
  companyId: number,
  features: Record<string, boolean>
): Promise<CompanyCommerceAdminMatrixResponse> {
  return apiClient.request<CompanyCommerceAdminMatrixResponse>('/api/appcfg/company-commerce-admin-matrix', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ company_id: companyId, features }),
  });
}

export async function fetchCompanyInventorySettingsAdminMatrix(
  accessToken: string
): Promise<CompanyInventorySettingsAdminMatrixResponse> {
  return apiClient.request<CompanyInventorySettingsAdminMatrixResponse>('/api/appcfg/company-inventory-settings-admin-matrix', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCompanyInventorySettingsAdminMatrix(
  accessToken: string,
  companyId: number,
  settings: Partial<InventorySettingsRecord>
): Promise<CompanyInventorySettingsAdminMatrixResponse> {
  return apiClient.request<CompanyInventorySettingsAdminMatrixResponse>('/api/appcfg/company-inventory-settings-admin-matrix', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ company_id: companyId, ...settings }),
  });
}

export async function downloadSystemDatabaseBackup(
  accessToken: string,
  companyId: number
): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiClient.requestRaw(`/api/appcfg/system-backups/database-export?company_id=${companyId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    let message = `No se pudo exportar el respaldo (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (typeof payload?.message === 'string' && payload.message.trim() !== '') {
        message = payload.message;
      }
    } catch {
      // Keep generic message when body is not JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const fileName = match?.[1] ? decodeURIComponent(match[1]) : 'facturacion_full_backup.sql';

  return { blob, fileName };
}

export type SystemBackupFileRow = {
  file_name: string;
  size_bytes: number;
  size_label: string;
  generated_at: string;
};

export type SystemBackupListResponse = {
  backups: SystemBackupFileRow[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
};

export async function listSystemDatabaseBackups(
  accessToken: string,
  companyId: number,
  page = 1,
  perPage = 10
): Promise<SystemBackupListResponse> {
  const response = await apiClient.request<SystemBackupListResponse>(
    `/api/appcfg/system-backups/database-files?company_id=${companyId}&page=${page}&per_page=${perPage}`,
    {
    method: 'GET',
    headers: authHeaders(accessToken),
    }
  );

  return {
    backups: response.backups ?? [],
    pagination: {
      page: Number(response.pagination?.page ?? page),
      per_page: Number(response.pagination?.per_page ?? perPage),
      total: Number(response.pagination?.total ?? 0),
      last_page: Number(response.pagination?.last_page ?? 1),
    },
  };
}

export async function downloadSystemDatabaseBackupFile(
  accessToken: string,
  companyId: number,
  fileName: string
): Promise<{ blob: Blob; fileName: string }> {
  const encodedName = encodeURIComponent(fileName);
  const response = await apiClient.requestRaw(`/api/appcfg/system-backups/database-files/${encodedName}?company_id=${companyId}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  if (!response.ok) {
    let message = `No se pudo descargar el respaldo (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (typeof payload?.message === 'string' && payload.message.trim() !== '') {
        message = payload.message;
      }
    } catch {
      // Keep generic message when body is not JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const match = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const resolvedFileName = match?.[1] ? decodeURIComponent(match[1]) : fileName;

  return { blob, fileName: resolvedFileName };
}

export async function restoreSystemDatabaseBackup(
  accessToken: string,
  companyId: number,
  file: File
): Promise<{ message: string }> {
  const form = new FormData();
  form.append('company_id', String(companyId));
  form.append('backup_file', file);

  const response = await apiClient.requestRaw('/api/appcfg/system-backups/database-restore', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: form,
  });

  if (!response.ok) {
    let message = `No se pudo restaurar el respaldo (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string };
      if (typeof payload?.message === 'string' && payload.message.trim() !== '') {
        message = payload.message;
      }
    } catch {
      // Keep generic message when body is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<{ message: string }>;
}
