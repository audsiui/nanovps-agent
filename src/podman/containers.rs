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
        tracing::info!(container_id = %id, "podman: restart container");
        match self.container_action(id, "restart").await {
            Ok(()) => {
                tracing::info!(container_id = %id, "podman: restart container ok");
                Ok(())
            }
            Err(error) => {
                tracing::warn!(container_id = %id, %error, "podman: restart container failed");
                Err(error)
            }
        }
    }

    pub async fn stop_container(&self, id: &str) -> Result<()> {
        tracing::info!(container_id = %id, "podman: stop container");
        match self.container_action(id, "stop").await {
            Ok(()) => {
                tracing::info!(container_id = %id, "podman: stop container ok");
                Ok(())
            }
            Err(error) => {
                tracing::warn!(container_id = %id, %error, "podman: stop container failed");
                Err(error)
            }
        }
    }

    pub async fn start_container(&self, id: &str) -> Result<()> {
        tracing::info!(container_id = %id, "podman: start container");
        match self.container_action(id, "start").await {
            Ok(()) => {
                tracing::info!(container_id = %id, "podman: start container ok");
                Ok(())
            }
            Err(error) => {
                tracing::warn!(container_id = %id, %error, "podman: start container failed");
                Err(error)
            }
        }
    }

    pub async fn remove_container(&self, id: &str, force: bool) -> Result<()> {
        tracing::info!(container_id = %id, force, "podman: remove container");
        let path = if force {
            format!("/containers/{id}?force=true")
        } else {
            format!("/containers/{id}")
        };
        match self.delete(&path).await {
            Ok(_) => {
                tracing::info!(container_id = %id, force, "podman: remove container ok");
                Ok(())
            }
            Err(error) => {
                tracing::warn!(container_id = %id, force, %error, "podman: remove container failed");
                Err(error)
            }
        }
    }

    pub async fn create_container(&self, options: CreateContainerOptions) -> Result<CreateContainerResult> {
        tracing::info!(
            name = %options.name,
            image = %options.image,
            network = ?options.network,
            "podman: create container"
        );
        let config = build_container_config(&options);
        let create = self.create_container_once(&config).await;
        let container_id = match create {
            Ok(id) => id,
            Err(error) if error.to_string().contains("status 404") => {
                tracing::info!(
                    name = %options.name,
                    image = %options.image,
                    "podman: image missing, fallback to pull"
                );
                self.pull_image(&options.image).await?;
                wait_for_image(self, &options.image).await?;
                match self.create_container_once(&config).await {
                    Ok(id) => id,
                    Err(error) => {
                        tracing::warn!(
                            name = %options.name,
                            image = %options.image,
                            %error,
                            "podman: create container failed after pull"
                        );
                        return Err(error);
                    }
                }
            }
            Err(error) => {
                tracing::warn!(
                    name = %options.name,
                    image = %options.image,
                    %error,
                    "podman: create container failed"
                );
                return Err(error);
            }
        };

        tracing::info!(
            container_id = %container_id,
            name = %options.name,
            image = %options.image,
            "podman: container created, starting"
        );
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
    for attempt in 0..10 {
        if client.image_exists(image).await? {
            tracing::debug!(image, attempt, "podman: image ready after pull");
            return Ok(());
        }
        tracing::debug!(image, attempt, "podman: image not ready yet, sleeping 1s");
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    tracing::warn!(image, "podman: image pulled but still not available after 10 attempts");
    Err(anyhow!("image {image} pulled but not available after waiting"))
}
