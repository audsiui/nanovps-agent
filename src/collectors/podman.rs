use crate::collectors::host::MetricsState;
use crate::podman::{stats::NumberOrString, PodmanClient};
use crate::types::{ContainerMemoryStat, ContainerNetworkStat, ContainerStat};
use anyhow::Result;

pub async fn collect_container_metrics(
    client: &PodmanClient,
    rate: &mut MetricsState,
) -> Result<Vec<ContainerStat>> {
    if !client.socket_exists() {
        return Ok(Vec::new());
    }

    let timestamp = crate::collectors::host::now_ms();
    let containers = client.container_list().await?;
    let mut results = Vec::new();

    for container in containers {
        if !matches!(container.state.as_deref(), Some("running") | Some("Running") | None) {
            continue;
        }

        let stats = client.container_stats_raw(&container.id).await?;
        for stat in stats {
            let id_raw = stat.id.unwrap_or_else(|| container.id.clone());
            let id = id_raw.chars().take(12).collect::<String>();
            let name = stat.name.unwrap_or_else(|| container_name(&container));

            let (mut rx_total, mut tx_total) = (0, 0);
            if let Some(network) = stat.network {
                for (iface_name, iface) in network {
                    if iface_name == "lo" {
                        continue;
                    }
                    rx_total += iface.rx_bytes.unwrap_or(0);
                    tx_total += iface.tx_bytes.unwrap_or(0);
                }
            } else {
                rx_total = stat.net_input.unwrap_or(0);
                tx_total = stat.net_output.unwrap_or(0);
            }

            let cpu_percent = stat.cpu.as_ref().map(NumberOrString::as_f64).unwrap_or(0.0);
            let usage_percent = stat.mem_perc.as_ref().map(NumberOrString::as_f64).unwrap_or(0.0);

            results.push(ContainerStat {
                id: id.clone(),
                name,
                cpu_percent,
                memory: ContainerMemoryStat {
                    usage: stat.mem_usage.as_ref().map(NumberOrString::as_u64).unwrap_or(0),
                    limit: stat.mem_limit.as_ref().map(NumberOrString::as_u64).unwrap_or(0),
                    usage_percent,
                },
                network: ContainerNetworkStat {
                    rx_rate: rate.calculate(&format!("container_{id}_rx"), rx_total, timestamp),
                    tx_rate: rate.calculate(&format!("container_{id}_tx"), tx_total, timestamp),
                    rx_total,
                    tx_total,
                },
            });
        }
    }

    Ok(results)
}

fn container_name(container: &crate::podman::stats::PodmanContainerSummary) -> String {
    container
        .name
        .clone()
        .or_else(|| container.names.first().cloned())
        .map(|name| name.trim_start_matches('/').to_string())
        .unwrap_or_else(|| "unknown".to_string())
}
