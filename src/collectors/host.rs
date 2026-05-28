use crate::types::{CpuStat, HostDiskStat, HostStat, MemoryStat, NetworkStat};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{Disks, Networks, System};

pub struct MetricsState {
    rates: HashMap<String, (u64, u64)>,
    system: System,
}

impl Default for MetricsState {
    fn default() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        Self {
            rates: HashMap::new(),
            system,
        }
    }
}

impl MetricsState {
    pub fn calculate(&mut self, id: &str, bytes: u64, timestamp: u64) -> u64 {
        let previous = self.rates.insert(id.to_string(), (bytes, timestamp));
        let Some((previous_bytes, previous_timestamp)) = previous else {
            return 0;
        };
        let time_diff = timestamp.saturating_sub(previous_timestamp) as f64 / 1000.0;
        if time_diff <= 0.0 || bytes < previous_bytes {
            return 0;
        }
        ((bytes - previous_bytes) as f64 / time_diff).floor() as u64
    }
}

pub async fn collect_host_metrics(state: &mut MetricsState) -> HostStat {
    let timestamp = now_ms();
    state.system.refresh_all();

    let networks = Networks::new_with_refreshed_list();
    let mut rx_total = 0;
    let mut tx_total = 0;
    for (_name, data) in &networks {
        rx_total += data.total_received();
        tx_total += data.total_transmitted();
    }

    let disks = Disks::new_with_refreshed_list();
    let disks = disks
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .filter(|disk| !disk.file_system().to_string_lossy().contains("overlay"))
        .map(|disk| {
            let size = disk.total_space();
            let used = size.saturating_sub(disk.available_space());
            let use_percent = if size == 0 {
                0.0
            } else {
                round2((used as f64 / size as f64) * 100.0)
            };

            HostDiskStat {
                fs: disk.mount_point().to_string_lossy().to_string(),
                disk_type: disk.file_system().to_string_lossy().to_string(),
                size,
                used,
                use_percent,
            }
        })
        .collect();

    let used_memory = state.system.used_memory();
    let total_memory = state.system.total_memory();

    HostStat {
        uptime: System::uptime(),
        cpu: CpuStat {
            cores: state.system.cpus().len(),
            usage_percent: round2(state.system.global_cpu_usage() as f64),
        },
        memory: MemoryStat {
            total: total_memory,
            used: used_memory,
            usage_percent: if total_memory == 0 {
                0.0
            } else {
                round2((used_memory as f64 / total_memory as f64) * 100.0)
            },
        },
        network: NetworkStat {
            rx_rate: state.calculate("host_total_rx", rx_total, timestamp),
            tx_rate: state.calculate("host_total_tx", tx_total, timestamp),
            rx_total,
            tx_total,
        },
        disks,
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}
