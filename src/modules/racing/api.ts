import { apiClient } from '../../shared/api/client';
import type {
  RacingBootstrapResponse,
  RacingEventCostSummaryResponse,
  RacingEventCostsResponse,
  RacingAlertsResponse,
  InventoryProductLookupsResponse,
  InventoryProductsResponse,
  RacingChecklistResponse,
  RacingEvent,
  RacingVehicle,
  RacingVehicleHistoryResponse,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchRacingBootstrap(accessToken: string): Promise<RacingBootstrapResponse> {
  return apiClient.request<RacingBootstrapResponse>('/api/racing/bootstrap', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRacingVehicle(
  accessToken: string,
  payload: { code: string; name: string; plate?: string; model?: string }
): Promise<RacingVehicle> {
  const response = await apiClient.request<{ vehicle: RacingVehicle }>('/api/racing/vehicles', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  return response.vehicle;
}

export async function fetchRacingVehicleHistory(accessToken: string, vehicleId: number): Promise<RacingVehicleHistoryResponse> {
  return apiClient.request<RacingVehicleHistoryResponse>(`/api/racing/vehicles/${vehicleId}/history`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRacingEvent(
  accessToken: string,
  payload: { code: string; name: string; location?: string; starts_at: string; ends_at?: string; budget_amount?: number }
): Promise<RacingEvent> {
  const response = await apiClient.request<{ event: RacingEvent }>('/api/racing/events', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
  return response.event;
}

export async function createRacingMaintenance(
  accessToken: string,
  vehicleId: number,
  payload: {
    component_code: string;
    action_type: string;
    service_date: string;
    estimated_life_km?: number;
    notes?: string;
  }
): Promise<RacingVehicleHistoryResponse> {
  return apiClient.request<RacingVehicleHistoryResponse>(`/api/racing/vehicles/${vehicleId}/maintenance`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchRacingChecklist(accessToken: string, eventId: number): Promise<RacingChecklistResponse> {
  return apiClient.request<RacingChecklistResponse>(`/api/racing/events/${eventId}/checklist`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRacingChecklistItem(
  accessToken: string,
  eventId: number,
  payload: { item_type?: string; item_label: string; planned_qty?: number }
): Promise<RacingChecklistResponse> {
  return apiClient.request<RacingChecklistResponse>(`/api/racing/events/${eventId}/checklist`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateRacingChecklistItem(
  accessToken: string,
  eventId: number,
  itemId: number,
  payload: { loaded_qty?: number; returned_qty?: number; status?: string }
): Promise<RacingChecklistResponse> {
  return apiClient.request<RacingChecklistResponse>(`/api/racing/events/${eventId}/checklist/${itemId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function createRacingInventoryAssignment(
  accessToken: string,
  payload: {
    assignment_type: 'VEHICLE' | 'EVENT';
    vehicle_id?: number;
    event_id?: number;
    product_id?: number;
    quantity: number;
    notes?: string;
  }
): Promise<void> {
  await apiClient.request('/api/racing/inventory-assignments', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchRacingEventCosts(accessToken: string, eventId: number): Promise<RacingEventCostsResponse> {
  return apiClient.request<RacingEventCostsResponse>(`/api/racing/events/${eventId}/costs`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createRacingEventCost(
  accessToken: string,
  eventId: number,
  payload: {
    cost_stage: 'PRE' | 'DURING' | 'POST';
    cost_category: string;
    concept: string;
    amount: number;
    cost_date: string;
    supplier_name?: string;
    notes?: string;
  }
): Promise<RacingEventCostsResponse> {
  return apiClient.request<RacingEventCostsResponse>(`/api/racing/events/${eventId}/costs`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function fetchRacingEventCostSummary(accessToken: string): Promise<RacingEventCostSummaryResponse> {
  return apiClient.request<RacingEventCostSummaryResponse>('/api/racing/reports/event-cost-summary', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchRacingAlerts(accessToken: string): Promise<RacingAlertsResponse> {
  return apiClient.request<RacingAlertsResponse>('/api/racing/alerts', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchInventoryProductAutocomplete(
  accessToken: string,
  search: string,
  categoryId?: number | null
): Promise<InventoryProductsResponse> {
  const query = new URLSearchParams();
  query.set('autocomplete', '1');
  query.set('limit', '20');
  if (search.trim() !== '') {
    query.set('search', search.trim());
  }
  if (categoryId && categoryId > 0) {
    query.set('category_id', String(categoryId));
  }

  return apiClient.request<InventoryProductsResponse>(`/api/inventory/products?${query.toString()}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchInventoryProductLookups(accessToken: string): Promise<InventoryProductLookupsResponse> {
  return apiClient.request<InventoryProductLookupsResponse>('/api/inventory/product-lookups', {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}
