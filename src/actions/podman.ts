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
    unix: socketPath,
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

/**
 * 创建并启动容器
 * 对应: podman run -d --name xxx ...
 */
export interface CreateContainerOptions {
  name: string;
  image: string;
  hostname?: string;
  memory?: string;
  memorySwap?: string;
  storageOpt?: string;
  cpus?: number;
  sshPort?: number;
  network?: string;
  capAdd?: string[];
  userns?: string;
  restartPolicy?: string;
}

export async function createContainer(options: CreateContainerOptions): Promise<{ id: string; name: string }> {
  const socketPath = await getPodmanSocket();
  if (!socketPath) throw new Error('Podman socket not available');

  // 构建 Podman API 的容器配置
  const containerConfig: any = {
    name: options.name,
    image: options.image,
    hostname: options.hostname,
    restart_policy: options.restartPolicy || 'always',
  };

  // 资源限制
  const resources: any = {};
  if (options.memory) {
    // 转换 "128m" -> 134217728 bytes
    resources.memory = parseMemorySize(options.memory);
  }
  if (options.memorySwap) {
    resources.memory_swap = parseMemorySize(options.memorySwap);
  }
  if (options.storageOpt) {
    resources.storage_opt = [options.storageOpt];
  }
  if (options.cpus) {
    resources.cpu_period = 100000;
    resources.cpu_quota = options.cpus * 100000;
  }
  if (Object.keys(resources).length > 0) {
    containerConfig.resource_limits = resources;
  }

  // 端口映射
  if (options.sshPort) {
    containerConfig.port_mappings = [
      {
        host_port: options.sshPort,
        container_port: 22,
        protocol: 'tcp',
        host_ip: '',
      }
    ];
  }

  // 网络
  if (options.network) {
    containerConfig.networks = [{ name: options.network }];
  }

  // Capabilities
  if (options.capAdd && options.capAdd.length > 0) {
    containerConfig.cap_add = options.capAdd;
  }

  // User namespace
  if (options.userns) {
    containerConfig.userns = options.userns;
  }

  // 1. 创建容器
  const createUrl = `http://d/v4.0.0/libpod/containers/create`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerConfig),
    unix: socketPath,
  });

  if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Failed to create container: ${createRes.statusText} - ${errorText}`);
  }

  const createData = (await createRes.json()) as { Id: string };
  const containerId = createData.Id;

  // 2. 启动容器
  const startUrl = `http://d/v4.0.0/libpod/containers/${containerId}/start`;
  const startRes = await fetch(startUrl, {
    method: 'POST',
    unix: socketPath,
  });

  if (!startRes.ok) {
    throw new Error(`Container created but failed to start: ${startRes.statusText}`);
  }

  return {
    id: containerId,
    name: options.name
  };
}

/**
 * 解析内存大小字符串
 * "128m" -> 134217728
 * "1g" -> 1073741824
 */
function parseMemorySize(size: string): number {
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg]?)b?$/);
  if (!match) {
    throw new Error(`Invalid memory size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2] ?? 'b';

  const multipliers: Record<string, number> = {
    'b': 1,
    'k': 1024,
    'm': 1024 * 1024,
    'g': 1024 * 1024 * 1024,
  };

  const multiplier = multipliers[unit];
  if (!multiplier) {
    throw new Error(`Unknown memory unit: ${unit}`);
  }

  return Math.floor(value * multiplier);
}