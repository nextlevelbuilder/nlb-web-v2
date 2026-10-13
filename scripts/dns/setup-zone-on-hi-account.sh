#!/usr/bin/env bash
# Add nextlevelbuilder.io to the hi@ Cloudflare account (pending until nameservers change) and import
# the DNS records from scripts/dns/nextlevelbuilder-io-records.json. Idempotent: existing records
# with the same type+name+content are skipped.
#
# Requires CF_ZONE_TOKEN (or CLOUDFLARE_API_TOKEN in .env) with:
#   Account > Zone: Edit (zone.create)  and  Zone > DNS: Edit   on account 7ac87c90789159ae1b10b7d78f5dcc08.
# Never run against the Digitop account: the account id below is pinned.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACCOUNT_ID="7ac87c90789159ae1b10b7d78f5dcc08"
ZONE_NAME="nextlevelbuilder.io"
RECORDS="$ROOT/scripts/dns/nextlevelbuilder-io-records.json"

TOKEN="${CF_ZONE_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  TOKEN="$(python3 -c '
import sys
for line in open(sys.argv[1], encoding="utf-8"):
    if line.startswith("CLOUDFLARE_API_TOKEN="):
        print(line.split("=", 1)[1].strip().strip("\"'"'"'")); break' "$ROOT/.env")"
fi
[[ -n "$TOKEN" ]] || { echo "No token (set CF_ZONE_TOKEN)" >&2; exit 1; }

api() { # method path [body]
  local args=(-sS -X "$1" "https://api.cloudflare.com/client/v4$2" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
  [[ $# -ge 3 ]] && args+=(--data "$3")
  curl "${args[@]}"
}

zone_json="$(api GET "/zones?name=$ZONE_NAME&account.id=$ACCOUNT_ID")"
zone_id="$(printf '%s' "$zone_json" | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result") or []; print(r[0]["id"] if r else "")')"
if [[ -z "$zone_id" ]]; then
  created="$(api POST /zones "{\"name\":\"$ZONE_NAME\",\"account\":{\"id\":\"$ACCOUNT_ID\"},\"type\":\"full\",\"jump_start\":false}")"
  zone_id="$(printf '%s' "$created" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["id"]) if d.get("success") else sys.exit("zone create failed: %s" % d.get("errors"))')"
  zone_json="$(api GET "/zones/$zone_id")"
  zone_json="{\"result\":[$(printf '%s' "$zone_json" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["result"]))')]}"
fi
echo "zone: $zone_id"
printf '%s' "$zone_json" | python3 -c 'import json,sys; z=json.load(sys.stdin)["result"][0]; print("status:", z["status"]); print("nameservers:", ", ".join(z["name_servers"]))'

existing="$(api GET "/zones/$zone_id/dns_records?per_page=500")"
python3 - "$RECORDS" "$existing" <<'PY' | while IFS= read -r body; do
import json, sys
records = json.load(open(sys.argv[1]))["records"]
existing = {(r["type"], r["name"], r["content"]) for r in json.loads(sys.argv[2]).get("result") or []}
for record in records:
    if (record["type"], record["name"], record["content"]) not in existing:
        print(json.dumps(record))
PY
  result="$(api POST "/zones/$zone_id/dns_records" "$body")"
  printf '%s' "$result" | python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result") or {}; print(("created " if d.get("success") else "FAILED ") + (r.get("type","") + " " + r.get("name","") if d.get("success") else str(d.get("errors"))))'
done
echo "Done. Change the registrar nameservers to the ones above; then attach Workers custom domains (see records JSON)."
