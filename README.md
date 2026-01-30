# NanoVPS Agent

[![Release Build](https://github.com/audsiui/nanovps-agent/actions/workflows/release.yml/badge.svg)](https://github.com/audsiui/nanovps-agent/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

NanoVPS Agent 是一个轻量级的 VPS（虚拟专用服务器）监控和管理代理程序，专为边缘计算和云服务器管理场景设计。

## 功能特性

- **系统监控**：实时采集主机的 CPU、内存、磁盘和网络使用状况
- **容器管理**：通过 Podman API 管理容器（创建、启动、停止、重启、删除容器）
- **网络管理**：设置和移除端口转发规则（使用 iptables/ip6tables）
- **实时通信**：通过 WebSocket 与服务器建立双向通信，定期上报监控数据并接收远程命令
- **跨平台支持**：支持 Linux AMD64 和 ARM64 架构
- **自动重连**：WebSocket 连接断开时自动重连（指数退避策略）
- **机器指纹**：使用 64 位十六进制密钥唯一标识每个代理实例

## 技术栈

- **运行时**：Bun（高性能 JavaScript/TypeScript 运行时）
- **编程语言**：TypeScript 5.x
- **系统信息采集**：systeminformation
- **容器管理**：Podman（通过 Unix Socket 调用 REST API）
- **网络管理**：iptables/ip6tables

## 快速开始

### 环境要求

- Linux 操作系统（AMD64 或 ARM64）
- [Bun](https://bun.sh/) 运行时（开发/构建时需要）

### 安装

#### 方式一：下载预编译二进制文件

从 [Releases](https://github.com/audsiui/nanovps-agent/releases) 页面下载适合你系统架构的二进制文件：

```bash
# AMD64 架构
wget https://github.com/audsiui/nanovps-agent/releases/latest/download/nanovps-agent-linux-amd64 -O nanovps-agent
chmod +x nanovps-agent

# ARM64 架构
wget https://github.com/audsiui/nanovps-agent/releases/latest/download/nanovps-agent-linux-arm64 -O nanovps-agent
chmod +x nanovps-agent
```

#### 方式二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/audsiui/nanovps-agent.git
cd nanovps-agent

# 安装依赖
bun install

# 构建（生成 Linux AMD64 和 ARM64 可执行文件）
bun run build

# 或者只构建特定架构
bun run build:linux-x64    # 仅 AMD64
bun run build:linux-arm64  # 仅 ARM64
```

### 配置

创建 `.env` 文件或在环境变量中设置以下配置：

```bash
# WebSocket 服务器地址
SERVER_URL=ws://your-server.com/ws

# 代理名称（用于在管理界面标识）
AGENT_NAME=My-VPS-01

# 数据采集间隔（毫秒，默认 2000）
COLLECT_INTERVAL=2000
```

### 运行

```bash
# 使用环境变量文件
./nanovps-agent

# 或直接指定环境变量
SERVER_URL=ws://your-server.com/ws SERVER_TOKEN=token ./nanovps-agent
```

## 系统架构

```text
┌─────────────────────────────────────────────────────────┐
│                    NanoVPS Agent                         │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │   Host      │  │   Podman    │  │   Network       │  │
│  │  Collector  │  │  Collector  │  │   Manager       │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────┘  │
│         │                │                              │
│         └────────────────┼──────────────────────────────┘
│                          │                              │
│                   ┌──────▼──────┐                       │
│                   │  WebSocket  │                       │
│                   │   Client    │◄─────────────────────┐│
│                   └──────┬──────┘                      ││
│                          │                             ││
└──────────────────────────┼─────────────────────────────┘│
                           │                            │
                           ▼                            │
                 ┌─────────────────┐                    │
                 │  NanoVPS Server │────────────────────┘
                 │   (WebSocket)   │  (下发命令)
                 └─────────────────┘
```

## 项目结构

```text
src/
├── actions/           # 动作执行模块
│   ├── net.ts        # 网络/防火墙操作（端口转发）
│   └── podman.ts     # 容器管理操作
├── collectors/        # 数据采集模块
│   ├── host.ts       # 主机系统指标采集
│   └── podman.ts     # 容器指标采集
├── handlers/          # 命令处理器
│   └── cmd-handler.ts # WebSocket 命令处理
├── transport/         # 通信传输层
│   └── ws-client.ts  # WebSocket 客户端实现
├── utils/             # 工具函数
│   ├── calc.ts       # 速率计算工具
│   ├── machine-key.ts # 机器密钥生成与管理
│   └── socket.ts     # Podman Socket 探测工具
├── config.ts         # 配置加载与管理
├── index.ts          # 应用入口文件
└── types.ts          # 核心类型定义
```

## 依赖要求

- **Podman**：如需容器管理功能，需要安装 Podman 并启用 API Socket

  ```bash
  # 启用 Podman Socket
  systemctl --user enable --now podman.socket
  # 或系统级
  sudo systemctl enable --now podman.socket
  ```

- **iptables/ip6tables**：如需端口转发功能，需要 root 权限访问 iptables

## 开发

```bash
# 安装依赖
bun install

# 开发模式运行
bun run dev

# 构建
bun run build
```

## CI/CD

项目使用 GitHub Actions 自动构建和发布：

- 推送以 `v` 开头的 tag（如 `v1.0.0`）时自动触发构建
- 自动生成 Linux AMD64 和 ARM64 架构的二进制文件
- 自动创建 GitHub Release 并上传构建产物

## 许可证

[MIT](LICENSE)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 致谢

- [Bun](https://bun.sh/) - 高性能 JavaScript 运行时
- [systeminformation](https://systeminformation.io/) - 系统信息采集库
