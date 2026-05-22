# Frontend

React + Vite + Tailwind CSS client for the StreamHub auth flow.

## Responsibilities
- Read the API URL from the root `.env.main` file at build time.
- Keep the auth token in `localStorage`.
- Protect private routes and redirect unauthenticated users to `/login`.
- Present a minimal authenticated shell once the backend confirms the token.
- Show the logged-in company's streamings after login.
- Expose the super-admin workspace to rename companies, users, and streamings, plus create and delete them.

## Notes
- The frontend does not own database or auth configuration.
- It only talks to the Bun + Elysia backend through the configured API base URL.
- Tailwind CSS is the styling layer; the semantic component classes in `src/styles.css` are implemented through Tailwind layers and utilities.