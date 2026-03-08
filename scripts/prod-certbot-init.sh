#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.prod}"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

: "${DOMAIN:?DOMAIN is required (example: city.example.com)}"
: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL is required (example: ops@example.com)}"

CERTBOT_DOMAINS="${CERTBOT_DOMAINS:-${DOMAIN}}"
DOMAIN_ARGS=""
OLD_IFS=$IFS
IFS=','
for raw_domain in $CERTBOT_DOMAINS; do
  domain="$(printf '%s' "$raw_domain" | tr -d '[:space:]')"
  if [ -n "$domain" ]; then
    DOMAIN_ARGS="${DOMAIN_ARGS} -d ${domain}"
  fi
done
IFS=$OLD_IFS

if [ -z "${DOMAIN_ARGS}" ]; then
  echo "No valid domains were found in CERTBOT_DOMAINS/DOMAIN" >&2
  exit 1
fi

compose() {
  if [ -f "${ENV_FILE}" ]; then
    docker compose --env-file "${ENV_FILE}" -f "${ROOT_DIR}/docker-compose.prod.yml" "$@"
  else
    docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" "$@"
  fi
}

compose up -d edge

# shellcheck disable=SC2086
compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --cert-name "${DOMAIN}" \
  --email "${LETSENCRYPT_EMAIL}" \
  --agree-tos \
  --no-eff-email \
  --rsa-key-size 4096 \
  --keep-until-expiring \
  $DOMAIN_ARGS

compose restart edge
compose up -d certbot

echo "Certbot bootstrap completed for ${CERTBOT_DOMAINS}."
