use anyhow::Result;
use std::env;
use crate::machine_key;

#[derive(Clone, Debug)]
pub struct Config {
    pub server_url: String,
    pub agent_name: String,
    pub collect_interval_ms: u64,
    pub podman_socket: String,
    pub log_mode: String,
    pub log_dir: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        Ok(Self {
            server_url: env::var("SERVER_URL").unwrap_or_else(|_| "ws://127.0.0.1:3000/ws".to_string()),
            agent_name: env::var("AGENT_NAME").unwrap_or_else(|_| machine_key::load_or_create().unwrap_or_else(|_| hostname_fallback())),
            collect_interval_ms: parse_interval_ms(&env::var("COLLECT_INTERVAL").unwrap_or_else(|_| "10s".to_string())),
            podman_socket: env::var("PODMAN_SOCKET").unwrap_or_else(|_| "/run/podman/podman.sock".to_string()),
            log_mode: env::var("LOG_MODE").unwrap_or_else(|_| "console".to_string()),
            log_dir: env::var("LOG_DIR").unwrap_or_else(|_| "./logs".to_string()),
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

fn hostname_fallback() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "nanovps-agent".to_string())
}
