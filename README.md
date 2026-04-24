# Blueteam Secure Desk

Secure Reporter Dashboard is a standalone Next.js admin dashboard project.

## Getting Started

1) Create a Firebase web app and enable **Email/Password** auth.

2) Create `.env.local` from `.env.example` and fill in the `NEXT_PUBLIC_FIREBASE_*` values.

3) Configure Supabase (for attachment download signing):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to browser)
- `SUPABASE_BUCKET=reports`

4) Run the development server:

```bash
npm install
npm run dev
```

## Production

```bash
npm run lint
npm run build
```
