#!/bin/bash
# 配置 NanoVPS Agent
# 下载 config.example.json 并配置

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

CONFIG_DIR="/etc/nanovps-agent"
CONFIG_FILE="$CONFIG_DIR/config.json"
CONFIG_EXAMPLE_URL="https://raw.githubusercontent.com/audsiui/nanovps-agent/master/config.example.json"

# 检查 agent 是否已安装
if [ ! -f "/usr/local/bin/nanovps-agent" ]; then
    echo "错误: 未找到 nanovps-agent"
    echo "请先运行 download-agent.sh"
    exit 1
fi

# 创建配置目录
mkdir -p "$CONFIG_DIR"

# 检查是否已有 config.json 文件
if [ -f "$CONFIG_FILE" ]; then
    echo "检测到已存在 config.json 文件"
    read -p "是否覆盖? (y/N): " -n 1 -r < /dev/tty
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "保持现有配置"
        echo ""
        echo "配置文件: $CONFIG_FILE"
        echo "如需修改，请手动编辑: nano $CONFIG_FILE"
        exit 0
    fi
    cp "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%Y%m%d_%H%M%S)"
fi

echo "正在下载配置文件..."

# 下载 config.example.json 作为 config.json
if ! wget -q "$CONFIG_EXAMPLE_URL" -O "$CONFIG_FILE"; then
    echo "错误: 无法下载 config.example.json"
    echo "请手动从 GitHub 下载并放置到 $CONFIG_FILE"
    exit 1
fi

echo "✓ 配置文件已下载到: $CONFIG_FILE"
echo ""

# 提示用户修改配置
echo "====================================="
echo "  重要: 请配置以下必填项"
echo "====================================="
echo ""
echo "需要修改 $CONFIG_FILE 中的以下字段:"
echo ""
echo "1. agentId (必填) — 您的 Agent 标识，由服务端分配"
echo "2. serverUrl (必填) — 服务端 WebSocket 地址"
echo ""
echo "当前配置:"
echo ""
cat "$CONFIG_FILE"
echo ""
echo "请修改为您的实际配置，例如:"
echo '  "agentId": "my-vps-001"'
echo '  "serverUrl": "ws://your-server.com:3000/ws"'
echo '  "serverUrl": "wss://your-server.com:3000/ws" (SSL)'
echo ""

echo ""
echo "⚠ 重要: 请手动编辑配置文件:"
echo "  nano $CONFIG_FILE"
echo ""
echo "必须修改 agentId 为您的服务端分配的标识"
echo "必须修改 serverUrl 为您的服务端地址"
echo ""

echo ""
echo "====================================="
echo "  配置完成!"
echo "====================================="
echo ""
echo "配置目录: $CONFIG_DIR"
echo "配置文件: $CONFIG_FILE"
echo ""