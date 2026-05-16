export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  if (typeof window === 'undefined') {
    const backendPort = import.meta.env.VITE_BACKEND_PORT || '8000';
    return `http://127.0.0.1:${backendPort}`;
  }

  const host = window.location.hostname;
  const protocol = window.location.protocol;
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '8000';

  const isLocalHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

  if (isLocalHost) {
    return `${protocol}//${host}:${backendPort}`;
  }

  return '';
}