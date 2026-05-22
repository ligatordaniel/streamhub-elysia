# Backend

Bun + Elysia API for the StreamHub company-scoped auth and admin workflow.

## Responsibilities
- Read the root `.env.main` file.
- Keep the database config inside `backend/src/config/database.ts`.
- Open the SQLite file stored under `database/`.
- Seed `scriptdog_limitada` with 2 audio and 2 video streamings from `database/seed.json`.
- Seed the first `super_admin` from env values and associate that user with `scriptdog_limitada`.
- Expose login, me, logout, my-streamings, health, and super-admin CRUD routes for companies, users, and streamings.

## Notes
- The backend is stateless beyond the SQLite user, company, and streaming tables.
- The frontend stores the bearer token in `localStorage` and sends it on requests.
- UUIDs are used for all company, user, and streaming identifiers.
- The seed step only inserts missing companies and streamings, so later admin edits survive restarts.