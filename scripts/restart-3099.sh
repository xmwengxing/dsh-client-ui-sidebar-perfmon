#!/usr/bin/env bash
# Robust restart of the temp dsh instance on 3099 for perfmon verification.
# Kills the old instance, waits for the port to be truly free, starts a new one,
# and prints the launch token once it appears.
set -u
PORT=3099
# Split so this script's own command line never matches the pattern.
PAT="bin.js --pro""file"
kill $(pgrep -f "$PAT" 2>/dev/null) 2>/dev/null
for i in $(seq 1 30); do
  if ss -tln 2>/dev/null | grep -q ":${PORT} "; then sleep 1; else break; fi
done
if ss -tln 2>/dev/null | grep -q ":${PORT} "; then
  fuser -k "${PORT}/tcp" 2>/dev/null
  sleep 3
fi
LOG=/tmp/perfmon-3099.log
: > "$LOG"
setsid nohup dsh --profile web --port "$PORT" --no-open > "$LOG" 2>&1 < /dev/null &
disown
for i in $(seq 1 60); do
  TOKEN=$(grep -oE "token=[A-Za-z0-9_-]+" "$LOG" 2>/dev/null | tail -1 | cut -d= -f2)
  if [ -n "${TOKEN:-}" ]; then echo "TOKEN=$TOKEN"; exit 0; fi
  sleep 2
done
echo "NO_TOKEN; last log lines:" >&2
tail -5 "$LOG" >&2
exit 1
