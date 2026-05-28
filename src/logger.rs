use tracing_subscriber::{fmt, EnvFilter};

pub fn init(mode: &str, dir: &str) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    let subscriber = fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact();

    match mode {
        "file" => {
            let appender = tracing_appender::rolling::never(dir, "agent.log");
            subscriber.with_writer(appender).init();
        }
        _ => subscriber.init(),
    }
}
