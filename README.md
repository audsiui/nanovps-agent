# NanoVPS Agent Rust

Rust rewrite of NanoVPS Agent.

## Build

```bash
cargo build --release
```

## Configuration

Create `config.json` in the working directory:

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

`agentId` is required, all other fields are optional with the defaults shown above.
