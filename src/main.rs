mod actions;
mod collectors;
mod command;
mod config;
mod logger;
mod podman;
mod transport;
mod types;

use anyhow::Result;
use collectors::host::{collect_host_metrics, MetricsState};
use collectors::podman::collect_container_metrics;
use podman::PodmanClient;
use tokio::sync::mpsc;
use tokio::time::{interval, Duration};
use types::{ClientMessage, ReportPayload, ServerMessage};

#[tokio::main]
async fn main() -> Result<()> {
    let config = config::Config::load()?;
    logger::init(&config.log_mode, &config.log_dir);
    let podman = PodmanClient::new(&config.podman_socket);

    tracing::info!(agent_id = %config.agent_id, server_url = %config.server_url, "agent started");

    let (outbound_tx, outbound_rx) = mpsc::channel(256);
    let (inbound_tx, mut inbound_rx) = mpsc::channel(256);

    tokio::spawn(transport::ws_client::run(
        config.server_url.clone(),
        config.agent_id.clone(),
        config.agent_token.clone(),
        outbound_rx,
        inbound_tx,
    ));

    let command_podman = podman.clone();
    let command_outbound = outbound_tx.clone();
    tokio::spawn(async move {
        while let Some(message) = inbound_rx.recv().await {
            match message {
                ServerMessage::Cmd(command) => {
                    let response = command::handle_command(&command_podman, command).await;
                    let _ = command_outbound.send(ClientMessage::Response(response)).await;
                }
                ServerMessage::Auth(_) => {}
            }
        }
    });

    let mut timer = interval(Duration::from_millis(config.collect_interval_ms));
    let mut state = MetricsState::default();

    loop {
        timer.tick().await;
        let host = collect_host_metrics(&mut state).await;
        let (containers, errors) = match collect_container_metrics(&podman, &mut state).await {
            Ok(containers) => (containers, None),
            Err(error) => {
                tracing::warn!(%error, "failed to collect Podman metrics");
                (Vec::new(), Some(vec![error.to_string()]))
            }
        };

        let report = ClientMessage::Report(ReportPayload {
            agent_id: config.agent_id.clone(),
            timestamp: collectors::host::now_ms(),
            host,
            containers,
            errors,
        });

        let _ = outbound_tx.send(report).await;
    }
}
