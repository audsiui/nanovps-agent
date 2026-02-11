#!/bin/bash
# Podman 安装脚本 - Debian 13

set -e

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo "错误: 请使用 root 权限运行此脚本"
    exit 1
fi

# 检查 SWAP
echo "====================================="
echo "  检查系统 SWAP"
echo "====================================="
echo ""

# 获取系统信息
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
    
    # 询问是否添加 SWAP
    read -p "是否现在添加 SWAP? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "请选择 SWAP 大小:"
        echo "  1) ${SWAP_RECOMMENDED}MB (推荐: 内存的 2 倍)"
        echo "  2) 4096MB (4GB)"
        echo "  3) 8192MB (8GB)"
        echo "  4) 自定义大小"
        echo ""
        read -p "请选择 (1-4): " SWAP_CHOICE
        
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
                read -p "请输入 SWAP 大小 (MB): " SWAP_SIZE_MB
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
        
        # 创建 SWAP 文件
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
        read -p "按回车键继续..."
    fi
else
    echo "✓ SWAP 已配置"
    echo ""
    # 检查 SWAP 是否小于推荐值
    if [ "$SWAP_TOTAL" -lt "$SWAP_RECOMMENDED" ]; then
        echo "提示: 当前 SWAP 小于推荐值 (${SWAP_RECOMMENDED}MB)"
        echo "      如需调整，可以运行: swapoff /swapfile && rm /swapfile"
        echo "      然后重新运行此脚本"
        echo ""
        read -p "按回车键继续安装..."
    fi
fi

echo ""
echo "正在安装 Podman..."
apt-get update
apt-get install -y podman

echo "安装完成!"
podman --version

echo ""
echo "正在启用 Podman 服务..."
systemctl enable --now podman.socket

echo ""
echo "正在检查 Podman 服务状态..."
# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/check-podman-autostart.sh" ]; then
    bash "$SCRIPT_DIR/check-podman-autostart.sh"
else
    echo "✓ Podman 服务已启用并启动"
    echo "  - podman.socket: 开机自启并已启动"
fi
