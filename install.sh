#!/bin/bash

set -e

# ============================================
# NanoVPS Agent 自动化安装脚本
# ============================================

REPO="fhmy/nanovps-agent"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/nanovps-agent"
SERVICE_NAME="nanovps-agent"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    command -v "$1" >/dev/null 2>&1
}

# 获取系统架构
get_arch() {
    local arch=$(uname -m)
    case $arch in
        x86_64)
            echo "linux-amd64"
            ;;
        aarch64|arm64)
            echo "linux-arm64"
            ;;
        *)
            log_error "不支持的架构: $arch"
            exit 1
            ;;
    esac
}

# 获取最新版本号
get_latest_version() {
    local version_url="https://api.github.com/repos/${REPO}/releases/latest"

    if check_command curl; then
        curl -s "$version_url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    elif check_command wget; then
        wget -qO- "$version_url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
    else
        log_error "需要 curl 或 wget 来获取版本信息"
        exit 1
    fi
}

# 下载文件
download_file() {
    local url="$1"
    local output="$2"

    if check_command curl; then
        curl -fsSL "$url" -o "$output"
    elif check_command wget; then
        wget -q "$url" -O "$output"
    else
        log_error "需要 curl 或 wget 来下载文件"
        exit 1
    fi
}

# 检查是否以 root 运行
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 权限运行此脚本 (sudo)"
        exit 1
    fi
}

# 安装二进制文件
install_binary() {
    local version="$1"
    local arch="$2"
    local download_url="https://github.com/${REPO}/releases/download/${version}/nanovps-agent-${arch}"
    local temp_file="/tmp/nanovps-agent-${arch}"

    log_info "下载 nanovps-agent ${version} (${arch})..."

    if ! download_file "$download_url" "$temp_file"; then
        log_error "下载失败，请检查版本号和网络连接"
        exit 1
    fi

    log_info "安装到 ${INSTALL_DIR}..."
    chmod +x "$temp_file"
    mv "$temp_file" "${INSTALL_DIR}/nanovps-agent"

    log_success "安装完成: ${INSTALL_DIR}/nanovps-agent"
}

# 创建配置文件
setup_config() {
    log_info "设置配置文件..."

    # 创建配置目录
    mkdir -p "$CONFIG_DIR"

    # 如果配置文件已存在，询问是否覆盖
    if [ -f "${CONFIG_DIR}/.env" ]; then
        log_warn "配置文件已存在: ${CONFIG_DIR}/.env"
        read -p "是否覆盖? [y/N]: " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "保留现有配置"
            return
        fi
    fi

    # 创建默认配置
    cat > "${CONFIG_DIR}/.env" << 'EOF'
# NanoVPS Agent 配置文件
# 服务器 WebSocket 地址
SERVER_URL=ws://127.0.0.1:3000/ws

# 上报频率，支持格式: 10s, 20s, 30s (最快10s，最慢30s)
COLLECT_INTERVAL=10s

# 日志配置
# LOG_MODE: console | file | both
LOG_MODE=file
LOG_DIR=/var/log/nanovps-agent
LOG_MAX_SIZE=5m
LOG_MAX_FILES=5
EOF

    log_success "配置文件创建: ${CONFIG_DIR}/.env"
    log_info "请编辑配置文件设置正确的 SERVER_URL"
}

# 创建 systemd 服务
setup_systemd() {
    log_info "创建 systemd 服务..."

    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

    cat > "$service_file" << EOF
[Unit]
Description=NanoVPS Agent - VPS 监控数据采集服务
After=network.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/nanovps-agent
WorkingDirectory=${CONFIG_DIR}
Restart=always
RestartSec=5

# 日志配置
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nanovps-agent

# 安全设置
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${CONFIG_DIR} /var/log/nanovps-agent

[Install]
WantedBy=multi-user.target
EOF

    # 重新加载 systemd
    systemctl daemon-reload

    log_success "systemd 服务创建: $service_file"
}

# 创建日志目录
setup_log_dir() {
    log_info "创建日志目录..."
    mkdir -p /var/log/nanovps-agent
    chmod 755 /var/log/nanovps-agent
    log_success "日志目录: /var/log/nanovps-agent"
}

# 启动服务
start_service() {
    log_info "启动 nanovps-agent 服务..."

    # 启用服务（开机自启）
    systemctl enable "$SERVICE_NAME"

    # 启动服务
    if systemctl start "$SERVICE_NAME"; then
        log_success "服务已启动"
    else
        log_error "服务启动失败，请检查配置"
        log_info "查看日志: journalctl -u $SERVICE_NAME -f"
        return 1
    fi
}

# 显示安装信息
show_info() {
    echo
    echo "=========================================="
    echo "  NanoVPS Agent 安装完成"
    echo "=========================================="
    echo
    echo "  安装路径: ${INSTALL_DIR}/nanovps-agent"
    echo "  配置文件: ${CONFIG_DIR}/.env"
    echo "  日志目录: /var/log/nanovps-agent"
    echo
    echo "  常用命令:"
    echo "    启动服务: systemctl start $SERVICE_NAME"
    echo "    停止服务: systemctl stop $SERVICE_NAME"
    echo "    重启服务: systemctl restart $SERVICE_NAME"
    echo "    查看状态: systemctl status $SERVICE_NAME"
    echo "    查看日志: journalctl -u $SERVICE_NAME -f"
    echo
    echo "=========================================="
    echo
    log_warn "请记得编辑配置文件: ${CONFIG_DIR}/.env"
    log_warn "设置正确的 SERVER_URL 后重启服务"
}

# 卸载函数
uninstall() {
    log_info "卸载 NanoVPS Agent..."

    # 停止并禁用服务
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
    fi
    if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl disable "$SERVICE_NAME"
    fi

    # 删除服务文件
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload

    # 删除二进制文件
    rm -f "${INSTALL_DIR}/nanovps-agent"

    # 询问是否删除配置和日志
    read -p "是否删除配置和日志文件? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$CONFIG_DIR"
        rm -rf "/var/log/nanovps-agent"
        log_info "配置和日志已删除"
    fi

    log_success "NanoVPS Agent 已卸载"
}

# 显示帮助
show_help() {
    cat << EOF
NanoVPS Agent 安装脚本

用法: $0 [选项]

选项:
    -i, --install       安装 NanoVPS Agent (默认)
    -u, --uninstall     卸载 NanoVPS Agent
    -v, --version       指定安装版本 (默认: 最新版)
    -d, --dir           指定安装目录 (默认: /usr/local/bin)
    -h, --help          显示此帮助

示例:
    sudo $0                    # 安装最新版
    sudo $0 -v v1.0.0          # 安装指定版本
    sudo $0 -u                 # 卸载
EOF
}

# 主函数
main() {
    local action="install"
    local version=""

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -i|--install)
                action="install"
                shift
                ;;
            -u|--uninstall)
                action="uninstall"
                shift
                ;;
            -v|--version)
                version="$2"
                shift 2
                ;;
            -d|--dir)
                INSTALL_DIR="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知选项: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 执行操作
    case $action in
        install)
            check_root

            log_info "开始安装 NanoVPS Agent..."

            # 检查依赖
            if ! check_command curl && ! check_command wget; then
                log_error "需要安装 curl 或 wget"
                exit 1
            fi

            # 获取版本
            if [ -z "$version" ]; then
                log_info "获取最新版本..."
                version=$(get_latest_version)
                if [ -z "$version" ]; then
                    log_error "无法获取最新版本号"
                    exit 1
                fi
            fi
            log_info "安装版本: $version"

            # 获取架构
            arch=$(get_arch)
            log_info "系统架构: $arch"

            # 安装步骤
            install_binary "$version" "$arch"
            setup_config
            setup_log_dir
            setup_systemd

            # 询问是否立即启动
            echo
            read -p "是否立即启动服务? [Y/n]: " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                start_service
            fi

            show_info
            ;;

        uninstall)
            check_root
            uninstall
            ;;
    esac
}

# 运行主函数
main "$@"
