# AI KINTEL PM2 Cron Blueprint

## Status

- Stage: 11D - AI KINTEL PM2 Cron Blueprint.
- This is a review-only PM2 blueprint.
- It is not production config.
- Do not copy it to production without owner review.
- It does not create `packages/cron`.
- It does not create a real `.cjs` config file.
- It does not activate providers, source adapters, endpoints, backend code, UI, CSS, dependencies, or Local RC behavior.

## Future PM2 Names

- `kintel-crypto-market-context`
- `kintel-crypto-projects`
- `kintel-crypto-security`
- `kintel-crypto-onchain`
- `kintel-crypto-market-summary`

## Documentation-Only PM2 Skeleton

The following `ecosystem.crypto.config.cjs` skeleton is planning text only. Do not create it as a runtime file in this repo.

```cjs
// ecosystem.crypto.config.cjs - documentation-only skeleton.
// Do not copy to production without AI KINTEL owner review.
// PM2 config must not include secrets.
// Env comes from production .env.
// Paid source env missing must not crash disabled sources.
// Disabled/deferred sources must not call providers.

module.exports = {
  apps: [
    {
      name: 'kintel-crypto-market-context',
      script: 'tsx',
      args: 'scripts/fetch-crypto-market-context.ts',
      cwd: '/opt/aikintel-platform/packages/cron',
      cron_restart: '0 */6 * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kintel-crypto-projects',
      script: 'tsx',
      args: 'scripts/fetch-crypto-projects.ts',
      cwd: '/opt/aikintel-platform/packages/cron',
      cron_restart: '15 */6 * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kintel-crypto-security',
      script: 'tsx',
      args: 'scripts/fetch-crypto-security.ts',
      cwd: '/opt/aikintel-platform/packages/cron',
      cron_restart: '*/30 * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kintel-crypto-onchain',
      script: 'tsx',
      args: 'scripts/fetch-crypto-onchain.ts',
      cwd: '/opt/aikintel-platform/packages/cron',
      cron_restart: '30 */12 * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kintel-crypto-market-summary',
      script: 'tsx',
      args: 'scripts/generate-crypto-market-summary.ts',
      cwd: '/opt/aikintel-platform/packages/cron',
      cron_restart: '45 2,14 * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

## Review Notes

- PM2 schedules above are planning placeholders only.
- Final schedule belongs to AI KINTEL integration review.
- Future cron fetchers must follow 11C source config and adapter contracts.
- Future disabled/deferred paid sources must not call providers.
- Secrets belong in production env management, never in PM2 config.
- Missing env for disabled/deferred paid sources must not crash cron startup or module startup.
