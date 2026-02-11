#!/bin/bash
# 下载 NanoVPS Agent
# 自动检测架构并下载最新版本

set -e

# 检测架构
detect_arch() {
    local arch=$(uname -m)
    case "$arch" in
        x86_64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "错误: 不支持的架构: $arch" >&2
            exit 1
            ;;
    esac
}

# 获取最新版本号
get_latest_version() {
    local api_url="https://api.github.com/repos/audsiui/nanovps-agent/releases/latest"
    
    if command -v curl &> /dev/null; then
        curl -s "$api_url" | grep '"tag_name":' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/'
    elif command -v wget &> /dev/null; then
        wget -qO- "$api_url" | grep '"tag_name":' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/'
    else
        echo ""
    fi
}

# 显示手动下载提示
show_manual_download_help() {
    local arch=$1
    echo ""
    echo "====================================="
    echo "  自动下载失败，请手动下载"
    echo "====================================="
    echo ""
    echo "步骤："
    echo "1. 访问 https://github.com/audsiui/nanovps-agent/releases"
    echo "2. 下载最新版本的 nanovps-agent-linux-${arch}"
    echo "3. 将文件上传到 /opt/nanovps/ 目录"
    echo "4. 执行: chmod +x /opt/nanovps/nanovps-agent"
    echo ""
    echo "或者直接执行："
    echo "  mkdir -p /opt/nanovps"
    echo "  wget https://github.com/audsiui/nanovps-agent/releases/latest/download/nanovps-agent-linux-${arch} -O /opt/nanovps/nanovps-agent"
    echo "  chmod +x /opt/nanovps/nanovps-agent"
    echo ""
}

echo "====================================="
echo "  下载 NanoVPS Agent"
echo "====================================="
echo ""

# 检查 root
if [ "$EUID" -ne 0 ]; then
    echo "错误: 需要 root 权限"
    exit 1
fi

# 配置
INSTALL_DIR="/opt/nanovps"
TARGET_FILE="$INSTALL_DIR/nanovps-agent"

# 第 1 步：创建目录并安装 wget
echo "[1/3] 创建目录并安装 wget..."
mkdir -p "$INSTALL_DIR"
apt-get update -qq
apt-get install -y -qq wget

# 第 2 步：获取最新版本号
echo "[2/3] 获取最新版本号..."
VERSION=$(get_latest_version)
ARCH=$(detect_arch)

if [ -z "$VERSION" ]; then
    echo "警告: 无法自动获取最新版本号"
    show_manual_download_help "$ARCH"
    exit 1
fi

echo "最新版本: $VERSION"
echo "检测到架构: $ARCH"

# 构建下载链接
BINARY_NAME="nanovps-agent-linux-${ARCH}"
DOWNLOAD_URL="https://github.com/audsiui/nanovps-agent/releases/download/${VERSION}/${BINARY_NAME}"

echo "下载地址: $DOWNLOAD_URL"
echo ""

# 第 3 步：下载二进制文件
echo "[3/3] 下载 NanoVPS Agent..."

# 先移除 set -e 以处理下载失败
set +e
wget -q --show-progress "$DOWNLOAD_URL" -O "$TARGET_FILE"
DOWNLOAD_STATUS=$?
set -e

if [ $DOWNLOAD_STATUS -ne 0 ]; then
    echo ""
    echo "错误: 下载失败 (状态码: $DOWNLOAD_STATUS)"
    # 清理可能残留的不完整文件
    rm -f "$TARGET_FILE"
    show_manual_download_help "$ARCH"
    exit 1
fi

chmod +x "$TARGET_FILE"

echo ""
echo "====================================="
echo "  下载完成!"
echo "====================================="
echo ""
echo "版本: $VERSION"
echo "架构: $ARCH"
echo "程序路径: $TARGET_FILE"
echo ""
