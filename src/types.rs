use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostDiskStat {
    pub fs: String,
    #[serde(rename = "type")]
    pub disk_type: String,
    pub size: u64,
    pub used: u64,
    pub use_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStat {
    pub uptime: u64,
    pub cpu: CpuStat,
    pub memory: MemoryStat,
    pub network: NetworkStat,
    pub disks: Vec<HostDiskStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuStat {
    pub cores: usize,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStat {
    pub total: u64,
    pub used: u64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStat {
    pub rx_rate: u64,
    pub tx_rate: u64,
    pub rx_total: u64,
    pub tx_total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStat {
    pub id: String,
    pub name: String,
    pub cpu_percent: f64,
    pub memory: ContainerMemoryStat,
    pub network: ContainerNetworkStat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerMemoryStat {
    pub usage: u64,
    pub limit: u64,
    pub usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerNetworkStat {
    pub rx_rate: u64,
    pub tx_rate: u64,
    pub rx_total: u64,
    pub tx_total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ClientMessage {
    #[serde(rename = "report")]
    Report(ReportPayload),
    #[serde(rename = "response")]
    Response(CommandResponsePayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPayload {
    pub agent_id: String,
    pub timestamp: u64,
    pub host: HostStat,
    pub containers: Vec<ContainerStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandResponsePayload {
    pub ref_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    #[serde(rename = "cmd")]
    Cmd(ServerCommand),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerCommand {
    pub id: String,
    pub action: AgentAction,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentAction {
    #[serde(rename = "container:create")]
    ContainerCreate,
    #[serde(rename = "container:start")]
    ContainerStart,
    #[serde(rename = "container:stop")]
    ContainerStop,
    #[serde(rename = "container:restart")]
    ContainerRestart,
    #[serde(rename = "container:remove")]
    ContainerRemove,
    #[serde(rename = "container:remove-force")]
    ContainerRemoveForce,
    #[serde(rename = "agent:upgrade")]
    AgentUpgrade,
    #[serde(rename = "agent:restart")]
    AgentRestart,
    #[serde(rename = "net:forward")]
    NetForward,
    #[serde(rename = "net:unforward")]
    NetUnforward,
}
