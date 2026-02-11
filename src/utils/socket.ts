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

  // 只检测系统级 socket（root 用户模式）
  const socketPath = '/run/podman/podman.sock';
  if (existsSync(socketPath)) {
    return socketPath;
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