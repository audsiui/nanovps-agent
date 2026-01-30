import type { AgentConfig } from './types';
import os from 'os';

const env = process.env;

const DEFAULT_INTERVAL = 2000;
const DEFAULT_URL = 'ws://127.0.0.1:3000/ws';

export function loadConfig(): AgentConfig {
  if (!env.SERVER_TOKEN) {
    console.error('❌ [致命错误] .env 文件中缺少 SERVER_TOKEN。');
    process.exit(1);
  }

  const config: AgentConfig = {
    serverUrl: env.SERVER_URL || DEFAULT_URL,
    agentName: env.AGENT_NAME || os.hostname(),
    token: env.SERVER_TOKEN,
    interval: Number(env.COLLECT_INTERVAL) || DEFAULT_INTERVAL,
    podmanSocket: env.PODMAN_SOCKET || '', 
  };

  return config;
}

export const CONFIG = loadConfig();