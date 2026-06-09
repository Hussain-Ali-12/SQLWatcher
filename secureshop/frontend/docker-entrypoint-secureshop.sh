#!/bin/sh
set -eu
API_BASE="${SECURESHOP_API_BASE_URL:-http://127.0.0.1:9000}"
cat > /usr/share/nginx/html/config.js <<EOF
window.SECURESHOP_API_BASE = "${API_BASE}";
EOF
