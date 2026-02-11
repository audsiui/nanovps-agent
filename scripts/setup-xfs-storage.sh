#!/bin/bash
# 为 Podman 准备 XFS 存储 (带项目配额)
# 使用规范路径: /var/lib/nanovps

set -e

# 检查 root
if [ "$EUID" -ne 0 ]; then 
    echo "错误: 请使用 root 权限运行"
    exit 1
fi

# 配置
STORAGE_DIR="/var/lib/nanovps"
DISK_FILE="$STORAGE_DIR/storage.img"
MOUNT_POINT="$STORAGE_DIR/data"

# 输入存储大小
echo "====================================="
echo "  NanoVPS XFS 存储配置"
echo "====================================="
echo ""
echo "专用存储路径: $STORAGE_DIR"
echo ""
echo "请输入存储大小 (单位: GB，如 20、50):"
read -r SIZE_NUM

# 验证输入
if [[ ! "$SIZE_NUM" =~ ^[0-9]+$ ]]; then
    echo "错误: 请输入数字，如 20"
    exit 1
fi

SIZE="${SIZE_NUM}G"

echo ""
echo "配置确认:"
echo "  磁盘文件: $DISK_FILE"
echo "  挂载点: $MOUNT_POINT"
echo "  大小: $SIZE"
echo ""
echo "继续? (y/N)"
read -r CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    exit 0
fi

echo ""
echo "[1/6] 安装 xfsprogs..."
apt-get update -qq
apt-get install -y -qq xfsprogs

echo "[2/6] 创建存储目录..."
mkdir -p "$STORAGE_DIR"

echo "[3/6] 创建 ${SIZE} 磁盘文件 ($DISK_FILE)..."
fallocate -l "$SIZE" "$DISK_FILE"

echo "[4/6] 格式化为 XFS..."
mkfs.xfs "$DISK_FILE"

echo "[5/6] 创建挂载点 ($MOUNT_POINT)..."
mkdir -p "$MOUNT_POINT"

echo "[6/6] 挂载 (启用 pquota)..."
mount -o loop,pquota "$DISK_FILE" "$MOUNT_POINT"

echo "[6/6] 配置开机挂载..."
if ! grep -q "$DISK_FILE" /etc/fstab; then
    echo "$DISK_FILE $MOUNT_POINT xfs loop,pquota 0 0" >> /etc/fstab
fi

echo ""
echo "====================================="
echo "  完成！"
echo "====================================="
echo ""
df -h "$MOUNT_POINT"
echo ""
echo "磁盘文件: $DISK_FILE"
echo "挂载点: $MOUNT_POINT"
echo ""
echo "✓ 专用存储已准备就绪"
