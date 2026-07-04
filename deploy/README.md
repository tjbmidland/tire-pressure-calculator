## Deploy to Proxmox LXC

### Prerequisites
- Proxmox host
- Phone with Tailscale app (for HTTPS/PWA)

### Quick Start

Run on the Proxmox host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/debian.sh)"
```

Or use the custom setup script:

```bash
scp -r tire-pressure-calculator/ root@<proxmox-ip>:/root/
ssh root@<proxmox-ip>
cd /root/tire-pressure-calculator/deploy
bash setup.sh
```

### What it does

1. Creates a Debian LXC container
2. Installs Node.js 20 + nginx
3. Clones the repo to `/opt/tirepressure`
4. Sets up a systemd service (`tirepressure`)
5. Configures nginx as reverse proxy

### After setup

1. Enter the LXC: `pct enter <vmid>`
2. Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh`
3. Authenticate: `tailscale up`
4. Get HTTPS cert: `tailscale cert <hostname>`
5. Update nginx config with SSL, reload

### Data persistence

All data is stored in `/opt/tirepressure/data/tirepressure.db` (SQLite). Back up this file to preserve saved pressures.

### Access

- **Home wifi**: `http://<lxc-ip>`
- **Anywhere (Tailscale)**: `https://<tailscale-hostname>`
- **PWA**: Add to Home Screen in Safari for offline use
