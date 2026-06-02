use super::PodmanClient;
use anyhow::Result;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct PodmanNetInterface {
    #[serde(rename = "RxBytes")]
    pub rx_bytes: Option<u64>,
    #[serde(rename = "TxBytes")]
    pub tx_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PodmanStatsEntry {
    #[serde(rename = "ID", alias = "id", alias = "ContainerID")]
    pub id: Option<String>,
    #[serde(rename = "Name", alias = "name")]
    pub name: Option<String>,
    #[serde(rename = "Network")]
    pub network: Option<HashMap<String, PodmanNetInterface>>,
    #[serde(rename = "NetInput")]
    pub net_input: Option<u64>,
    #[serde(rename = "NetOutput")]
    pub net_output: Option<u64>,
    #[serde(rename = "CPU")]
    pub cpu: Option<NumberOrString>,
    #[serde(rename = "MemUsage")]
    pub mem_usage: Option<NumberOrString>,
    #[serde(rename = "MemLimit")]
    pub mem_limit: Option<NumberOrString>,
    #[serde(rename = "MemPerc")]
    pub mem_perc: Option<NumberOrString>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PodmanContainerSummary {
    #[serde(rename = "Id", alias = "id")]
    pub id: String,
    #[serde(rename = "Names", alias = "names", default)]
    pub names: Vec<String>,
    #[serde(rename = "Name", alias = "name")]
    pub name: Option<String>,
    #[serde(rename = "State", alias = "state")]
    pub state: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum NumberOrString {
    Number(f64),
    String(String),
}

impl NumberOrString {
    pub fn as_f64(&self) -> f64 {
        match self {
            Self::Number(value) => *value,
            Self::String(value) => parse_percent(value),
        }
    }

    pub fn as_u64(&self) -> u64 {
        match self {
            Self::Number(value) => value.max(0.0).round() as u64,
            Self::String(value) => parse_size(value),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum StatsResponse {
    List(Vec<PodmanStatsEntry>),
    Object { #[serde(rename = "Stats")] stats: StatsValue },
    Entry(PodmanStatsEntry),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum StatsValue {
    List(Vec<PodmanStatsEntry>),
    Map(HashMap<String, PodmanStatsEntry>),
}

impl PodmanClient {
    pub async fn container_list(&self) -> Result<Vec<PodmanContainerSummary>> {
        tracing::debug!("podman: list containers (all=true)");
        match self.get_json::<Vec<PodmanContainerSummary>>("/containers/json?all=true").await {
            Ok(list) => {
                tracing::debug!(count = list.len(), "podman: list containers ok");
                Ok(list)
            }
            Err(error) => {
                tracing::warn!(%error, "podman: list containers failed");
                Err(error)
            }
        }
    }

    pub async fn container_stats_raw(&self, id: &str) -> Result<Vec<PodmanStatsEntry>> {
        tracing::debug!(container_id = %id, "podman: fetch container stats");
        let response: StatsResponse = match self
            .get_json(&format!("/containers/{id}/stats?stream=false"))
            .await
        {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!(container_id = %id, %error, "podman: fetch container stats failed");
                return Err(error);
            }
        };
        let entries = match response {
            StatsResponse::List(items) => items,
            StatsResponse::Object { stats } => match stats {
                StatsValue::List(items) => items,
                StatsValue::Map(map) => map.into_values().collect(),
            },
            StatsResponse::Entry(entry) => vec![entry],
        };
        tracing::debug!(
            container_id = %id,
            entries = entries.len(),
            "podman: container stats ok"
        );
        Ok(entries)
    }
}

fn parse_percent(value: &str) -> f64 {
    let trimmed = value.trim().trim_end_matches('%');
    trimmed.parse().unwrap_or_else(|_| parse_leading_number(trimmed))
}

fn parse_size(value: &str) -> u64 {
    let trimmed = value.trim();
    let number_len = trimmed
        .chars()
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.' || *ch == '-')
        .count();
    let number = trimmed[..number_len].trim().parse::<f64>().unwrap_or(0.0);
    let unit = trimmed[number_len..].trim().to_ascii_lowercase();
    let multiplier = match unit.as_str() {
        "" | "b" => 1.0,
        "kb" | "kib" => 1024.0,
        "mb" | "mib" => 1024.0 * 1024.0,
        "gb" | "gib" => 1024.0 * 1024.0 * 1024.0,
        "tb" | "tib" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };
    (number.max(0.0) * multiplier).round() as u64
}

fn parse_leading_number(value: &str) -> f64 {
    let numeric: String = value
        .chars()
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.' || *ch == '-')
        .collect();
    numeric.parse().unwrap_or(0.0)
}
