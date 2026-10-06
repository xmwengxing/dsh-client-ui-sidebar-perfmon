#!/usr/bin/env bash
# Submit perfmon to the community plugin list (https://awesome-dsh-plugin.com).
#
# The payload is one file in someone else's repository, so the flow is
# fork -> add that one file -> open a PR. Run this from anywhere: the fork is
# cloned into a temporary directory and this checkout is never touched.
#
# The list checks, automatically, that the submitted repository is at least one day
# old. This script refuses to run before that (see REPO_CREATED below), because a
# PR that fails that check just adds noise for the maintainers.
#
# Usage:  contrib/submit-pr.sh [--dry-run]
set -euo pipefail

REPO_CREATED="2026-09-29T07:51:27Z"   # this plugin's GitHub repo, from the API
LIST_REPO="awesome-dsh-plugin/awesome-dsh-plugin"
FORK_REPO="xmwengxing/awesome-dsh-plugin"
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

if [ "$DRY_RUN" = "--dry-run" ]; then
  cat "$entry"
  echo "==> dry run: stopping before any fork or push"
  rm -f "$entry"
  exit 0
fi

echo "==> forking $LIST_REPO (ok if the fork already exists)"
gh repo fork "$LIST_REPO" --default-branch-only >/dev/null 2>&1 || true

echo "==> cloning the fork into a temporary directory"
workdir=$(mktemp -d)
list_dir="$workdir/${LIST_REPO#*/}"
gh repo clone "$FORK_REPO" "$list_dir"
cd "$list_dir"
origin_url=$(git remote get-url origin)
case "$origin_url" in
  *"$FORK_REPO"*) ;;  # expected: origin is our fork
  *) echo "unexpected origin: $origin_url" >&2; exit 1 ;;
esac

mkdir -p data/plugins
cp "$entry" "data/plugins/$ENTRY_NAME"
rm -f "$entry"

branch="add-$PLUGIN_REPO"
git checkout -b "$branch" >/dev/null 2>&1 || git checkout - >/dev/null
git add "data/plugins/$ENTRY_NAME"
git -c user.name="$(git config --get user.name || echo xmwengxing)" \
    -c user.email="$(git config --get user.email || echo xmwengxing@users.noreply.github.com)" \
    commit -q -m "Add $PLUGIN_REPO

Host performance monitor in the right Sidebar — CPU, memory and swap gauges plus a
process table sortable by CPU, memory or name, refreshed live on Linux, macOS and
Windows. Installs from a prebuilt release tarball, and the package declares
dsh.bundle."

git push -u origin HEAD

gh pr create --repo "$LIST_REPO" --head "xmwengxing:$branch" \
  --title "Add $PLUGIN_REPO" \
  --body "Adds \`$PLUGIN_REPO\` under **UI Enhancements**.

- Host performance monitor for the right Sidebar: CPU / memory / swap ring gauges, and a process table with three sort tags that double as its column headers.
- Reads each platform's own source: \`/proc\` on Linux, \`vm_stat\` + \`ps\` on macOS, one PowerShell call on Windows. A figure a platform cannot answer is reported as unavailable and shown as \`—\`, never as zero.
- One bundle, host half plus browser half, no runtime dependencies. \`dsh.bundle\` is declared with a \`cordis.patch.yml\`; \`dsh.client\` is declared for the browser half.
- A prebuilt tarball is attached to each release, so the entry carries a \`tarball:\` pointer and an install needs no build approval.
- MIT licensed, 88 tests (\`npm test\`)."

echo "==> done"
