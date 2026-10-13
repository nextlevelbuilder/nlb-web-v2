#!/usr/bin/env bash
# Idempotent Cloudflare provisioning for nlb-web-v2 on the hi@nextlevelbuilder.io account.
#
# Creates (or reuses) D1, KV, R2 buckets and Turnstile widgets for production and staging,
# writes the resulting ids into wrangler.jsonc, and optionally sets worker secrets from .env.
#
# Usage:
#   scripts/provision-cloudflare.sh resources        # create/reuse resources + update wrangler.jsonc
#   scripts/provision-cloudflare.sh secrets <env>    # env = production | staging; pipes values, never echoes
#   scripts/provision-cloudflare.sh all              # resources, then secrets for both envs
#
# Auth model (see docs/deployment-guide.md):
# - D1 / KV / Turnstile / Workers use the wrangler OAuth login. Wrangler auto-loads
#   CLOUDFLARE_API_TOKEN from ./.env, so OAuth commands run from a neutral directory with the
#   token unset.
# - R2 uses the account API token from .env (the OAuth login has no R2 scope).
# The account id is ALWAYS pinned; the login can also see another account that must never be written.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACCOUNT_ID="7ac87c90789159ae1b10b7d78f5dcc08"
WRANGLER="$ROOT/node_modules/.bin/wrangler"
CONFIG="$ROOT/wrangler.jsonc"
NEUTRAL_DIR="$(mktemp -d)"
trap 'rm -rf "$NEUTRAL_DIR"' EXIT

[[ -x "$WRANGLER" ]] || { echo "wrangler not installed; run npm ci first" >&2; exit 1; }

# wrangler via OAuth (token from .env must not leak in).
wr_oauth() { (cd "$NEUTRAL_DIR" && env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" "$WRANGLER" "$@"); }
# wrangler via OAuth but with the project config (secrets, deploys, remote migrations).
wr_project() { (cd "$NEUTRAL_DIR" && env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" "$WRANGLER" --config "$CONFIG" "$@"); }

# Read one key from .env without printing it.
env_value() {
  python3 - "$ROOT/.env" "$1" <<'PY'
import sys
path, key = sys.argv[1], sys.argv[2]
for line in open(path, encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    if k.strip() == key:
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        sys.stdout.write(v)
        break
PY
}

oauth_token() {
  # Refreshes the OAuth token if needed, then reads it from wrangler's config file (never printed).
  wr_oauth whoami >/dev/null 2>&1 || true
  # Several wrangler versions use different config homes; the most recently refreshed file wins.
  local cfg
  cfg="$(ls -t "$HOME/.wrangler/config/default.toml" "$HOME/.config/.wrangler/config/default.toml" \
    "$HOME/Library/Preferences/.wrangler/config/default.toml" 2>/dev/null | head -1 || true)"
  if [[ -n "$cfg" ]]; then
    sed -n 's/^oauth_token = "\(.*\)"$/\1/p' "$cfg"
    return 0
  fi
  echo "wrangler OAuth config not found; run 'wrangler login'" >&2
  return 1
}

cf_api() { # method path [json-body] — uses the OAuth token
  local method="$1" path="$2" body="${3:-}" token
  token="$(oauth_token)"
  if [[ -n "$body" ]]; then
    curl -fsS -X "$method" "https://api.cloudflare.com/client/v4$path" -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data "$body"
  else
    curl -fsS -X "$method" "https://api.cloudflare.com/client/v4$path" -H "Authorization: Bearer $token"
  fi
}

ensure_d1() { # name -> prints uuid
  local name="$1" id
  id="$(wr_oauth d1 list --json 2>/dev/null | python3 -c 'import json,sys; n=sys.argv[1]; print(next((d["uuid"] for d in json.load(sys.stdin) if d["name"]==n), ""))' "$name")"
  if [[ -z "$id" ]]; then
    wr_oauth d1 create "$name" >/dev/null
    id="$(wr_oauth d1 list --json 2>/dev/null | python3 -c 'import json,sys; n=sys.argv[1]; print(next((d["uuid"] for d in json.load(sys.stdin) if d["name"]==n), ""))' "$name")"
  fi
  [[ -n "$id" ]] || { echo "failed to resolve D1 $name" >&2; exit 1; }
  echo "$id"
}

ensure_kv() { # title -> prints id
  local title="$1" id
  id="$(wr_oauth kv namespace list 2>/dev/null | python3 -c 'import json,sys; t=sys.argv[1]; print(next((d["id"] for d in json.load(sys.stdin) if d["title"]==t), ""))' "$title")"
  if [[ -z "$id" ]]; then
    wr_oauth kv namespace create "$title" >/dev/null
    id="$(wr_oauth kv namespace list 2>/dev/null | python3 -c 'import json,sys; t=sys.argv[1]; print(next((d["id"] for d in json.load(sys.stdin) if d["title"]==t), ""))' "$title")"
  fi
  [[ -n "$id" ]] || { echo "failed to resolve KV $title" >&2; exit 1; }
  echo "$id"
}

ensure_r2() { # uses the account API token from .env (wrangler auto-loads it inside $ROOT)
  local name="$1"
  if (cd "$ROOT" && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" "$WRANGLER" r2 bucket info "$name" >/dev/null 2>&1); then
    return 0
  fi
  (cd "$ROOT" && CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" "$WRANGLER" r2 bucket create "$name" >/dev/null)
}

workers_subdomain() {
  cf_api GET "/accounts/$ACCOUNT_ID/workers/subdomain" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["subdomain"])'
}

ensure_turnstile() { # name domains-json -> prints sitekey
  local name="$1" domains="$2" key
  key="$(cf_api GET "/accounts/$ACCOUNT_ID/challenges/widgets?per_page=100" | python3 -c 'import json,sys; n=sys.argv[1]; print(next((w["sitekey"] for w in json.load(sys.stdin)["result"] if w["name"]==n), ""))' "$name")"
  local body
  body="$(python3 -c 'import json,sys; print(json.dumps({"name": sys.argv[1], "domains": json.loads(sys.argv[2]), "mode": "managed"}))' "$name" "$domains")"
  if [[ -z "$key" ]]; then
    key="$(cf_api POST "/accounts/$ACCOUNT_ID/challenges/widgets" "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["sitekey"])')"
  else
    cf_api PUT "/accounts/$ACCOUNT_ID/challenges/widgets/$key" "$body" >/dev/null
  fi
  echo "$key"
}

turnstile_secret() { # sitekey -> secret on stdout (caller must pipe it, never print)
  cf_api GET "/accounts/$ACCOUNT_ID/challenges/widgets/$1" | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin)["result"]["secret"])'
}

update_wrangler_config() { # key=value pairs
  node - "$CONFIG" "$@" <<'JS'
const fs = require("fs");
const [file, ...pairs] = process.argv.slice(2);
const values = Object.fromEntries(pairs.map((p) => p.split("=")));
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const stg = cfg.env.staging;
cfg.d1_databases[0].database_id = values.D1_PROD;
stg.d1_databases[0].database_id = values.D1_STAGING;
// KV bindings are upserted by binding name so new namespaces can be added without reordering.
function setKv(target, binding, id) {
  target.kv_namespaces = target.kv_namespaces || [];
  const existing = target.kv_namespaces.find((kv) => kv.binding === binding);
  if (existing) existing.id = id; else target.kv_namespaces.push({ binding, id });
}
setKv(cfg, "MCP_DELEGATION_JTI", values.KV_JTI_PROD);
setKv(stg, "MCP_DELEGATION_JTI", values.KV_JTI_STAGING);
cfg.vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY = values.TURNSTILE_PROD;
stg.vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY = values.TURNSTILE_STAGING;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
JS
}

cmd_resources() {
  echo "Provisioning on account $ACCOUNT_ID"
  local d1_prod d1_staging kv_jti_prod kv_jti_staging sub ts_prod ts_staging
  d1_prod="$(ensure_d1 nlb-prod)"; echo "D1 nlb-prod: $d1_prod"
  d1_staging="$(ensure_d1 nlb-staging)"; echo "D1 nlb-staging: $d1_staging"
  kv_jti_prod="$(ensure_kv nlb-mcp-delegation-jti)"; echo "KV nlb-mcp-delegation-jti: $kv_jti_prod"
  kv_jti_staging="$(ensure_kv nlb-mcp-delegation-jti-staging)"; echo "KV nlb-mcp-delegation-jti-staging: $kv_jti_staging"
  ensure_r2 nlb-media-public; ensure_r2 nlb-media-staging; ensure_r2 nlb-media-staging-public; echo "R2 buckets ok"
  sub="$(workers_subdomain)"; echo "workers.dev subdomain: $sub"
  ts_prod="$(ensure_turnstile nlb-web-production "[\"nextlevelbuilder.io\",\"nextlevelbuilder-web.$sub.workers.dev\"]")"
  ts_staging="$(ensure_turnstile nlb-web-staging "[\"staging.nextlevelbuilder.io\",\"nextlevelbuilder-web-staging.$sub.workers.dev\",\"localhost\"]")"
  echo "Turnstile site keys: production $ts_prod, staging $ts_staging"
  update_wrangler_config "D1_PROD=$d1_prod" "D1_STAGING=$d1_staging" "KV_JTI_PROD=$kv_jti_prod" "KV_JTI_STAGING=$kv_jti_staging" \
    "TURNSTILE_PROD=$ts_prod" "TURNSTILE_STAGING=$ts_staging"
  echo "wrangler.jsonc updated"
}

# Worker secrets copied from .env. NEXT_PUBLIC_* values are build-time vars, not secrets.
SECRET_KEYS=(
  BETTER_AUTH_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
  POLAR_ACCESS_TOKEN POLAR_ORG_ID POLAR_ORG_SLUG POLAR_WEBHOOK_SECRET
  POLAR_PRODUCT_PREMIUM_EARLYBIRD_ANNUAL POLAR_PRODUCT_PREMIUM_QUARTERLY POLAR_PRODUCT_PREMIUM_ANNUAL
  POLAR_PRODUCT_VIP_EARLYBIRD_ANNUAL POLAR_PRODUCT_VIP_QUARTERLY POLAR_PRODUCT_VIP_ANNUAL
  RESEND_API_KEY RESEND_FROM_EMAIL DISCORD_INVITE_URL DISCORD_BOT_TOKEN DISCORD_GUILD_ID DISCORD_PREMIUM_ROLE_ID
  # Shared with the MCP worker; the same value must be set there (docs/cutover-runbook.md).
  MCP_DELEGATION_SECRET
)

cmd_secrets() {
  local target="${1:-}" env_args=() site_key app_url
  case "$target" in
    production) env_args=(--env=""); site_key="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY)' "$CONFIG")" ;;
    staging) env_args=(--env staging); site_key="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).env.staging.vars.NEXT_PUBLIC_TURNSTILE_SITE_KEY)' "$CONFIG")" ;;
    *) echo "usage: $0 secrets production|staging" >&2; exit 1 ;;
  esac
  app_url="$(node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(process.argv[2]==="staging"?c.env.staging.vars.NEXT_PUBLIC_APP_URL:c.vars.NEXT_PUBLIC_APP_URL)' "$CONFIG" "$target")"

  local key value
  for key in "${SECRET_KEYS[@]}"; do
    value="$(env_value "$key")"
    if [[ -z "$value" ]]; then echo "skip $key (not in .env)"; continue; fi
    printf '%s' "$value" | wr_project secret put "$key" "${env_args[@]}" >/dev/null
    echo "set $key"
  done
  printf '%s' "$app_url" | wr_project secret put BETTER_AUTH_URL "${env_args[@]}" >/dev/null; echo "set BETTER_AUTH_URL"
  turnstile_secret "$site_key" | wr_project secret put TURNSTILE_SECRET_KEY "${env_args[@]}" >/dev/null; echo "set TURNSTILE_SECRET_KEY"
}

case "${1:-}" in
  resources) cmd_resources ;;
  secrets) cmd_secrets "${2:-}" ;;
  all) cmd_resources; cmd_secrets staging; cmd_secrets production ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
