function inferRailwayBackendOrigin(host: string): string | null {
  const lowerHost = host.toLowerCase();
  if (!lowerHost.endsWith('.up.railway.app')) {
    return null;
  }

  const rawCandidates = [
    lowerHost.replace('facturacionadmin', 'facturacionbackendapi'),
    lowerHost.replace('facturacionfrontend', 'facturacionbackendapi'),
    lowerHost.replace('facturacion-admin', 'facturacion-backend-api'),
    lowerHost.replace('facturacion-frontend', 'facturacion-backend-api'),
    lowerHost.replace('-admin-', '-backendapi-'),
    lowerHost.replace('-frontend-', '-backendapi-'),
    lowerHost.replace('admin-production', 'backendapi-production'),
    lowerHost.replace('frontend-production', 'backendapi-production'),
    lowerHost.replace('admin', 'backendapi'),
    lowerHost.replace('frontend', 'backendapi'),
    lowerHost.replace('facturacionadmin', 'facturacionbackend'),
    lowerHost.replace('facturacionfrontend', 'facturacionbackend'),
    lowerHost.replace('facturacion-frontend', 'facturacion-backend'),
    lowerHost.replace('-admin-', '-backend-'),
    lowerHost.replace('-frontend-', '-backend-'),
    lowerHost.replace('admin-production', 'backend-production'),
    lowerHost.replace('frontend-production', 'backend-production'),
    lowerHost.replace('admin', 'backend'),
    lowerHost.replace('frontend', 'backend'),
  ];

  const seen = new Set<string>();
  for (const candidate of rawCandidates) {
    if (!candidate || candidate === lowerHost || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    if (!candidate.includes('backend')) {
      continue;
    }

    return `https://${candidate}`;
  }

  return null;
}

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

  const inferredRailwayBackend = inferRailwayBackendOrigin(host);
  if (inferredRailwayBackend) {
    return inferredRailwayBackend;
  }

  return '';
}