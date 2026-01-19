#!/bin/sh
set -e

# Inject API_URL into config.js at runtime
if [ -n "$API_URL" ]; then
  sed -i "s|__API_URL_PLACEHOLDER__|$API_URL|g" /usr/share/nginx/html/config.js
  echo "Injected API_URL: $API_URL"
fi

# Inject PORT into nginx config
envsubst '${PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'
