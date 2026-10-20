#!/bin/sh
set -eu
umask 077
if [ "${#BROWSER_DESKTOP_PASSWORD}" -ne 8 ]; then
  echo "BROWSER_DESKTOP_PASSWORD must be exactly 8 characters." >&2
  exit 1
fi
x11vnc -storepasswd "$BROWSER_DESKTOP_PASSWORD" /tmp/studio-vnc-password >/dev/null 2>&1
unset BROWSER_DESKTOP_PASSWORD
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
xvfb_pid=$!
attempt=0
until xdpyinfo -display :99 >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 20 ]; then exit 1; fi
  sleep 1
done
openbox >/dev/null 2>&1 &
openbox_pid=$!
x11vnc -display :99 -rfbauth /tmp/studio-vnc-password -rfbport 5900 -localhost -forever -shared -quiet >/dev/null 2>&1 &
vnc_pid=$!
websockify --web=/usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
web_pid=$!
uvicorn studio_bridge:app --host 0.0.0.0 --port 8000 --no-access-log &
manager_pid=$!
cleanup() {
  kill -TERM "$manager_pid" 2>/dev/null || true
  wait "$manager_pid" 2>/dev/null || true
  kill "$web_pid" "$vnc_pid" "$openbox_pid" "$xvfb_pid" 2>/dev/null || true
}
trap cleanup INT TERM EXIT
wait "$manager_pid"
