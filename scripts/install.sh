#!/bin/bash
# NanoVPS Agent 半自动化安装脚本
# Debian 13 专用
# 支持 curl | bash 方式执行

set -e

# GitHub 仓库配置
GITHUB_USER="audsiui"
GITHUB_REPO="nanovps-agent"
GITHUB_BRANCH="main"
SCRIPTS_BASE_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/scripts"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}错误: 请使用 root 权限运行${NC}"
    echo "用法: sudo bash $0"
    exit 1
fi

# 检测是否在交互式终端运行
INTERACTIVE=false
if [ -t 0 ] && [ -t 1 ]; then
    INTERACTIVE=true
fi

# 创建工作目录
WORK_DIR="/tmp/nanovps-install-$$"
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

echo "====================================="
echo "  NanoVPS Agent 安装向导"
echo "====================================="
echo ""
echo "工作目录: $WORK_DIR"

if [ "$INTERACTIVE" = false ]; then
    echo -e "${YELLOW}注意: 检测到非交互式模式，将自动执行所有步骤${NC}"
fi
echo ""

# 下载所有脚本
echo "正在下载安装脚本..."
SCRIPTS=(
    "install-podman.sh"
    "check-podman-autostart.sh"
    "verify-podman.sh"
    "setup-xfs-storage.sh"
    "migrate-podman.sh"
    "create-vps-network.sh"
    "download-agent.sh"
    "setup-config.sh"
    "setup-systemd.sh"
)

for script in "${SCRIPTS[@]}"; do
    echo "  下载 $script..."
    if ! curl -fsSL "${SCRIPTS_BASE_URL}/${script}" -o "$script"; then
        echo -e "${RED}错误: 无法下载 $script${NC}"
        rm -rf "$WORK_DIR"
        exit 1
    fi
    chmod +x "$script"
done

echo ""
echo "✓ 所有脚本已下载"
echo ""

# 显示欢迎信息
echo "====================================="
echo "  安装向导"
echo "====================================="
echo ""
echo "此脚本将一步步引导您完成安装"
echo "每完成一步，您需要确认后才继续下一步"
echo ""
echo "系统要求: Debian 13"
echo ""

if [ "$INTERACTIVE" = true ]; then
    read -p "按回车键开始安装..."
    echo ""
fi

# 步骤计数器
STEP=0
TOTAL_STEPS=8

# 步骤执行函数
run_step() {
    local step_name=$1
    local step_desc=$2
    local script_name=$3

    STEP=$((STEP + 1))

    echo ""
    echo "====================================="
    echo "  步骤 $STEP/$TOTAL_STEPS: $step_name"
    echo "====================================="
    echo ""
    echo "描述: $step_desc"
    echo ""

    # 非交互模式自动执行
    if [ "$INTERACTIVE" = false ]; then
        echo "正在自动执行..."
        echo ""
    else
        read -p "是否执行此步骤? (y/N): " -n 1 -r
        echo

        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}跳过步骤 $STEP${NC}"
            return 0
        fi

        echo "正在执行..."
        echo ""
    fi

    # 执行脚本
    if [ -f "$script_name" ]; then
        bash "$script_name"
        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}✓ 步骤 $STEP 完成${NC}"
        else
            echo ""
            echo -e "${RED}✗ 步骤 $STEP 执行失败${NC}"

            if [ "$INTERACTIVE" = true ]; then
                read -p "是否继续下一步? (y/N): " -n 1 -r
                echo
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    echo "安装已中止"
                    rm -rf "$WORK_DIR"
                    exit 1
                fi
            else
                # 非交互模式下失败直接退出
                echo "安装已中止"
                rm -rf "$WORK_DIR"
                exit 1
            fi
        fi
    else
        echo -e "${RED}错误: 找不到脚本 $script_name${NC}"
        rm -rf "$WORK_DIR"
        exit 1
    fi
}

# 步骤 1: 安装 Podman
run_step \
    "安装 Podman" \
    "安装 Podman 容器引擎（无根模式支持）" \
    "install-podman.sh"

# 步骤 2: 验证 Podman
run_step \
    "验证 Podman 安装" \
    "运行 hello-world 容器验证无根模式" \
    "verify-podman.sh"

# 步骤 3: 准备 XFS 存储
run_step \
    "准备 XFS 存储" \
    "创建虚拟磁盘文件并格式化为 XFS（支持项目配额）" \
    "setup-xfs-storage.sh"

# 步骤 4: 迁移 Podman 存储
run_step \
    "迁移 Podman 存储" \
    "配置 Podman 使用 XFS 存储目录" \
    "migrate-podman.sh"

# 步骤 5: 创建网络
run_step \
    "创建容器网络" \
    "创建 vps-net 网络（支持 IPv4 和 IPv6）" \
    "create-vps-network.sh"

# 步骤 6: 下载 Agent
run_step \
    "下载 NanoVPS Agent" \
    "自动检测架构并下载最新版本" \
    "download-agent.sh"

# 步骤 7: 配置 Agent
run_step \
    "配置 Agent" \
    "下载 .env 配置文件并设置服务端地址" \
    "setup-config.sh"

# 步骤 8: 创建 systemd 服务
run_step \
    "创建 systemd 服务" \
    "设置开机自启和自动重启（最多5次）" \
    "setup-systemd.sh"

# 清理工作目录
cd /
rm -rf "$WORK_DIR"

# 安装完成 - 显示配置汇总
echo ""
echo "====================================="
echo "  安装向导完成!"
echo "====================================="
echo ""
echo -e "${GREEN}✓ NanoVPS Agent 安装完成${NC}"
echo ""

# 配置汇总
echo "====================================="
echo "  配置汇总"
echo "====================================="
echo ""

# 1. 系统信息
echo "【系统信息】"
echo "  操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
echo "  系统架构: $(uname -m)"
echo ""

# 2. SWAP 信息
echo "【SWAP 配置】"
free -h | grep -E "^Mem:|^Swap:" | while read line; do
    echo "  $line"
done
echo ""

# 3. Agent 程序
echo "【Agent 程序】"
if [ -f /opt/nanovps/nanovps-agent ]; then
    echo "  程序路径: /opt/nanovps/nanovps-agent"
    /opt/nanovps/nanovps-agent --version 2>/dev/null | head -1 || echo "  版本: 未知"
else
    echo "  程序路径: /opt/nanovps/nanovps-agent (未找到)"
fi
echo ""

# 4. 配置文件
echo "【配置文件】"
if [ -f /opt/nanovps/.env ]; then
    echo "  配置文件: /opt/nanovps/.env"
    SERVER_URL=$(grep "^SERVER_URL=" /opt/nanovps/.env 2>/dev/null | cut -d'=' -f2)
    if [ -n "$SERVER_URL" ]; then
        echo "  服务端地址: $SERVER_URL"
    else
        echo "  服务端地址: 未配置 (请修改 .env 文件)"
    fi
else
    echo "  配置文件: /opt/nanovps/.env (未找到)"
fi
echo ""

# 5. XFS 存储
echo "【XFS 存储】"
if mountpoint -q /var/lib/nanovps/data 2>/dev/null; then
    echo "  磁盘文件: /var/lib/nanovps/storage.img"
    echo "  挂载点: /var/lib/nanovps/data"
    df -h /var/lib/nanovps/data | tail -1 | awk '{print "  已用: "$3" / 总计: "$2" (使用率: "$5")"}'
else
    echo "  状态: 未挂载"
fi
echo ""

# 6. Podman 存储
echo "【Podman 存储】"
if [ -f /etc/containers/storage.conf ]; then
    GRAPHROOT=$(grep "^graphroot" /etc/containers/storage.conf 2>/dev/null | cut -d'=' -f2 | tr -d ' "')
    if [ -n "$GRAPHROOT" ]; then
        echo "  存储根目录: $GRAPHROOT"
    else
        echo "  存储根目录: /var/lib/containers (默认)"
    fi
    
    RUNROOT=$(grep "^runroot" /etc/containers/storage.conf 2>/dev/null | cut -d'=' -f2 | tr -d ' "')
    if [ -n "$RUNROOT" ]; then
        echo "  运行时目录: $RUNROOT"
    fi
else
    echo "  存储根目录: /var/lib/containers (默认)"
fi
echo ""

# 7. 容器网络
echo "【容器网络】"
if podman network exists vps-net 2>/dev/null; then
    echo "  网络名称: vps-net"
    echo "  驱动: bridge"
    echo "  IPv4: 10.88.0.0/16 (网关: 10.88.0.1)"
    echo "  IPv6: fd00:dead:beef::/64 (网关: fd00:dead:beef::1)"
else
    echo "  网络名称: vps-net (未创建)"
fi
echo ""

# 8. systemd 服务
echo "【Systemd 服务】"
if [ -f /etc/systemd/system/nanovps-agent.service ]; then
    echo "  服务文件: /etc/systemd/system/nanovps-agent.service"
    
    # 检查服务状态
    if systemctl is-enabled nanovps-agent.service &>/dev/null; then
        echo "  开机自启: 已启用"
    else
        echo "  开机自启: 未启用"
    fi
    
    # 检查运行状态
    if systemctl is-active nanovps-agent.service &>/dev/null; then
        echo "  运行状态: 运行中"
    else
        echo "  运行状态: 未运行"
    fi
else
    echo "  服务文件: 未创建"
fi
echo ""

# 9. 管理命令
echo "【常用命令】"
echo "  启动 Agent:   systemctl start nanovps-agent"
echo "  停止 Agent:   systemctl stop nanovps-agent"
echo "  重启 Agent:   systemctl restart nanovps-agent"
echo "  查看状态:     systemctl status nanovps-agent"
echo "  查看日志:     journalctl -u nanovps-agent -f"
echo "  查看容器:     podman ps"
echo "  查看网络:     podman network ls"
echo "  查看存储:     df -h /var/lib/nanovps/data"
echo ""

# 10. 重要提醒
echo "【重要提醒】"
if [ -f /opt/nanovps/.env ]; then
    SERVER_URL=$(grep "^SERVER_URL=" /opt/nanovps/.env 2>/dev/null | cut -d'=' -f2)
    if [ -z "$SERVER_URL" ] || [ "$SERVER_URL" = "ws://localhost:8080" ]; then
        echo -e "${YELLOW}  ⚠ 请确保已修改 /opt/nanovps/.env 中的 SERVER_URL 为您实际的服务端地址${NC}"
    fi
fi

echo "  • 如需卸载，请保留以下文件/目录："
echo "    - /opt/nanovps/ (程序和数据)"
echo "    - /var/lib/nanovps/ (容器存储)"
echo "    - /swapfile (SWAP)"
echo ""
echo "  • 配置文件位于: /opt/nanovps/.env"
echo ""
echo "====================================="
echo ""
