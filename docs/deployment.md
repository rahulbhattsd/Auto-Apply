# Render Deployment

Use the root `render.yaml` blueprint. It creates:

- one paid Docker web service that serves the API, the built React app, and all queue workers
- one Render Postgres database
- one Render Key Value Redis instance
- one persistent disk mounted at `/app/uploads`

The single-service layout is intentional: uploaded resumes stay on the same disk that the application worker reads during browser automation.

## Required Before Deploy

Set these prompted secrets in Render:

- `GROQ_API_KEY` for live AI resume and cover-letter generation
- `SMTP_*` only if email notifications should send for real

Render generates `JWT_SECRET`. `APP_URL` and `API_URL` are inferred from `RENDER_EXTERNAL_URL` if not set.

## 24/7 Operation

Use a paid Render instance. Free web services can sleep, which means scheduled discovery and queue processing will not be truly 24/7.

## Health Checks

- liveness: `/api/health`
- readiness: `/api/ready`

Migrations run with `pnpm db:migrate` during Render pre-deploy.
