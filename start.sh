#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> 检查 Node 版本（要求 24.x）..."
if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 node，请先安装 Node 24.x（推荐 nvm: nvm install 24 && nvm use 24）" >&2
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -ne 24 ]; then
  echo "警告：当前 Node 是 $(node -v)，项目要求 24.x，可能存在不兼容" >&2
fi

echo "==> 检查依赖..."
if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖（npm ci）..."
  npm ci
else
  echo "依赖已存在，跳过安装"
fi

echo "==> 检查环境变量..."
if [ ! -f .env ] && [ -f .env.example ]; then
  echo "未发现 .env，从 .env.example 复制一份（按需编辑其中的密钥）"
  cp .env.example .env
fi

echo "==> 启动 Vite 开发服务器..."
echo "    访问 http://localhost:5173 预览站点"
echo "    按 Ctrl+C 停止"
echo
exec npm run dev