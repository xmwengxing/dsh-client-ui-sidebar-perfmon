#!/usr/bin/env bash
# Submit perfmon to the community plugin list (https://awesome-dsh-plugin.com).
#
# The payload is one file in someone else's repository, so the flow is
# fork -> add that one file -> open a PR. Run this from anywhere; it clones into a
# temporary directory and never touches this checkout.
#
# The list checks, automatically, that the submitted repository is at least one day
# old. This script refuses to run before that (see SUBMITTED_REPO_CREATED below),
# because a PR that fails that check just adds noise for the maintainers.
#
# Usage:  contrib/submit-pr.sh [--dry-run]
set -euo pipefail

REPO_CREATED="2026-09-29T07:51:27Z"   # this plugin's GitHub repo, from the API
LIST_REPO="awesome-dsh-plugin/awesome-dsh-plugin"
ENTRY_NAME="xmwengxing__dsh-client-ui-sidebar-perfmon.yml"
PLUGIN_REPO="xmwengxing/dsh-client-ui-sidebar-perfmon"
DRY_RUN="${1:-}"

echo "==> checking the list's eligibility bar"
command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not logged in"; exit 1; }

created_epoch=$(date -d "$REPO_CREATED" +%s)
age_hours=$(( ( $(date +%s) - created_epoch ) / 3600 ))
if [ "$age_hours" -lt 24 ]; then
  echo "the plugin repo is ${age_hours}h old; the list requires 24h."
  echo "ready at: $(date -d "@$(( created_epoch + 86400 ))" '+%Y-%m-%d %H:%M %Z')"
  exit 1
fi
echo "    ok: repo is ${age_hours}h old"

echo "==> reading the entry payload from this repo"
entry=$(mktemp)
# Drop the leading comment block: the list wants the document, not our notes.
sed '/^#/d' "$(dirname "$0")/awesome-dsh-plugin-entry.yml" | sed '/^[[:space:]]*$/d' > "$entry"
echo "    $(wc -l < "$entry") lines"
cat "$entry"

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "==> dry run: stopping before any fork or push"
  rm -f "$entry"
  exit 0
fi

echo "==> forking and cloning $LIST_REPO"
workdir=$(mktemp -d)
gh repo fork "$LIST_REPO" --clone --remote --default-branch-only >/dev/null 2>&1 || {
  echo "fork failed; if a fork already exists, clone it manually into $workdir"; exit 1; }
repo_dir=$(find "$workdir" -maxdepth 1 -mindepth 1 -type d | head -n 1)
cd "$repo_dir"

# Forking an already-forked repo lands here with the fork as `origin`; the upstream
# must be `upstream` so the PR targets the list and not our own copy.
gh repo set-default "$LIST_REPO" >/dev/null 2>&1 || true

mkdir -p data/plugins
cp "$entry" "data/plugins/$ENTRY_NAME"
rm -f "$entry"

if [ -x scripts/generate-readme.mjs ] || [ -f scripts/generate-readme.mjs ]; then
  echo "==> regenerating the READMEs (optional, but keeps the diff honest)"
  npm ci --silent >/dev/null 2>&1 && node scripts/generate-readme.mjs >/dev/null 2>&1 || \
    echo "    skipped: could not run the generator; the maintainers regenerate on merge"
fi

git checkout -b "add-$PLUGIN_REPO" >/dev/null 2>&1 || git checkout - >/dev/null
git add "data/plugins/$ENTRY_NAME"
[ -f README.md ] && git add README.md README.zh.md 2>/dev/null || true
git -c user.name="$(git config --get user.name || echo xmwengxing)" \
    -c user.email="$(git config --get user.email || echo xmwengxing@users.noreply.github.com)" \
    commit -q -m "Add $PLUGIN_REPO

Host performance monitor in the right Sidebar — CPU, memory and swap gauges plus a
process table sortable by CPU, memory or name, refreshed live on Linux, macOS and
Windows. Installs from a prebuilt release tarball, and the package declares
dsh.bundle."

git push -u origin HEAD

gh pr create --repo "$LIST_REPO" \
  --title "Add $PLUGIN_REPO" \
  --body "Adds \`$PLUGIN_REPO\` under **UI Enhancements**.

- Host performance monitor for the right Sidebar: CPU / memory / swap ring gauges, and a process table with three sort tags that double as its column headers.
- Reads each platform's own source: \`/proc\` on Linux, \`vm_stat\` + \`ps\` on macOS, one PowerShell call on Windows. A figure a platform cannot answer is reported as unavailable and shown as \`—\`, never as zero.
- One bundle, host half plus browser half, no runtime dependencies. \`dsh.bundle\` is declared with a \`cordis.patch.yml\`; \`dsh.client\` is declared for the browser half.
- A prebuilt tarball is attached to each release, so the entry carries a \`tarball:\` pointer and an install needs no build approval.
- MIT licensed, 49 tests (\`npm test\`)."

echo "==> done"
