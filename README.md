# BoxBol

Voice-first quotation assistant for a corrugated box company. Wispr Flow types the owner's speech into one always-focused command box; the app turns it into request cards and PDF quotations.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in `MONGODB_URI`, `GROQ_API_KEY`, `APP_PASSCODE`, `SESSION_SECRET`.
3. `npm run dev` and open http://localhost:3000. Log in with `APP_PASSCODE`.
4. Check the database: http://localhost:3000/api/health

## Where to change things

- `lib/fields.ts`: the card fields, spoken aliases, allowed values, and what counts as missing. Edit this after checking the notebook.
- `lib/company.ts`: letterhead details for the PDF (placeholders for now).

## Scripts

- `npm test`: unit tests (Vitest)
- `npm run typecheck`, `npm run lint`
- `npm run harness`: runs `tests/requests.json` through the real parser (phase 6)
