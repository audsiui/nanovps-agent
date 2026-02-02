// src/types.ts

// ==========================================
// 1. 基础配置与通用类型
// ==========================================

export interface AgentConfig {
  serverUrl: string;
  agentName: string; // 唯一标识，使用机器码（64字符十六进制字符串）
  interval: number;  // 采集间隔 (ms)
  podmanSocket: string; // Unix Socket 路径
}

// ==========================================
// 2. 核心指标定义 (Data Models)
// ==========================================

/**
 * 主机硬盘状态
 */
export interface HostDiskStat {
  fs: string;       // 文件系统/盘符 (e.g., "/dev/sda1", "C:")
  type: string;     // 类型 (e.g., "ext4", "NTFS")
  size: number;     // 总大小 (Bytes)
  used: number;     // 已用 (Bytes)
  usePercent: number; // 使用率 (0-100)
}

/**
 * 主机整体状态
 */
export interface HostStat {
  uptime: number;   // 运行时间 (秒)
  cpu: {
    cores: number;        // 物理核心数
    usagePercent: number; // 总使用率 (0-100)
  };
  memory: {
    total: number;    // Bytes
    used: number;     // Bytes
    usagePercent: number;
  };
  network: {
    // 聚合了所有物理网卡的流量
    rxRate: number;   // 下载速率 (Bytes/s)
    txRate: number;   // 上传速率 (Bytes/s)
    rxTotal: number;  // 总接收 (Bytes) - 用于校对
    txTotal: number;  // 总发送 (Bytes)
  };
  disks: HostDiskStat[];
}

/**
 * Podman 容器单体状态
 */
export interface ContainerStat {
  id: string;       // 容器短 ID (12位)
  name: string;     // 容器名称 (e.g., "my-nginx")
  
  cpuPercent: number; // CPU 使用率 (可能超过 100% 如果是多核)
  
  memory: {
    usage: number;    // 已用内存 (Bytes)
    limit: number;    // 限制内存 (Bytes)
    usagePercent: number; 
  };
  
  network: {
    // Podman 容器通常有独立的 Network Namespace
    rxRate: number;   // 实时下载速率 (Bytes/s)
    txRate: number;   // 实时上传速率 (Bytes/s)
    rxTotal: number;  // 累计接收 (Bytes)
    txTotal: number;  // 累计发送 (Bytes)
  };
}

// ==========================================
// 3. 通信协议 (WebSocket Payloads)
// ==========================================

// ------ 3.1 Agent 发给 Server 的消息 ------


/** * 监控数据上报包 
 * 周期性发送 (Heartbeat + Data)
 */
export interface ReportPayload {
  type: 'report';
  data: {
    agentId: string;
    timestamp: number; // 采集时间戳
    host: HostStat;
    containers: ContainerStat[];
    // 容错机制：如果 Host 采到了但 Podman 挂了，这里会携带错误信息
    errors?: string[]; 
  };
}

/** * 指令执行结果回复包
 * 当 Server 下发 'cmd' 后，Agent 执行完通过此消息回复
 */
export interface CommandResponsePayload {
  type: 'response';
  refId: string;       // 对应 ServerCommand 的 id
  success: boolean;    // 执行是否成功
  message?: string;    // 成功提示或错误详情
  data?: any;          // 如果有返回数据 (例如 fetch logs)
}

// Agent 发送的消息总集
export type ClientMessage = ReportPayload | CommandResponsePayload;


// ------ 3.2 Server 发给 Agent 的消息 ------

/**
 * 控制指令包
 * 服务端下发，要求 Agent 执行操作
 */
export interface ServerCommand {
  type: 'cmd';
  id: string;          // 唯一指令 ID (UUID)，用于追踪回复
  action: AgentAction; // 具体动作
  payload: any;        // 动作所需的参数
}

// 具体的动作定义 (Discriminated Union 增强类型安全)
export type AgentAction =
  // --- 容器类 ---
  | 'container:create'  // 创建容器
  | 'container:start'
  | 'container:stop'
  | 'container:restart'
  | 'container:kill'
  | 'container:remove'

  // --- Agent 自身 ---
  | 'agent:upgrade'
  | 'agent:restart'

  // --- 网络类 ---
  | 'net:forward'
  | 'net:unforward';


export type ServerMessage = ServerCommand;