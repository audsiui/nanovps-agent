use super::PodmanClient;
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContainerOptions {
    pub name: String,
    pub image: String,
    pub hostname: Option<String>,
    pub memory: Option<u64>,
    pub memory_swap: Option<i64>,
    pub storage_opt: Option<String>,
    pub cpus: Option<f64>,
    pub pids_limit: Option<i64>,
    pub ssh_port: Option<u16>,
    pub network: Option<String>,
    pub ip: Option<String>,
    pub ip6: Option<String>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub userns: Option<String>,
    pub restart_policy: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateContainerResult {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct CreateResponse {
    #[serde(rename = "Id")]
    id: String,
}

impl PodmanClient {
    pub async fn restart_container(&self, id: &str) -> Result<()> {
        self.container_action(id, "restart").await
    }

    pub async fn stop_container(&self, id: &str) -> Result<()> {
        self.container_action(id, "stop").await
    }

    pub async fn start_container(&self, id: &str) -> Result<()> {
        self.container_action(id, "start").await
    }

    pub async fn remove_container(&self, id: &str, force: bool) -> Result<()> {
        let path = if force {
            format!("/containers/{id}?force=true")
        } else {
            format!("/containers/{id}")
        };
        self.delete(&path).await?;
        Ok(())
    }

    pub async fn create_container(&self, options: CreateContainerOptions) -> Result<CreateContainerResult> {
        let config = build_container_config(&options);
        let create = self.create_container_once(&config).await;
        let container_id = match create {
            Ok(id) => id,
            Err(error) if error.to_string().contains("status 404") => {
                self.pull_image(&options.image).await?;
                wait_for_image(self, &options.image).await?;
                self.create_container_once(&config).await?
            }
            Err(error) => return Err(error),
        };

        self.start_container(&container_id).await?;

        Ok(CreateContainerResult {
            id: container_id,
            name: options.name,
        })
    }

    async fn container_action(&self, id: &str, action: &str) -> Result<()> {
        self.post_empty(&format!("/containers/{id}/{action}")).await?;
        Ok(())
    }

    async fn create_container_once(&self, config: &Value) -> Result<String> {
        let response: CreateResponse = self.post_json("/containers/create", config).await?;
        Ok(response.id)
    }
}

fn build_container_config(options: &CreateContainerOptions) -> Value {
    let mut config = json!({
        "image": options.image,
        "name": options.name,
        "restart_policy": options.restart_policy.clone().unwrap_or_else(|| "always".to_string()),
        "systemd": "always"
    });

    if let Some(hostname) = &options.hostname {
        config["hostname"] = json!(hostname);
    }

    let mut resources = serde_json::Map::new();
    if let Some(memory) = options.memory {
        resources.insert("memory".to_string(), json!({ "limit": memory }));
    }
    if let Some(memory_swap) = options.memory_swap {
        let memory = resources.entry("memory".to_string()).or_insert_with(|| json!({}));
        memory["swap"] = json!(memory_swap);
    }
    if let Some(storage_opt) = &options.storage_opt {
        resources.insert("storage_opt".to_string(), json!([storage_opt]));
    }
    if let Some(cpus) = options.cpus {
        resources.insert("cpu".to_string(), json!({
            "quota": (cpus * 100000.0).floor() as i64,
            "period": 100000
        }));
    }
    if let Some(pids_limit) = options.pids_limit {
        resources.insert("pids".to_string(), json!({ "limit": pids_limit }));
    }
    if !resources.is_empty() {
        config["resource_limits"] = Value::Object(resources);
    }

    if let Some(ssh_port) = options.ssh_port {
        config["portmappings"] = json!([{
            "host_port": ssh_port,
            "container_port": 22,
            "protocol": "tcp"
        }]);
    }

    if let Some(network) = &options.network {
        let mut network_config = serde_json::Map::new();
        if let Some(ip) = &options.ip {
            network_config.insert("static_ips".to_string(), json!([ip]));
        }
        if let Some(ip6) = &options.ip6 {
            network_config.insert("static_ipv6s".to_string(), json!([ip6]));
        }
        config["networks"] = json!({ network: Value::Object(network_config) });
    }

    if let Some(env) = &options.env {
        if !env.is_empty() {
            config["env"] = json!(env);
        }
    }

    if let Some(userns) = &options.userns {
        config["userns"] = json!({ "nsmode": userns });
    }

    config
}

async fn wait_for_image(client: &PodmanClient, image: &str) -> Result<()> {
    for _ in 0..10 {
        if client.image_exists(image).await? {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    Err(anyhow!("image {image} pulled but not available after waiting"))
}
