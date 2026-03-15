import { apiClient } from '../../shared/api/client';
import type {
  CashMovement,
  CashSession,
  CloseSessionPayload,
  CreateMovementPayload,
  OpenSessionPayload,
} from './types';

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchCashSessions(
  accessToken: string,
  params?: { cashRegisterId?: number | null; status?: string; limit?: number }
): Promise<CashSession[]> {
  const query = new URLSearchParams();
  if (params?.cashRegisterId) query.set('cash_register_id', String(params.cashRegisterId));
  if (params?.status) query.set('status', params.status);
  if (params?.limit) query.set('limit', String(params.limit));

  const path = `/api/cash/sessions${query.toString() ? '?' + query.toString() : ''}`;
  const res = await apiClient.request<{ data: CashSession[] }>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
  return res.data;
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
