import { apiClient } from '../../shared/api/client';
import type { CompanyCertUploadResponse, CompanyProfile, UpdateCompanyProfilePayload } from './types';

function authHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

function toAbsoluteAssetUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) {
    return raw;
  }

  const base = apiClient.baseUrl.replace(/\/+$/, '');
  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }

  return `${base}/${raw}`;
}

export async function fetchCompanyProfile(accessToken: string, companyId?: number): Promise<CompanyProfile> {
  const query = new URLSearchParams();
  if (companyId) query.set('company_id', String(companyId));
  const path = `/api/appcfg/company-profile${query.toString() ? '?' + query.toString() : ''}`;

  const profile = await apiClient.request<CompanyProfile>(path, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });

  return {
    ...profile,
    logo_url: toAbsoluteAssetUrl(profile.logo_url),
  };
}

export async function updateCompanyProfile(
  accessToken: string,
  payload: UpdateCompanyProfilePayload
): Promise<CompanyProfile> {
  return apiClient.request<CompanyProfile>('/api/appcfg/company-profile', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export async function uploadCompanyLogo(
  accessToken: string,
  file: File
): Promise<{ message: string; logo_url: string }> {
  const formData = new FormData();
  formData.append('logo', file);

  const baseUrl = apiClient.baseUrl;
  const response = await fetch(`${baseUrl}/api/appcfg/company-logo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  const payload = await response.json() as { message: string; logo_url: string };
  return {
    ...payload,
    logo_url: toAbsoluteAssetUrl(payload.logo_url) ?? payload.logo_url,
  };
}

export async function uploadCompanyCert(
  accessToken: string,
  file: File,
  certPassword: string
): Promise<CompanyCertUploadResponse> {
  const formData = new FormData();
  formData.append('cert', file);
  formData.append('cert_password', certPassword);

  const baseUrl = apiClient.baseUrl;
  const response = await fetch(`${baseUrl}/api/appcfg/company-cert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  return response.json() as Promise<CompanyCertUploadResponse>;
}
