# Sunco Motors Enquiry Management CRM

Walk-in enquiry tracking for Sunco Motors (Caloundra, Maroochydore, Kingaroy, Hervey Bay), replacing the Excel walk-in workbook.
See [`docs/PLAN.md`](docs/PLAN.md) for the plan and the decisions behind it.

## What it does

- **Today screen:** a big "New walk-in" button, overdue follow-ups, follow-ups due today and today's walk-ins.
- **New walk-in form**, built for a phone in the showroom:
  - Brand and model are picked from lists, never typed. Used cars: just type the make and model (suggestions appear; small typos like "hodna" are matched to Honda and new makes are added automatically), plus an optional stock number.
  - Date, month, salesperson and site fill in automatically. Postcode and phone are checked and tidied.
  - Possible duplicates are flagged as the phone number or email is entered.
- **Enquiries:**
  - Search and filters (open, overdue, due today, this month, sold, lost).
  - Tablets show the list and the selected enquiry side by side; desk PCs show a table like the spreadsheet.
  - On each enquiry: tap to call, SMS or email; log a follow-up and set the next date in one step; mark Sold or Lost (with a reason); comments and a full history.
  - Managers can also reassign, re-open, or mark an enquiry as a duplicate/invalid. Nothing is ever deleted.
- **Approvals:** when a salesperson marks an enquiry Sold or Lost, it waits for a sales manager who covers that brand and site. The manager approves or declines it with a reason, which is kept in the enquiry's history. Until then it stays open and drops out of the overdue lists. Sales managers and the GM close enquiries directly.
- **Light or dark:** the sun/moon button at the top switches between light and dark screens, and Account → Appearance offers Match device, Light or Dark. The choice is remembered on each device.
- **Reports** for a day, a month, year to date or any date range:
  - Conversion (enquiries sold ÷ enquiries), cars sold, and test-drive, trade-in and finance rates, each compared with the previous period.
  - Breakdowns by site, brand, salesperson, model, source, lost reason and postcode.
  - Overdue (escalated) and stale enquiries.
  - Export to Excel (CSV).
  - **Brand trends (general manager only):**
    - Enquiries, test drives and cars sold for any or all brands.
    - Up to five brands share one chart in brand colours. With more, or by choice, each brand gets its own small chart on a shared scale.
    - The current month is shown by day. Choosing more months, up to a year, shows one point per month.
    - Bubbles show each brand's share of enquiries.
- **Team:**
  - The GM adds and removes sales managers and salespeople, and ticks which brands at which sites each person works on.
  - Managers add salespeople within their own brands/sites.
  - Passwords are reset with a one-time temporary password, and a leaver's open enquiries can be moved to someone else.
- **Admin** (GM/admin):
  - Branding: name, colours and logo.
  - Sites and brands: the brand × site grid; adding a brand or turning it on or off at a site.
  - Model lists per brand, used-car makes and models, lost reasons and sources.
  - Email and follow-up settings.
  - Backups: download and restore.
  - Spreadsheet import and the audit log.
- **Email reminders** (once an email account is entered in Admin):
  - Salespeople get their follow-ups each morning.
  - Managers get a morning summary (overdue follow-ups and yesterday's walk-ins) and an end-of-day summary.
  - Admins are alerted if a nightly backup fails.
- **Backups:**
  - an automatic nightly copy of the database (30 daily + 12 monthly kept), plus "Back up now", download and restore;
  - the nightly backup can also be **emailed off-site** as an encrypted `.sunco-backup` file that uploads straight back in (see *If something breaks*).

## Running it

Needs **Node.js 22.13 or newer**. The database is Node's built-in SQLite, so there's nothing else to install.

```bash
npm install
npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran" --email you@example.com
npm start
```

`create-user` asks for the password; it is never typed on the command line. Open http://localhost:3000 and sign in. Everyone else is added from **Team** in the app.

### First-time setup checklist

1. **Admin → Branding:** logo and colours.
2. **Admin → Models:** check each brand's model list. The starting lists are a best-effort snapshot of the Australian range.
3. **Team:** add the sales managers (at least one per site) and tick their brands and sites; they then add their salespeople.
4. **Admin → Import spreadsheet:** bring in the open enquiries from the old workbook.
5. **Admin → Email & settings:** enter the email account details, send a test, and switch reminders on.
6. **Admin → Email & settings → Nightly backup:**
   - Turn on "Email the backup every night".
   - Enter an off-site address and a backup passphrase. **Write the passphrase down and keep it away from the server.**
7. **Admin → Backups:** use "Email" on a backup once to check it arrives. Optionally set `BACKUP_DIR` to another drive or a synced cloud folder.

## If something breaks

Every night the CRM emails an encrypted backup file (`sunco-crm-backup-YYYY-MM-DD-HHMM.sunco-backup`) to the address set in Admin. To get running again:

**If the app still opens:** Admin → Backups → *Restore from a backup file*. Choose the file from the most recent backup email, enter the backup passphrase and type RESTORE.

**If the server is lost or the app won't start:**
1. Set the CRM up on any server (see *Running it*).
2. Save the attachment from the latest backup email onto that server.
3. Run `npm run restore -- sunco-crm-backup-2026-11-08-0200.sunco-backup`, enter the backup passphrase, then `npm start`.
   - If the database is damaged, it is moved aside automatically first.
4. Everyone signs in with their usual username and password.

Backups made by an older version of the app are upgraded automatically when restored. A safety copy of whatever was there before is always saved first.


## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DATA_DIR` | `./data` | Database and session secret. |
| `DB_PATH` | `$DATA_DIR/sunco-crm.db` | Database file |
| `BACKUP_DIR` | `$DATA_DIR/backups` | Where nightly/manual backups are kept on the server. Turn on emailed backups as well, so a copy is off-site. |
| `JWT_SECRET` | generated into `$DATA_DIR/.session-secret` | Session signing secret (min 32 characters). Set it explicitly in the cloud. |
| `NODE_ENV` | | `production` turns on HTTPS-only cookies |
| `COOKIE_SECURE` | `true` in production | Set `false` only when serving over plain HTTP on a private network |
| `TRUST_PROXY` | `false` | Set `true` behind a load balancer/reverse proxy that handles HTTPS |

### Hosting

There are step-by-step guides for both options:

- **[Online](docs/hosting/ONLINE.md) (recommended for four sites and phones on the road):**
  - a small Linux server in Sydney/Melbourne, with Docker and automatic HTTPS;
  - about A$10–A$25 a month.
- **[Internal server](docs/hosting/LOCAL-SERVER.md):**
  - Ubuntu (Docker or a system service) or Windows (NSSM), inside the company network;
  - the other sites connect over the WAN/VPN.

Both use the ready-made files in [`deploy/`](deploy/): `docker-compose.yml`, `Caddyfile` and `.env.example`, plus the `Dockerfile` at the top level. Always run **one** copy of the app against a data folder, because it uses a single SQLite file.

## Training

PowerPoint guides for salespeople and sales managers are in [`docs/training/`](docs/training/).

## Roles and access

| Role | Sees | Can manage |
|---|---|---|
| Salesperson | Only their own enquiries, in the brand + site combinations assigned to them | Their own enquiries |
| Sales Manager | Every enquiry in their brand + site combinations | Salespeople in those brands/sites; reassign, re-open, mark invalid, export |
| General Manager | Everything | Sales managers and salespeople, roles, all Admin settings |
| Admin (flag) | As GM | Other admins, restoring backups |

Access is granted per brand at a site (e.g. *MG – Caloundra*). All rules are enforced by the server (`src/lib/scope.js`).

## Project layout

```
src/
  server.js            start-up, scheduler
  app.js               Express app, security headers, CSRF check, routes
  auth.js              sign-in, sessions, change password, account
  db.js                SQLite, migrations, seed
  migrations/*.sql     schema
  seed/                starting sites, brands, models, lists
  lib/                 permissions (scope), validation, time, settings, audit
  routes/              enquiries, users, reference, reports (+CSV), admin, system (backups, import, email)
  services/            reports, backup, importer, mailer, scheduler
public/                the web app (no build step)
  js/core.js           helpers, router, dialogs
  js/enquiries.js      Today, list, detail, new/edit form
  js/reports.js        reports
  js/admin.js          team, admin, account
  js/main.js           sign-in, navigation
test/                  API tests (node --test)
scripts/create-user.js first admin account
scripts/restore.js     restore from a backup file from the command line
```

## Tests

```bash
npm test
```

## Trial version (no server)

`demo/` builds a single-page trial that runs the real screens in the browser against demo data (changes stay in that browser; email, backups, exports and import are disabled):

```bash
node demo/build.js path/to/demo-data.json trial.html
```

`demo-data.json` is an export of a demo database (sites, brands, models, users, enquiries, activities, settings; no passwords).
