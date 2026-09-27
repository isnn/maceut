#!/usr/bin/env bash
#
# Checks that no real credential has ever been committed.
#
#   ./scripts/audit-secrets.sh
#
# Reads the actual values out of the env files and searches every commit on every
# ref for each one. Values are NEVER printed — only the key name, its length, its
# last four characters, and a verdict. Safe to run with output shared.
#
# Exits 1 if anything is found, so it can gate a release.
#
# Why this exists: on 2026-09-19 a `git add -A` swept `api/..env.swp` — a nano swap
# file for api/.env — into a commit that was pushed. That one turned out to hold only
# nano's 1024-byte header, no buffer contents. Had the editor paged the buffer out,
# it would have carried the HERE and R2 keys into a public PR, and nobody would have
# had a reason to look. `.gitignore` now blocks those files; this makes the check
# repeatable rather than dependent on someone noticing.
set -uo pipefail
cd "$(dirname "$0")/.."

FOUND=0

note()  { printf '  %s\n' "$*"; }
flag()  { printf '  ⚠️  %s\n' "$*"; FOUND=1; }

echo "=============================================================="
echo " 1. Env files tracked by git, now or ever"
echo "=============================================================="
for f in .env api/.env web/.env.local api/.env.local; do
  ever=$(git log --all --oneline -- "$f" 2>/dev/null | wc -l)
  if [ "$ever" -gt 0 ]; then
    flag "$f appears in $ever commit(s)"
    git log --all --oneline -- "$f" | sed 's/^/        /'
  else
    note "$(printf '%-18s never committed' "$f")"
  fi
done

echo
echo "=============================================================="
echo " 2. Editor swap / backup files in history"
echo "=============================================================="
swaps=$(git log --all --pretty=format: --name-only --diff-filter=A 2>/dev/null \
        | sort -u | grep -E '\.swp$|\.swo$|\.swn$|~$|\.bak$|\.orig$|^\.#' || true)
if [ -z "$swaps" ]; then note "none"; else echo "$swaps" | while read -r s; do flag "$s"; done; FOUND=1; fi

echo
echo "=============================================================="
echo " 3. Every real secret value, against all history"
echo "=============================================================="

# A value identical to the one in .env.example is a documented default, not a secret
# (RABBITMQ_URL's amqp://guest:guest@... is the case that matters). Comparing against
# the example file is more reliable than guessing at placeholder patterns.
example_value() {
  local key="$1" file="$2" example
  case "$file" in
    api/.env)       example="api/.env.example" ;;
    .env)           example=".env.example" ;;
    web/.env.local) example="web/.env.example" ;;
    *)              return 1 ;;
  esac
  [ -f "$example" ] || return 1
  grep -m1 "^${key}=" "$example" 2>/dev/null | cut -d= -f2- \
    | sed 's/[[:space:]]*#.*$//' | sed 's/[[:space:]]*$//'
}

check() {
  local label="$1" value="$2" key="$3" file="$4"

  [ -z "$value" ] && { note "$(printf '%-28s unset' "$label")"; return; }

  if [ "$value" = "$(example_value "$key" "$file" || echo '\0')" ]; then
    note "$(printf '%-28s default from .env.example — not a secret' "$label")"
    return
  fi
  if [ ${#value} -lt 12 ]; then
    note "$(printf '%-28s too short to search meaningfully' "$label")"
    return
  fi

  local hits tracked
  hits=$(git log --all --oneline -S"$value" 2>/dev/null | wc -l)
  tracked=$(git grep -l -F "$value" -- . 2>/dev/null | wc -l)

  if [ "$hits" -eq 0 ] && [ "$tracked" -eq 0 ]; then
    note "$(printf '%-28s CLEAN  (…%s, %d chars)' "$label" "${value: -4}" "${#value}")"
  else
    flag "$(printf '%-28s EXPOSED  commits: %d  tracked files: %d' "$label" "$hits" "$tracked")"
    git log --all --oneline -S"$value" 2>/dev/null | sed 's/^/        commit /'
    git grep -l -F "$value" -- . 2>/dev/null | sed 's/^/        file   /'
  fi
}

scan() {
  local file="$1"
  [ -f "$file" ] || return
  while IFS= read -r line; do
    case "$line" in \#*|'') continue ;; esac
    local key="${line%%=*}" val="${line#*=}"
    case "$key" in
      *SECRET*|*KEY*|*PASSWORD*|*TOKEN*|*ACCOUNT_ID*|DATABASE_URL|RABBITMQ_URL)
        val="$(printf '%s' "$val" | sed 's/[[:space:]]*#.*$//' | sed 's/[[:space:]]*$//')"
        check "$file $key" "$val" "$key" "$file"
        ;;
    esac
  done < "$file"
}

scan "api/.env"
scan ".env"
scan "web/.env.local"

echo
echo "=============================================================="
echo " 4. Remote branches"
echo "=============================================================="
git fetch --quiet --all 2>/dev/null || true
for br in $(git branch -r --format='%(refname:short)' 2>/dev/null | grep -v HEAD); do
  bad=$(git ls-tree -r --name-only "$br" 2>/dev/null \
        | grep -E '(^|/)\.env$|\.env\.local$|\.swp$|\.swo$|~$' || true)
  [ -n "$bad" ] && { flag "$br contains:"; echo "$bad" | sed 's/^/        /'; }
done
note "checked $(git branch -r 2>/dev/null | grep -vc HEAD) remote branches"

echo
echo "=============================================================="
if [ "$FOUND" -eq 0 ]; then
  echo " CLEAN — no credential value in any commit, tracked file,"
  echo "         or remote branch."
  echo "=============================================================="
  exit 0
fi
echo " FINDINGS ABOVE — treat any EXPOSED value as compromised and"
echo " rotate it. Removing it from history does not un-publish it."
echo "=============================================================="
exit 1
