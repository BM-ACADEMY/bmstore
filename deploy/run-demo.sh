#!/usr/bin/env bash
# Rebuilds demo stores from data/demo (stores.json + <key>.csv) with apps/api/scripts/seed-demo-store.ts.
#   ./deploy/run-demo.sh                 # foods and jewels
#   ./deploy/run-demo.sh foods           # just one
# WARNING: deletes and recreates each named store (its products, orders and media).
# The owner login (owner@<key>.test + a fresh random password) is written to /root/demo-<key>-login.txt (mode 600).
# Seeds connect as the app role (APP_DATABASE_URL), because the owner role skips row-level security.
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STORES=("$@"); [[ ${#STORES[@]} -gt 0 ]] || STORES=(foods jewels)

for K in "${STORES[@]}"; do
  [[ -r "data/demo/$K.csv" ]] || { echo "no data/demo/$K.csv" >&2; exit 1; }
  PW="Demo$(openssl rand -hex 6)9x"
  ( umask 077; echo "owner@$K.test $PW" > "/root/demo-$K-login.txt" )
  ./deploy/compose.sh run --rm -T \
    -v "$ROOT_DIR/apps/api/scripts/seed-demo-store.ts:/app/apps/api/scripts/seed-demo-store.ts:ro" \
    -v "$ROOT_DIR/data/demo:/demo:ro" \
    -e DEMO_CSV="$K" -e DEMO_SLUG="$K" -e DEMO_PASSWORD="$PW" \
    migrate sh -c 'DATABASE_URL="$APP_DATABASE_URL" npx ts-node scripts/seed-demo-store.ts' 2>&1 | cut -c1-300
done
echo ALLDONE
