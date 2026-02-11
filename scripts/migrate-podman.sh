#!/bin/bash
# 强制 Podman 搬家 - 配置 Podman 使用专用 XFS 存储

set -e

# 检查 root
if [ "$EUID" -ne 0 ]; then 
    echo "错误: 请使用 root 权限运行"
    exit 1
fi

# 配置
STORAGE_DIR="/var/lib/nanovps"
MOUNT_POINT="$STORAGE_DIR/data"
PODMAN_ROOT="$MOUNT_POINT/containers"
PODMAN_RUN="$MOUNT_POINT/run"

# 检查挂载点
if ! mountpoint -q "$MOUNT_POINT"; then
    echo "错误: $MOUNT_POINT 未挂载"
    echo "请先运行 setup-xfs-storage.sh 创建 XFS 存储"
    exit 1
fi

echo "正在配置 Podman 使用 $MOUNT_POINT..."
echo ""

# 创建 Podman 配置目录
mkdir -p /etc/containers

# 备份原有配置
if [ -f /etc/containers/storage.conf ]; then
    echo "[1/4] 备份原有配置..."
    cp /etc/containers/storage.conf "/etc/containers/storage.conf.bak.$(date +%Y%m%d_%H%M%S)"
fi

# 创建新的 storage.conf
echo "[2/4] 配置 storage.conf..."
cat > /etc/containers/storage.conf << EOF
[storage]
# 容器存储根目录
driver = "overlay"
runroot = "$PODMAN_RUN"
graphroot = "$PODMAN_ROOT"

[storage.options]
# 启用 XFS 配额
size = ""
EOF

# 创建必要的目录
echo "[3/4] 创建存储目录..."
mkdir -p "$PODMAN_ROOT"
mkdir -p "$PODMAN_RUN"
chmod 755 "$PODMAN_ROOT"
chmod 755 "$PODMAN_RUN"

# 检查旧数据
echo "[4/4] 检查旧数据..."
OLD_STORAGE="/var/lib/containers"
if [ -d "$OLD_STORAGE" ] && [ "$(ls -A $OLD_STORAGE 2>/dev/null)" ]; then
    echo ""
    echo "检测到旧的容器数据在 $OLD_STORAGE"
    echo "数据大小: $(du -sh $OLD_STORAGE 2>/dev/null | cut -f1)"
    echo ""
    read -p "是否迁移旧数据? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "正在迁移..."
        systemctl stop podman.socket 2>/dev/null || true
        
        if command -v rsync &> /dev/null; then
            rsync -av "$OLD_STORAGE/" "$PODMAN_ROOT/"
        else
            cp -ra "$OLD_STORAGE/"* "$PODMAN_ROOT/" 2>/dev/null || true
        fi
        
        echo "✓ 迁移完成"
    fi
fi

echo ""
echo "====================================="
echo "  Podman 配置完成!"
echo "====================================="
echo ""
echo "存储根目录: $PODMAN_ROOT"
echo "运行时目录: $PODMAN_RUN"
echo ""
