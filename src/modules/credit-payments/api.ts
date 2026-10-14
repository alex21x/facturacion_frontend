import { apiClient } from '../../shared/api/client';
import type {
  CreditPaymentsPaginated,
  CreditPaymentsDetail,
  PaymentMethodOption,
} from './types';
import type { SalesLookups } from '../sales/types';
import type { PurchasesLookups } from '../purchases/types';
import { fetchSalesLookups } from '../sales/api';
import { fetchPurchasesLookups } from '../purchases/api';

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    query.set(key, String(value));
  });
  return query.toString();
}

export async function fetchCustomerCreditDocuments(
  accessToken: string,
  params: { page: number; perPage: number; branchId?: number | null; search?: string; paymentStatus?: string | null }
): Promise<CreditPaymentsPaginated> {
  const suffix = buildQuery({
    page: params.page,
    per_page: params.perPage,
    branch_id: params.branchId ?? null,
    search: params.search ?? '',
    payment_status: params.paymentStatus ?? null,
  });

  return apiClient.request<CreditPaymentsPaginated>(`/api/sales/credit-payments/documents?${suffix}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchSupplierCreditDocuments(
  accessToken: string,
  params: { page: number; perPage: number; branchId?: number | null; search?: string; paymentStatus?: string | null }
): Promise<CreditPaymentsPaginated> {
  const suffix = buildQuery({
    page: params.page,
    per_page: params.perPage,
    branch_id: params.branchId ?? null,
    search: params.search ?? '',
    payment_status: params.paymentStatus ?? null,
  });

  return apiClient.request<CreditPaymentsPaginated>(`/api/purchases/credit-payments/documents?${suffix}`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCustomerPayments(accessToken: string, documentId: number): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/sales/credit-payments/documents/${documentId}/payments`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function fetchSupplierPayments(accessToken: string, documentId: number): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/purchases/credit-payments/documents/${documentId}/payments`, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

export async function createCustomerPayment(accessToken: string, documentId: number, payload: Record<string, unknown>): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/sales/credit-payments/documents/${documentId}/payments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateCustomerPayment(accessToken: string, documentId: number, paymentId: number, payload: Record<string, unknown>): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/sales/credit-payments/documents/${documentId}/payments/${paymentId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteCustomerPayment(accessToken: string, documentId: number, paymentId: number): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/sales/credit-payments/documents/${documentId}/payments/${paymentId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function createSupplierPayment(accessToken: string, documentId: number, payload: Record<string, unknown>): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/purchases/credit-payments/documents/${documentId}/payments`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function updateSupplierPayment(accessToken: string, documentId: number, paymentId: number, payload: Record<string, unknown>): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/purchases/credit-payments/documents/${documentId}/payments/${paymentId}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplierPayment(accessToken: string, documentId: number, paymentId: number): Promise<CreditPaymentsDetail> {
  return apiClient.request<CreditPaymentsDetail>(`/api/purchases/credit-payments/documents/${documentId}/payments/${paymentId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export async function fetchCustomerPaymentMethods(accessToken: string, branchId?: number | null): Promise<PaymentMethodOption[]> {
  const lookups = await fetchSalesLookups(accessToken, { branchId: branchId ?? null });
  return normalizeMethodsFromSales(lookups);
}

export async function fetchSupplierPaymentMethods(accessToken: string): Promise<PaymentMethodOption[]> {
  const lookups = await fetchPurchasesLookups(accessToken);
  return normalizeMethodsFromPurchases(lookups);
}

function normalizeMethodsFromSales(lookups: SalesLookups): PaymentMethodOption[] {
  return (lookups.payment_methods ?? []).map((m) => ({
    id: Number(m.id),
    code: String(m.code ?? ''),
    name: String(m.name ?? `Metodo ${m.id}`),
  }));
}

function normalizeMethodsFromPurchases(lookups: PurchasesLookups): PaymentMethodOption[] {
  return (lookups.payment_methods ?? []).map((m) => ({
    id: Number(m.id),
    code: String(m.code ?? ''),
    name: String(m.name ?? `Metodo ${m.id}`),
  }));
}

export async function fetchPaymentTicketHtml(accessToken: string, endpoint: string): Promise<string> {
  const response = await fetch(`${apiClient.baseUrl}${endpoint}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar ticket (${response.status})`);
  }

  return response.text();
}
