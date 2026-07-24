# TRADE//OS

**Trading Intelligence Journal** — Import, analyze, and improve your trading performance.

Screenshot-first trading journal with AI-powered trade extraction from screenshots and CSV batch import. Automatic performance analytics with a FIFA sports-broadcast-inspired UI.

## Features

- **CSV/Excel Batch Import** — Upload broker exports with auto field mapping and duplicate detection
- **Screenshot AI Import** — Paste or upload trade screenshots, AI extracts trade data automatically (powered by DeepSeek)
- **Performance Dashboard** — KPI cards, equity curve, directional bias, session heatmap, monthly calendar
- **Deep Analytics** — Performance, risk, and behavior analysis with interactive charts
- **Trade Journal** — Full CRUD with search, pagination, and bulk operations
- **Performance Calendar** — Day-by-day P&L visualization with monthly summaries
- **Multi-Account Support** — Track multiple brokerage accounts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Animation | Framer Motion |
| Charts | Recharts |
| Database | Turso (serverless SQLite) via Drizzle ORM |
| Auth | NextAuth.js v5 |
| AI | DeepSeek Vision API |
| CSV | PapaParse |
| Deployment | Vercel |

## Getting Started

```bash
# Install dependencies
npm install

# Set up local environment
cp .env.local.example .env.local
# Edit .env.local with your values

# Run database migration (local SQLite)
npm run db:push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Database connection string |
| `AUTH_SECRET` | NextAuth encryption secret |
| `AUTH_URL` | Application URL |
| `DEEPSEEK_API_KEY` | DeepSeek API key for screenshot AI extraction |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema to database |
| `npm run db:generate` | Generate migration files |
| `npm run db:studio` | Open Drizzle Studio |

## Deployment

Deployed on Vercel. Push to `main` branch to trigger automatic deployment.

## License

Private — All rights reserved.
