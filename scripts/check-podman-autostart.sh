#!/bin/bash
# 检查 Podman 自启动配置

echo "检查 Podman 自启动状态..."
echo ""

# 检查 socket 服务状态
echo "[1/2] Socket 服务状态:"
systemctl is-enabled podman.socket 2>/dev/null && echo "  ✓ podman.socket 已启用开机自启" || echo "  ✗ podman.socket 未启用"

# 检查 service 服务状态（可选）
echo ""
echo "[2/2] Service 服务状态:"
systemctl is-enabled podman.service 2>/dev/null && echo "  ✓ podman.service 已启用开机自启" || echo "  - podman.service 未启用（通常不需要）"

echo ""
echo "说明:"
echo "  podman.socket - 用于 API 和无根模式（已配置）"
echo "  podman.service - 用于根容器（可选）"
echo ""
