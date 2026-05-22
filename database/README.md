# Database

Shared persistence assets live here so schema and seed material do not get scattered across app folders.

## Contents
- `schema.sql` is the authoritative SQLite schema.
- `data/` is reserved for the local SQLite file and stays ignored.
- `seed.json` stores the UUID-based initial companies and streamings.

## Contract
- The backend config remains inside `backend/`.
- The backend only points to the files stored in this folder.
- The seed file is initial data only; it is not meant to overwrite edited records on later boots.