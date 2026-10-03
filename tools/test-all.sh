#!/usr/bin/env bash
# Bateria completa local: typecheck/lint/vitest do server, lint/build do
# frontend, sobe API + frontend em portas próprias e roda o Playwright.
# Tudo aponta para localhost; nada é enviado para servidores externos.
#
# Uso:  tools/test-all.sh [args extras do playwright]
# Ex.:  tools/test-all.sh --grep "árbitro"
# Env:  API_PORT (4333), WEB_PORT (4300), PW_PROJECT (chromium), SKIP_BUILD=1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PORT="${API_PORT:-4333}"
WEB_PORT="${WEB_PORT:-4300}"
PW_PROJECT="${PW_PROJECT:-chromium}"
API_URL="http://localhost:${API_PORT}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/rl-test-all.XXXXXX")"
LOG_DIR="${TMP_DIR}/logs"
mkdir -p "$LOG_DIR"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  rm -rf "$TMP_DIR"
  # next build/start reescrevem o next-env.d.ts; não deixa sujeira no git
  git -C "$ROOT" checkout -- frontend/next-env.d.ts 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Ambiente isolado do servidor: banco temporário, sem envio externo e
# credenciais administrativas descartáveis.
export TELEMETRY_ENABLED=false
export GEO_ENABLED=false
export TELEMETRY_URL="http://127.0.0.1:9"
export ANALYTICS_DB_PATH="${TMP_DIR}/analytics.db"
export MASTER_USER="e2e-user"
export MASTER_PASSWORD="e2e-password-$$"
export MASTER_TOKEN_SECRET="e2e-secret-$$"
export LOG_LEVEL="${LOG_LEVEL:-warn}"

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

wait_http() {
  local url="$1" name="$2"
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "✗ ${name} não respondeu em ${url}" >&2
  tail -50 "$LOG_DIR/${name}.log" >&2 || true
  exit 1
}

for port in "$API_PORT" "$WEB_PORT"; do
  if lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "✗ porta ${port} já está em uso — defina API_PORT/WEB_PORT" >&2
    exit 1
  fi
done

step "server: typecheck + lint + vitest"
(cd "$ROOT/server" && npm run --silent typecheck && npm run --silent lint && npm test --silent)

step "frontend: lint"
(cd "$ROOT/frontend" && npm run --silent lint)

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  step "server + frontend: build (API em ${API_URL})"
  (cd "$ROOT/server" && npm run --silent build)
  (cd "$ROOT/frontend" && NEXT_PUBLIC_API_URL="$API_URL" NEXT_PUBLIC_WS_URL="$API_URL" npm run --silent build)
fi

step "subindo API (:${API_PORT}) e frontend (:${WEB_PORT})"
(cd "$ROOT/server" && PORT="$API_PORT" exec node dist/index.js) >"$LOG_DIR/api.log" 2>&1 &
PIDS+=($!)
(cd "$ROOT/frontend" && PORT="$WEB_PORT" exec npx next start -p "$WEB_PORT") >"$LOG_DIR/web.log" 2>&1 &
PIDS+=($!)
wait_http "${API_URL}/health" api
wait_http "http://localhost:${WEB_PORT}/" web

step "playwright (${PW_PROJECT})"
set +e
(cd "$ROOT/frontend" && E2E_API_URL="$API_URL" PORT="$WEB_PORT" \
  npx playwright test --project="$PW_PROJECT" "$@")
status=$?
set -e

if [ $status -ne 0 ]; then
  echo -e "\n--- últimas linhas do log da API ---"
  tail -40 "$LOG_DIR/api.log" || true
  echo "✗ Playwright falhou (traces/vídeos em frontend/test-results)"
  exit $status
fi
echo -e "\n\033[1;32m✓ bateria completa verde\033[0m"
