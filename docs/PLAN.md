# Sunco Motors Walk-In CRM — Project Plan

**Status:** Draft for review. Nothing in this plan has been built yet.
**Goal:** Replace the walk-in tracking Excel workbook (one tab per brand, carried over to a new tab each month) with a small CRM built for Sunco Motors. Sales staff need to use it every day, so it has to be quicker than the spreadsheet.

---

## 1. Guiding principles

These decide every design trade-off below. If a feature works against them, it gets cut or simplified.

1. **An enquiry takes under 30 seconds to log, on a phone.** If it's slower than typing into Excel, people will stop using it.
2. **Pick from a list instead of typing.** Brand, model, source, status, lost reason and salesperson are all dropdowns that admins manage. Free text is limited to the customer's name, phone, email and notes.
3. **The system fills in what it already knows.** Date, time, salesperson (the logged-in user), location, and the brand if the user only sells one brand.
4. **Everyone sees only what they need.** A salesperson sees their own enquiries for their own brands and locations. Managers see their team. The GM sees everything.
5. **No month-end carry-over.** All enquiries live in one list. "This month" and "previous months" are filters, so open enquiries never get lost between tabs.
6. **Admins change settings, not developers.** Brands, models, users, roles, locations, colours and logo are all edited in the Admin screen.

---

## 2. What we have today (current repo)

The repo already has a working prototype (`server.js` + `public/index.html`): Node/Express, SQLite, Socket.IO live updates, JWT login, an enquiry form, a dashboard and CSV export. It's a useful starting point, but it has gaps that line up with what this plan needs to fix:

| Area | Current prototype | Problem |
|---|---|---|
| Brands / salespeople | Hard-coded in the HTML (MG, LDV, Jeep, Volvo, Leapmotor, Polestar, Used) | Can't add or remove them without editing code; doesn't match your brand list |
| Model | Free-text box | This is the data-consistency problem ("CX5", "CX-5", "cx 5") |
| Permissions | Only `admin` / `user`; every logged-in user sees and edits **every** enquiry | No brand or location scoping |
| Live updates | Every new or changed enquiry is broadcast to **all** connected clients | Leaks enquiries across teams |
| Security | Default `admin/admin123`, PIN `154558` and the JWT secret are hard-coded in source and printed to the console | Has to change before real customer data goes in |
| Month handling | "Archive" flag | Fine to replace with status + date filters |
| Follow-ups | None | Core requirement |

**Recommendation:** keep the stack (Node + Express + SQLite + plain HTML/JS, or a light framework). Rebuild the data model and permissions properly rather than patching the prototype, and reuse its UI pieces where they fit.

---

## 3. Users and permissions

### Roles

| Capability | Salesperson | Sales Manager | General Manager | Admin* |
|---|---|---|---|---|
| Log a new enquiry | ✅ own brands/locations | ✅ team's brands/locations | ✅ all | ✅ |
| View enquiries | Own only | All in assigned brands + locations | All | All |
| Edit enquiry | Own only | Team's | All | All |
| Reassign enquiry to another salesperson | ❌ | ✅ within team | ✅ | ✅ |
| Delete enquiry | ❌ | ❌ (can mark "Duplicate/Invalid") | ✅ | ✅ |
| Daily / monthly / yearly reports | Own figures | Team + per-salesperson | Whole dealership | All |
| Export to CSV/Excel | ❌ | ✅ own scope | ✅ | ✅ |
| Manage users and privileges | ❌ | Add/disable salespeople in own brands (optional) | ✅ | ✅ |
| Manage brands, models, locations, lists | ❌ | Models for own brands (optional) | ✅ | ✅ |
| Branding / colours / logo | ❌ | ❌ | ✅ | ✅ |

\*"Admin" can be a flag on a GM account (e.g. you) rather than a separate person. That keeps it to three real roles.

### Scoping

Sunco has **four locations: Caloundra, Maroochydore, Kingaroy and Hervey Bay**, and each one carries its own mix of brands. So the basic unit is a **franchise**: one brand at one location (e.g. *MG – Caloundra*, *MG – Hervey Bay*).

- Admin sets up which brands are sold at which location (the **franchise list**).
- Each user is assigned to **specific franchises**, not to brands and locations separately. That stops a Caloundra MG salesperson from automatically seeing Hervey Bay MG enquiries. It also covers someone who sells MG at Caloundra and LDV at Maroochydore.
- Shortcuts in Admin: "all brands at Kingaroy" (e.g. a site manager) or "Hyundai at every location" (e.g. a brand manager).
- **Salesperson:** sees only enquiries assigned to them, within their franchises.
- **Sales Manager:** sees every enquiry in their franchises (e.g. one site, or one brand across sites).
- **General Manager:** sees all four locations.
- This is enforced **on the server** for every request and every live update, not just hidden in the UI.
- On the enquiry form, the **location** defaults to the user's site, and the **brand** dropdown shows only brands sold at that location *and* assigned to the user.

### Login

- Each person gets their own username and password (no shared PIN).
- Optional: "Sign in with Google" if Sunco uses Google Workspace (see §8).
- A manager or admin can reset a password. Disabling a user keeps all their historical enquiries and lets them be reassigned.

---

## 4. Keeping data consistent

This is the most important part for usefulness. Reports are only as good as the data going in.

| Field | How it's controlled |
|---|---|
| **Brand** | Dropdown, limited to the user's assigned brands. Auto-selected if they have only one. |
| **Model** | Dropdown filtered by the chosen brand. Managed per brand in Admin. Models can be marked **inactive** (hidden from new entries, kept on old ones for reporting). |
| **Variant / trim** (optional) | Optional second dropdown under model, e.g. "MG ZS → Excite / Essence". |
| **Used cars** | Treated as a brand. Model is replaced by **Make** (dropdown) + **Model** (short text or picked from a list) + optional stock number. |
| **Source** | Dropdown: Walk-in, Phone, Web lead, Referral, Repeat customer, Other. Admin-managed. |
| **Status** | Fixed pipeline: New → Contacted → Test drive → Negotiating → Sold / Lost. |
| **Lost reason** | Required when status = Lost. Dropdown: Price, Finance declined, Bought elsewhere, Not ready, No stock, No contact, Other (+ note). |
| **Next follow-up date** | Required while an enquiry is open. Defaults to tomorrow with one-tap options (+1d, +3d, +1w). |
| **Phone** | Formatted and validated as an Australian mobile/landline. |
| **Email** | Format check. Optional. |
| **Duplicate check** | When a phone number or email is entered, warn if an open enquiry already exists for that customer and show who owns it. |
| **Trade-in / finance** | Yes/No toggles (cheap to capture, useful in reports). |

Admins can add, rename, reorder and deactivate every dropdown list. Values are stored by ID, so renaming "Leapmotor C10" to "Leapmotor C10 Design" updates every report without breaking history.

---

## 5. Ease of use (so people actually use it)

### Screens for a salesperson (three screens total)

1. **Today**, the home screen:
   - Large **"+ New Walk-In"** button.
   - **Follow-ups due today** and **overdue** (red), each with tap-to-call / tap-to-SMS / "Done, next follow-up in…".
   - Today's enquiries.
2. **New / Edit Enquiry**: one short form. Required fields: customer name, phone *or* email, brand, model, source, next follow-up. Everything else is optional or defaulted. Large touch targets, works one-handed on a phone.
3. **My Enquiries**: searchable list (name, phone, model) with filter chips (Open, This month, Overdue, Sold, Lost).

### Design decisions that help adoption

- **Mobile-first web app** that can be "installed" on a phone home screen (PWA). No app store.
- Quick-update buttons on each enquiry: *Called*, *No answer*, *Booked test drive*, *Sold*, *Lost*. Each one adds a timestamped note to the activity history automatically.
- Activity history per enquiry (who did what, when) replaces scattered notes cells.
- No mandatory field that salespeople see as busywork. Every required field has to feed a report someone reads.
- Brand colours/logo on the screen so it feels like Sunco's tool, not IT's.

### Rollout tactics (non-technical, equally important)

- Pilot with one brand team for 1–2 weeks, then adjust before rolling out to the rest.
- Import all currently open enquiries from the Excel workbook so nobody has to re-enter them.
- Pick a **hard cut-over date** after which the spreadsheet is read-only.
- Managers run the morning meeting from the **Overdue follow-ups** and **Yesterday's walk-ins** screens. If managers use it, salespeople will too.
- A one-page "how to log a walk-in" card, plus a 15-minute walkthrough per team.

---

## 6. Follow-ups and notifications

- Each open enquiry always has a **next follow-up date** (optionally with a time).
- **In-app:** badge count on the Today screen and a red "overdue" state.
- **Browser/phone push notifications** (PWA) at a set time each morning: "You have 4 follow-ups today, 2 overdue."
- **Email digest** (optional), via the dealership's email or Gmail:
  - Salesperson: daily list of follow-ups due.
  - Manager: daily summary of the team's overdue follow-ups and yesterday's walk-ins.
- **Escalation:** if a follow-up is overdue by X days (admin setting, e.g. 3), it shows on the manager's dashboard.
- **Stale enquiries:** an open enquiry with no activity for Y days (e.g. 30/60) prompts "close as Lost?" so the pipeline stays clean without a month-end clear-out.

---

## 7. Reporting and dashboards

All reports respect the user's scope (a salesperson sees their own, a manager sees their team, the GM sees everything) and can be filtered by **brand, location, salesperson, source, and date range**.

### End-of-day summary (the "daily report")
- Walk-ins today by brand and salesperson.
- Test drives today, sales today.
- Follow-ups completed vs due vs missed.
- Optional automatic email to managers/GM at close of business.

### Month-to-date and year-to-date
- **Enquiries**, **test drives**, **sales**, and **lost**, broken down by location, brand, salesperson, source and model.
- **Location comparison** (GM view): the four sites side by side, and the same brand compared across sites.
- **Conversion rate** = sold ÷ enquiries (definition agreed with management, see §10). Shown for the month and the year, with the same period last month/year for comparison.
- **Test-drive rate** and **test-drive → sale rate**.
- **Lost reasons** breakdown.
- **Follow-up compliance**: % of follow-ups done on time, per salesperson.
- **Most-enquired models** per brand.

### Exports
- CSV/Excel export of any filtered view, for anyone who still wants to work in a spreadsheet.

---

## 8. Hosting options

The app is built once and can run in either of these setups. Only configuration changes.

| | **A. Local server at the dealership** | **B. Google Cloud (recommended if staff need access from more than one site or off-site)** |
|---|---|---|
| Where it runs | A small PC/mini-server or NAS on the dealership network | Google Cloud Run (app) + Cloud SQL Postgres or a managed database |
| Access | Inside the dealership Wi-Fi/network; multi-site needs a VPN or a secure tunnel (e.g. Tailscale / Cloudflare Tunnel) | Any device with internet, over HTTPS |
| Login | Username/password | Username/password **and/or** Google sign-in (restricted to `@sunco…` Workspace accounts) |
| Cost | Hardware you may already have; ~$0/month | Typically low (tens of dollars/month at this scale) |
| Backups | Must be set up (nightly copy to another drive or cloud) | Automatic managed backups |
| Maintenance | Someone on site restarts or updates it | Mostly hands-off |
| Risk | PC failure or power outage = downtime | Depends on internet access |

**Recommendation: option B (Google Cloud).** With four sites spread from Caloundra to Hervey Bay, one central server that all of them reach over HTTPS is simpler and more reliable than a server at one site plus VPN links to the other three. Development and the pilot can still run locally first. The database layer will support both SQLite (local) and Postgres (cloud) so moving between them is a configuration change.

> "Google API" note: Google Sheets/Apps Script could technically be the backend, but it brings back the problems you're trying to escape (no real permissions per row, easy to over-type, slow with many users). Google Cloud hosting + Google sign-in gives you the "Google" convenience without those limits.

### Privacy and security (customer data)
- Customer names, phones and emails are personal information under the Australian Privacy Act. We will use HTTPS only, hashed passwords, per-user logins, no shared PIN, an audit log of edits/deletes/exports, and automatic backups.
- Admin setting for data retention (e.g. anonymise Lost enquiries after N years).

---

## 9. Admin screen

- **Branding:** dealership name, logo upload, primary/accent colours (live preview), optional per-brand colour for badges.
- **Brands:** add, rename, reorder, deactivate. Each brand has its models (and optional variants).
- **Locations:** add, rename, deactivate sites.
- **Franchises:** a location × brand grid. Tick which brands are sold at each location. Turning one off hides it from new enquiries and keeps its history.
- **Users:** add/disable, set role, set home location, assign franchises (with "whole location" / "whole brand" shortcuts), reset password, reassign all of a departing salesperson's open enquiries in one action.
- **Lists:** sources, lost reasons, status labels (labels only; the pipeline logic stays fixed).
- **Settings:** follow-up escalation days, stale-enquiry days, daily email send time, time zone.
- **Audit log:** who changed what, and when.

### Initial setup (seeded, all editable later)
**Locations:** Caloundra, Maroochydore, Kingaroy, Hervey Bay.
**Brands (21):** Audi, Chery, Ford, GAC, Geely, GMSV, GWM, Honda, Hyundai, Isuzu, Jeep, JMC, Kia, LDV, Leapmotor, MG, Mitsubishi, Nissan, Volvo, XPeng, Used Cars.
Each brand will be seeded with its current Australian model line-up for you to check and correct before go-live. Models belong to the brand, so they're shared across all locations that sell it.
**Franchises (brand × location), 33 in total:**

| Location | Brands |
|---|---|
| **Caloundra** (10) | Hyundai, Nissan, MG, Chery, LDV, Jeep, Leapmotor, GAC, JMC, Used Cars |
| **Maroochydore** (9) | Hyundai, Nissan, Audi, MG, LDV, GMSV, Volvo, GAC, Used Cars |
| **Kingaroy** (7) | Hyundai, Nissan, Ford, Mitsubishi, Geely, GWM, Used Cars |
| **Hervey Bay** (7) | Nissan, Isuzu, Honda, Kia, XPeng, GWM, Used Cars |

Brands at more than one site share one model list (e.g. Nissan's models are set up once and used at all four sites). Used Cars runs at every location.

### Adding and removing brands (Admin)
This is only a starting setup. Everything here can be changed in the Admin portal without a developer:
- **Add a brand:** enter the name and colour, tick the locations that sell it, add its models. It shows up in the enquiry form for users assigned to it straight away.
- **Add a brand to another site:** tick the box in the location × brand grid.
- **Remove a brand (or remove it from one site):** switch it to *inactive*. It disappears from new enquiries and user assignments, but its past enquiries and reports are kept. Hard delete is only allowed for a brand that has never had an enquiry (e.g. a typo).
- **Models:** add, rename, reorder or retire per brand at any time.

---

## 10. Data model (simplified)

```
locations      (id, name, active)
brands         (id, name, colour, sort_order, active)
models         (id, brand_id, name, sort_order, active)
variants       (id, model_id, name, active)                -- optional
users          (id, name, username, email, password_hash, role, active, is_admin)
franchises     (id, location_id, brand_id, active)          -- which brands each site sells
users          += home_location_id
user_franchises(user_id, franchise_id)                      -- what each user can see/log
lookup_values  (id, list_type[source|lost_reason], label, sort_order, active)
customers      (id, name, phone, email, created_at)        -- enables duplicate detection
enquiries      (id, customer_id, franchise_id, model_id, variant_id,
                salesperson_id, source_id, status, lost_reason_id,
                test_drive, trade_in, finance, next_followup_at,
                created_at, closed_at, created_by)
activities     (id, enquiry_id, user_id, type[note|call|sms|status_change|followup_done],
                body, created_at)
settings       (key, value)                                 -- branding, thresholds
audit_log      (id, user_id, action, entity, entity_id, before, after, created_at)
```

**Decisions needed (see §12):** what counts as a "conversion" (sold ÷ all enquiries, or ÷ enquiries with a test drive?), and whether a sale is counted in the month the enquiry came in or the month it sold. Recommendation: show **both** "sold this month" (by sale date) and "conversion of this month's enquiries" (by enquiry date).

---

## 11. Delivery phases

| Phase | Scope | Outcome |
|---|---|---|
| **0. Foundations** (~1 week) | New data model, migrations, proper auth (no hard-coded secrets/PIN), roles + brand/location scoping enforced server-side, seed brands/models/locations | Secure base to build on |
| **1. Core logging** (~1–2 weeks) | Today screen, New/Edit Enquiry form with locked-down dropdowns, My Enquiries list, duplicate check, activity history, mobile/PWA layout | Salespeople can replace the spreadsheet for new walk-ins |
| **2. Follow-ups** (~1 week) | Next-follow-up logic, overdue states, quick-action buttons, push + email digests, manager escalation | Nothing falls through the cracks |
| **3. Reporting** (~1 week) | Daily summary, MTD/YTD dashboards, conversion/test-drive/lost-reason reports, CSV/Excel export, end-of-day email | Management visibility without month-end tabs |
| **4. Admin & branding** (~1 week) | Full admin screens (brands, models, users, locations, lists, branding, settings, audit log) | Self-service changes, no developer needed |
| **5. Migration & pilot** (~1–2 weeks) | Excel import tool (open enquiries + optional history, each brand tab mapped to its franchise), pilot at one location or with one brand team, fixes from feedback | Proven with real users |
| **6. Go-live** | Hosting setup (local or Google Cloud), backups, training, spreadsheet cut-over date | Whole dealership on the CRM |

Timelines are rough working estimates and depend on answers to §12.

---

## 12. Questions to answer before building

1. **Locations and brands:** ✅ Confirmed. 4 locations, 21 brands, 33 brand-location combinations (see §9).
2. **People:** roughly how many salespeople and managers? Do any salespeople sell more than one brand? Do managers cover several brands?
3. **Hosting:** do staff need access from outside the dealership (home, other sites)? Does Sunco use **Google Workspace** (for Google sign-in) or Microsoft 365?
4. **Devices:** will staff mostly use their phones, desk PCs or showroom tablets?
5. **Spreadsheet columns:** please share a copy of the current workbook (customer details can be removed). We need the exact columns to match and to build the import.
6. **Conversion definition:** sold ÷ enquiries, or sold ÷ test drives? Counted by enquiry month or sale month? (We can show both.)
7. **Used cars:** do you want to link to a stock number/stock list, or just make + model?
8. **Notifications:** email, phone push, or both? Should managers get a daily end-of-day email automatically?
9. **Rollout scope:** all 21 brands are set up from day one. Should the pilot and first rollout cover only the Caloundra brands you manage directly (Hyundai, Nissan, GAC, JMC, Leapmotor, Jeep, Chery, LDV, MG, Used Cars), with the other sites' managers brought on afterwards?
10. **Brand spelling:** confirm display names "Chery", "Leapmotor", "GMSV" and "GWM" (or "GWM Haval"). Any can be renamed in Admin.
11. **Data retention:** how long should customer details be kept on Lost enquiries?

---

## 13. Out of scope for v1 (possible later)

- Integration with the DMS (dealer management system), manufacturer lead portals, or website lead forms.
- SMS sending from the app (v1 uses tap-to-SMS on the salesperson's own phone).
- Stock/inventory management.
- Commission or deal desking.
