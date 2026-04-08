#!/usr/bin/env bash
set -euo pipefail

# WeGO 一键上线脚本：
# - 拉取指定分支
# - Docker Compose 重建并启动
# - 健康检查
# - 可选页面探活

BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/healthz}"
CHECK_URLS="${CHECK_URLS:-}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
  printf "${GREEN}[deploy]${NC} %s\n" "$*"
}

warn() {
  printf "${YELLOW}[deploy]${NC} %s\n" "$*"
}

err() {
  printf "${RED}[deploy]${NC} %s\n" "$*" >&2
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "缺少命令: $1"
    exit 1
  fi
}

usage() {
  cat <<'EOF'
用法:
  ./scripts/deploy.sh

可选环境变量:
  BRANCH=main
  REMOTE=origin
  PROJECT_DIR=/home/deploy/WeGO
  HEALTH_URL=http://127.0.0.1:8787/healthz
  CHECK_URLS="https://your-domain/index.html https://your-domain/route-detail.html?route=xxx"

示例:
  BRANCH=main CHECK_URLS="https://zhangxianyue.cn/index.html https://zhangxianyue.cn/search.html" ./scripts/deploy.sh
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

need_cmd git
need_cmd docker
need_cmd curl

if ! docker compose version >/dev/null 2>&1; then
  err "当前环境不支持 'docker compose'，请先安装 Docker Compose v2。"
  exit 1
fi

cd "$PROJECT_DIR"

if [[ ! -f "docker-compose.yml" ]]; then
  err "未找到 docker-compose.yml，请检查 PROJECT_DIR: $PROJECT_DIR"
  exit 1
fi

log "当前目录: $PROJECT_DIR"
log "拉取代码: $REMOTE/$BRANCH"
git fetch "$REMOTE" "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"

log "启动容器（含重建）"
docker compose up -d --build

log "等待后端健康检查: $HEALTH_URL"
ok=0
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  err "后端健康检查失败，请查看日志：docker compose logs --tail=200 backend nginx"
  exit 1
fi
log "后端健康检查通过"

if [[ -n "$CHECK_URLS" ]]; then
  warn "开始页面探活"
  for url in $CHECK_URLS; do
    code="$(curl -k -s -o /dev/null -w '%{http_code}' "$url" || true)"
    if [[ "$code" == "200" || "$code" == "301" || "$code" == "302" ]]; then
      log "OK  $url ($code)"
    else
      warn "WARN $url ($code)"
    fi
  done
fi

log "容器状态"
docker compose ps

log "部署完成"
