// src/index.ts
import { CONFIG } from './config';
import { wsClient } from './transport/ws-client';
import { collectHostMetrics } from './collectors/host';
import { collectContainerMetrics } from './collectors/podman';
import type { ReportPayload } from './types';
import os from 'os';

async function loop() {
  try {
    // 1. 并行采集
    // 生产级容错：即使采集报错，也不能让主循环挂掉
    const [host, containers] = await Promise.all([
      collectHostMetrics().catch(e => {
        console.error('Host Collector Error:', e);
        return null;
      }),
      collectContainerMetrics().catch(e => {
        console.error('Podman Collector Error:', e);
        return [];
      })
    ]);

    if (!host) return; // 主机数据都拿不到，本次放弃上报

    // 2. 组装数据包
    const payload: ReportPayload = {
      type: 'report',
      data: {
        agentId: CONFIG.agentName,
        timestamp: Date.now(),
        host: host,
        containers: containers,
        // 如果容器列表是空的，并且 Socket 也没找到，可以在这里加个 errors 标记（可选）
      }
    };

    // 3. 发送
    // 这里不需要判断 isConnected，client 内部会处理，如果没连上就发不出去（丢弃）
    wsClient.send(payload);

    // 4. 本地日志 (可选，证明活着)
    const time = new Date().toLocaleTimeString();
    const cpu = host.cpu.usagePercent.toFixed(1);
    const mem = host.memory.usagePercent.toFixed(1);
    console.log(`[${time}] Sent Report | CPU: ${cpu}% | Mem: ${mem}% | Containers: ${containers.length}`);

  } catch (e) {
    console.error('Main Loop Critical Error:', e);
  }
}

async function main() {
  console.log(`🚀 Bun Agent Starting... [ID: ${CONFIG.agentName}]`);
  
  // 1. 启动 WebSocket 连接
  wsClient.connect();

  // 2. 注册指令处理器 (预留)
  wsClient.onCommand((cmd) => {
    console.log('🤖 Received Command:', cmd);
    // 下一步我们会在这里调用 handlers
  });

  // 3. 立即执行一次采集
  await loop();

  // 4. 启动定时器
  setInterval(loop, CONFIG.interval);
}

main();