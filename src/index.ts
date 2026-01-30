import { CONFIG } from './config';
import { wsClient } from './transport/ws-client';
import { collectHostMetrics } from './collectors/host';
import { collectContainerMetrics } from './collectors/podman';
import type { ReportPayload } from './types';
import { handleServerCommand } from './handlers/cmd-handler';

async function loop() {
  try {
    const [host, containers] = await Promise.all([
      collectHostMetrics().catch(e => {
        console.error('主机采集器错误:', e);
        return null;
      }),
      collectContainerMetrics().catch(e => {
        console.error('容器采集器错误:', e);
        return [];
      })
    ]);

    if (!host) return;

    const payload: ReportPayload = {
      type: 'report',
      data: {
        agentId: CONFIG.agentName,
        timestamp: Date.now(),
        host: host,
        containers: containers,
      }
    };

    wsClient.send(payload);

    const time = new Date().toLocaleTimeString();
    const cpu = host.cpu.usagePercent.toFixed(1);
    const mem = host.memory.usagePercent.toFixed(1);
    console.log(`[${time}] 上报成功 | CPU: ${cpu}% | 内存: ${mem}% | 容器数: ${containers.length}`);

  } catch (e) {
    console.error('主循环严重错误:', e);
  }
}

async function main() {
  console.log(`🚀 Agent 启动中... [ID: ${CONFIG.agentName}]`);
  
  wsClient.connect();

  wsClient.onCommand(async (cmd) => {
    const response = await handleServerCommand(cmd);
    
    wsClient.send(response);
    
    console.log(`📤 命令 ${cmd.id} 响应已发送: ${response.success ? '成功' : '失败'}`);
  });

  console.log('⏳ 等待连接...');
  const connected = await wsClient.waitForConnection(10000);
  if (!connected) {
    console.warn('⚠️ 连接超时，继续运行...');
  }

  await loop();
  setInterval(loop, CONFIG.interval);
}

main();