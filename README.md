# NanoVPS Agent

轻量级 VPS 基础设施管理套件，基于 Bun + TypeScript 构建。

> **不只是 Agent，是一整套 VPS 管理基础设施** - 从容器运行时到存储、网络、监控的完整解决方案。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    NanoVPS 基础设施                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ NanoVPS     │  │  Podman     │  │  XFS 存储            │  │
│  │ Agent       │◄─┤  容器引擎   │◄─┤  (项目配额)         │  │
│  │ (监控/管理) │  │             │  │                     │  │
│  └──────┬──────┘  └─────────────┘  └─────────────────────┘  │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  vps-net 网络                        │    │
│  │     IPv4: 10.88.0.0/16 + IPv6: fd00:dead:beef::/64  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           systemd 服务 (开机自启/自动重启)           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  WebSocket 服务端 │
                    │  (用户自部署)    │
                    └─────────────────┘
```

## 核心组件

### 1. NanoVPS Agent
轻量级监控与管理代理
- **系统监控** - CPU、内存、磁盘、网络实时采集
- **容器管理** - 基于 Podman API 管理容器生命周期
- **端口转发** - iptables 端口转发配置
- **实时通信** - WebSocket 双向通信，自动重连

### 2. Podman 容器引擎
无根(rootless)容器运行时
- 无需守护进程，更安全
- 支持无根模式运行
- Docker 兼容的 CLI

### 3. XFS 项目配额存储
专用容器存储，支持资源限制
- 每个容器独立的磁盘配额
- 防止单个容器占满磁盘
- 高性能 XFS 文件系统

### 4. 双栈容器网络
IPv4/IPv6 双栈桥接网络
- 每个容器独立 IP
- 内置 DNS 解析
- 网络隔离安全

### 5. Systemd 服务管理
- 开机自启动
- 异常自动重启（最多5次）
- 日志统一管理

## 一键安装（Debian 13）

一条命令部署完整基础设施：

```bash
curl -fsSL https://raw.githubusercontent.com/audsiui/nanovps-agent/main/scripts/install.sh | bash
```

安装向导会引导您完成 8 个步骤，每个步骤可选择是否执行：

| 步骤 | 组件 | 说明 |
|------|------|------|
| 1 | SWAP | 检查内存，按需配置交换空间 |
| 2 | Podman | 安装容器引擎并验证无根模式 |
| 3 | XFS 存储 | 创建带项目配额的虚拟磁盘 |
| 4 | 存储迁移 | 配置 Podman 使用 XFS 存储 |
| 5 | 容器网络 | 创建 IPv4/IPv6 双栈网络 |
| 6 | Agent | 下载并安装最新版本 |
| 7 | 配置 | 设置服务端地址 |
| 8 | 服务 | 创建 systemd 服务 |

**安装完成后：**
```bash
# 启动服务
systemctl start nanovps-agent

# 查看状态
systemctl status nanovps-agent

# 查看日志
journalctl -u nanovps-agent -f
```

## 手动安装

如需自定义组件，可单独执行各脚本：

```bash
# 1. 下载安装脚本
wget https://raw.githubusercontent.com/audsiui/nanovps-agent/main/scripts/install.sh
chmod +x install.sh

# 2. 分步执行
sudo bash install.sh

# 或单独执行各组件
sudo bash scripts/install-podman.sh      # 仅安装 Podman
sudo bash scripts/setup-xfs-storage.sh   # 仅创建存储
sudo bash scripts/create-vps-network.sh  # 仅创建网络
sudo bash scripts/download-agent.sh      # 仅下载 Agent
sudo bash scripts/setup-config.sh        # 仅配置
sudo bash scripts/setup-systemd.sh       # 仅创建服务
```

## 环境变量

创建 `/opt/nanovps/.env` 配置文件：

| 变量 | 说明 | 默认值 |
|------|------|------|
| `SERVER_URL` | WebSocket 服务器地址 | `ws://localhost:8080` |
| `COLLECT_INTERVAL` | 采集间隔（毫秒） | 2000 |
| `LOG_MODE` | 日志模式：console/file/both | file |
| `LOG_DIR` | 日志目录 | /opt/nanovps/logs |

## 管理命令

```bash
# Agent 管理
systemctl start|stop|restart|status nanovps-agent
journalctl -u nanovps-agent -f

# 容器管理
podman ps                    # 查看运行中的容器
podman ps -a                 # 查看所有容器
podman images                # 查看镜像
podman network ls            # 查看网络

# 存储管理
df -h /var/lib/nanovps/data  # 查看 XFS 存储使用情况
xfs_quota -x -c 'report -p' /var/lib/nanovps/data  # 查看项目配额
```

## 适用场景

- **VPS 主机商** - 批量管理客户容器
- **开发测试环境** - 快速创建隔离环境
- **家庭服务器** - 安全运行多个服务
- **边缘计算节点** - 轻量级容器管理

## 构建

```bash
# 安装依赖
bun install

# 开发运行
bun run dev

# 构建二进制文件（Linux x64 + arm64）
bun run build
```

## 系统要求

- **操作系统**: Debian 13 (trixie)
- **架构**: x86_64 或 aarch64
- **权限**: root (安装脚本需要)
- **内存**: 建议 1GB+
- **磁盘**: 建议 20GB+

## 技术栈

- **Agent**: Bun + TypeScript
- **容器运行时**: Podman (rootless)
- **存储**: XFS + 项目配额
- **网络**: CNI bridge (IPv4/IPv6)
- **服务管理**: systemd

## 优势

- **单文件部署** - Agent 单二进制文件，无需依赖
- **跨架构** - 支持 Linux x64 / arm64
- **资源隔离** - XFS 项目配额防止资源抢占
- **安全运行** - Podman 无根模式
- **轻量级** - 基于 Bun 运行时，资源占用低
- **机器标识** - 基于机器码的唯一 ID，无需手动配置
- **日志轮转** - 内置日志文件轮转

## License

MIT
