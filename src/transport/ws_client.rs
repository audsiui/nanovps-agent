use crate::types::{AuthResult, ClientMessage, ServerMessage};
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite};
use tungstenite::Message;
use url::Url;

const AUTH_FAIL_DELAY: Duration = Duration::from_secs(60);

pub async fn run(
    server_url: String,
    agent_id: String,
    agent_token: String,
    mut outbound: mpsc::Receiver<ClientMessage>,
    inbound: mpsc::Sender<ServerMessage>,
) {
    let mut reconnect_delay = Duration::from_secs(1);
    let mut pending: Vec<ClientMessage> = Vec::new();

    loop {
        match connect_url(&server_url, &agent_id, &agent_token) {
            Ok(url) => match connect_async(url.as_str()).await {
                Ok((ws, _)) => {
                    tracing::info!("websocket connected");
                    let (mut write, mut read) = ws.split();

                    let retry_messages = std::mem::take(&mut pending);
                    for (index, message) in retry_messages.iter().enumerate() {
                        if send_message(&mut write, message).await.is_err() {
                            pending.extend(retry_messages[index..].iter().cloned());
                            break;
                        }
                    }

                    let auth = wait_auth(&mut read).await;
                    match auth {
                        AuthOutcome::Ok => {
                            tracing::info!("auth succeeded");
                            reconnect_delay = Duration::from_secs(1);
                            message_loop(&mut write, &mut read, &mut outbound, &inbound, &mut pending).await;
                        }
                        AuthOutcome::Failed(reason) => {
                            tracing::warn!(reason, "auth failed");
                            reconnect_delay = AUTH_FAIL_DELAY;
                        }
                        AuthOutcome::Disconnected => {
                            tracing::warn!("disconnected before auth");
                        }
                    }
                }
                Err(error) => tracing::warn!(%error, "websocket connect failed"),
            },
            Err(error) => tracing::error!(%error, "invalid websocket url"),
        }

        sleep(reconnect_delay).await;
        if reconnect_delay < AUTH_FAIL_DELAY {
            reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(30));
        }
    }
}

enum AuthOutcome {
    Ok,
    Failed(String),
    Disconnected,
}

async fn wait_auth<S>(read: &mut S) -> AuthOutcome
where
    S: StreamExt<Item = Result<Message, tungstenite::Error>> + Unpin,
{
    while let Some(result) = read.next().await {
        match result {
            Ok(Message::Text(text)) => {
                let msg = serde_json::from_str::<ServerMessage>(&text);
                match msg {
                    Ok(ServerMessage::Auth(AuthResult { success, reason })) => {
                        if success {
                            return AuthOutcome::Ok;
                        } else {
                            return AuthOutcome::Failed(reason.unwrap_or_default());
                        }
                    }
                    Ok(ServerMessage::Cmd(_)) => {
                        tracing::warn!("received cmd before auth, treating as auth succeeded");
                        return AuthOutcome::Ok;
                    }
                    Err(error) => tracing::warn!(%error, "failed to parse message during auth"),
                }
            }
            Ok(Message::Close(frame)) => {
                if let Some(frame) = frame {
                    tracing::warn!(code = %frame.code, reason = %frame.reason, "closed before auth");
                }
                return AuthOutcome::Disconnected;
            }
            Ok(_) => {}
            Err(error) => {
                tracing::warn!(%error, "websocket error during auth");
                return AuthOutcome::Disconnected;
            }
        }
    }
    AuthOutcome::Disconnected
}

async fn message_loop<S, R>(
    write: &mut S,
    read: &mut R,
    outbound: &mut mpsc::Receiver<ClientMessage>,
    inbound: &mpsc::Sender<ServerMessage>,
    pending: &mut Vec<ClientMessage>,
) where
    S: SinkExt<Message> + Unpin,
    S::Error: std::error::Error + Send + Sync + 'static,
    R: StreamExt<Item = Result<Message, tungstenite::Error>> + Unpin,
{
    loop {
        tokio::select! {
            Some(message) = outbound.recv() => {
                if send_message(write, &message).await.is_err() {
                    pending.push(message);
                    break;
                }
            }
            incoming = read.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<ServerMessage>(&text) {
                            Ok(message) => {
                                let _ = inbound.send(message).await;
                            }
                            Err(error) => tracing::warn!(%error, "failed to parse server message"),
                        }
                    }
                    Some(Ok(Message::Close(frame))) => {
                        if let Some(frame) = frame {
                            tracing::info!(code = %frame.code, reason = %frame.reason, "websocket closed");
                        }
                        break;
                    }
                    None => break,
                    Some(Ok(_)) => {}
                    Some(Err(error)) => {
                        tracing::warn!(%error, "websocket error");
                        break;
                    }
                }
            }
        }
    }
}

fn connect_url(server_url: &str, agent_id: &str, agent_token: &str) -> Result<Url> {
    let mut url = Url::parse(server_url)?;
    url.query_pairs_mut().append_pair("agentId", agent_id);
    url.query_pairs_mut().append_pair("token", agent_token);
    Ok(url)
}

async fn send_message<S>(write: &mut S, message: &ClientMessage) -> Result<()>
where
    S: SinkExt<Message> + Unpin,
    S::Error: std::error::Error + Send + Sync + 'static,
{
    let text = serde_json::to_string(message)?;
    write.send(Message::Text(text.into())).await?;
    Ok(())
}