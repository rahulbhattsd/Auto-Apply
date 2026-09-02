# AUTOAPPLY — Autonomous AI Job Application Platform

## Project Overview
AutoApply is a fully autonomous AI agent that discovers, analyzes, and applies to jobs on your behalf. Built for reliability and observability, it navigates complex application states, tailors resumes using Groq LLMs, and executes browser automation securely.

## Tech Stack
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Recharts
- **API Backend:** Node.js, Fastify, Zod, JWT Auth
- **Database & Queue:** PostgreSQL (Prisma ORM), Redis, BullMQ
- **Workers:** 5 dedicated worker processes (Discovery, Analysis, Resume, Application, Verification)
- **AI & Automation:** Groq (LLM), Playwright (Browser Automation)

## Local Development
\`\`\`bash
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm --filter @autoapply/database run generate
pnpm run dev
\`\`\`

## Production Deployment
\`\`\`bash
docker compose -f docker-compose.prod.yml up -d
\`\`\`

## Mermaid Architecture Diagrams
See \`docs/architecture.md\` for full detailed diagrams.

## Limitations & Human-in-the-Loop Behavior
- AI hallucination checks prevent automated submission if data anomalies are detected.
- Any form containing CAPTCHA or lacking confirmation identifiers will halt automation and transition to \`NEEDS_HUMAN\` state.

## Future Roadmap
- Expanding mock adapters to real ATS platforms.
- More granular notification triggers.
- Advanced chaos resilience features across distributed nodes.
