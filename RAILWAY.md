# Railway Deployment

## Frontend service

Root directory: repository root

Recommended variable:

```env
APP_VARIANT=app
```

Build command:

```bash
npm ci
npm run build
```

Start command:

```bash
npm run start:app
```

Required variables:

```env
VITE_API_BASE_URL=https://<backend-domain>
VITE_REQUEST_TIMEOUT_MS=30000
VITE_AUTH_REQUEST_TIMEOUT_MS=15000
VITE_EXPORT_REQUEST_TIMEOUT_MS=90000
VITE_SLOW_LOOKUP_TIMEOUT_MS=45000
VITE_BULK_IMPORT_TIMEOUT_MS=180000
VITE_SALES_ISSUE_TIMEOUT_MS=120000
VITE_SUNAT_ASYNC_TIMEOUT_MS=120000
```

This variable must point to the public Railway backend URL. Do not rely on `:8000` from the frontend host in cloud deployments.

## Admin service

Use the same repository, but create a second Railway service.

Recommended variable:

```env
APP_VARIANT=admin
```

Build command:

```bash
npm ci
npm run build:admin
```

Start command:

```bash
npm run start:admin
```

Required variables:

```env
VITE_API_BASE_URL=https://<backend-domain>
VITE_REQUEST_TIMEOUT_MS=30000
VITE_AUTH_REQUEST_TIMEOUT_MS=15000
VITE_EXPORT_REQUEST_TIMEOUT_MS=90000
VITE_SLOW_LOOKUP_TIMEOUT_MS=45000
VITE_BULK_IMPORT_TIMEOUT_MS=180000
VITE_SALES_ISSUE_TIMEOUT_MS=120000
VITE_SUNAT_ASYNC_TIMEOUT_MS=120000
```

This variable must point to the public Railway backend URL used by the admin portal.

Notes:

- Frontend and admin are deployed as separate static services from the same repo.
- Point both services to the same backend public URL.
- The backend Railway service must also allow the frontend/admin public origins through its CORS envs such as `FRONTEND_APP_URL` or `FRONTEND_URL`.
- If the admin Railway service shows the normal web instead of the admin portal, the service is building/running the default app variant. Set `APP_VARIANT=admin` on that Railway service and redeploy.
- `railway.json` uses the shared `Dockerfile.railway`, which now builds both outputs and serves `dist` or `dist-admin` depending on `APP_VARIANT`.
- The timeout values above are tuned for Railway production where SUNAT/bridge operations can exceed 20s under load.
- Start with these values, then increase only the specific route group that still times out.