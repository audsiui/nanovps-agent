import type { AgentConfig } from './types';
import os from 'os';

const env = process.env;

const DEFAULT_INTERVAL = 2000;
const DEFAULT_URL = 'ws://127.0.0.1:3000/ws';

export function loadConfig(): AgentConfig {
  const config: AgentConfig = {
    serverUrl: env.SERVER_URL || DEFAULT_URL,
    agentName: env.AGENT_NAME || os.hostname(),
    interval: Number(env.COLLECT_INTERVAL) || DEFAULT_INTERVAL,
    podmanSocket: env.PODMAN_SOCKET || '',
  };

  return config;
}

export const CONFIG = loadConfig();