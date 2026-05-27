#!/usr/bin/env bash
# Build & push the TaintedPort image.
# Requires the sibling private repo to be checked out at ../TaintedPort-Vulns.
set -euo pipefail

cd "$(dirname "$0")"

docker buildx build \
    --build-context vulns=../TaintedPort-Vulns \
    --platform linux/amd64 \
    --no-cache \
    -t nunoloureiro/taintedport:latest \
    .

docker push nunoloureiro/taintedport:latest
