import { apiClient } from '../../shared/api/client';
import type {
  RestaurantBootstrapResponse,
  CheckoutRestaurantOrderPayload,
  ComandaKitchenStatus,
  CreateRestaurantOrderPayload,
  PaginatedComandasResponse,
  PaginatedRestaurantOrdersResponse,
  ResolveRestaurantCustomerByDocumentResponse,
  RestaurantCustomerSuggestion,
  RestaurantTableStatus,
  RestaurantTablesResponse,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function fetchRestaurantBootstrap(
  accessToken: string,
  params?: { branchId?: number | null; warehouseId?: number | null }
): Promise<RestaurantBootstrapResponse> {
  const query = new URLSearchParams();

  if (params?.branchId) query.set('branch_id', String(params.branchId));
  if (params?.warehouseId) query.set('warehouse_id', String(params.warehouseId));

  const suffix = query.toString();
  const path = suffix ? `/api/restaurant/bootstrap?${suffix}` : '/api/restaurant/bootstrap';

  return apiClient.request<RestaurantBootstrapResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchRestaurantCustomerAutocomplete(
  accessToken: string,
  queryText: string
): Promise<RestaurantCustomerSuggestion[]> {
  const query = new URLSearchParams();
  query.set('q', queryText);
  query.set('limit', '12');

  const response = await apiClient.request<{ data: RestaurantCustomerSuggestion[] }>(
    `/api/sales/customers/autocomplete?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );

  return response.data;
}

export async function resolveRestaurantCustomerByDocument(
  accessToken: string,
  document: string
): Promise<ResolveRestaurantCustomerByDocumentResponse> {
  const query = new URLSearchParams();
  query.set('document', document);

  return apiClient.request<ResolveRestaurantCustomerByDocumentResponse>(
    `/api/sales/customers/resolve-document?${query.toString()}`,
    {
      method: 'GET',
      headers: authHeaders(accessToken),
    }
  );
}

export async function fetchComandas(
  accessToken: string,
  params?: { branchId?: number | null; status?: ComandaKitchenStatus | ''; search?: string; page?: number; perPage?: number }
): Promise<PaginatedComandasResponse> {
  const query = new URLSearchParams();

  if (params?.branchId) query.set('branch_id', String(params.branchId));
  if (params?.status) query.set('status', params.status);
  if (params?.search && params.search.trim() !== '') query.set('search', params.search.trim());
  if (params?.page && params.page > 0) query.set('page', String(params.page));
  if (params?.perPage && params.perPage > 0) query.set('per_page', String(params.perPage));

  const suffix = query.toString();
  const path = suffix ? `/api/restaurant/comandas?${suffix}` : '/api/restaurant/comandas';

  return apiClient.request<PaginatedComandasResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function updateComandaStatus(
  accessToken: string,
  id: number,
  payload: { status: ComandaKitchenStatus; table_label?: string }
): Promise<{ message: string; id: number; status: ComandaKitchenStatus; table_label?: string | null }> {
  return apiClient.request(`/api/restaurant/comandas/${id}/status`, {
    method: 'PUT',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchRestaurantTables(
  accessToken: string,
  params?: { branchId?: number | null; status?: RestaurantTableStatus | ''; search?: string }
): Promise<RestaurantTablesResponse> {
  const query = new URLSearchParams();

  if (params?.branchId) query.set('branch_id', String(params.branchId));
  if (params?.status) query.set('status', params.status);
  if (params?.search && params.search.trim() !== '') query.set('search', params.search.trim());

  const suffix = query.toString();
  const path = suffix ? `/api/restaurant/tables?${suffix}` : '/api/restaurant/tables';

  return apiClient.request<RestaurantTablesResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRestaurantTable(
  accessToken: string,
  payload: { branch_id: number; code: string; name: string; capacity: number }
): Promise<{ message: string; id: number }> {
  return apiClient.request('/api/restaurant/tables', {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function updateRestaurantTable(
  accessToken: string,
  id: number,
  payload: { name?: string; capacity?: number; status?: RestaurantTableStatus }
): Promise<{ message: string; id: number }> {
  return apiClient.request(`/api/restaurant/tables/${id}`, {
    method: 'PUT',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Restaurant orders  (vertical-specific endpoints, isolated from retail sales)
// ---------------------------------------------------------------------------

export async function fetchRestaurantOrders(
  accessToken: string,
  params?: { branchId?: number | null; status?: string; search?: string; page?: number; perPage?: number }
): Promise<PaginatedRestaurantOrdersResponse> {
  const query = new URLSearchParams();

  if (params?.branchId) query.set('branch_id', String(params.branchId));
  if (params?.status) query.set('status', params.status);
  if (params?.search && params.search.trim() !== '') query.set('search', params.search.trim());
  if (params?.page && params.page > 0) query.set('page', String(params.page));
  if (params?.perPage && params.perPage > 0) query.set('per_page', String(params.perPage));

  const suffix = query.toString();
  const path = suffix ? `/api/restaurant/orders?${suffix}` : '/api/restaurant/orders';

  return apiClient.request<PaginatedRestaurantOrdersResponse>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRestaurantOrder(
  accessToken: string,
  payload: CreateRestaurantOrderPayload
): Promise<{ id: number; document_kind: string; series: string; number: number; total: number; status: string }> {
  return apiClient.request('/api/restaurant/orders', {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function updateRestaurantOrder(
  accessToken: string,
  orderId: number,
  payload: {
    customer_id?: number | null;
    payment_method_id?: number | null;
    notes?: string;
    items: Array<{
      line_no?: number;
      product_id?: number | null;
      unit_id?: number | null;
      description: string;
      qty: number;
      unit_price: number;
      tax_total?: number;
      subtotal?: number;
      total?: number;
    }>;
  }
): Promise<{ message: string; data: unknown }> {
  return apiClient.request(`/api/sales/commercial-documents/${orderId}`, {
    method: 'PUT',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Checkout: convert a SALES_ORDER to INVOICE or RECEIPT + release mesa
// ---------------------------------------------------------------------------

export async function checkoutRestaurantOrder(
  accessToken: string,
  orderId: number,
  payload: CheckoutRestaurantOrderPayload
): Promise<{ id: number; document_kind: string; series: string; number: number; total: number; status: string }> {
  return apiClient.request(`/api/restaurant/orders/${orderId}/checkout`, {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
