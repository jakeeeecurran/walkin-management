# Hosting the CRM online

This guide puts the **Sunco Motors Enquiry Management CRM** on a small cloud server in Australia, at an address like `https://crm.suncomotors.com.au`. Staff can then use it from any site, at home or on their phone, with no VPN.

> **Want it kept inside the company network instead?** See [LOCAL-SERVER.md](LOCAL-SERVER.md).

---

## 1. Why this setup

- **One small Linux server (a "VPS") in Sydney or Melbourne.** Customer data stays in Australia, and pages are fast from the Sunshine Coast and Wide Bay.
- **Docker + Caddy**, using the files in the `deploy/` folder. Caddy gets and renews the HTTPS certificate on its own.
- **One server, one copy of the app.** The CRM keeps its data in one database file on the server's disk. That is why "serverless" hosts such as Vercel and Netlify **won't work**: they have no permanent disk.

### Cost

Roughly **A$10–A$25 a month** for the server, plus about A$2–A$5 a month for the provider's automatic backups. Any of these is fine:

| Provider | Australian region | Suggested size |
|---|---|---|
| DigitalOcean | Sydney (SYD1) | Basic Droplet, 2 GB RAM / 1 vCPU, add *Backups* |
| Vultr | Sydney / Melbourne | Cloud Compute, 2 GB RAM |
| AWS Lightsail | Sydney (ap-southeast-2) | 2 GB instance, add automatic snapshots |
| Microsoft Azure | Australia East | B1ms VM (good if you already have an Azure tenant) |
| Binary Lane | Brisbane / Sydney | 2 GB VPS (Australian-owned) |

Choose **Ubuntu 24.04 LTS** as the operating system.

---

## 2. What you need before starting

1. **A domain you control,** e.g. `suncomotors.com.au`, and access to its DNS settings. Your web or IT provider manages this.
2. **An email account** the CRM can send from, with SMTP details. For Microsoft 365: `smtp.office365.com`, port 587, and Authenticated SMTP turned on for that mailbox.
3. About an hour, and someone comfortable typing commands into a terminal.

---

## 3. Step by step

### 3.1 Create the server

In your provider's control panel, create the server:

- Ubuntu 24.04, Sydney or Melbourne region, 2 GB RAM.
- **Add an SSH key** rather than a password, if offered.
- **Turn on the provider's automatic backups or snapshots.**

Note the server's **public IP address**, e.g. `203.0.113.25`.

### 3.2 Point the web address at it

In the DNS settings for your domain, add a record:

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `crm` | `203.0.113.25` (your server's IP) | 300 |

That makes `crm.suncomotors.com.au` point to the server. It can take a few minutes to work.

### 3.3 Connect and secure the server

From a PC (Windows Terminal, PowerShell or macOS Terminal):

```bash
ssh root@203.0.113.25
```

Then, on the server:

```bash
apt update && apt upgrade -y
apt install -y unattended-upgrades ufw git
dpkg-reconfigure -plow unattended-upgrades       # choose Yes: automatic security updates

ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable
```

### 3.4 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 3.5 Get the CRM

```bash
git clone https://github.com/jakeeeecurran/walkin-management.git /opt/sunco-crm
cd /opt/sunco-crm/deploy
```

The repository is private. Git asks for a GitHub username and a personal access token with read access.

### 3.6 Settings

```bash
cp .env.example .env
nano .env
```

```ini
CRM_DOMAIN=crm.suncomotors.com.au
JWT_SECRET=<paste the output of: openssl rand -hex 32>
BACKUP_PATH=./backups
```

Save with Ctrl+O, Enter, then Ctrl+X. Then create the backup folder. The app runs as user ID 1000 inside its container.

```bash
mkdir -p backups && chown 1000:1000 backups
```

Leave the `Caddyfile` as it is. Online, Caddy gets a real certificate from Let's Encrypt, and you do **not** add `tls internal`.

### 3.7 Start it

```bash
docker compose up -d --build
docker compose ps
```

After a minute, both services should show as running, and `crm` as *healthy*. Check in a browser: `https://crm.suncomotors.com.au/api/health` should show `{"ok":true}` with a padlock.

### 3.8 Create the first admin account

```bash
docker compose exec crm npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran" --email you@suncomotors.com.au
```

Enter a strong password twice. Nothing shows while typing. Then sign in at `https://crm.suncomotors.com.au`.

---

## 4. Set it up in the app

Work through the checklist in the main [README](../../README.md#first-time-setup-checklist):

1. **Admin → Sites & brands** and **Models:** check the brands at each site and each brand's model list.
2. **Team:** add the sales managers (at least one per site) and tick their brands. They then add their salespeople. Each person gets a temporary password.
3. **Admin → Email & settings:**
   - Enter the SMTP details and set **CRM web address** to `https://crm.suncomotors.com.au`, so links in emails work.
   - Click *Send test*, then turn on the reminders.
4. **Admin → Email & settings → Nightly backup:**
   - Turn on **Email the backup every night**.
   - Send it to a mailbox you check, e.g. a shared IT or admin mailbox.
   - Set a **backup passphrase**. Write it down and keep it somewhere safe. Without it, emailed backups can't be opened.
5. **Admin → Backups:** click *Email* on a backup once and confirm it arrives.

Tell staff to add the CRM to their phone's home screen:

- **iPhone:** in Safari, tap *Share → Add to Home Screen*.
- **Android:** in Chrome, open the menu and tap *Add to Home screen*.

---

## 5. Keeping it safe

| Area | What's in place / what to do |
|---|---|
| **HTTPS** | Automatic. Caddy renews the certificate before it expires. |
| **Passwords** | Stored hashed. Repeated failed sign-ins are rate-limited. Everyone has their own login. Disable leavers from **Team** the same day. |
| **Server updates** | Security updates install automatically (step 3.3). Reboot occasionally from the provider's panel, or with `reboot`. |
| **Server access** | Use SSH keys. Don't share the root login. Give your IT provider their own key. |
| **Data location** | Keep the server in an Australian region. |
| **Customer data** | If a customer asks to be removed, a general manager can blank their details and keep the sales record. On the enquiry, open the ··· menu and choose *Remove personal details*. |

---

## 6. Backups: three layers

1. **Nightly copy on the server.** Automatic, at 2:00 am Queensland time. 30 daily and 12 monthly copies are kept in `deploy/backups`.
2. **Emailed encrypted backup.** Every night, to the mailbox you chose. This is your copy if the server or the provider account is lost.
3. **Provider snapshots/backups.** A whole-server copy, turned on in step 3.1.

### If the server is lost: rebuild and restore (about 30 minutes)

1. Follow steps 3.1–3.7 on a new server. Point the DNS record at its new IP.
2. Upload the latest backup email attachment to the server's `deploy/backups/` folder. For example, from your PC:

   ```bash
   scp sunco-crm-backup-2026-11-08-0200.sunco-backup root@<new-ip>:/opt/sunco-crm/deploy/backups/
   ```

3. Restore it, enter the passphrase, then restart:

   ```bash
   cd /opt/sunco-crm/deploy
   docker compose exec crm npm run restore -- /backups/sunco-crm-backup-2026-11-08-0200.sunco-backup
   docker compose restart crm
   ```

4. Everyone signs in with their usual username and password.

**If the app still opens,** restore from *Admin → Backups → Restore from a backup file* instead.

**Test this once a quarter** on a spare server or PC. A backup is only good if it restores.

---

## 7. Updating to a new version

```bash
cd /opt/sunco-crm && git pull
cd deploy && docker compose up -d --build
```

Click **Back up now** in Admin → Backups first. Database changes are applied automatically when the app starts. Staff may need to refresh their browser once.

---

## 8. Useful commands

Run these from `/opt/sunco-crm/deploy`.

| Task | Command |
|---|---|
| See if it's running | `docker compose ps` |
| Live logs | `docker compose logs -f crm` |
| Restart the CRM | `docker compose restart crm` |
| Stop everything | `docker compose down` (data is kept) |
| Start again | `docker compose up -d` |
| Reset a forgotten admin password | Another admin uses *Team → Edit → Reset password*. If no admin can sign in, create a new admin with `create-user` (step 3.8) and use a different username. |
| Disk space | `df -h` and `du -sh backups` |

---

## 9. Troubleshooting

| Problem | Check |
|---|---|
| Browser can't reach the site | Does `ping crm.suncomotors.com.au` show the server IP? Is the firewall open (`ufw status`)? |
| Certificate error straight after setup | DNS hadn't updated when Caddy started. Wait 10 minutes, then run `docker compose restart caddy`. `docker compose logs caddy` shows why. |
| Sign-in does nothing | Make sure you're on `https://`, not `http://`. |
| No emails | Admin → Email & settings → *Send test*. Some providers block port 25: use 587. For Microsoft 365, turn on Authenticated SMTP for that mailbox. |
| "Nightly backup FAILED" email | Disk full? (`df -h`). Is the `backups` folder owned by 1000:1000? |
| Health check | `https://crm.suncomotors.com.au/api/health` should show `{"ok":true}` |

### Important: one copy only

Run **one** copy of the app. Don't scale it to several servers or containers. They would each have their own separate database file.
