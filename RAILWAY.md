# Railway Deployment

## Frontend service

Root directory: repository root

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