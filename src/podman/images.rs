use super::PodmanClient;
use anyhow::Result;

impl PodmanClient {
    pub async fn pull_image(&self, image: &str) -> Result<()> {
        tracing::info!(image, "podman: pull image start");
        let from_image = encode_component(image);
        match self.post_empty(&format!("/images/create?fromImage={from_image}")).await {
            Ok(payload) => {
                tracing::info!(image, resp_len = payload.len(), "podman: pull image ok");
                Ok(())
            }
            Err(error) => {
                tracing::warn!(image, %error, "podman: pull image failed");
                Err(error)
            }
        }
    }

    pub async fn image_exists(&self, image: &str) -> Result<bool> {
        let encoded = encode_component(image);
        match self.get_empty(&format!("/images/{encoded}/exists")).await {
            Ok(_) => {
                tracing::debug!(image, exists = true, "podman: image_exists check");
                Ok(true)
            }
            Err(error) if error.to_string().contains("status 404") => {
                tracing::debug!(image, exists = false, "podman: image_exists check");
                Ok(false)
            }
            Err(error) => {
                tracing::warn!(image, %error, "podman: image_exists check failed");
                Err(error)
            }
        }
    }
}

fn encode_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
