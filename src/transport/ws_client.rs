use crate::types::{ClientMessage, ServerMessage};
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

pub async fn run(
    server_url: String,
    machine_key: String,
    mut outbound: mpsc::Receiver<ClientMessage>,
    inbound: mpsc::Sender<ServerMessage>,
) {
    let mut reconnect_delay = Duration::from_secs(1);
    let mut pending: Vec<ClientMessage> = Vec::new();

    loop {
        match connect_url(&server_url, &machine_key) {
            Ok(url) => match connect_async(url.as_str()).await {
                Ok((ws, _)) => {
                    tracing::info!("websocket connected");
                    reconnect_delay = Duration::from_secs(1);
                    let (mut write, mut read) = ws.split();

                    let retry_messages = std::mem::take(&mut pending);
                    for (index, message) in retry_messages.iter().enumerate() {
                        if send_message(&mut write, message).await.is_err() {
                            pending.extend(retry_messages[index..].iter().cloned());
                            break;
                        }
                    }

                    loop {
                        tokio::select! {
                            Some(message) = outbound.recv() => {
                                if send_message(&mut write, &message).await.is_err() {
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
                                    Some(Ok(Message::Close(_))) | None => break,
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
                Err(error) => tracing::warn!(%error, "websocket connect failed"),
            },
            Err(error) => tracing::error!(%error, "invalid websocket url"),
        }

        sleep(reconnect_delay).await;
        reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(30));
    }
}

fn connect_url(server_url: &str, machine_key: &str) -> Result<Url> {
    let mut url = Url::parse(server_url)?;
    url.query_pairs_mut().append_pair("key", machine_key);
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
