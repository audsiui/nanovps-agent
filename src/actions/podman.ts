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

  // 构建 URL: /v5.0.0/libpod/containers/{id}/{action}
  const url = `http://d/v5.0.0/libpod/containers/${id}/${action}`;

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

/**
 * 删除容器
 * @param id 容器 ID
 * @param force 是否强制删除（包括正在运行的容器）
 */
export async function removeContainer(id: string, force: boolean): Promise<void> {
  const socketPath = await getPodmanSocket();
  if (!socketPath) throw new Error('Podman socket not available');

  const params = new URLSearchParams();
  if (force) {
    params.append('force', 'true');
  }

  const url = `http://d/v5.0.0/libpod/containers/${id}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'DELETE',
    unix: socketPath,
  });

  if (!res.ok) {
    throw new Error(`Podman remove failed: ${res.statusText}`);
  }
}

/**
 * 创建并启动容器
 * 对应: podman run -d --name xxx ...
 */
export interface CreateContainerOptions {
  name: string;
  image: string;
  hostname?: string;
  /** 内存限制，单位：字节 (如 512MB = 536870912) */
  memory?: number;
  /** 内存+Swap 限制，单位：字节。-1 表示不限制 swap */
  memorySwap?: number;
  storageOpt?: string;
  /** CPU 核心数限制 (如 0.5, 1, 2) */
  cpus?: number;
  /** 进程数限制 */
  pidsLimit?: number;
  sshPort?: number;
  network?: string;
  /** 静态 IPv4 地址 */
  ip?: string;
  /** 静态 IPv6 地址 */
  ip6?: string;
  /** 环境变量，如 { ROOT_PASSWORD: 'xxx' } */
  env?: Record<string, string>;
  userns?: string;
  restartPolicy?: string;
}


/**
 * 拉取镜像
 * @param image 镜像名称 (如 "docker.io/library/alpine:latest")
 */
async function pullImage(image: string): Promise<void> {
  const socketPath = await getPodmanSocket();
  if (!socketPath) throw new Error('Podman socket not available');

  // 使用 t=-1 参数等待拉取完成（无限超时）
  const pullUrl = `http://d/v5.0.0/libpod/images/pull?reference=${encodeURIComponent(image)}&t=-1`;
  
  console.log(`[Podman] 开始拉取镜像: ${image}`);
  const res = await fetch(pullUrl, {
    method: 'POST',
    unix: socketPath,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to pull image ${image}: ${res.statusText} - ${errorText}`);
  }

  // 读取并丢弃响应流（等待拉取完成）
  await res.text();
  console.log(`[Podman] 镜像拉取完成: ${image}`);
}

/**
 * 检查镜像是否存在
 */
async function imageExists(image: string): Promise<boolean> {
  const socketPath = await getPodmanSocket();
  if (!socketPath) return false;

  const url = `http://d/v5.0.0/libpod/images/${encodeURIComponent(image)}/exists`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      unix: socketPath,
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

export async function createContainer(options: CreateContainerOptions): Promise<{ id: string; name: string }> {
  const socketPath = await getPodmanSocket();
  if (!socketPath) throw new Error('Podman socket not available');

  // 构建 Podman API 的容器配置 (SpecGenerator)
  const containerConfig: any = {
    image: options.image,
    hostname: options.hostname,
    restart_policy: options.restartPolicy || 'always',
  };

  // 资源限制 (OCI spec 格式)
  const resources: any = {};
  if (options.memory) {
    resources.memory = { limit: options.memory };
  }
  if (options.memorySwap) {
    resources.memory = resources.memory || {};
    resources.memory.swap = options.memorySwap;  // int64 类型，不是对象
  }
  if (options.storageOpt) {
    resources.storage_opt = [options.storageOpt];
  }
  if (options.cpus) {
    // CPU 使用 OCI LinuxCPU 格式
    resources.cpu = {
      quota: Math.floor(options.cpus * 100000),
      period: 100000
    };
  }
  if (options.pidsLimit) {
    resources.pids = { limit: options.pidsLimit };
  }
  if (Object.keys(resources).length > 0) {
    containerConfig.resource_limits = resources;
  }

  // 端口映射 - 使用 publish 格式兼容自定义网络
  if (options.sshPort) {
    containerConfig.publish = [
      `${options.sshPort}:22/tcp`
    ];
  }

  // 网络配置 (Podman v5 使用 map 格式)
  if (options.network) {
    const networkConfig: any = {};
    if (options.ip) {
      networkConfig.static_ips = [options.ip];
    }
    if (options.ip6) {
      networkConfig.static_ipv6s = [options.ip6];
    }
    containerConfig.networks = {
      [options.network]: networkConfig
    };
  }

  // 环境变量 - Libpod API 需要 map[string]string 格式
  if (options.env && Object.keys(options.env).length > 0) {
    containerConfig.env = options.env;
  }

  // User namespace (Podman v5 需要对象格式)
  if (options.userns) {
    containerConfig.userns = { nsmode: options.userns };
  }

  // Systemd 模式（写死为 always）
  containerConfig.systemd = 'always';

  // 1. 创建容器 (name 必须作为 URL query 参数)
  const createUrl = `http://d/v5.0.0/libpod/containers/create?name=${encodeURIComponent(options.name)}`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerConfig),
    unix: socketPath,
  });

  let containerId: string;
  
  // 如果镜像不存在，自动拉取并重试
  if (createRes.status === 404) {
    console.log(`Image ${options.image} not found locally, pulling...`);
    await pullImage(options.image);
    
    // 等待镜像可用（最多重试 10 次，每次 1 秒）
    let exists = false;
    for (let i = 0; i < 10; i++) {
      if (await imageExists(options.image)) {
        exists = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (!exists) {
      throw new Error(`Image ${options.image} pulled but not available after waiting`);
    }
    
    // 重新创建容器
    const retryRes = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerConfig),
      unix: socketPath,
    });
    
    if (!retryRes.ok) {
      const errorText = await retryRes.text();
      throw new Error(`Failed to create container after pulling image: ${retryRes.statusText} - ${errorText}`);
    }
    
    const retryData = (await retryRes.json()) as { Id: string };
    containerId = retryData.Id;
  } else if (!createRes.ok) {
    const errorText = await createRes.text();
    throw new Error(`Failed to create container: ${createRes.statusText} - ${errorText}`);
  } else {
    const createData = (await createRes.json()) as { Id: string };
    containerId = createData.Id;
  }

  // 2. 启动容器
  const startUrl = `http://d/v5.0.0/libpod/containers/${containerId}/start`;
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

