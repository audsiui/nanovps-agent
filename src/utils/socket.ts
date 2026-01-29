import { CONFIG } from '../config';

/**
 * 探测 Linux 下 Podman Socket 路径
 */
export async function findPodmanSocket(): Promise<string> {
  if (CONFIG.podmanSocket) {
    try {
      if (await Bun.file(CONFIG.podmanSocket).exists()) {
        return CONFIG.podmanSocket;
      }
    } catch {
    }
    console.warn(`⚠️ Configured socket [${CONFIG.podmanSocket}] not found, switching to auto-detect.`);
  }

  const candidates: string[] = [];

  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;

  if (uid >= 1000) {
    candidates.push(`/run/user/${uid}/podman/podman.sock`);
  }

  candidates.push('/run/podman/podman.sock');

  for (const path of candidates) {
    try {
      if (await Bun.file(path).exists()) {
        return path;
      }
    } catch (e) {
      continue;
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