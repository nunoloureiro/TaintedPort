#!/bin/bash
set -e

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  ───────────────────────────────────────────────────────────${NC}"
echo -e "${BOLD}${YELLOW}   _____     _       _           _ ____            _      ${NC}"
echo -e "${BOLD}${YELLOW}  |_   _|_ _(_)_ __ | |_ ___  __| |  _ \\ ___  _ __| |_    ${NC}"
echo -e "${BOLD}${YELLOW}    | |/ _\` | | '_ \\| __/ _ \\/ _\` | |_) / _ \\| '__| __|   ${NC}"
echo -e "${BOLD}${YELLOW}    | | (_| | | | | | ||  __/ (_| |  __/ (_) | |  | |_    ${NC}"
echo -e "${BOLD}${YELLOW}    |_|\\__,_|_|_| |_|\\__\\___|\\__,_|_|   \\___/|_|   \\__|   ${NC}"
echo -e "${CYAN}  ───────────────────────────────────────────────────────────${NC}"
echo ""

IMAGE="nunoloureiro/taintedport:latest"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VULNS_CONTEXT="$SCRIPT_DIR/../TaintedPort-Vulns"

show_help() {
    echo -e "${BOLD}Usage:${NC} ./build.sh [OPTIONS]"
    echo ""
    echo "  Lint, build, and push the TaintedPort Docker image."
    echo "  Requires the vulns build context at ../TaintedPort-Vulns."
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo -e "  ${CYAN}--prune${NC}     Prune unused Docker images after build"
    echo -e "  ${CYAN}--no-push${NC}   Build only — skip 'docker push'"
    echo -e "  ${CYAN}--help${NC}      Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  ./build.sh             Lint, build, push"
    echo "  ./build.sh --no-push   Lint and build only"
    echo "  ./build.sh --prune     Lint, build, push, then prune"
}

DO_PRUNE=false
DO_PUSH=true

for arg in "$@"; do
    case "$arg" in
        --prune)   DO_PRUNE=true ;;
        --no-push) DO_PUSH=false ;;
        --help|-h) show_help; exit 0 ;;
        *) echo -e "${RED}Unknown option: $arg${NC}"; show_help; exit 1 ;;
    esac
done

# ── Sanity check: vulns context must exist ────────────────────
if [ ! -d "$VULNS_CONTEXT" ]; then
    echo -e "  ${RED}✗ Vulns context missing at $VULNS_CONTEXT${NC}"
    exit 1
fi
if [ ! -f "$VULNS_CONTEXT/KnownVulnerabilities.txt" ]; then
    echo -e "  ${RED}✗ KnownVulnerabilities.txt missing in $VULNS_CONTEXT${NC}"
    exit 1
fi

# ── Lint ──────────────────────────────────────────────────────
echo -e "  ${BLUE}${BOLD}[1/3]${NC} ${BOLD}Linting frontend...${NC}"
echo -e "  ${DIM}─────────────────────────────────────────${NC}"

if [ -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    (cd "$SCRIPT_DIR/frontend" && npm run lint -- --quiet) || LINT_EXIT=$?
    LINT_EXIT=${LINT_EXIT:-0}
    if [ $LINT_EXIT -eq 0 ]; then
        echo ""
        echo -e "  ${GREEN}✓ Lint passed${NC}"
    else
        echo ""
        echo -e "  ${RED}✗ Lint failed — aborting build.${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "  ${YELLOW}⚠ frontend/node_modules missing — skipping lint${NC}"
    echo -e "  ${DIM}  (run 'cd frontend && npm install' to enable)${NC}"
fi

# ── Build ──────────────────────────────────────────────────────
echo ""
echo -e "  ${BLUE}${BOLD}[2/3]${NC} ${BOLD}Building Docker image...${NC}"
echo -e "  ${DIM}─────────────────────────────────────────${NC}"

docker buildx build \
    --build-context "vulns=$VULNS_CONTEXT" \
    --platform linux/amd64 \
    --no-cache \
    -t "$IMAGE" \
    "$SCRIPT_DIR"

echo ""
echo -e "  ${GREEN}✓ Image built: ${BOLD}$IMAGE${NC}"

# ── Push ───────────────────────────────────────────────────────
if $DO_PUSH; then
    echo ""
    echo -e "  ${BLUE}${BOLD}[3/3]${NC} ${BOLD}Pushing to Docker Hub...${NC}"
    echo -e "  ${DIM}─────────────────────────────────────────${NC}"

    docker push "$IMAGE"

    echo ""
    echo -e "  ${GREEN}✓ Pushed: ${BOLD}$IMAGE${NC}"
else
    echo ""
    echo -e "  ${YELLOW}⚠ --no-push set — skipping push${NC}"
fi

# ── Prune (optional) ──────────────────────────────────────────
if $DO_PRUNE; then
    echo ""
    echo -e "  ${YELLOW}Pruning unused Docker images...${NC}"
    docker image prune -f
    echo -e "  ${GREEN}✓ Pruned${NC}"
fi

echo ""
echo -e "  ${CYAN}───────────────────────────────────────${NC}"
echo -e "  ${GREEN}${BOLD}✓ All done!${NC} ${DIM}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo ""
