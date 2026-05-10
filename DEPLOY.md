# Deploying to Vercel + Turso

This prototype runs locally with a plain SQLite file (`data/impacta.db`).
For Vercel — where the filesystem is read-only — point it at a hosted libsql
database (Turso) instead. The application code is identical; only env vars change.

## 1. Create a Turso database

```bash
# install once
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup           # or: turso auth login
turso db create impacta
turso db show impacta --url      # → libsql://impacta-<org>.turso.io
turso db tokens create impacta   # → eyJ...
```

## 2. Seed it from your machine

Set the env vars **locally** (in `.env.local` or your shell), then run the seed
once. It creates the schema and inserts 50 demo consultants + 6 demo projects.

```bash
TURSO_URL=libsql://impacta-<org>.turso.io \
TURSO_AUTH_TOKEN=eyJ... \
npm run db:seed
```

## 3. Configure Vercel

In the Vercel project → **Settings → Environment Variables**, add:

| Name                  | Value                                        |
| --------------------- | -------------------------------------------- |
| `TURSO_URL`           | `libsql://impacta-<org>.turso.io`            |
| `TURSO_AUTH_TOKEN`    | The token from step 1                        |
| `ANTHROPIC_API_KEY`   | Optional — turns on Claude in the wizard     |

## 4. Deploy

```bash
vercel --prod
```

…or push to `main` if the GitHub integration is wired up.

## What does **not** work on Vercel

- **CV file uploads / downloads.** Vercel's filesystem is read-only, so
  `uploads/` writes silently no-op (`cv_file_path` stays `null`). The CV's
  extracted text is still saved to the DB and powers full-text search and the
  "extracted CV text" panel — only the original-file download is unavailable.
  If you need real file storage on Vercel, add **Vercel Blob** (or S3) and
  swap the `writeFile` call in `src/app/upload/page.tsx` and the read in
  `src/app/api/cv/[id]/route.ts`.

## Hosting alternatives

If you want CV downloads to work without object storage, deploy to a host with
a real disk: **Fly.io**, **Railway**, or **Render** (with a persistent volume).
The same `TURSO_URL` env vars work — or omit them and the app falls back to a
local SQLite file inside the container.
