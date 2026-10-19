#!/usr/bin/env bash
# Fresh Ubuntu 24.04 host only; application deployment is a separate step.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export DEBIAN_FRONTEND=noninteractive
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ $EUID == 0 ]] || die 'Run as root.'
[[ $# == 1 && -f $1 ]] || die 'Usage: bash bootstrap-host.sh /path/to/operator.pub'
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || die 'Requires Ubuntu 24.04.'
ssh-keygen -lf "$1" >/dev/null || die 'Invalid SSH public key.'
[[ $(grep -c . "$1") == 1 ]] || die 'Supply exactly one public key.'
[[ ! -e /etc/mimiao/instance ]] || die 'Refusing to modify a Mimiao CRM host.'
if command -v docker >/dev/null && [[ -n $(docker ps -aq) ]]; then
  die 'Requires a host without application containers.'
fi
if id threads >/dev/null 2>&1 && [[ ! -f /etc/threads-studio/host-prepared ]]; then
  die 'Existing threads user is not managed by this bootstrap.'
fi
mapfile -t ssh_ports < <(sshd -T | awk '$1=="port" {print $2}')
if [[ -n ${SSH_CONNECTION:-} ]]; then ssh_ports+=("${SSH_CONNECTION##* }"); fi
[[ ${#ssh_ports[@]} -gt 0 ]] || die 'Cannot determine the active SSH port.'
for port in "${ssh_ports[@]}"; do
  [[ $port =~ ^[0-9]+$ && $port -ge 1 && $port -le 65535 ]] || die 'Invalid SSH port.'
done

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ca-certificates curl git sudo jq ufw fail2ban unattended-upgrades
timedatectl set-timezone Europe/Kyiv
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
printf 'Unattended-Upgrade::Automatic-Reboot "false";\n' > /etc/apt/apt.conf.d/52threads-reboot
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer

cat > /etc/sysctl.d/99-threads.conf <<'EOF'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
kernel.kptr_restrict = 2
vm.swappiness = 10
EOF
sysctl -p /etc/sysctl.d/99-threads.conf
if [[ -z $(swapon --show --noheadings) ]]; then
  [[ ! -e /swapfile ]] || die '/swapfile exists but is inactive; inspect it manually.'
  [[ $(df --output=avail -k / | tail -1) -gt 4194304 ]] || die 'Need at least 4 GiB free before swap creation.'
  install -m 600 /dev/null /swapfile
  fallocate -l 2G /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

install -d -m 700 /etc/threads-studio
touch /etc/threads-studio/host-prepared
id threads >/dev/null 2>&1 || useradd -m -s /bin/bash threads
install -d -m 700 -o threads -g threads /home/threads/.ssh
auth=/home/threads/.ssh/authorized_keys
touch "$auth"
key=$(cat "$1")
grep -qxF "$key" "$auth" || printf '%s\n' "$key" >> "$auth"
chown threads:threads "$auth"
chmod 600 "$auth"
# This is the host administrator. Docker-group membership is also root-equivalent.
printf 'threads ALL=(ALL:ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/threads-studio
chmod 440 /etc/sudoers.d/threads-studio
visudo -cf /etc/sudoers.d/threads-studio

ufw default deny incoming
ufw default allow outgoing
for port in "${ssh_ports[@]}"; do ufw allow "$port/tcp"; done
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
cat > /etc/fail2ban/jail.d/threads.local <<EOF
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
bantime.increment = true
bantime.factor = 2
bantime.maxtime = 1w
backend = systemd
[sshd]
enabled = true
port = $(IFS=,; echo "${ssh_ports[*]}")
EOF
fail2ban-client -t
systemctl enable fail2ban
systemctl restart fail2ban

if ! command -v docker >/dev/null; then
  install -d -m 755 /etc/apt/keyrings
  curl --fail --silent --show-error --max-time 60 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod 644 /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
install -d -m 755 /etc/docker
daemon=/etc/docker/daemon.json
candidate=$(mktemp)
trap 'rm -f "$candidate"' EXIT
if [[ -f $daemon ]]; then cat "$daemon" > "$candidate"; else printf '{}\n' > "$candidate"; fi
jq '. + {"log-driver":"json-file", "log-opts":{"max-size":"10m","max-file":"3"}, "live-restore":true}' "$candidate" > "$candidate.next"
mv "$candidate.next" "$candidate"
dockerd --validate --config-file="$candidate"
if ! cmp -s "$candidate" "$daemon"; then
  install -m 644 "$candidate" "$daemon"
  systemctl restart docker
fi
systemctl enable --now docker
usermod -aG docker threads
install -d -m 755 /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/threads.conf <<'EOF'
[Journal]
SystemMaxUse=200M
RuntimeMaxUse=50M
MaxRetentionSec=14day
EOF
systemctl restart systemd-journald
install -d -m 755 -o threads -g threads /opt/threads-studio
apt-get clean
printf '\nHost prepared. SSH access policy is unchanged.\n'
printf 'Verify a NEW key-only SSH session as threads, then run harden-ssh.sh through sudo in that session.\n'
ufw status
systemctl is-active docker fail2ban
free -h
df -h /
