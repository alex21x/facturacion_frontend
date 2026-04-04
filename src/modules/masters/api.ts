import { apiClient } from '../../shared/api/client';
import type {
  AccessControlResponse,
  CashRegisterRow,
  CommerceSettingsResponse,
  DocumentKindRow,
  InventorySettings,
  LotRow,
  MasterOptionsResponse,
  PaymentMethodRow,
  PriceTierRow,
  SeriesRow,
  UnitRow,
  WarehouseRow,
  MastersDashboardResponse,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchMasterOptions(accessToken: string): Promise<MasterOptionsResponse> {
  return apiClient.request<MasterOptionsResponse>('/api/masters/options', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchMastersDashboard(accessToken: string): Promise<MastersDashboardResponse> {
  return apiClient.request<MastersDashboardResponse>('/api/masters/dashboard', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchWarehouses(accessToken: string): Promise<WarehouseRow[]> {
  const response = await apiClient.request<{ data: WarehouseRow[] }>('/api/masters/warehouses', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function createWarehouse(
  accessToken: string,
  payload: { branch_id?: number | null; code: string; name: string; address?: string | null; status?: number }
) {
  return apiClient.request('/api/masters/warehouses', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateWarehouse(accessToken: string, id: number, payload: Partial<WarehouseRow>) {
  return apiClient.request(`/api/masters/warehouses/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchCashRegisters(accessToken: string): Promise<CashRegisterRow[]> {
  const response = await apiClient.request<{ data: CashRegisterRow[] }>('/api/masters/cash-registers', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function createCashRegister(
  accessToken: string,
  payload: { branch_id?: number | null; code: string; name: string; status?: number }
) {
  return apiClient.request('/api/masters/cash-registers', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCashRegister(accessToken: string, id: number, payload: Partial<CashRegisterRow>) {
  return apiClient.request(`/api/masters/cash-registers/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchPaymentMethods(accessToken: string): Promise<PaymentMethodRow[]> {
  const response = await apiClient.request<{ data: PaymentMethodRow[] }>('/api/masters/payment-methods', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function createPaymentMethod(accessToken: string, payload: { code: string; name: string; status?: number }) {
  return apiClient.request('/api/masters/payment-methods', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updatePaymentMethod(accessToken: string, id: number, payload: Partial<PaymentMethodRow>) {
  return apiClient.request(`/api/masters/payment-methods/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchSeries(accessToken: string): Promise<SeriesRow[]> {
  const response = await apiClient.request<{ data: SeriesRow[] }>('/api/masters/series', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function createSeries(
  accessToken: string,
  payload: {
    branch_id?: number | null;
    warehouse_id?: number | null;
    document_kind: SeriesRow['document_kind'];
    series: string;
    current_number?: number;
    number_padding?: number;
    reset_policy?: SeriesRow['reset_policy'];
    is_enabled?: boolean;
  }
) {
  return apiClient.request('/api/masters/series', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateSeries(accessToken: string, id: number, payload: Partial<SeriesRow>) {
  return apiClient.request(`/api/masters/series/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchPriceTiers(accessToken: string): Promise<PriceTierRow[]> {
  const response = await apiClient.request<{ data: PriceTierRow[] }>('/api/masters/price-tiers', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function createPriceTier(
  accessToken: string,
  payload: { code: string; name: string; min_qty: number; max_qty?: number | null; priority?: number; status?: number }
) {
  return apiClient.request('/api/masters/price-tiers', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updatePriceTier(accessToken: string, id: number, payload: Partial<PriceTierRow>) {
  return apiClient.request(`/api/masters/price-tiers/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchLots(accessToken: string): Promise<LotRow[]> {
  const response = await apiClient.request<{ data: LotRow[] }>('/api/masters/lots', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function createLot(
  accessToken: string,
  payload: {
    product_id: number;
    warehouse_id: number;
    lot_code: string;
    manufacture_at?: string | null;
    expires_at?: string | null;
    unit_cost?: number | null;
    supplier_reference?: string | null;
    status?: number;
  }
) {
  return apiClient.request('/api/masters/lots', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchInventorySettings(accessToken: string): Promise<InventorySettings> {
  const response = await apiClient.request<{ data: InventorySettings }>('/api/masters/inventory-settings', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function updateInventorySettings(accessToken: string, payload: Partial<InventorySettings>) {
  return apiClient.request('/api/masters/inventory-settings', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchDocumentKinds(accessToken: string): Promise<DocumentKindRow[]> {
  const response = await apiClient.request<{ data: DocumentKindRow[] }>('/api/masters/document-kinds', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return response.data;
}

export async function updateDocumentKinds(accessToken: string, kinds: Array<{ code: string; is_enabled: boolean }>) {
  return apiClient.request('/api/masters/document-kinds', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ kinds }),
  });
}

export async function updateUnits(accessToken: string, units: Array<{ id: number; is_enabled: boolean }>) {
  return apiClient.request<{ message: string; data?: UnitRow[] }>('/api/masters/units', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ units }),
  });
}

export async function fetchCommerceSettings(accessToken: string): Promise<CommerceSettingsResponse> {
  return apiClient.request<CommerceSettingsResponse>('/api/appcfg/commerce-settings', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateCommerceSettings(
  accessToken: string,
  features: Array<{ feature_code: string; is_enabled: boolean; config?: Record<string, unknown> | null }>
) {
  return apiClient.request<CommerceSettingsResponse>('/api/appcfg/commerce-settings', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ features }),
  });
}

export async function fetchAccessControl(accessToken: string): Promise<AccessControlResponse> {
  return apiClient.request<AccessControlResponse>('/api/masters/access-control', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRole(
  accessToken: string,
  payload: {
    code: string;
    name: string;
    status?: number;
    functional_profile?: 'SELLER' | 'CASHIER' | 'GENERAL' | null;
    permissions: Array<{
      module_code: string;
      can_view: boolean;
      can_create: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_export: boolean;
      can_approve: boolean;
    }>;
  }
) {
  return apiClient.request('/api/masters/roles', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateRole(
  accessToken: string,
  id: number,
  payload: {
    name?: string;
    status?: number;
    functional_profile?: 'SELLER' | 'CASHIER' | 'GENERAL' | null;
    permissions?: Array<{
      module_code: string;
      can_view: boolean;
      can_create: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_export: boolean;
      can_approve: boolean;
    }>;
  }
) {
  return apiClient.request(`/api/masters/roles/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function createUser(
  accessToken: string,
  payload: {
    branch_id?: number | null;
    username: string;
    password: string;
    first_name: string;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: number;
    role_id: number;
  }
) {
  return apiClient.request('/api/masters/users', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateUser(
  accessToken: string,
  id: number,
  payload: {
    branch_id?: number | null;
    password?: string;
    first_name?: string;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    status?: number;
    role_id?: number;
  }
) {
  return apiClient.request(`/api/masters/users/${id}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}
