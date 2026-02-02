import { CONFIG } from '../config';
import { existsSync } from 'node:fs';
import { createLogger } from './logger';

const logger = createLogger('Podman');

/**
 * 探测 Linux 下 Podman Socket 路径
 */
export async function findPodmanSocket(): Promise<string> {
  if (CONFIG.podmanSocket) {
    if (existsSync(CONFIG.podmanSocket)) {
      return CONFIG.podmanSocket;
    }
    logger.warn(`配置的 socket [${CONFIG.podmanSocket}] 未找到，切换到自动检测`);
  }

  const candidates: string[] = [];

  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;

  if (uid >= 0) {
    candidates.push(`/run/user/${uid}/podman/podman.sock`);
  }

  candidates.push('/run/podman/podman.sock');

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  return '';
}

let cachedSocket: string | null = null; 

export async function getPodmanSocket(): Promise<string> {
  if (cachedSocket !== null) return cachedSocket;
  
  cachedSocket = await findPodmanSocket();
  
  if (cachedSocket) {
    logger.info(`Socket 已连接: ${cachedSocket}`);
  } else {
    logger.warn('未找到 Socket（Windows 上属于正常）');
  }
  
  return cachedSocket;
}