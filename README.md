# QC OS

QC OS is the quality inspection and corrective action workflow for production.

Current deployment strategy:

- The validated workshop prototype is served from `/prototype/qc.html`.
- The mobile capture prototype is served from `/prototype/mobile.html`.
- Root `/` redirects to `/prototype/qc.html` for the first workshop trial.

Future integrations:

- Factory OS: style, order, color, production batch, workshop process data.
- People OS: departments, people, roles, active status.
- Supabase: reports, corrective actions, reviews, archives, KPI entries.
- Amazon S3: problem photos, improvement photos, review evidence, archive exports.
- Vercel: production deployment at `qc-os.vanwellfgroup.com`.

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Environment

Copy `.env.example` to `.env.local` and fill in values when connecting real services.

