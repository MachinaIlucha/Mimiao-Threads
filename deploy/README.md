# Подготовка VPS

Перенесена настройка хоста из bootstrap Futurist: Ubuntu 24.04, Europe/Kyiv, автоматические security updates без автоматической перезагрузки, swap 2 ГБ, UFW, fail2ban, SSH по ключу и Docker Compose. Скрипт предназначен для свежего сервера. CRM и резервные копии не устанавливаются. Приложение также запускается отдельно.

Для диска 20 ГБ журналы Docker ограничены 3 × 10 МБ на контейнер, системный журнал — 200 МБ. Docker устанавливается из [официального apt-репозитория](https://docs.docker.com/engine/install/ubuntu/). Не публикуйте порты PostgreSQL/API: публикация портов Docker обходит UFW. В production Compose наружу доступны только порты Caddy.

## Настройка

1. Передайте `bootstrap-host.sh`, `harden-ssh.sh` и **публичный** ключ оператора на новый VPS по SSH. Приватный ключ остаётся на компьютере оператора.
2. Из root-сессии выполните `bash bootstrap-host.sh /root/operator.pub`. Скрипт сохраняет текущую политику входа, открывает обнаруженные SSH-порты и 80/tcp, 443/tcp+udp. Создаёт администратора `threads` с sudo без пароля и доступом к Docker; это административный, а не ограниченный пользователь.
3. Не закрывая первую сессию, откройте новую: `ssh -o PasswordAuthentication=no -i PATH_TO_PRIVATE_KEY threads@SERVER_IP`. Проверьте `sudo -n true` и `docker info`.
4. В этой новой сессии запустите `sudo --preserve-env=SSH_CONNECTION bash /root/harden-ssh.sh`. Он выключит root/password SSH, оставит только `threads` по ключу. Запланирован автоматический откат SSH через 5 минут.
5. Откройте ещё одну новую key-only SSH-сессию. Если вход работает, выполните `sudo systemctl stop threads-ssh-rollback.timer`. Только после этого закрывайте исходную root-сессию. Если вход не работает, дождитесь отката или восстановите конфигурацию через консоль провайдера.
6. Проверьте `sudo ufw status`, `sudo fail2ban-client status sshd`, `sudo sshd -T`, `docker compose version`, `free -h`, `df -h`, `systemctl --failed`. Если существует `/var/run/reboot-required`, перезагрузите сервер и повторите проверку входа и служб.

Скрипт не меняет root-пароль для консоли провайдера, не генерирует CI-ключи и не кладёт секреты в репозиторий. Не сохраняйте IP, пароли и приватные ключи в этих файлах. Для установки приложения используйте [основной README](../README.md#развёртывание-на-отдельном-vps): домен, production `.env` и подключение Meta настраиваются отдельно.
