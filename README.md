# NanoVPS Agent Rust

Rust rewrite of NanoVPS Agent.

## Build

```bash
cargo build --release
```

## Environment

```bash
SERVER_URL=ws://127.0.0.1:3000/ws
COLLECT_INTERVAL=10s
PODMAN_SOCKET=/run/podman/podman.sock
LOG_MODE=console
LOG_DIR=./logs
```
