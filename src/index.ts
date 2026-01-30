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
        console.error('Host Collector Error:', e);
        return null;
      }),
      collectContainerMetrics().catch(e => {
        console.error('Podman Collector Error:', e);
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
    console.log(`[${time}] Sent Report | CPU: ${cpu}% | Mem: ${mem}% | Containers: ${containers.length}`);

  } catch (e) {
    console.error('Main Loop Critical Error:', e);
  }
}

async function main() {
  console.log(`🚀 Bun Agent Starting... [ID: ${CONFIG.agentName}]`);
  
  wsClient.connect();

  wsClient.onCommand(async (cmd) => {
    const response = await handleServerCommand(cmd);
    
    wsClient.send(response);
    
    console.log(`📤 Sent response for cmd ${cmd.id}: ${response.success ? 'OK' : 'FAIL'}`);
  });

  console.log('⏳ Waiting for connection...');
  await new Promise(resolve => setTimeout(resolve, 500));

  await loop();
  setInterval(loop, CONFIG.interval);
}

main();