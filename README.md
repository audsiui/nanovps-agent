# NanoVPS Agent

轻量级 VPS 监控与管理代理，基于 Bun + TypeScript 构建。

## 功能

- **系统监控** - CPU、内存、磁盘、网络实时采集
- **容器管理** - 基于 Podman API 管理容器生命周期
- **端口转发** - iptables 端口转发配置
- **实时通信** - WebSocket 双向通信，自动重连

## 优势

- **单文件部署** - 单二进制文件，无需依赖
- **跨架构** - 支持 Linux x64 / arm64
- **轻量级** - 基于 Bun 运行时，资源占用低
- **机器标识** - 基于机器码的唯一 ID，无需手动配置
- **日志轮转** - 内置日志文件轮转，支持控制台/文件/双模式

## 快速开始

```bash
# 下载二进制文件
wget https://github.com/audsiui/nanovps-agent/releases/latest/download/nanovps-agent-linux-amd64 -O nanovps-agent
chmod +x nanovps-agent

# 配置环境变量
export SERVER_URL=ws://your-server.com/ws

# 运行
./nanovps-agent
```

## 环境变量

| 变量 | 说明 | 默认值 |
| ---- | ---- | ------ |
| `SERVER_URL` | WebSocket 服务器地址 | - |
| `COLLECT_INTERVAL` | 采集间隔（毫秒） | 2000 |
| `LOG_MODE` | 日志模式：console/file/both | console |
| `LOG_DIR` | 日志目录 | ./logs |

## 构建

```bash
# 安装依赖
bun install

# 开发运行
bun run dev

# 构建二进制文件
bun run build
```

## 依赖

- Linux 系统（x64 / arm64）
- Podman（可选，容器管理功能）
- root 权限（可选，端口转发功能）

## License

MIT
