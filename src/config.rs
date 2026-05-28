use anyhow::{bail, Result};
use serde::Deserialize;
use std::fs;

#[derive(Clone, Debug)]
pub struct Config {
    pub server_url: String,
    pub agent_id: String,
    pub collect_interval_ms: u64,
    pub podman_socket: String,
    pub log_mode: String,
    pub log_dir: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigFile {
    agent_id: String,
    #[serde(default)]
    server_url: Option<String>,
    #[serde(default)]
    collect_interval: Option<String>,
    #[serde(default)]
    podman_socket: Option<String>,
    #[serde(default)]
    log_mode: Option<String>,
    #[serde(default)]
    log_dir: Option<String>,
}

impl Config {
    pub fn load() -> Result<Self> {
        let text = fs::read_to_string("config.json")
            .map_err(|e| anyhow::anyhow!("failed to read config.json: {e}"))?;
        let file: ConfigFile = serde_json::from_str(&text)
            .map_err(|e| anyhow::anyhow!("failed to parse config.json: {e}"))?;

        let agent_id = file.agent_id.trim().to_string();
        if agent_id.is_empty() {
            bail!("agentId is required in config.json");
        }

        Ok(Self {
            agent_id,
            server_url: file.server_url.unwrap_or_else(|| "ws://127.0.0.1:3000/ws".to_string()),
            collect_interval_ms: parse_interval_ms(&file.collect_interval.unwrap_or_else(|| "10s".to_string())),
            podman_socket: file.podman_socket.unwrap_or_else(|| "/run/podman/podman.sock".to_string()),
            log_mode: file.log_mode.unwrap_or_else(|| "console".to_string()),
            log_dir: file.log_dir.unwrap_or_else(|| "./logs".to_string()),
        })
    }
}

fn parse_interval_ms(value: &str) -> u64 {
    let trimmed = value.trim();
    if let Ok(ms) = trimmed.parse::<u64>() {
        return ms.clamp(10_000, 30_000);
    }

    let (num, unit) = trimmed.split_at(trimmed.len().saturating_sub(1));
    let parsed = num.parse::<u64>().unwrap_or(10);
    let ms = match unit {
        "s" | "S" => parsed * 1000,
        "m" | "M" => parsed * 60_000,
        _ => 10_000,
    };

    ms.clamp(10_000, 30_000)
}
