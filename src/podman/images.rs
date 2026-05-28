use super::PodmanClient;
use anyhow::Result;

impl PodmanClient {
    pub async fn pull_image(&self, image: &str) -> Result<()> {
        let from_image = encode_component(image);
        self.post_empty(&format!("/images/create?fromImage={from_image}")).await?;
        Ok(())
    }

    pub async fn image_exists(&self, image: &str) -> Result<bool> {
        let image = encode_component(image);
        match self.get_empty(&format!("/images/{image}/exists")).await {
            Ok(_) => Ok(true),
            Err(error) if error.to_string().contains("status 404") => Ok(false),
            Err(error) => Err(error),
        }
    }
}

fn encode_component(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}
