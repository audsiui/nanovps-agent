#!/bin/bash
# Podman 5.x 通用安装脚本
# 自动检测发行版：
#   - Debian 13 / Ubuntu 24.10+ / RHEL 9+ / Fedora 40+ / Alpine 3.20+ / Arch  -> 走包管理器
#   - Debian 11/12、Ubuntu 22.04/24.04 等仅有 4.x 仓库的系统                  -> 走 mgoltzsche/podman-static
# 强制要求最终 Podman >= 5.0（Agent 硬编码 libpod/v5.0.0 API）

set -e

PODMAN_VERSION="${PODMAN_VERSION:-v5.8.1}"
PODMAN_STATIC_REPO="mgoltzsche/podman-static"

if [ "$EUID" -ne 0 ]; then
    echo "错误: 请使用 root 权限运行此脚本"
    exit 1
fi

# --- SWAP 检查 ---
echo "====================================="
echo "  检查系统 SWAP"
echo "====================================="
echo ""

MEMORY_TOTAL=$(free -m | awk '/^Mem:/ {print $2}')
SWAP_TOTAL=$(free -m | awk '/^Swap:/ {print $2}')
SWAP_RECOMMENDED=$((MEMORY_TOTAL * 2))

echo "系统内存: ${MEMORY_TOTAL}MB"
echo "当前 SWAP: ${SWAP_TOTAL}MB"
echo "推荐 SWAP: ${SWAP_RECOMMENDED}MB (内存的 2 倍)"
echo ""
echo "注意: 实际 SWAP 需求取决于您的超开策略"
echo "      如果计划超开容器，建议适当增加"
echo ""

if [ "$SWAP_TOTAL" -eq 0 ]; then
    echo "⚠ 警告: 系统未配置 SWAP"
    echo ""
    echo "SWAP 的作用:"
    echo "  • 防止内存不足时系统崩溃"
    echo "  • 提高系统稳定性"
    echo "  • 为容器提供额外的内存缓冲"
    echo ""

    read -p "是否现在添加 SWAP? (y/N): " -n 1 -r < /dev/tty
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "请选择 SWAP 大小:"
        echo "  1) ${SWAP_RECOMMENDED}MB (推荐: 内存的 2 倍)"
        echo "  2) 4096MB (4GB)"
        echo "  3) 8192MB (8GB)"
        echo "  4) 自定义大小"
        echo ""
        read -p "请选择 (1-4): " SWAP_CHOICE < /dev/tty

        case $SWAP_CHOICE in
            1)
                SWAP_SIZE_MB=$SWAP_RECOMMENDED
                ;;
            2)
                SWAP_SIZE_MB=4096
                ;;
            3)
                SWAP_SIZE_MB=8192
                ;;
            4)
                read -p "请输入 SWAP 大小 (MB): " SWAP_SIZE_MB < /dev/tty
                if ! [[ "$SWAP_SIZE_MB" =~ ^[0-9]+$ ]]; then
                    echo "错误: 无效的数字"
                    exit 1
                fi
                ;;
            *)
                echo "无效的选择"
                exit 1
                ;;
        esac

        SWAP_SIZE_GB=$(( (SWAP_SIZE_MB + 1023) / 1024 ))

        echo ""
        echo "正在创建 ${SWAP_SIZE_MB}MB (${SWAP_SIZE_GB}GB) 的 SWAP..."
        echo ""

        echo "[1/4] 创建 SWAP 文件..."
        fallocate -l ${SWAP_SIZE_MB}M /swapfile

        echo "[2/4] 设置权限..."
        chmod 600 /swapfile

        echo "[3/4] 格式化为 SWAP..."
        mkswap /swapfile

        echo "[4/4] 启用 SWAP 并设置开机启动..."
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' >> /etc/fstab

        echo ""
        echo "✓ SWAP 配置完成!"
        free -h | grep -E "^Mem:|^Swap:"
        echo ""
    else
        echo ""
        echo "⚠ 未配置 SWAP，继续安装 Podman..."
        echo "  建议: 安装完成后手动配置 SWAP"
        echo ""
        read -p "按回车键继续..." < /dev/tty
    fi
else
    echo "✓ SWAP 已配置"
    echo ""
    if [ "$SWAP_TOTAL" -lt "$SWAP_RECOMMENDED" ]; then
        echo "提示: 当前 SWAP 小于推荐值 (${SWAP_RECOMMENDED}MB)"
        echo "      如需调整，可以运行: swapoff /swapfile && rm /swapfile"
        echo "      然后重新运行此脚本"
        echo ""
        read -p "按回车键继续安装..." < /dev/tty
    fi
fi

# --- 发行版检测 ---
if [ ! -f /etc/os-release ]; then
    echo "错误: 缺少 /etc/os-release，无法检测发行版"
    exit 1
fi
. /etc/os-release
DISTRO_ID="${ID:-unknown}"
DISTRO_VERSION="${VERSION_ID:-}"

# --- 架构检测 ---
case "$(uname -m)" in
    x86_64|amd64)  ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "错误: 不支持的架构 $(uname -m)"; exit 1 ;;
esac

# --- 决定安装方式 ---
USE_STATIC=1
case "$DISTRO_ID" in
    debian)
        MAJOR=$(echo "$DISTRO_VERSION" | cut -d. -f1)
        [ "${MAJOR:-0}" -ge 13 ] 2>/dev/null && USE_STATIC=0
        ;;
    ubuntu)
        MAJOR=$(echo "$DISTRO_VERSION" | cut -d. -f1)
        MINOR=$(echo "$DISTRO_VERSION" | cut -d. -f2)
        if [ "${MAJOR:-0}" -gt 24 ] 2>/dev/null; then
            USE_STATIC=0
        elif [ "${MAJOR:-0}" -eq 24 ] && [ "${MINOR:-0}" -ge 10 ] 2>/dev/null; then
            USE_STATIC=0
        fi
        ;;
    rhel|centos|rocky|almalinux|fedora|arch|alpine|opensuse-tumbleweed)
        USE_STATIC=0
        ;;
esac

echo "====================================="
echo "  Podman 通用安装脚本"
echo "====================================="
echo "  发行版: $DISTRO_ID $DISTRO_VERSION"
echo "  架构:   $ARCH"
if [ "$USE_STATIC" -eq 1 ]; then
    echo "  方式:   静态二进制 ($PODMAN_VERSION, mgoltzsche/podman-static)"
else
    echo "  方式:   发行版包管理器"
fi
echo "====================================="
echo ""

# --- 检查现有 Podman ---
EXISTING_MAJOR=0
if command -v podman >/dev/null 2>&1; then
    EXISTING_VER=$(podman --version 2>/dev/null | awk '{print $3}' || echo "0")
    EXISTING_MAJOR=$(echo "$EXISTING_VER" | cut -d. -f1)
    if [ "${EXISTING_MAJOR:-0}" -ge 5 ] 2>/dev/null; then
        echo "✓ 已安装 Podman $EXISTING_VER (>= 5.0)，仅启用服务"
        systemctl daemon-reload || true
        systemctl enable --now podman.socket
        systemctl list-unit-files 2>/dev/null | grep -q podman-restart.service \
            && systemctl enable --now podman-restart.service || true
        echo ""
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        [ -f "$SCRIPT_DIR/check-podman-autostart.sh" ] && bash "$SCRIPT_DIR/check-podman-autostart.sh"
        exit 0
    fi
    echo "⚠ 检测到旧版 Podman $EXISTING_VER (< 5.0)，将先卸载"
    case "$DISTRO_ID" in
        debian|ubuntu)
            apt-get remove -y podman podman-docker 2>/dev/null || true
            ;;
        rhel|centos|rocky|almalinux|fedora)
            dnf remove -y podman 2>/dev/null || true
            ;;
        alpine)
            apk del podman 2>/dev/null || true
            ;;
    esac
    echo ""
fi

# --- 安装 ---
if [ "$USE_STATIC" -eq 0 ]; then
    case "$DISTRO_ID" in
        debian|ubuntu)
            apt-get update
            apt-get install -y podman
            ;;
        rhel|centos|rocky|almalinux|fedora)
            dnf install -y podman
            ;;
        alpine)
            apk add --no-cache podman
            ;;
        arch)
            pacman -Sy --noconfirm podman
            ;;
        opensuse-tumbleweed)
            zypper install -y podman
            ;;
    esac
else
    echo "[1/5] 安装静态 Podman 所需的宿主依赖..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y --no-install-recommends \
            iptables uidmap util-linux ca-certificates curl tar
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y iptables shadow-utils util-linux ca-certificates curl tar
    elif command -v yum >/dev/null 2>&1; then
        yum install -y iptables shadow-utils util-linux ca-certificates curl tar
    else
        echo "  警告: 未识别的包管理器，跳过依赖安装（请确保已装 iptables/uidmap/curl/tar）"
    fi

    echo ""
    echo "[2/5] 下载 podman-static $PODMAN_VERSION ($ARCH)..."
    TMP=$(mktemp -d)
    trap 'rm -rf "$TMP"' EXIT
    URL="https://github.com/${PODMAN_STATIC_REPO}/releases/download/${PODMAN_VERSION}/podman-linux-${ARCH}.tar.gz"
    echo "  $URL"
    if ! curl -fsSL -o "$TMP/podman.tar.gz" "$URL"; then
        echo "错误: 下载失败"
        exit 1
    fi

    echo ""
    echo "[3/5] 解压并合并到 / ..."
    tar -xzf "$TMP/podman.tar.gz" -C "$TMP"
    SRC="$TMP/podman-linux-${ARCH}"
    if [ ! -d "$SRC/usr" ]; then
        echo "错误: 压缩包结构异常，找不到 $SRC/usr"
        exit 1
    fi
    cp -r "$SRC/usr" /
    [ -d "$SRC/etc" ] && cp -r "$SRC/etc" /

    echo ""
    echo "[4/5] 配置 systemd 单元..."
    if [ -d /usr/local/lib/systemd/system ]; then
        for unit in /usr/local/lib/systemd/system/podman.socket \
                    /usr/local/lib/systemd/system/podman.service \
                    /usr/local/lib/systemd/system/podman-restart.service; do
            [ -f "$unit" ] || continue
            name=$(basename "$unit")
            ln -sf "$unit" "/etc/systemd/system/$name"
            echo "  链接 $unit -> /etc/systemd/system/$name"
        done
    fi
    if [ ! -e /etc/systemd/system/podman.socket ]; then
        cat > /etc/systemd/system/podman.socket <<'EOF'
[Unit]
Description=Podman API Socket
Documentation=man:podman-system-service(1)

[Socket]
ListenStream=%t/podman/podman.sock
SocketMode=0660

[Install]
WantedBy=sockets.target
EOF
        cat > /etc/systemd/system/podman.service <<'EOF'
[Unit]
Description=Podman API Service
Requires=podman.socket
After=podman.socket
Documentation=man:podman-system-service(1)

[Service]
Type=exec
KillMode=process
ExecStart=/usr/local/bin/podman system service --time=0

[Install]
WantedBy=multi-user.target
EOF
        echo "  写入自定义 podman.socket / podman.service"
    fi

    # Ubuntu 23.10+ apparmor 修复
    if [ -f /etc/apparmor.d/podman ] && ! grep -q '/usr/{bin,local/bin}/podman' /etc/apparmor.d/podman; then
        sed -Ei 's!^profile podman /usr/bin/podman !profile podman /usr/{bin,local/bin}/podman !' /etc/apparmor.d/podman
        systemctl reload apparmor 2>/dev/null || true
        echo "  已修补 /etc/apparmor.d/podman"
    fi

    systemctl daemon-reload
fi

echo ""
echo "[5/5] 启用 Podman 服务..."
systemctl enable --now podman.socket
if systemctl list-unit-files 2>/dev/null | grep -q podman-restart.service; then
    systemctl enable --now podman-restart.service
fi

# --- 验证 ---
echo ""
if ! command -v podman >/dev/null 2>&1; then
    echo "✗ 安装失败: 找不到 podman 命令"
    exit 1
fi
FINAL_VER=$(podman --version | awk '{print $3}')
FINAL_MAJOR=$(echo "$FINAL_VER" | cut -d. -f1)
if [ "${FINAL_MAJOR:-0}" -lt 5 ] 2>/dev/null; then
    echo "✗ 安装失败: Podman 版本 $FINAL_VER < 5.0，与 Agent 不兼容"
    exit 1
fi

echo "====================================="
echo "  ✓ 安装完成"
echo "====================================="
echo "  Podman 版本: $FINAL_VER"
echo "  二进制路径:  $(command -v podman)"
echo "  Socket:      /run/podman/podman.sock"
echo "====================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/check-podman-autostart.sh" ]; then
    bash "$SCRIPT_DIR/check-podman-autostart.sh"
fi
