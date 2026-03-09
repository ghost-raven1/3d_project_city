#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

SERVER_HOST="${SERVER_HOST:-31.172.65.206}"
SERVER_USER="${SERVER_USER:-root}"
SERVER_PORT="${SERVER_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/opt/3d-project-city}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-3d-project-city}"
APP_PORT="${APP_PORT:-18080}"
APP_API_PORT="${APP_API_PORT:-13000}"
PUBLIC_HOST="${PUBLIC_HOST:-${SERVER_HOST}}"
SSH_KEY="${SSH_KEY:-}"
PUSH_ENV_FILE="${PUSH_ENV_FILE:-0}"

required_tools=(ssh rsync)
for tool in "${required_tools[@]}"; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "Missing required tool: ${tool}" >&2
    exit 1
  fi
done

SSH_OPTS=(-p "${SERVER_PORT}" -o StrictHostKeyChecking=accept-new)
if [ -n "${SSH_KEY}" ]; then
  SSH_OPTS+=(-i "${SSH_KEY}")
fi

SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"

echo "Syncing project files to ${SSH_TARGET}:${REMOTE_DIR} ..."
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" "mkdir -p '${REMOTE_DIR}'"

rsync -az --delete \
  --exclude ".git" \
  --exclude "node_modules" \
  --exclude "backend/node_modules" \
  --exclude "frontend/node_modules" \
  --exclude ".DS_Store" \
  --exclude ".env" \
  --exclude "backend/.env" \
  --exclude "frontend/.env" \
  --exclude ".env.prod" \
  "${ROOT_DIR}/" "${SSH_TARGET}:${REMOTE_DIR}/"

if [ "${PUSH_ENV_FILE}" = "1" ]; then
  if [ -f "${ROOT_DIR}/.env.prod" ]; then
    echo "Uploading local .env.prod ..."
    rsync -az "${ROOT_DIR}/.env.prod" "${SSH_TARGET}:${REMOTE_DIR}/.env.prod"
  else
    echo "PUSH_ENV_FILE=1 set, but local .env.prod was not found." >&2
    exit 1
  fi
fi

echo "Deploying containers on ${SSH_TARGET} ..."
ssh "${SSH_OPTS[@]}" "${SSH_TARGET}" bash -s -- \
  "${REMOTE_DIR}" \
  "${COMPOSE_PROJECT_NAME}" \
  "${PUBLIC_HOST}" \
  "${APP_PORT}" \
  "${APP_API_PORT}" <<'REMOTE'
set -Eeuo pipefail

REMOTE_DIR="$1"
COMPOSE_PROJECT_NAME="$2"
PUBLIC_HOST="$3"
APP_PORT="$4"
APP_API_PORT="$5"

cd "${REMOTE_DIR}"

if [ ! -f ".env.prod" ]; then
  if [ -f ".env.prod.example" ]; then
    cp .env.prod.example .env.prod
  else
    touch .env.prod
  fi
fi

upsert_env() {
  key="$1"
  value="$2"
  tmp_file="$(mktemp)"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { updated = 0 }
    $0 ~ ("^" key "=") { print key "=" value; updated = 1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' .env.prod > "${tmp_file}"
  mv "${tmp_file}" .env.prod
}

FRONTEND_URL="http://${PUBLIC_HOST}:${APP_PORT}"
BACKEND_URL="http://${PUBLIC_HOST}:${APP_API_PORT}"

upsert_env "DOMAIN" "${PUBLIC_HOST}"
upsert_env "VITE_API_URL" "${BACKEND_URL}"
upsert_env "CORS_ORIGIN" "${FRONTEND_URL}"
upsert_env "WS_CORS_ORIGIN" "${FRONTEND_URL}"

if grep -q '^POSTGRES_PASSWORD=change-me$' .env.prod; then
  echo "WARNING: POSTGRES_PASSWORD is still 'change-me' in .env.prod" >&2
fi

APP_PORT="${APP_PORT}" APP_API_PORT="${APP_API_PORT}" docker compose \
  --env-file .env.prod \
  -f docker-compose.prod.yml \
  -f docker-compose.prod.multi-project.yml \
  -p "${COMPOSE_PROJECT_NAME}" \
  up -d --build postgres ollama ollama-init backend frontend

APP_PORT="${APP_PORT}" APP_API_PORT="${APP_API_PORT}" docker compose \
  --env-file .env.prod \
  -f docker-compose.prod.yml \
  -f docker-compose.prod.multi-project.yml \
  -p "${COMPOSE_PROJECT_NAME}" \
  ps
REMOTE

echo "Deployment finished."
echo "Frontend: http://${PUBLIC_HOST}:${APP_PORT}"
echo "Backend health: http://${PUBLIC_HOST}:${APP_API_PORT}/health/live"
