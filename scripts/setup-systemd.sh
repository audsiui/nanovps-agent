#!/bin/bash
# 创建 NanoVPS Agent systemd 服务
# 支持开机自启、故障自动重启

set -e

echo "====================================="
echo "  创建 systemd 服务"
echo "====================================="
echo ""

# 检查 root
if [ "$EUID" -ne 0 ]; then
    echo "错误: 需要 root 权限"
    exit 1
fi

CONFIG_DIR="/etc/nanovps-agent"
SERVICE_NAME="nanovps-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# 检查程序是否存在
if [ ! -f "/usr/local/bin/nanovps-agent" ]; then
    echo "错误: 未找到 nanovps-agent"
    echo "请先运行 download-agent.sh"
    exit 1
fi

# 检查配置文件是否存在
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    echo "警告: 未找到 config.json 配置文件"
    echo "请先运行 setup-config.sh"
    echo ""
    read -p "是否继续? (y/N): " -n 1 -r < /dev/tty
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo "正在创建 systemd 服务..."

# 创建服务文件（与 release notes 保持一致）
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=NanoVPS Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$CONFIG_DIR
ExecStart=/usr/local/bin/nanovps-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "✓ 服务文件已创建: $SERVICE_FILE"

# 重新加载 systemd
echo "重新加载 systemd..."
systemctl daemon-reload

# 启用开机自启
echo "启用开机自启..."
systemctl enable "$SERVICE_NAME"

echo ""
echo "====================================="
echo "  systemd 服务配置完成!"
echo "====================================="
echo ""
echo "服务名称: $SERVICE_NAME"
echo ""
echo "服务特性:"
echo "  ✓ 开机自启"
echo "  ✓ 故障自动重启 (间隔 5 秒)"
echo ""
echo "管理命令:"
echo "  systemctl start $SERVICE_NAME    # 启动服务"
echo "  systemctl stop $SERVICE_NAME     # 停止服务"
echo "  systemctl restart $SERVICE_NAME  # 重启服务"
echo "  systemctl status $SERVICE_NAME   # 查看状态"
echo "  journalctl -u $SERVICE_NAME -f   # 查看日志"
echo ""

# 询问是否立即启动
read -p "是否立即启动服务? (y/N): " -n 1 -r < /dev/tty
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "启动服务..."
    systemctl start "$SERVICE_NAME"
    sleep 2
    echo ""
    systemctl status "$SERVICE_NAME" --no-pager
fi

echo ""