#!/bin/bash
# 配置 NanoVPS Agent
# 下载 .env.example 并配置环境变量

set -e

echo "====================================="
echo "  配置 NanoVPS Agent"
echo "====================================="
echo ""

# 检查 root
if [ "$EUID" -ne 0 ]; then
    echo "错误: 需要 root 权限"
    exit 1
fi

INSTALL_DIR="/opt/nanovps"
ENV_FILE="$INSTALL_DIR/.env"
ENV_EXAMPLE_URL="https://raw.githubusercontent.com/audsiui/nanovps-agent/main/.env.example"

# 检查 agent 是否已安装
if [ ! -f "$INSTALL_DIR/nanovps-agent" ]; then
    echo "错误: 未找到 nanovps-agent"
    echo "请先运行 download-agent.sh"
    exit 1
fi

# 检查是否已有 .env 文件
if [ -f "$ENV_FILE" ]; then
    echo "检测到已存在 .env 文件"
    read -p "是否覆盖? (y/N): " -n 1 -r < /dev/tty
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "保持现有配置"
        exit 0
    fi
    cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d_%H%M%S)"
fi

echo "正在下载配置文件..."

# 下载 .env.example
if ! wget -q "$ENV_EXAMPLE_URL" -O "$ENV_FILE"; then
    echo "错误: 无法下载 .env.example"
    echo "请手动从 GitHub 下载并放置到 $ENV_FILE"
    exit 1
fi

echo "✓ 配置文件已下载到: $ENV_FILE"
echo ""

# 提示用户修改 SERVER_URL
echo "====================================="
echo "  重要: 请配置服务端地址"
echo "====================================="
echo ""
echo "需要修改 $ENV_FILE 中的 SERVER_URL"
echo ""
echo "当前配置:"
grep "^SERVER_URL=" "$ENV_FILE" || echo "SERVER_URL=ws://localhost:8080"
echo ""
echo "请修改为您的服务端地址，例如:"
echo "  SERVER_URL=ws://your-server.com:8080"
echo "  SERVER_URL=wss://your-server.com:8080 (SSL)"
echo ""

# 询问是否立即编辑
read -p "是否立即编辑配置文件? (y/N): " -n 1 -r < /dev/tty
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v nano &> /dev/null; then
        nano "$ENV_FILE"
    elif command -v vim &> /dev/null; then
        vim "$ENV_FILE"
    else
        echo "未找到编辑器，请手动编辑:"
        echo "  $ENV_FILE"
    fi
else
    echo ""
    echo "请稍后手动编辑配置文件:"
    echo "  $ENV_FILE"
fi

echo ""
echo "====================================="
echo "  配置完成!"
echo "====================================="
echo ""
echo "程序目录: $INSTALL_DIR"
echo "配置文件: $ENV_FILE"
echo ""
