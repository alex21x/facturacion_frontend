export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '8000';

  return `${protocol}//${host}:${backendPort}`;
}