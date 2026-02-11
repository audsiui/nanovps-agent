#!/bin/bash
# 创建 NanoVPS Agent systemd 服务
# 支持开机自启、自动重启（最多5次）

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

INSTALL_DIR="/opt/nanovps"
SERVICE_NAME="nanovps-agent"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# 检查程序是否存在
if [ ! -f "$INSTALL_DIR/nanovps-agent" ]; then
    echo "错误: 未找到 nanovps-agent"
    echo "请先运行 download-agent.sh"
    exit 1
fi

# 检查配置文件是否存在
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo "警告: 未找到 .env 配置文件"
    echo "请先运行 setup-config.sh"
    echo ""
    read -p "是否继续? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
fi

echo "正在创建 systemd 服务..."

# 创建服务文件
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=NanoVPS Agent - VPS monitoring and management service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/nanovps-agent
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=5

# 环境变量
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="HOME=/root"

# 日志
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nanovps-agent

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
echo "  ✓ 自动重启 (退出后5秒自动重启)"
echo "  ✓ 重启限制 (60秒内最多5次，超过则停止)"
echo ""
echo "管理命令:"
echo "  systemctl start $SERVICE_NAME    # 启动服务"
echo "  systemctl stop $SERVICE_NAME     # 停止服务"
echo "  systemctl restart $SERVICE_NAME  # 重启服务"
echo "  systemctl status $SERVICE_NAME   # 查看状态"
echo "  journalctl -u $SERVICE_NAME -f   # 查看日志"
echo ""

# 询问是否立即启动
read -p "是否立即启动服务? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "启动服务..."
    systemctl start "$SERVICE_NAME"
    sleep 2
    echo ""
    systemctl status "$SERVICE_NAME" --no-pager
fi

echo ""
