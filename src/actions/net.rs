use anyhow::{anyhow, Result};
use serde::Deserialize;
use tokio::process::Command;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardOptions {
    pub protocol: Protocol,
    pub port: u16,
    pub target_ip: String,
    pub target_port: Option<u16>,
    pub ip_type: IpType,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
    All,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IpType {
    Ipv4,
    Ipv6,
    All,
}

pub async fn setup_port_forwarding(options: ForwardOptions) -> Result<()> {
    let mut applied = Vec::new();

    for tool in tools(&options.ip_type) {
        for protocol in protocols(&options.protocol) {
            if let Err(error) = apply_rule(tool, protocol, &options).await {
                for (applied_tool, applied_protocol) in applied.into_iter().rev() {
                    let _ = remove_rule(applied_tool, applied_protocol, &options).await;
                }
                return Err(error);
            }
            applied.push((tool, protocol));
        }
    }

    save_firewall_rules(&options.ip_type).await
}

pub async fn remove_port_forwarding(options: ForwardOptions) -> Result<()> {
    for tool in tools(&options.ip_type) {
        for protocol in protocols(&options.protocol) {
            remove_rule(tool, protocol, &options).await?;
        }
    }
    save_firewall_rules(&options.ip_type).await
}

async fn apply_rule(tool: &str, protocol: &str, options: &ForwardOptions) -> Result<()> {
    let rules = forwarding_rules("-I", tool, protocol, options);
    let checks = forwarding_rules("-C", tool, protocol, options);
    let mut inserted: Vec<Vec<String>> = Vec::new();

    for (check, insert) in checks.iter().zip(rules.iter()) {
        if rule_exists(tool, check).await? {
            continue;
        }

        if let Err(error) = run_net_command(tool, insert).await {
            for undo in inserted.into_iter().rev() {
                let _ = run_net_command(tool, &undo).await;
            }
            return Err(error);
        }

        inserted.push(delete_args(insert));
    }

    Ok(())
}

async fn remove_rule(tool: &str, protocol: &str, options: &ForwardOptions) -> Result<()> {
    for args in forwarding_rules("-D", tool, protocol, options) {
        if let Err(error) = run_net_command(tool, &args).await {
            let message = error.to_string();
            if !is_missing_rule_error(&message) {
                return Err(error);
            }
        }
    }

    Ok(())
}

async fn rule_exists(tool: &str, args: &[String]) -> Result<bool> {
    match run_net_command(tool, args).await {
        Ok(()) => Ok(true),
        Err(error) => {
            let message = error.to_string();
            if is_missing_rule_error(&message) {
                Ok(false)
            } else {
                Err(error)
            }
        }
    }
}

fn forwarding_rules(action: &str, tool: &str, protocol: &str, options: &ForwardOptions) -> Vec<Vec<String>> {
    let target_port = options.target_port.unwrap_or(options.port).to_string();
    let source_port = options.port.to_string();
    let comment = format!("agent-fwd-{}-{protocol}", options.port);
    let destination = if tool == "ip6tables" {
        format!("[{}]:{target_port}", options.target_ip)
    } else {
        format!("{}:{target_port}", options.target_ip)
    };

    vec![
        vec![
            "-t".to_string(),
            "nat".to_string(),
            action.to_string(),
            "PREROUTING".to_string(),
            "-p".to_string(),
            protocol.to_string(),
            "--dport".to_string(),
            source_port.clone(),
            "-j".to_string(),
            "DNAT".to_string(),
            "--to-destination".to_string(),
            destination.clone(),
            "-m".to_string(),
            "comment".to_string(),
            "--comment".to_string(),
            comment.clone(),
        ],
        vec![
            "-t".to_string(),
            "nat".to_string(),
            action.to_string(),
            "OUTPUT".to_string(),
            "-p".to_string(),
            protocol.to_string(),
            "--dport".to_string(),
            source_port,
            "-j".to_string(),
            "DNAT".to_string(),
            "--to-destination".to_string(),
            destination,
            "-m".to_string(),
            "comment".to_string(),
            "--comment".to_string(),
            comment.clone(),
        ],
        vec![
            action.to_string(),
            "FORWARD".to_string(),
            "-p".to_string(),
            protocol.to_string(),
            "-d".to_string(),
            options.target_ip.clone(),
            "--dport".to_string(),
            target_port,
            "-j".to_string(),
            "ACCEPT".to_string(),
            "-m".to_string(),
            "comment".to_string(),
            "--comment".to_string(),
            comment,
        ],
    ]
}

fn delete_args(args: &[String]) -> Vec<String> {
    let mut delete = args.to_vec();
    for arg in &mut delete {
        if arg == "-I" {
            *arg = "-D".to_string();
            break;
        }
    }
    delete
}

async fn run_net_command(bin: &str, args: &[String]) -> Result<()> {
    let output = Command::new(bin).args(args).output().await?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(anyhow!("firewall command failed: {stderr}"))
}

fn is_missing_rule_error(message: &str) -> bool {
    message.contains("No chain/target/match")
        || message.contains("Bad rule")
        || message.contains("does a matching rule exist")
}

async fn save_firewall_rules(ip_type: &IpType) -> Result<()> {
    for tool in tools(ip_type) {
        let (command, path) = if tool == "ip6tables" {
            ("ip6tables-save", "/etc/iptables/rules.v6")
        } else {
            ("iptables-save", "/etc/iptables/rules.v4")
        };
        save_one(command, path).await?;
    }
    Ok(())
}

async fn save_one(command: &str, path: &str) -> Result<()> {
    let output = Command::new(command).output().await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("failed to save firewall rules with {command}: {stderr}"));
    }

    if let Some(parent) = std::path::Path::new(path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(path, output.stdout).await?;
    Ok(())
}

fn tools(ip_type: &IpType) -> Vec<&'static str> {
    match ip_type {
        IpType::Ipv4 => vec!["iptables"],
        IpType::Ipv6 => vec!["ip6tables"],
        IpType::All => vec!["iptables", "ip6tables"],
    }
}

fn protocols(protocol: &Protocol) -> Vec<&'static str> {
    match protocol {
        Protocol::Tcp => vec!["tcp"],
        Protocol::Udp => vec!["udp"],
        Protocol::All => vec!["tcp", "udp"],
    }
}
