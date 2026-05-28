use anyhow::{anyhow, Result};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct PodmanClient {
    socket_path: PathBuf,
    api_version: String,
}

impl PodmanClient {
    pub fn new(socket_path: impl Into<PathBuf>) -> Self {
        Self {
            socket_path: socket_path.into(),
            api_version: "v5.0.0".to_string(),
        }
    }

    pub fn socket_exists(&self) -> bool {
        self.socket_path.exists()
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    pub async fn get_empty(&self, path: &str) -> Result<Vec<u8>> {
        self.request("GET", path, None::<&()>).await
    }

    pub async fn get_json<T>(&self, path: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let response = self.request("GET", path, None::<&()>).await?;
        serde_json::from_slice(&response).map_err(Into::into)
    }

    pub async fn post_empty(&self, path: &str) -> Result<Vec<u8>> {
        self.request("POST", path, None::<&()>).await
    }

    pub async fn post_json<B, T>(&self, path: &str, body: &B) -> Result<T>
    where
        B: Serialize,
        T: DeserializeOwned,
    {
        let response = self.request("POST", path, Some(body)).await?;
        serde_json::from_slice(&response).map_err(Into::into)
    }

    pub async fn delete(&self, path: &str) -> Result<Vec<u8>> {
        self.request("DELETE", path, None::<&()>).await
    }

    fn api_path(&self, path: &str) -> String {
        if path.starts_with('/') {
            format!("/{}/libpod{}", self.api_version, path)
        } else {
            format!("/{}/libpod/{}", self.api_version, path)
        }
    }

    async fn request<B>(&self, method: &str, path: &str, body: Option<&B>) -> Result<Vec<u8>>
    where
        B: Serialize + ?Sized,
    {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::UnixStream;

        let mut stream = UnixStream::connect(&self.socket_path).await?;
        let api_path = self.api_path(path);
        let body = match body {
            Some(value) => serde_json::to_vec(value)?,
            None => Vec::new(),
        };

        let mut request = format!(
            "{method} {api_path} HTTP/1.1\r\nHost: d\r\nConnection: close\r\nContent-Length: {}\r\n",
            body.len()
        );
        if !body.is_empty() {
            request.push_str("Content-Type: application/json\r\n");
        }
        request.push_str("\r\n");

        stream.write_all(request.as_bytes()).await?;
        if !body.is_empty() {
            stream.write_all(&body).await?;
        }

        let mut response = Vec::new();
        stream.read_to_end(&mut response).await?;
        parse_http_response(&response)
    }
}

fn parse_http_response(response: &[u8]) -> Result<Vec<u8>> {
    let header_end = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| anyhow!("invalid Podman HTTP response"))?;
    let headers = std::str::from_utf8(&response[..header_end])?;
    let status_line = headers.lines().next().ok_or_else(|| anyhow!("missing HTTP status"))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| anyhow!("missing HTTP status code"))?
        .parse::<u16>()?;

    let body = response[header_end + 4..].to_vec();
    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&body);
        return Err(anyhow!("Podman API failed with status {status}: {text}"));
    }

    if headers
        .lines()
        .any(|line| line.eq_ignore_ascii_case("transfer-encoding: chunked"))
    {
        decode_chunked(&body)
    } else {
        Ok(body)
    }
}

fn decode_chunked(body: &[u8]) -> Result<Vec<u8>> {
    let mut decoded = Vec::new();
    let mut index = 0;

    loop {
        if index >= body.len() {
            return Err(anyhow!("invalid chunked Podman response"));
        }

        let line_end = body[index..]
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or_else(|| anyhow!("invalid chunked Podman response"))?
            + index;
        let size_text = std::str::from_utf8(&body[index..line_end])?;
        let size = usize::from_str_radix(size_text.split(';').next().unwrap_or("0"), 16)?;
        index = line_end + 2;

        if size == 0 {
            break;
        }

        let end = index.checked_add(size).ok_or_else(|| anyhow!("truncated chunked Podman response"))?;
        if end > body.len() {
            return Err(anyhow!("truncated chunked Podman response"));
        }

        decoded.extend_from_slice(&body[index..end]);
        index = end;

        if body.get(index..index + 2) != Some(b"\r\n") {
            return Err(anyhow!("invalid chunked Podman response"));
        }
        index += 2;
    }

    Ok(decoded)
}
