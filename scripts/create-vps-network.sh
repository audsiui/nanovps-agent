#!/bin/bash
# 创建 vps-net 网络 - 支持 IPv4 和 IPv6
# 用于 NanoVPS Agent 项目

set -e

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo "错误: 请使用 root 权限运行此脚本"
    exit 1
fi

# 网络配置
NETWORK_NAME="vps-net"
IPV4_SUBNET="10.88.0.0/16"
IPV4_GATEWAY="10.88.0.1"
IPV6_SUBNET="fd00:dead:beef::/64"
IPV6_GATEWAY="fd00:dead:beef::1"

echo "====================================="
echo "  创建 Podman 网络: $NETWORK_NAME"
echo "====================================="
echo ""

# 检查网络是否已存在
if podman network exists "$NETWORK_NAME"; then
    echo "网络 '$NETWORK_NAME' 已存在"
    echo ""
    echo "现有网络信息:"
    podman network inspect "$NETWORK_NAME" --format 'table {{.Name}}\t{{.NetworkInterface}}\t{{.Driver}}' 2>/dev/null || \
    podman network inspect "$NETWORK_NAME"
    echo ""
    read -p "是否删除并重新创建? (y/N): " -n 1 -r < /dev/tty
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "删除现有网络..."
        podman network rm "$NETWORK_NAME"
    else
        echo "保持现有网络配置"
        exit 0
    fi
fi

echo "正在创建网络 '$NETWORK_NAME'..."
echo "  IPv4 子网: $IPV4_SUBNET"
echo "  IPv4 网关: $IPV4_GATEWAY"
echo "  IPv6 子网: $IPV6_SUBNET"
echo "  IPv6 网关: $IPV6_GATEWAY"
echo ""

# 创建支持 IPv4 和 IPv6 的网络
podman network create \
    --driver bridge \
    --subnet "$IPV4_SUBNET" \
    --gateway "$IPV4_GATEWAY" \
    --ipv6 \
    --subnet "$IPV6_SUBNET" \
    --gateway "$IPV6_GATEWAY" \
    "$NETWORK_NAME"

echo ""
echo "====================================="
echo "  网络创建成功!"
echo "====================================="
echo ""
echo "网络详情:"
podman network inspect "$NETWORK_NAME" | grep -E '"name"|"subnet"|"gateway"|"ipv6_enabled"' || \
podman network inspect "$NETWORK_NAME"
echo ""
echo "验证命令:"
echo "  podman network ls                    # 列出所有网络"
echo "  podman network inspect $NETWORK_NAME # 查看详细信息"
echo ""
echo "使用方式:"
echo "  podman run --network $NETWORK_NAME ..."
echo ""
