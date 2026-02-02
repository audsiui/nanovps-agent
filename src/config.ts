import type { AgentConfig } from './types';
import { getMachineKey } from './utils/machine-key';

const env = process.env;

const DEFAULT_INTERVAL = 2000;
const DEFAULT_URL = 'ws://127.0.0.1:3000/ws';

export function loadConfig(): AgentConfig {
  const config: AgentConfig = {
    serverUrl: env.SERVER_URL || DEFAULT_URL,
    agentName: getMachineKey(),
    interval: Number(env.COLLECT_INTERVAL) || DEFAULT_INTERVAL,
    podmanSocket: env.PODMAN_SOCKET || '',
  };

  return config;
}

export const CONFIG = loadConfig();