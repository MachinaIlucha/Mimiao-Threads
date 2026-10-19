#!/usr/bin/env bash
# Run only from a verified, new key-authenticated SSH session as threads.
set -Eeuo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 && ${SUDO_USER:-} == threads && -n ${SSH_CONNECTION:-} ]] || {
  echo 'Use a new key-authenticated threads session: sudo --preserve-env=SSH_CONNECTION bash harden-ssh.sh' >&2
  exit 1
}
[[ -s /home/threads/.ssh/authorized_keys && -f /etc/threads-studio/host-prepared ]]
target=/etc/ssh/sshd_config.d/00-threads-studio.conf
[[ ! -e $target ]] || { echo 'Policy already exists; inspect effective sshd settings.'; exit 1; }
install -d -m 755 /etc/ssh/sshd_config.d
cat > "$target" <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
KbdInteractiveAuthentication no
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers threads
EOF
trap 'rm -f "$target"; systemctl reload ssh' ERR
sshd -t
read -r client_ip _ server_ip server_port <<< "$SSH_CONNECTION"
effective=$(sshd -T -C "user=threads,addr=$client_ip,host=$client_ip,laddr=$server_ip,lport=$server_port")
for setting in 'permitrootlogin no' 'passwordauthentication no' 'pubkeyauthentication yes' 'authenticationmethods publickey' 'kbdinteractiveauthentication no' 'allowusers threads'; do
  grep -qxF "$setting" <<< "$effective"
done
# Automatically restore the original access policy unless a fresh login confirms it.
systemd-run --unit=threads-ssh-rollback --on-active=5m /bin/sh -c 'rm -f /etc/ssh/sshd_config.d/00-threads-studio.conf; systemctl reload ssh'
systemctl reload ssh
trap - ERR
echo 'SSH policy applied. Within 5 minutes, open another key-only threads session and run:'
echo 'sudo systemctl stop threads-ssh-rollback.timer'
