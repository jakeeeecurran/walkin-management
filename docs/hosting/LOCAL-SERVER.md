# Hosting the CRM on an internal server

This guide sets up the **Sunco Motors Enquiry Management CRM** on a server inside the Sunco network. Staff at all four sites reach it through the company network. It is not visible on the internet.

> **Want it online instead?** See [ONLINE.md](ONLINE.md). The online option is usually simpler for four sites and phones on the road.

---

## 1. Before you start

### What you need

| | Minimum | Recommended |
|---|---|---|
| Server | Any always-on PC or virtual machine | A VM on the company host, or a small dedicated PC/NUC |
| CPU / memory | 2 cores, 2 GB RAM | 2 cores, 4 GB RAM |
| Disk | 10 GB free, SSD | 20 GB SSD, plus a **second disk or NAS** for backups |
| Operating system | Ubuntu Server 24.04 LTS, Windows Server 2019+, or Windows 10/11 Pro | **Ubuntu Server 24.04 LTS** |
| Network | Fixed IP address on the LAN | Fixed IP and an internal DNS name, e.g. `crm.sunco.local` |

The CRM is light. A few hundred enquiries a month across 33 brand–site combinations is nothing for it. It needs no separate database server, because the database is a single file.

### Questions for your IT provider

1. **Which server, and what IP address?** Ask for a fixed IP (e.g. `10.0.1.50`).
2. **Can the other sites reach it?** Caloundra, Maroochydore, Kingaroy and Hervey Bay must be able to reach that IP. Most multi-site dealerships already have a site-to-site VPN or WAN for the DMS. If not, see [section 6](#6-reaching-it-from-the-other-sites).
3. **Can we have an internal DNS name?** For example `crm.sunco.local` pointing at the server. Staff remember a name much more easily than an IP.
4. **Phones on the road:** do salespeople need the CRM away from the dealership? If so, they need the company VPN on their phone. Otherwise, host it online instead.
5. **Email account:** which SMTP server and account can the CRM use to send reminders and backups? For Microsoft 365, that is `smtp.office365.com`, port 587, with "Authenticated SMTP" turned on for the sending mailbox.

### Choose a setup

| Option | Best for | HTTPS |
|---|---|---|
| **A. Ubuntu + Docker** (recommended) | IT providers comfortable with Linux | Automatic, via Caddy |
| **B. Ubuntu without Docker** | Linux servers where Docker isn't allowed | Caddy installed separately |
| **C. Windows server or PC** | Sites that only run Windows | Plain HTTP on the LAN, or Caddy for Windows |

---

## 2. Option A: Ubuntu + Docker (recommended)

These steps were tested with the files in the `deploy/` folder.

### 2.1 Install Docker

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # then log out and back in
```

### 2.2 Get the CRM

```bash
sudo mkdir -p /opt/sunco-crm && sudo chown $USER /opt/sunco-crm
git clone https://github.com/jakeeeecurran/walkin-management.git /opt/sunco-crm
cd /opt/sunco-crm/deploy
```

The repository is private, so sign in with a GitHub account that has access. If you'd rather not use GitHub, download the ZIP from GitHub and copy it to the server.

### 2.3 Settings

```bash
cp .env.example .env
nano .env
```

| Setting | What to put |
|---|---|
| `CRM_DOMAIN` | The internal name, e.g. `crm.sunco.local`. Without a DNS name, use the server's IP, e.g. `10.0.1.50`. |
| `JWT_SECRET` | Run `openssl rand -hex 32` and paste the result. Keep it private. |
| `BACKUP_PATH` | Where backup copies go on the server. Ideally a second disk or NAS mount, e.g. `/mnt/backups/sunco-crm`. |

Make the backup folder and let the CRM write to it. The app runs as user ID 1000 inside the container.

```bash
mkdir -p ./backups            # or your BACKUP_PATH
sudo chown 1000:1000 ./backups
```

### 2.4 HTTPS on an internal network

Internal names like `crm.sunco.local` can't get a public certificate, so Caddy makes its own. Open `Caddyfile` and add `tls internal`:

```
{$CRM_DOMAIN} {
	tls internal
	encode gzip
	reverse_proxy crm:3000
}
```

If your IT provider has a company certificate for the name, use that instead. Replace `tls internal` with `tls /certs/crm.crt /certs/crm.key` and mount the files into the `caddy` service.

### 2.5 Start it

```bash
docker compose up -d --build
docker compose ps            # both services should say "running" / "healthy"
```

### 2.6 Create the first admin account

```bash
docker compose exec crm npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran" --email you@suncomotors.com.au
```

It asks for a password twice. Nothing appears while you type. Everyone else is added from **Team** in the app.

### 2.7 Trust the certificate on staff devices (only with `tls internal`)

Browsers warn about Caddy's own certificate until each device trusts it. Export Caddy's root certificate:

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./sunco-crm-root.crt
```

Install it on each device as a trusted root:

- **Windows (company PCs):** your IT provider can push it to every PC with Group Policy. That's the easiest way. By hand: double-click → *Install Certificate* → *Local Machine* → *Trusted Root Certification Authorities*.
- **iPhone/iPad:** email or AirDrop the file and install the profile. Then turn it on in *Settings → General → About → Certificate Trust Settings*.
- **Android:** *Settings → Security → Encryption & credentials → Install a certificate → CA certificate*.

Then browse to `https://crm.sunco.local` (or your IP) and sign in.

### 2.8 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

---

## 3. Option B: Ubuntu without Docker

### 3.1 Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v        # must be 22.13 or newer
```

### 3.2 Install the CRM as its own user

```bash
sudo useradd --system --create-home --home-dir /opt/sunco-crm sunco
sudo -u sunco git clone https://github.com/jakeeeecurran/walkin-management.git /opt/sunco-crm/app
cd /opt/sunco-crm/app && sudo -u sunco npm ci --omit=dev
sudo mkdir -p /var/lib/sunco-crm /mnt/backups/sunco-crm
sudo chown sunco:sunco /var/lib/sunco-crm /mnt/backups/sunco-crm
```

### 3.3 Settings file

Create `/etc/sunco-crm.env` with `sudo nano /etc/sunco-crm.env`:

```ini
NODE_ENV=production
PORT=3000
DATA_DIR=/var/lib/sunco-crm
BACKUP_DIR=/mnt/backups/sunco-crm
JWT_SECRET=paste-the-output-of-openssl-rand-hex-32
TRUST_PROXY=true
```

```bash
sudo chmod 600 /etc/sunco-crm.env
```

### 3.4 Run it as a service

Create `/etc/systemd/system/sunco-crm.service`:

```ini
[Unit]
Description=Sunco Motors Enquiry Management CRM
After=network-online.target
Wants=network-online.target

[Service]
User=sunco
WorkingDirectory=/opt/sunco-crm/app
EnvironmentFile=/etc/sunco-crm.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sunco-crm
systemctl status sunco-crm                      # should say active (running)
curl http://127.0.0.1:3000/api/health          # {"ok":true}
```

Create the first admin:

```bash
sudo -u sunco bash -c 'set -a; . /etc/sunco-crm.env; cd /opt/sunco-crm/app && npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran"'
```

### 3.5 HTTPS with Caddy

```bash
sudo apt install -y caddy
```

Replace `/etc/caddy/Caddyfile` with:

```
crm.sunco.local {
	tls internal
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy's root certificate is at `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`. Install it on staff devices as in [2.7](#27-trust-the-certificate-on-staff-devices-only-with-tls-internal). Open the firewall as in [2.8](#28-firewall).

---

## 4. Option C: Windows server or PC

### 4.1 Install

1. Install **Node.js 22 LTS** from <https://nodejs.org> (the Windows Installer `.msi`). Accept the defaults.
2. Copy the CRM to `C:\SuncoCRM`, either with Git or by unzipping the GitHub download.
3. Open **PowerShell as Administrator**:

```powershell
cd C:\SuncoCRM
npm ci --omit=dev
mkdir C:\SuncoCRM-data
mkdir D:\SuncoCRM-backups      # ideally a second drive or a mapped NAS
```

### 4.2 Run it as a Windows service

Download **NSSM** from <https://nssm.cc> and copy `nssm.exe` to `C:\Windows\System32`. NSSM is a small, free tool that runs any program as a service. Then run:

```powershell
nssm install SuncoCRM "C:\Program Files\nodejs\node.exe" "--disable-warning=ExperimentalWarning src\server.js"
nssm set SuncoCRM AppDirectory C:\SuncoCRM
nssm set SuncoCRM AppEnvironmentExtra NODE_ENV=production PORT=3000 DATA_DIR=C:\SuncoCRM-data BACKUP_DIR=D:\SuncoCRM-backups COOKIE_SECURE=false
nssm set SuncoCRM AppStdout C:\SuncoCRM-data\crm.log
nssm set SuncoCRM AppStderr C:\SuncoCRM-data\crm.log
nssm set SuncoCRM Start SERVICE_AUTO_START
nssm start SuncoCRM
```

Create the first admin, in the same PowerShell window:

```powershell
cd C:\SuncoCRM
$env:DATA_DIR="C:\SuncoCRM-data"
npm run create-user -- --admin --role general_manager --username jake --name "Jake Curran"
```

Allow other computers in:

```powershell
New-NetFirewallRule -DisplayName "Sunco CRM" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Domain,Private
```

Staff browse to `http://SERVER-NAME:3000` or `http://10.0.1.50:3000`.

### 4.3 About plain HTTP

`COOKIE_SECURE=false` lets sign-in work over plain `http://`. This is only acceptable **inside the company network or VPN**. Passwords and customer details cross the network unencrypted. For HTTPS on Windows, install **Caddy for Windows** (<https://caddyserver.com/download>) with the Caddyfile from [3.5](#35-https-with-caddy), and run it as a second NSSM service. Then:

- remove `COOKIE_SECURE=false`;
- add `TRUST_PROXY=true`;
- change the firewall rule to ports 80 and 443.

---

## 5. First-time setup in the app

Sign in as the admin you created and work through the checklist in the main [README](../../README.md#first-time-setup-checklist):

1. **Admin → Branding:** logo and colours. These are already set to the Sunco logo.
2. **Admin → Sites & brands** and **Models:** check the brand list and each brand's models.
3. **Team:** add the sales managers (at least one per site) and tick their brands. They then add their salespeople.
4. **Admin → Email & settings:**
   - Enter the SMTP details and the **CRM web address** (e.g. `https://crm.sunco.local`), then *Send test*.
   - Turn on the morning reminders.
5. **Admin → Email & settings → Nightly backup:**
   - Turn on **Email the backup every night**.
   - Send it to an address *outside* the server, e.g. a shared mailbox.
   - Set a **backup passphrase**. Write it down and keep it somewhere safe, away from the server.

---

## 6. Reaching it from the other sites

| Situation | What to do |
|---|---|
| Sites already share a WAN or site-to-site VPN | Nothing extra. Make sure the CRM's IP is reachable from every site and that the DNS name resolves at every site. |
| Sites are **not** connected | Ask IT to set up a site-to-site VPN. Or install **Tailscale** (free for small teams) on the server and on each device that needs access. |
| Phones away from the dealership | They need the company VPN or Tailscale on the phone. If that's impractical, [host online](ONLINE.md) instead. |

Test from a PC at **each** site and from a phone on the dealership Wi-Fi before go-live.

---

## 7. Backups: three layers

1. **Nightly copy on the server.** Made automatically at 2:00 am. 30 daily and 12 monthly copies are kept in `BACKUP_DIR`. Put that on a different disk or a NAS, so a failed system disk doesn't take the backups with it.
2. **Emailed encrypted backup.** Sent every night (turned on in step 5). This is your off-site copy if the server is lost, stolen or encrypted by ransomware.
3. **Server snapshots.** If the server is a VM, ask IT to include it in their normal VM backup or snapshot schedule.

**Test a restore once a quarter.** On a spare PC, install the CRM, save the latest backup email attachment, and run:

```bash
npm run restore -- sunco-crm-backup-YYYY-MM-DD-HHMM.sunco-backup
```

Enter the passphrase, then `npm start`. If you can sign in and see recent enquiries, your backups work.

**Restoring on the real server:**

- **Docker:** copy the file into the backups folder, then run:

  ```bash
  docker compose exec crm npm run restore -- /backups/<file>
  docker compose restart crm
  ```

- **Without Docker:**

  ```bash
  sudo systemctl stop sunco-crm
  sudo -u sunco bash -c 'set -a; . /etc/sunco-crm.env; cd /opt/sunco-crm/app && npm run restore -- /path/to/<file>'
  sudo systemctl start sunco-crm
  ```
- **If the app is still running:** use *Admin → Backups → Restore from a backup file* instead.

---

## 8. Updating to a new version

**Docker:**

```bash
cd /opt/sunco-crm && git pull
cd deploy && docker compose up -d --build
```

**Ubuntu service:**

```bash
cd /opt/sunco-crm/app && sudo -u sunco git pull && sudo -u sunco npm ci --omit=dev
sudo systemctl restart sunco-crm
```

**Windows:**

1. Copy the new files over `C:\SuncoCRM`, keeping the data folder.
2. Run `npm ci --omit=dev`.
3. Run `nssm restart SuncoCRM`.

Database changes are applied automatically when the app starts. Click **Back up now** in Admin → Backups before any update.

---

## 9. Troubleshooting

| Problem | Check |
|---|---|
| Page won't load from another site | Can that site ping the server? Is the firewall open? Does the DNS name resolve there? |
| Browser says "not secure" / certificate warning | That device doesn't trust Caddy's root certificate yet (see [2.7](#27-trust-the-certificate-on-staff-devices-only-with-tls-internal)). |
| Sign-in does nothing, or you're signed straight back out | Over plain `http://`, set `COOKIE_SECURE=false`. Behind Caddy, make sure `TRUST_PROXY=true`. |
| No reminder emails | Admin → Email & settings → *Send test*. For Microsoft 365, Authenticated SMTP must be on for that mailbox. |
| "Nightly backup FAILED" email | Is `BACKUP_DIR` still mounted and is the disk full? Check the logs. |
| Logs | Docker: `docker compose logs -f crm`. Ubuntu: `journalctl -u sunco-crm -f`. Windows: `C:\SuncoCRM-data\crm.log`. |
| Is it up? | `https://<your-address>/api/health` should show `{"ok":true}`. |

### Important: run one copy only

The CRM stores everything in one database file. Run **one** copy of the app against a given data folder. Never point two servers at the same shared folder.
