use anyhow::{bail, Result};
use std::env;
use std::io::{self, Write};

#[derive(Clone, Debug)]
pub struct Config {
    pub server_url: String,
    pub agent_id: String,
    pub collect_interval_ms: u64,
    pub podman_socket: String,
    pub log_mode: String,
    pub log_dir: String,
}

impl Config {
    pub fn load() -> Result<Self> {
        let agent_id = match env::var("AGENT_ID") {
            Ok(id) if !id.trim().is_empty() => id.trim().to_string(),
            _ => {
                print!("Enter Agent ID: ");
                io::stdout().flush()?;
                let mut input = String::new();
                io::stdin().read_line(&mut input)?;
                let id = input.trim().to_string();
                if id.is_empty() {
                    bail!("AGENT_ID is not configured, agent exiting");
                }
                id
            }
        };

        Ok(Self {
            server_url: env::var("SERVER_URL").unwrap_or_else(|_| "ws://127.0.0.1:3000/ws".to_string()),
            agent_id,
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

