#!/bin/sh
set -eu

DOMAIN="${DOMAIN:-localhost}"
SRC_DIR="/etc/nginx/templates-src"
DST_DIR="/etc/nginx/templates"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
DST_TEMPLATE="${DST_DIR}/default.conf.template"

mkdir -p "${DST_DIR}"

if [ -s "${CERT_DIR}/fullchain.pem" ] && [ -s "${CERT_DIR}/privkey.pem" ]; then
  cp "${SRC_DIR}/https.conf.template" "${DST_TEMPLATE}"
  echo "[edge] Using HTTPS template for ${DOMAIN}"
else
  cp "${SRC_DIR}/http.conf.template" "${DST_TEMPLATE}"
  echo "[edge] Using HTTP template for ${DOMAIN}. Run scripts/prod-certbot-init.sh, then restart edge."
fi
