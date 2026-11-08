# Sunco Motors Walk-In CRM — Project Plan

**Status:** Requirements confirmed, ready to build (full build, piloted at Caloundra first). Nothing has been built yet.
**Goal:** Replace the walk-in tracking Excel workbook (one tab per brand, carried over to a new tab each month) with a small CRM built for Sunco Motors. Sales staff need to use it every day, so it has to be quicker than the spreadsheet.

---

## 1. Guiding principles

These decide every design trade-off below. If a feature works against them, it gets cut or simplified.

1. **An enquiry takes under 30 seconds to log, on a phone.** If it's slower than typing into Excel, people will stop using it.
2. **Pick from a list instead of typing.** Brand, department, model, outcome and lost reason are all dropdowns or toggles that admins manage. Free text is limited to the customer's name, postcode, phone, email and comments, and each of those is validated.
3. **The system fills in what it already knows.** Date of entry, month, salesperson (the logged-in user), department, and the brand if the user only sells one brand.
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
| Delete enquiry | ❌ Never. Enquiries are kept permanently. | ❌ | ❌ | ❌ |
| Mark enquiry as *Duplicate/Invalid* (hidden from reports, still kept) | ❌ | ✅ | ✅ | ✅ |
| Download / restore backups | ❌ | ❌ | ✅ download | ✅ download + restore |
| Daily / monthly / yearly reports | Own figures | Team + per-salesperson | Whole dealership | All |
| Export to CSV/Excel | ❌ | ✅ own scope | ✅ | ✅ |
| Add / remove sales managers and assign their brands | ❌ | ❌ | ✅ | ✅ |
| Add / remove salespeople | ❌ | ✅ in own brands/site | ✅ | ✅ |
| Change anyone's role or privileges | ❌ | ❌ | ✅ | ✅ |
| Manage brands, models, locations, lists | ❌ | Models for own brands (optional) | ✅ | ✅ |
| Branding / colours / logo | ❌ | ❌ | ✅ | ✅ |

\*"Admin" can be a flag on a GM account (e.g. you) rather than a separate person. That keeps it to three real roles.

### Scoping

Sunco has **four locations: Caloundra, Maroochydore, Kingaroy and Hervey Bay**, and each one carries its own mix of brands. So the basic unit is a **franchise**: one brand at one location (e.g. *MG – Caloundra*, *MG – Hervey Bay*).

- Admin sets up which brands are sold at which location (the **franchise list**).
- Each user is assigned to **specific franchises**, not to brands and locations separately. That stops a Caloundra MG salesperson from automatically seeing Hervey Bay MG enquiries. It also covers someone who sells MG at Caloundra and LDV at Maroochydore.
- Shortcuts in Admin: "all brands at Kingaroy" (e.g. a site manager) or "Hyundai at every location" (e.g. a brand manager).
- **Salesperson:** sees only enquiries assigned to them, within their franchises.
- **Sales Manager:** sees every enquiry in their franchises (e.g. one site, or one brand across sites). Starting assumption: **at least one sales manager per site**, with more added at any time. Two managers can share a site (e.g. one for Hyundai/Nissan and one for MG/LDV/Chery at Caloundra), and one manager can cover brands at more than one site.
- **General Manager:** sees all four locations.
- This is enforced **on the server** for every request and every live update, not just hidden in the UI.
- On the enquiry form, the **location** defaults to the user's site, and the **brand** dropdown shows only brands sold at that location *and* assigned to the user.

### Login

- Each person gets their own username and password (no shared PIN).
- Sunco doesn't use Google Workspace, so there's no Google sign-in. Logins are the CRM's own: username (or email) and password.
- "Forgot password" sends a reset link by email. Managers/admins can also reset passwords.
- Users stay signed in on their own phone or PC for a set period (e.g. 30 days); shared showroom tablets/PCs can be set to sign out after inactivity.
- A manager or admin can reset a password. Disabling a user keeps all their historical enquiries and lets them be reassigned.

---

## 4. Enquiry fields and keeping data consistent

This is the most important part for usefulness. Reports are only as good as the data going in.

### Fields (matching the current spreadsheet columns)

| # | Spreadsheet column | In the CRM | How it's entered / controlled |
|---|---|---|---|
| 1 | Date of entry | **Date of entry** | Filled in automatically (today's date and time). Managers can back-date if needed. |
| 2 | Current month of the enquiry | **Month** | Worked out automatically from the date. Nobody types it, and there's no carry-over tab: open enquiries simply stay open until sold or lost. |
| 3 | Brand | **Brand** | Dropdown, limited to brands sold at the chosen site and assigned to the user. Auto-selected if there's only one. |
| 4 | Department (e.g. Caloundra, Kingaroy) | **Department / location** | Dropdown of the 4 sites. Defaults to the user's home site. Locked if the user only works at one site. |
| 5 | Customer name | **Customer name** | Text, required. Auto-capitalised ("john smith" → "John Smith"). |
| 6 | Customer postcode | **Postcode** | 4-digit Australian postcode, numbers only, checked for a valid QLD/AU range. Shows the suburb name as a check (e.g. 4551 → Caloundra). |
| 7 | Phone number | **Phone** | Validated and formatted as an Australian mobile/landline (`0412 345 678`). Phone *or* email required. |
| 8 | Email address | **Email** | Format check. Optional if a phone number is given. |
| 9 | Test drove? | **Test drive** | Yes/No toggle. Default No. |
| 10 | Has a trade? | **Trade-in** | Yes/No toggle. Default No. |
| 11 | Financing? | **Finance** | Yes/No toggle. Default No. |
| 12 | Lost enquiry? | **Outcome = Lost** | See *Outcome* below. Requires a lost reason. |
| 13 | Comments | **Comments** | Free text. Each comment is saved with the date and who wrote it, so the history builds up instead of being overwritten. |
| 14 | Sold? | **Outcome = Sold** | See *Outcome* below. Records the sale date. |

**Outcome:** the spreadsheet's separate "Lost" and "Sold" columns become one field with three options: **Open → Sold** or **Open → Lost**. That makes it impossible to tick both, or neither, by mistake.

### Extra fields the CRM adds (kept to a minimum)

| Field | Why | How |
|---|---|---|
| **Salesperson** | Needed for permissions, follow-ups and per-person conversion | Automatically the logged-in user. Managers can reassign. |
| **Model** | Stops over-typing and gives "most-enquired models" reports | Dropdown filtered by brand, managed per brand in Admin. Old models can be retired (hidden from new entries, kept on old ones). For **Used Cars**: make (dropdown) + model + optional stock number. |
| **Next follow-up date** | Drives the reminders | Required while the enquiry is Open. Defaults to tomorrow with one-tap +1 day / +3 days / +1 week. |
| **Lost reason** | Shows *why* enquiries are lost | Required when Outcome = Lost. Dropdown: Price, Finance declined, Bought elsewhere, Not ready, No stock, No contact, Other. |
| **Source** (optional) | Walk-in vs phone vs web | Dropdown, defaults to Walk-in. Can be switched off in Admin if not wanted. |

### Other safeguards
- **Duplicate check:** when a phone number or email is entered, warn if an open enquiry already exists for that customer and show who owns it.
- **Admin-managed lists:** admins can add, rename, reorder and retire every dropdown (brands, models, lost reasons, sources). Values are stored by ID, so renaming a model updates every report without breaking history.

---

## 5. Ease of use (so people actually use it)

### Screens for a salesperson (three screens total)

1. **Today**, the home screen:
   - Large **"+ New Walk-In"** button.
   - **Follow-ups due today** and **overdue** (red), each with tap-to-call / tap-to-SMS / "Done, next follow-up in…".
   - Today's enquiries.
2. **New / Edit Enquiry**: one short form. Required fields: customer name, postcode, phone *or* email, brand, model, next follow-up. Date, month, department and salesperson are filled in automatically, and the test drive / trade / finance toggles default to No. Large touch targets, works one-handed on a phone.
3. **My Enquiries**: searchable list (name, phone, model) with filter chips (Open, This month, Overdue, Sold, Lost, Test drove, Trade, Finance).

### Design decisions that help adoption

- **One web app, laid out for every screen size:**
  - **Phone:** single column, large buttons, bottom navigation, tap-to-call and tap-to-email. Can be added to the home screen like an app (no app store).
  - **Tablet:** two-panel layout (enquiry list on the left, selected enquiry on the right), suits showroom-floor use in portrait or landscape.
  - **Desk PC:** full table view with sortable columns (closest to the spreadsheet feel), keyboard shortcuts (e.g. `N` for new enquiry), and the full reporting dashboards.
  - Tested on iPhone/Android phones, iPad/Android tablets, and Chrome/Edge on Windows.
- Quick-update buttons on each enquiry: *Called*, *No answer*, *Booked test drive*, *Sold*, *Lost*. Each one adds a timestamped note to the activity history automatically.
- Activity history per enquiry (who did what, when) replaces scattered notes cells.
- No mandatory field that salespeople see as busywork. Every required field has to feed a report someone reads.
- Brand colours/logo on the screen so it feels like Sunco's tool, not IT's.

### Rollout tactics (non-technical, equally important)

- **Pilot at Caloundra** (Hyundai, Nissan, MG, Chery, LDV, Jeep, Leapmotor, GAC, JMC, Used Cars) for 2–3 weeks, then adjust before rolling out to Maroochydore, Kingaroy and Hervey Bay. The full system (all sites and brands) is built before the pilot; the other sites are simply switched on afterwards.
- Import all currently open enquiries from the Excel workbook so nobody has to re-enter them.
- Pick a **hard cut-over date** after which the spreadsheet is read-only.
- Managers run the morning meeting from the **Overdue follow-ups** and **Yesterday's walk-ins** screens. If managers use it, salespeople will too.
- A one-page "how to log a walk-in" card, plus a 15-minute walkthrough per team.

---

## 6. Follow-ups and notifications

- Each open enquiry always has a **next follow-up date** (optionally with a time).
- **In-app:** badge count on the Today screen and a red "overdue" state.
- **Email reminders (the main notification channel):**
  - **Salesperson, each morning:** "You have 4 follow-ups today, 2 overdue", with each customer's name, phone, brand/model and a link straight to the enquiry.
  - **Sales manager, each morning:** the team's overdue follow-ups and yesterday's walk-ins for their brands/site.
  - **End-of-day summary** to sales managers and the GM (see §7).
  - **Escalation email** to the manager when a follow-up is overdue by X days.
  - Send times are set in Admin. Each user can be switched on/off for each email.
  - Sent through Sunco's existing email account (SMTP) or a transactional email service, from an address like `crm@suncomotors…`.
- Phone push notifications are left out of v1 (could be added later).
- **Escalation:** if a follow-up is overdue by X days (admin setting, e.g. 3), it shows on the manager's dashboard and triggers the escalation email.
- **Stale enquiries:** an open enquiry with no activity for Y days (e.g. 30/60) prompts "close as Lost?" so the pipeline stays clean without a month-end clear-out.

---

## 7. Reporting and dashboards

All reports respect the user's scope (a salesperson sees their own, a manager sees their team, the GM sees everything) and can be filtered by **brand, location, salesperson, source, and date range**.

### End-of-day summary (the "daily report")
- Walk-ins today by brand and salesperson.
- Test drives today, sales today.
- Follow-ups completed vs due vs missed.
- Automatic email to sales managers and the GM at close of business (time set in Admin).

### Month-to-date and year-to-date
- **Enquiries**, **test drives**, **sales**, and **lost**, broken down by location, brand, salesperson, source and model.
- **Location comparison** (GM view): the four sites side by side, and the same brand compared across sites.
- **Conversion rate = enquiries sold ÷ enquiries.** Example: a salesperson with 60 enquiries who has sold 20 of them has a **33% conversion rate**. Shown per salesperson, sales manager team, brand, location and the whole dealership, for the month and the year, compared with the same period last month/year.
- **Test drive, trade-in and finance rates:** the % of enquiries with each ticked, plus conversion for test-drive vs no-test-drive enquiries.
- **Postcode map/table:** where customers come from, by site and brand (useful for marketing).
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
| Login | Username/password | Username/password (no Google Workspace needed) |
| Cost | Hardware you may already have; ~$0/month | Typically low (tens of dollars/month at this scale) |
| Backups | Must be set up (nightly copy to another drive or cloud) | Automatic managed backups, plus the CRM's own backups (see below) |
| Maintenance | Someone on site restarts or updates it | Mostly hands-off |
| Risk | PC failure or power outage = downtime | Depends on internet access |

**Recommendation: option B (Google Cloud).** With four sites spread from Caloundra to Hervey Bay, one central server that all of them reach over HTTPS is simpler and more reliable than a server at one site plus VPN links to the other three. Development and the pilot can still run locally first. The database layer will support both SQLite (local) and Postgres (cloud) so moving between them is a configuration change.

> **Note on Google:** Google Cloud only needs an ordinary Google account for billing. It does **not** require Google Workspace. Google Sheets/Apps Script as the back end is not recommended: it brings back the over-typing and lack of per-row permissions. If preferred, the same app runs on any Australian-region cloud host (e.g. AWS Sydney, Azure Australia East, or an Australian VPS) instead.

### Backups (all enquiries are kept permanently)
- **Nothing is ever deleted.** Enquiries can only be closed (Sold/Lost) or marked *Duplicate/Invalid*, which hides them from reports but keeps them. Every change is recorded in the audit log, so the earlier value can always be seen.
- **Automatic nightly backup** of the whole database, kept for 30 daily + 12 monthly copies, stored separately from the server (e.g. a cloud storage bucket, or another drive if hosted locally).
- **"Back up now" button** in Admin that downloads a full backup file, plus a **full Excel/CSV export** of every enquiry for a human-readable copy.
- **Restore** from any backup in Admin (admin only, with a confirmation step). Restores are tested as part of go-live.
- **Backup status** shown in Admin (last successful backup, size). If a nightly backup fails, an email alert goes to the admin.

### Privacy and security (customer data)
- Customer names, postcodes, phones and emails are personal information under the Australian Privacy Act. We will use HTTPS only, hashed passwords, per-user logins, no shared PIN, an audit log of edits/exports/restores, encrypted backups, and data stored in Australia.
- **Retention:** all enquiries are kept permanently (your decision). If a customer asks to be removed, the GM/admin can blank out their contact details while keeping the enquiry for reporting.

---

## 9. Admin screen

- **Branding:** dealership name, logo upload, primary/accent colours (live preview), optional per-brand colour for badges.
- **Brands:** add, rename, reorder, deactivate. Each brand has its models (and optional variants).
- **Locations:** add, rename, deactivate sites.
- **Franchises:** a location × brand grid. Tick which brands are sold at each location. Turning one off hides it from new enquiries and keeps its history.
- **Sales managers:** add or remove sales managers, choose their site(s) and tick the brands they manage. Removing a manager doesn't delete anything: their salespeople and enquiries stay, and can be moved to another manager.
- **Users:** add/disable, set role, set home location, assign franchises (with "whole location" / "whole brand" shortcuts), reset password, reassign all of a departing salesperson's open enquiries in one action.
- **Lists:** sources, lost reasons, status labels (labels only; the pipeline logic stays fixed).
- **Settings:** follow-up escalation days, stale-enquiry days, email send times, email sender settings, time zone (Australia/Brisbane).
- **Backups:** last backup status, "Back up now", download, restore.
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
customers      (id, name, postcode, phone, email, created_at)        -- enables duplicate detection
enquiries      (id, customer_id, franchise_id, model_id, variant_id,
                salesperson_id, source_id, lost_reason_id,
                test_drive, trade_in, finance, outcome[open|sold|lost], sold_at, next_followup_at,
                created_at, closed_at, created_by)
activities     (id, enquiry_id, user_id, type[note|call|sms|status_change|followup_done],
                body, created_at)
settings       (key, value)                                 -- branding, thresholds
audit_log      (id, user_id, action, entity, entity_id, before, after, created_at)
```

**Conversion (agreed):** enquiries sold ÷ enquiries. For a month, it's counted against the enquiries **entered that month** (so October's figure keeps rising if October enquiries sell in November). A separate **"cars sold this month"** count, by sale date, is shown next to it so month-end sales totals still line up.

---

## 11. Delivery phases

| Phase | Scope | Outcome |
|---|---|---|
| **0. Foundations** (~1 week) | New data model, migrations, proper auth (no hard-coded secrets/PIN), roles + brand/location scoping enforced server-side, seed brands/models/locations | Secure base to build on |
| **1. Core logging** (~1–2 weeks) | Today screen, New/Edit Enquiry form with locked-down dropdowns, My Enquiries list, duplicate check, activity history, phone / tablet / desktop layouts | Salespeople can replace the spreadsheet for new walk-ins |
| **2. Follow-ups** (~1 week) | Next-follow-up logic, overdue states, quick-action buttons, email reminders and digests, manager escalation | Nothing falls through the cracks |
| **3. Reporting** (~1 week) | Daily summary, MTD/YTD dashboards, conversion/test-drive/lost-reason reports, CSV/Excel export, end-of-day email | Management visibility without month-end tabs |
| **4. Admin & branding** (~1 week) | Full admin screens (brands, models, locations, sales managers, users, lists, branding, settings, audit log, backups & restore) | Self-service changes, no developer needed |
| **5. Migration & pilot** (~1–2 weeks) | Excel import tool (open enquiries + optional history, each brand tab mapped to its franchise), pilot at **Caloundra** (all 10 Caloundra brands), fixes from feedback | Proven with real users |
| **6. Go-live** | Hosting setup, backup + restore test, training, switch on Maroochydore, Kingaroy and Hervey Bay, spreadsheet cut-over date | Whole dealership (all 4 sites, 21 brands) on the CRM |

Timelines are rough working estimates and depend on answers to §12.

---

## 12. Questions to answer before building

1. **Locations and brands:** ✅ Confirmed. 4 locations, 21 brands, 33 brand-location combinations (see §9).
2. **People:** ✅ Assume at least one sales manager per site; more can be added in Admin with their own brands. Exact numbers not needed yet.
3. **Hosting / login:** ✅ No Google Workspace, so the CRM has its own logins. Cloud hosting recommended for 4-site access (see §8); final choice of provider before go-live.
4. **Devices:** ✅ Phone, tablet and desk PC, all equally supported (see §5).
5. **Spreadsheet columns:** ✅ Confirmed (see §4). A sample copy with customer details removed would still help when building the import, to check the date and Yes/No formats.
6. **Conversion definition:** ✅ Enquiries sold ÷ enquiries (e.g. 20 sold from 60 = 33%), counted against the month the enquiry was entered (see §10).
7. **Used cars:** do you want to link to a stock number/stock list, or just make + model?
8. **Notifications:** ✅ Email reminders. **Still needed before go-live:** which email account/domain the reminders should be sent from.
9. **Rollout scope:** ✅ Full build for all 4 sites and 21 brands; pilot at Caloundra first.
10. **Brand spelling:** ✅ "GMSV" and "GWM" exactly. "Chery" and "Leapmotor" assumed (renameable in Admin).
11. **Data retention:** ✅ Keep all enquiries permanently, with nightly backups and manual backup/restore (see §8).

---

## 13. Out of scope for v1 (possible later)

- Integration with the DMS (dealer management system), manufacturer lead portals, or website lead forms.
- SMS sending from the app (v1 uses tap-to-SMS on the salesperson's own phone).
- Stock/inventory management.
- Commission or deal desking.
