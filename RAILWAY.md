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
```

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
```

Notes:

- Frontend and admin are deployed as separate static services from the same repo.
- Point both services to the same backend public URL.
- If the admin Railway service shows the normal web instead of the admin portal, the service is building/running the default app variant. Set `APP_VARIANT=admin` on that Railway service and redeploy.
- `railway.json` uses the shared `Dockerfile.railway`, which now builds both outputs and serves `dist` or `dist-admin` depending on `APP_VARIANT`.