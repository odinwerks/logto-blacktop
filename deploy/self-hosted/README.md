# Self-hosted deployment

`docker-compose.yml` here is the version-controlled copy of the live compose file. Deploy it from the directory that contains this repository:

```
infra/logto-server/
├── docker-compose.yml   ← copy of deploy/self-hosted/docker-compose.yml
├── .env                 ← from .env.example, never committed
├── data/                ← logto, connectors, cloudflared
└── logto-server/        ← this repository (build context)
```

Paths in the compose file (`./logto-server`, `./data/...`) are relative to `infra/logto-server/`. It will not run from inside the repository.

## Update

```
cp logto-server/deploy/self-hosted/docker-compose.yml docker-compose.yml
docker compose -f docker-compose.yml build logto
docker compose -f docker-compose.yml up -d --no-deps logto
```

Commit any change to the live file back here.

## Settings that must not drift

- `NODE_ENV=production` activates the source filter in `packages/core/src/middleware/koa-security-headers.ts` that drops localhost from CSP `frame-ancestors` (SEC-02). Without it, the fix silently turns off.
- Leave `ADMIN_DISABLE_LOCALHOST` unset. It stops the 3002 admin listener, which the Cloudflare portal ingress targets.
- Published ports bind to `127.0.0.1` only. Cloudflared reaches Logto over `logto-net`.
- The data volumes are `external`. `docker compose down -v` does not delete them, but do not recreate them.
