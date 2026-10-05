# forray-assist
A tool for improving foray experiences and data collection quality through realtime voice assistance and transcription.

## Stack
Nuxt 3 (Vue 3) · Vuetify 3 · Supabase (Postgres) · deployed on Vercel.

## Development
```bash
cp .env.example .env   # fill in Supabase credentials
npm install
npm run dev
```
Apply `supabase/migrations/0001_init.sql` to your Supabase project (SQL editor or `supabase db push`).

## Deploy
Import the repo in Vercel (Nuxt is auto-detected) and set `SUPABASE_URL` and `SUPABASE_KEY` in the project's environment variables.
