# AGENTS.md

## 项目速览

- 单二进制 Rust Agent（`nanovps-agent`），无 workspace、无子 crate。入口 `src/main.rs`。
- 运行时依赖：WebSocket 服务端（默认 `ws://127.0.0.1:3000/ws/agent`，见 `src/config.rs:54`）+ 本机 Podman Unix socket。
- 模块边界：`transport/` WebSocket、`collectors/` 主机+容器指标、`podman/` 容器/镜像/统计的 libpod HTTP 客户端、`actions/net.rs` iptables 端口转发、`command.rs` 指令分发、`types.rs` 协议类型。
- 测试套件不存在（`src/` 下没有 `#[test]`、没有 `tests/` 目录）；`cargo test` 不会运行任何东西。也不要发明 formatter/lint 配置——仓库没有 `rustfmt.toml` / `clippy.toml` / `Makefile` / `justfile` / pre-commit hook。

## 构建命令

```bash
# 开发
cargo build
cargo build --release

# 生产 musl 静态链接
cargo build --release --target x86_64-unknown-linux-musl            # 需要 musl-tools
cargo build --release --target aarch64-unknown-linux-musl          # 见下方坑
```

aarch64-musl 复刻 CI 行为需要两步（参考 `.github/workflows/release.yml:36-49`）：

1. 安装 `gcc-aarch64-linux-gnu` + `musl-tools`，并把 `aarch64-linux-gnu-gcc` 作为 musl 链接器暴露（CI 用 `sudo ln -sf /usr/bin/aarch64-linux-gnu-gcc /usr/bin/aarch64-linux-musl-gcc`）。
2. 写 `.cargo/config.toml`：
   ```toml
   [target.aarch64-unknown-linux-musl]
   linker = "aarch64-linux-gnu-gcc"
   ```
   或者在构建时 `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=aarch64-linux-gnu-gcc cargo build --release --target aarch64-unknown-linux-musl`。

`Cargo.toml` 已是 `edition = "2024"` + `sysinfo 0.33`，需要近期 stable Rust toolchain。

## 本地运行与配置

- `config.json` 由 `src/config.rs:36` 从**当前工作目录**读取，不是从 `/etc/nanovps-agent/` 读。生产 systemd 单元的 `WorkingDirectory=/etc/nanovps-agent`（见 `scripts/setup-systemd.sh`）让它在部署时落在那里；本地 `cargo run` 必须在含 `config.json` 的目录执行。
- `config.json` 已在 `.gitignore` 中。模板用仓库根目录的 `config.example.json`，**不要**直接提交带凭据的 `config.json`。
- 必填字段：`agentId`、`agentToken`（缺一即 `bail!`，`src/config.rs:41-49`）。WebSocket 鉴权走 query string `?agentId=...&token=...`（`src/transport/ws_client.rs:157-162`）。
- `collectInterval` 在 `src/config.rs:63-77` 强制 clamp 到 `10s..=30s`，更短/更长会被夹紧——别在文档里承诺更小间隔。
- `serverUrl` 的真正默认值是 `ws://127.0.0.1:3000/ws/agent`（`src/config.rs:54`），README 表里写的是 `ws://127.0.0.1:3000/ws`，以代码为准。

## 协议格式（与 WebSocket 服务端互通时）

- 全部 serde 结构体用 `#[serde(rename_all = "camelCase")]`，**线协议是 camelCase**，Rust 侧是 snake_case。新增字段时两套命名都要想清楚。
- `ClientMessage` 是带 tag 的 enum：`{"type":"report","data":{...}}` 或 `{"type":"response","data":{...}}`（`src/types.rs:75-82`）。
- `ServerMessage` 同理：`{"type":"cmd", ...}` 或 `{"type":"auth", ...}`。
- `AgentAction` 用 kebab/冒号 tag：`container:create`、`container:remove-force`、`net:forward`、`agent:upgrade` 等（`src/types.rs:131-152`）。**新增 action 必须同时改 `src/command.rs::execute_command`**，否则会在 `match` 编译期/运行期出岔。
- `agent:upgrade`、`agent:restart` 当前在 `src/command.rs:89-91` 显式 `bail!("unsupported action")`——是占位，不要在没实现时移除。

## Podman 客户端

- `src/podman/client.rs` 是手写的 HTTP/1.1 over Unix stream（不依赖 `hyper`/`ureq`），路径前缀 `/{api_version}/libpod/`，当前 `api_version = "v5.0.0"`（`src/podman/client.rs:14-18`）。改 Podman API 版本要同步改这里。
- Podman 真实响应是 PascalCase（`Id`、`Names`、`RxBytes`、`CPU`、`MemUsage`...），`src/podman/stats.rs` 字段上用了 `#[serde(rename = "X", alias = "...")]` 多别名兼容——保留这些别名。
- `/containers/{id}/stats?stream=false` 的响应有三种形态（裸列表 / `{Stats: [...]|{...}}` / 单 entry），靠 `src/podman/stats.rs::StatsResponse` untagged enum 兜底。**不要**简化为单一变体。
- 容器创建时若 image 不存在会先 `pull_image` 再 `wait_for_image`（最多轮询 10 次，每次 1s，见 `src/podman/containers.rs:152-160`），不是 fire-and-forget。

## 采集器

- `src/collectors/host.rs::MetricsState` 用 `HashMap<id, (bytes, timestamp)>` 算 `rx_rate/tx_rate`，首次采样返回 0；`state.rates` 跨 tick 持有，**整个进程生命周期有效**。
- 主机磁盘列表会过滤掉文件名为 `overlay` 的条目（`src/collectors/host.rs:52`），保留这条过滤——overlay 来自容器层，无意义。
- 容器网络流量对每个非 `lo` 网卡求和（`src/collectors/podman.rs:30-37`）。
- Podman socket 不存在时 `collect_container_metrics` 直接返回空 Vec（`src/collectors/podman.rs:10-12`），不会 panic。

## WebSocket 传输

- 重连退避：1s → 30s 指数翻倍；**鉴权失败后跳到 60s**（`AUTH_FAIL_DELAY`，`src/transport/ws_client.rs:10`）—— 鉴权坏掉时不要无脑短间隔重连。
- `pending: Vec<ClientMessage>` 跨重连缓存未发出的消息（`src/transport/ws_client.rs:20,29-35,125-126`）。改 `ClientMessage` enum 时记得评估序列化兼容。
- 收到第一条非 `Auth` 消息也视为 `AuthOutcome::Ok`（`src/transport/ws_client.rs:87-90`），保持向后兼容老服务端。

## 端口转发（`src/actions/net.rs`）

- 用 `iptables`/`ip6tables` 直接 fork 进程，所有规则带 comment `agent-fwd-<port>-<proto>`，写入后调 `iptables-save`/`ip6tables-save` 持久化到 `/etc/iptables/rules.v{4,6}`。
- `apply_rule` 中途失败会回滚已下发的部分规则（`src/actions/net.rs:36-43`），不要破坏这个不变量。
- 缺少规则时（`No chain/target/match` 等）被静默忽略（`is_missing_rule_error`），视为幂等删除。

## 日志

- 过滤用 `RUST_LOG`（`EnvFilter`），默认 `info`。改默认级别改 `src/logger.rs:4`。
- `logMode=file` 用 `tracing_appender::rolling::never(dir, "agent.log")`（`src/logger.rs:13`）——**没有日志轮转**，目录/文件大小会无限增长，长跑服务需要外部 logrotate。

## CI / 发布

- 三个 workflow：
  - `release.yml` —— `v*` tag 推送触发，构建 x86_64 + aarch64 musl，产出 `nanovps-agent-${TAG}-${arch}.tar.gz`（含二进制 + `config.example.json` 改名的 `config.json`）并 `gh release create`。
  - `build-debian-image.yml` / `build-alpine-image.yml` —— 仅在 `images/Debian/**` 或 `images/Alpine/**` 路径变更时构建并推送到 `ghcr.io/<owner>/nanovps-{debian,alpine}`，多架构 `linux/amd64,linux/arm64`。
- 改 `images/` 下内容时检查路径 filter 仍能命中；改 `Cargo.toml` 版本号时记得同步发 `vX.Y.Z` tag。

## 编辑约定

- 不要添加注释（项目里 `actions/net.rs` 等文件极少行内注释，新增注释前先确认上下文）。
- Cargo workspace 未启用；新增 crate 必须先开 workspace。
- 真实部署在 Debian 13 + Podman（无根模式），本地单元测试覆盖不到环境相关代码（容器创建、iptables、Podman socket），改这些路径后建议在目标 Debian 13 VM 跑一次 `scripts/install.sh` 验证完整链路。
