import { CONFIG } from '../config';
import { existsSync } from 'node:fs';

/**
 * 探测 Linux 下 Podman Socket 路径
 */
export async function findPodmanSocket(): Promise<string> {
  if (CONFIG.podmanSocket) {
    if (existsSync(CONFIG.podmanSocket)) {
      return CONFIG.podmanSocket;
    }
    console.warn(`⚠️ Configured socket [${CONFIG.podmanSocket}] not found, switching to auto-detect.`);
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
    console.log(`✅ [Podman] Socket connected at: ${cachedSocket}`);
  } else {
    console.warn(`🔸 [Podman] Socket not found (Normal on Windows).`);
  }
  
  return cachedSocket;
}