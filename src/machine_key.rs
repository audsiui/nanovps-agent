use anyhow::Result;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::PathBuf;

pub fn load_or_create() -> Result<String> {
    let path = key_path();
    if let Ok(existing) = fs::read_to_string(&path) {
        let key = existing.trim().to_string();
        if key.len() == 64 {
            return Ok(key);
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let key = generate_key();
    fs::write(&path, &key)?;
    Ok(key)
}

fn key_path() -> PathBuf {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".nanovps").join("agent.key")
}

fn generate_key() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let digest = Sha256::digest(bytes);
    hex::encode(digest)
}
