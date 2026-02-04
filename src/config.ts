import type { AgentConfig } from './types';
import { getMachineKey } from './utils/machine-key';

const env = process.env;

const DEFAULT_INTERVAL = 10000; // 默认 10s
const MIN_INTERVAL = 10000;     // 最快 10s
const MAX_INTERVAL = 30000;     // 最慢 30s
const DEFAULT_URL = 'ws://127.0.0.1:3000/ws';

/**
 * 解析时间字符串为毫秒数
 * 支持格式: 10s, 30s, 1m 等
 * 纯数字则视为毫秒
 */
function parseInterval(value: string | undefined): number {
  if (!value) {
    return DEFAULT_INTERVAL;
  }

  const trimmed = value.trim();

  // 纯数字，视为毫秒
  if (/^\d+$/.test(trimmed)) {
    return clampInterval(Number(trimmed));
  }

  // 匹配数字+单位格式 (s=秒, m=分钟)
  const match = trimmed.match(/^(\d+)([sm])$/i);
  if (!match) {
    console.warn(`[Config] 无效的时间格式 "${value}"，使用默认值 ${DEFAULT_INTERVAL}ms`);
    return DEFAULT_INTERVAL;
  }

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const ms = unit === 'm' ? num * 60 * 1000 : num * 1000;
  return clampInterval(ms);
}

/**
 * 限制上报频率在合理范围内
 */
function clampInterval(ms: number): number {
  if (ms < MIN_INTERVAL) {
    console.warn(`[Config] 上报频率过快 (${ms}ms)，已限制为最快 ${MIN_INTERVAL}ms`);
    return MIN_INTERVAL;
  }
  if (ms > MAX_INTERVAL) {
    console.warn(`[Config] 上报频率过慢 (${ms}ms)，已限制为最慢 ${MAX_INTERVAL}ms`);
    return MAX_INTERVAL;
  }
  return ms;
}

export function loadConfig(): AgentConfig {
  const interval = parseInterval(env.COLLECT_INTERVAL);

  const config: AgentConfig = {
    serverUrl: env.SERVER_URL || DEFAULT_URL,
    agentName: getMachineKey(),
    interval,
    podmanSocket: env.PODMAN_SOCKET || '',
  };

  return config;
}

export const CONFIG = loadConfig();