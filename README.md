# NanoVPS Agent

基于 Rust 的 VPS 监控与管理 Agent，通过 WebSocket 连接服务端，采集主机和容器指标，执行远程指令。

## 功能

- 主机指标采集（CPU、内存、磁盘、网络）
- Podman 容器状态与资源统计
- 远程命令执行（容器创建/删除/启停等）
- WebSocket 长连接 + 自动重连
- systemd 服务自启动与故障重启

## 编译

```bash
cargo build --release
```

交叉编译（musl 静态链接，用于生产部署）：

```bash
# x86_64
cargo build --release --target x86_64-unknown-linux-musl

# aarch64（需要 gcc-aarch64-linux-gnu）
cargo build --release --target aarch64-unknown-linux-musl
```

## 配置

在 `/etc/nanovps-agent/` 目录下创建 `config.json`：

```json
{
  "agentId": "your-agent-id",
  "serverUrl": "ws://127.0.0.1:3000/ws",
  "collectInterval": "10s",
  "podmanSocket": "/run/podman/podman.sock",
  "logMode": "console",
  "logDir": "./logs"
}
```

| 字段 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `agentId` | 是 | — | 服务端分配的 Agent 标识 |
| `serverUrl` | 否 | `ws://127.0.0.1:3000/ws` | WebSocket 服务端地址 |
| `collectInterval` | 否 | `10s` | 指标采集间隔（10s-30s） |
| `podmanSocket` | 否 | `/run/podman/podman.sock` | Podman Unix socket 路径 |
| `logMode` | 否 | `console` | 日志模式（`console` 或 `file`） |
| `logDir` | 否 | `./logs` | 日志目录（logMode=file 时生效） |

## 一键部署安装

在目标 VPS（Debian 13）上执行以下命令，脚本会引导你逐步完成安装：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/audsiui/nanovps-agent/master/scripts/install.sh)
```

安装向导包含 8 个步骤，每步可选择执行或跳过：

1. 安装 Podman（含 SWAP 配置）
2. 验证 Podman（运行 hello-world 容器）
3. 准备 XFS 存储（创建虚拟磁盘，支持项目配额）
4. 迁移 Podman 存储（将容器数据迁移到 XFS）
5. 创建容器网络（vps-net，IPv4 + IPv6）
6. 下载 NanoVPS Agent（自动检测架构，下载最新版本）
7. 配置 Agent（生成 config.json，设置 agentId 和 serverUrl）
8. 创建 systemd 服务（自启动 + 故障重启）

### 手动分步执行

如果不想用安装向导，也可以单独运行各步骤脚本：

```bash
# 下载所有脚本
mkdir -p /tmp/nanovps-scripts && cd /tmp/nanovps-scripts
BASE=https://raw.githubusercontent.com/audsiui/nanovps-agent/master/scripts

curl -fsSL $BASE/install-podman.sh -o install-podman.sh
curl -fsSL $BASE/setup-xfs-storage.sh -o setup-xfs-storage.sh
curl -fsSL $BASE/migrate-podman.sh -o migrate-podman.sh
curl -fsSL $BASE/create-vps-network.sh -o create-vps-network.sh
curl -fsSL $BASE/download-agent.sh -o download-agent.sh
curl -fsSL $BASE/setup-config.sh -o setup-config.sh
curl -fsSL $BASE/setup-systemd.sh -o setup-systemd.sh

# 按需执行（需要 root 权限）
sudo bash install-podman.sh        # 步骤 1-2
sudo bash setup-xfs-storage.sh     # 步骤 3
sudo bash migrate-podman.sh        # 步骤 4
sudo bash create-vps-network.sh    # 步骤 5
sudo bash download-agent.sh        # 步骤 6
sudo bash setup-config.sh          # 步骤 7
sudo bash setup-systemd.sh         # 步骤 8
```

### 安装后管理

```bash
systemctl start nanovps-agent      # 启动
systemctl stop nanovps-agent       # 停止
systemctl restart nanovps-agent    # 重启
systemctl status nanovps-agent     # 状态
journalctl -u nanovps-agent -f     # 日志
nano /etc/nanovps-agent/config.json  # 修改配置
```

修改配置后需重启服务：`systemctl restart nanovps-agent`

### 文件位置

| 项目 | 路径 |
|---|---|
| Agent 程序 | `/usr/local/bin/nanovps-agent` |
| 配置文件 | `/etc/nanovps-agent/config.json` |
| systemd 服务 | `/etc/systemd/system/nanovps-agent.service` |
| 容器存储 | `/var/lib/nanovps/data`（XFS） |
| 容器网络 | `vps-net`（Podman bridge） |

## 项目结构

```
src/
├── main.rs            # 入口，初始化连接与采集循环
├── config.rs          # config.json 解析
├── logger.rs          # 日志模块
├── transport/
│   ├── mod.rs         # WebSocket 传输层
│   └── ws_client.rs   # WebSocket 客户端
├── collectors/
│   ├── mod.rs         # 指标采集调度
│   ├── host.rs        # 主机指标
│   └── podman.rs      # 容器指标
├── podman/
│   ├── mod.rs         # Podman API 客户端
│   ├── client.rs      # HTTP 请求封装
│   ├── containers.rs  # 容器操作
│   ├── images.rs      # 镜像操作
│   └── stats.rs       # 容器资源统计
├── actions/
│   ├── mod.rs         # 远程指令处理
│   └ net.rs          # 网络操作
└── command.rs         # 命令定义
```

## License

MIT