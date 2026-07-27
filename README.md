# QC OS

QC OS is the quality inspection and corrective action workflow for production.

Current deployment strategy:

- The validated workshop prototype is served from `/prototype/qc.html`.
- The mobile capture prototype is served from `/prototype/mobile.html`.
- Root `/` redirects to `/prototype/qc.html` for the first workshop trial.
- Current Vercel production URL: `https://qc-os.vercel.app/prototype/qc.html`.
- Planned production domain: `https://qc-os.vanwellfgroup.com`.
- DNS record needed for the planned domain:
  - Type: `CNAME`
  - Name: `qc-os`
  - Value: `111751b2c1b95b55.vercel-dns-016.com.`

Future integrations:

- Factory OS: style, order, color, production batch, workshop process data.
- People OS: departments, people, roles, active status.
- Supabase: reports, corrective actions, reviews, archives, KPI entries.
- Amazon S3: problem photos, improvement photos, review evidence, archive exports.
- Vercel: production deployment at `qc-os.vanwellfgroup.com`.

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
