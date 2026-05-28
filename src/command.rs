use crate::actions::net::{remove_port_forwarding, setup_port_forwarding, ForwardOptions};
use crate::podman::containers::CreateContainerOptions;
use crate::podman::PodmanClient;
use crate::types::{AgentAction, CommandResponsePayload, ServerCommand};
use anyhow::Result;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContainerIdPayload {
    container_id: String,
}

pub async fn handle_command(client: &PodmanClient, command: ServerCommand) -> CommandResponsePayload {
    match execute_command(client, &command).await {
        Ok((message, data)) => CommandResponsePayload {
            ref_id: command.id,
            success: true,
            message: Some(message),
            data,
        },
        Err(error) => CommandResponsePayload {
            ref_id: command.id,
            success: false,
            message: Some(error.to_string()),
            data: None,
        },
    }
}

async fn execute_command(
    client: &PodmanClient,
    command: &ServerCommand,
) -> Result<(String, Option<serde_json::Value>)> {
    match command.action {
        AgentAction::ContainerCreate => {
            let options: CreateContainerOptions = serde_json::from_value(command.payload.clone())?;
            let result = client.create_container(options).await?;
            let message = format!("Container {} created and started", result.name);
            Ok((message, Some(serde_json::to_value(result)?)))
        }
        AgentAction::ContainerRestart => {
            let payload: ContainerIdPayload = serde_json::from_value(command.payload.clone())?;
            client.restart_container(&payload.container_id).await?;
            Ok((format!("Container {} restarted", payload.container_id), None))
        }
        AgentAction::ContainerStop => {
            let payload: ContainerIdPayload = serde_json::from_value(command.payload.clone())?;
            client.stop_container(&payload.container_id).await?;
            Ok((format!("Container {} stopped", payload.container_id), None))
        }
        AgentAction::ContainerStart => {
            let payload: ContainerIdPayload = serde_json::from_value(command.payload.clone())?;
            client.start_container(&payload.container_id).await?;
            Ok((format!("Container {} started", payload.container_id), None))
        }
        AgentAction::ContainerRemove => {
            let payload: ContainerIdPayload = serde_json::from_value(command.payload.clone())?;
            client.remove_container(&payload.container_id, false).await?;
            Ok((format!("Container {} removed", payload.container_id), None))
        }
        AgentAction::ContainerRemoveForce => {
            let payload: ContainerIdPayload = serde_json::from_value(command.payload.clone())?;
            client.remove_container(&payload.container_id, true).await?;
            Ok((format!("Container {} force removed", payload.container_id), None))
        }
        AgentAction::NetForward => {
            let payload: ForwardOptions = serde_json::from_value(command.payload.clone())?;
            let message = format!(
                "Port forwarding set: :{} -> {}:{}",
                payload.port,
                payload.target_ip,
                payload.target_port.unwrap_or(payload.port)
            );
            setup_port_forwarding(payload).await?;
            Ok((message, None))
        }
        AgentAction::NetUnforward => {
            let payload: ForwardOptions = serde_json::from_value(command.payload.clone())?;
            let message = format!(
                "Port forwarding removed: :{} -> {}:{}",
                payload.port,
                payload.target_ip,
                payload.target_port.unwrap_or(payload.port)
            );
            remove_port_forwarding(payload).await?;
            Ok((message, None))
        }
        AgentAction::AgentUpgrade | AgentAction::AgentRestart => {
            anyhow::bail!("unsupported action")
        }
    }
}
