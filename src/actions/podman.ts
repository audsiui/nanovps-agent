// src/actions/podman.ts
import { getPodmanSocket } from '../utils/socket';

/**
 * 通用 Podman 操作封装
 * @param id 容器 ID
 * @param action 动作 (stop, start, restart, kill)
 */
async function podmanAction(id: string, action: string) {
  const socketPath = await getPodmanSocket();
  if (!socketPath) throw new Error('Podman socket not available');

  // 构建 URL: /v4.0.0/libpod/containers/{id}/{action}
  const url = `http://d/v4.0.0/libpod/containers/${id}/${action}`;

  const res = await fetch(url, {
    method: 'POST',
    // @ts-ignore
    unix: socketPath
  });

  if (!res.ok) {
    throw new Error(`Podman ${action} failed: ${res.statusText}`);
  }

  return true;
}

export const restartContainer = (id: string) => podmanAction(id, 'restart');
export const stopContainer = (id: string) => podmanAction(id, 'stop');
export const startContainer = (id: string) => podmanAction(id, 'start');
export const killContainer = (id: string) => podmanAction(id, 'kill');