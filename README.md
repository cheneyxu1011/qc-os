# QC OS

QC OS is the quality inspection and corrective action workflow for production.

## Required Reading

Before making any product, data, API, database, UI, or deployment change, read:

- [`SYSTEM_RULES.md`](./SYSTEM_RULES.md) - canonical product baseline and data synchronization standard.

The current prototype contains both live integrations and demonstration-only sections. `SYSTEM_RULES.md` records the difference and must be kept aligned with confirmed business decisions.

Current deployment strategy:

- The validated workshop prototype is served from `/prototype/qc.html`.
- The mobile capture prototype is served from `/prototype/mobile.html`.
- Root `/` redirects to `/prototype/qc.html` for the first workshop trial.
- Current Vercel production URL: `https://qc-os.vercel.app/prototype/qc.html`.
- Production domain: `https://qc-os.vanwellgroup.com`.

Future integrations:

- Factory OS: style, order, color, production batch, workshop process data.
- People OS: departments, people, roles, active status.
- Supabase: reports, corrective actions, reviews, archives, KPI entries.
- Amazon S3: problem photos, improvement photos, review evidence, archive exports.
- Vercel: production deployment at `qc-os.vanwellgroup.com`.

## Local Development

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:3000
```

## Environment

Copy `.env.example` to `.env.local` and fill in values when connecting real services.
