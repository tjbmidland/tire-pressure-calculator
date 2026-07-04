#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# License: MIT | https://github.com/community-scripts/ProxmoxVE/raw/main/LICENSE
# Source: https://github.com/tjbmidland/tire-pressure-calculator

APP="Tire Pressure Calculator"
var_tags="${var_tags:-calculator;cycling}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-512}"
var_disk="${var_disk:-2}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -d /opt/tirepressure ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi
  msg_info "Updating $APP"
  cd /opt/tirepressure
  git pull
  export PNPM_HOME="/root/.local/share/pnpm"
  export PATH="$PNPM_HOME:$PATH"
  $STD pnpm install --production
  $STD systemctl restart tirepressure
  msg_ok "Updated $APP"
  exit
}

start
build_container

function install() {
  setting_up_container
  network_check
  update_os

  msg_info "Installing Dependencies"
  $STD apt install -y \
    curl \
    git \
    nginx
  $STD curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  $STD apt install -y nodejs
  $STD curl -fsSL https://get.pnpm.io/install.sh | sh -
  export PNPM_HOME="/root/.local/share/pnpm"
  export PATH="$PNPM_HOME:$PATH"
  msg_ok "Installed Dependencies"

  msg_info "Installing Tire Pressure Calculator"
  $STD git clone https://github.com/tjbmidland/tire-pressure-calculator.git /opt/tirepressure
  cd /opt/tirepressure
  $STD pnpm install --production
  msg_ok "Installed Tire Pressure Calculator"

  msg_info "Configuring Application"
  mkdir -p /opt/tirepressure/data
  chown -R www-data:www-data /opt/tirepressure/data

  cat <<EOF >/etc/systemd/system/tirepressure.service
[Unit]
Description=Tire Pressure Calculator
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/tirepressure
ExecStart=/root/.local/share/pnpm/node_modules/.bin/pnpm start
Restart=on-failure
Environment=PORT=3000
Environment=DATA_DIR=/opt/tirepressure/data
Environment=PNPM_HOME=/root/.local/share/pnpm
Environment=PATH=/root/.local/share/pnpm:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
EOF
  $STD systemctl daemon-reload
  $STD systemctl enable -q --now tirepressure
  msg_ok "Configured Application"

  msg_info "Configuring Nginx"
  cat <<EOF >/etc/nginx/sites-available/tirepressure
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/tirepressure /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  $STD nginx -t
  $STD systemctl reload nginx
  msg_ok "Configured Nginx"

  motd_ssh
  customize
  cleanup_lxc
}

install
description

msg_ok "Completed successfully!\n"
echo -e "Access at: http://$(hostname -I | awk '{print $1}')"
