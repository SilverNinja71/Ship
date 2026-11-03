#!/bin/sh
# Builds the public website into apps/web/dist, with the Lookout as a download.
set -e

npm run build -w @ship/web
npm run build -w @ship/extension

cd apps/extension/dist
zip -qr ../../web/dist/lookout.zip . -x 'dev/*'
