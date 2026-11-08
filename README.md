# Sunco Walk-In CRM

Walk-in enquiry tracking for Sunco Motors (Caloundra, Maroochydore, Kingaroy, Hervey Bay).
See [`docs/PLAN.md`](docs/PLAN.md) for the full plan and build phases.

**Current stage:** phase 0, foundations: data structure, secure sign-in, roles and brand/site permissions, and the starting brand/site/model setup. The enquiry screens come in phase 1.

## Requirements

- Node.js 22.13 or newer. The database is Node's built-in SQLite, so there's nothing else to install.

## First-time setup

```bash
npm install
npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran"
npm start
```

`create-user` asks for the password (it's never typed on the command line). Then open http://localhost:3000 and sign in. Other users are added in the app by a manager or admin. They get a temporary password and must choose their own the first time they sign in.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DATA_DIR` | `./data` | Folder for the database and the session secret. **Back this folder up.** |
| `DB_PATH` | `$DATA_DIR/sunco-crm.db` | Database file |
| `JWT_SECRET` | generated into `$DATA_DIR/.session-secret` | Session signing secret (min 32 characters). Set it explicitly when hosting in the cloud. |
| `NODE_ENV` | | `production` turns on HTTPS-only cookies |
| `COOKIE_SECURE` | `true` in production | Set `false` only if serving over plain HTTP on a private network |
| `TRUST_PROXY` | `false` | Set `true` when running behind a load balancer/reverse proxy that terminates HTTPS |

## Roles and access

| Role | Sees |
|---|---|
| Salesperson | Only their own enquiries, in the brand + site combinations assigned to them |
| Sales Manager | Every enquiry in their assigned brand + site combinations; can add/disable salespeople in those |
| General Manager | Everything; can add/remove sales managers and change anyone's role |
| Admin (flag) | As GM, plus can create other admins |

Access is granted per brand at a site (e.g. *MG – Caloundra*), not per brand or per site separately. All rules are enforced by the server in `src/lib/scope.js`.

Enquiries are never deleted. Managers can mark one as duplicate/invalid, which hides it from lists and reports but keeps it. Every change is recorded in the audit log.

## API (phase 0)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | `{ username, password, remember }` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | |
| POST | `/api/auth/change-password` | `{ current_password, new_password }` |
| GET | `/api/reference` | Sites, brands, models, used makes/models, sources, lost reasons, assignable people, filtered to the user's access |
| GET | `/api/enquiries` | Filters: `q`, `outcome`, `month`, `location_id`, `brand_id`, `salesperson_id`, `overdue=1`, `due=today`, `include_invalid=1` (managers), `sort`, `limit`, `offset` |
| GET | `/api/enquiries/duplicates` | `phone` / `email`: open enquiries anywhere with the same details |
| GET/POST/PATCH | `/api/enquiries[/:id]` | Create/edit with validation |
| POST | `/api/enquiries/:id/activities` | Comment or log a call/email/SMS/follow-up |
| POST | `/api/enquiries/:id/invalid` | Managers: mark or unmark duplicate/invalid |
| GET/POST/PATCH | `/api/users[/:id]` | Managers/GM: manage users and their brand/site access |
| POST | `/api/users/:id/reset-password` | Issues a temporary password |

All requests that change data must be JSON (`Content-Type: application/json`) from the same site.

## Tests

```bash
npm test
```

## Starting data

`src/seed/data.js` holds the 4 sites, 21 brands, 33 brand-site combinations, model lists, used-car makes, sources and lost reasons. It's loaded once into an empty database; after that everything is managed in the app (Admin screens arrive in phase 4). **The model lists are a best-effort snapshot of the Australian range and need checking before go-live.**
