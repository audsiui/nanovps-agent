// test-server.ts
import { Elysia } from 'elysia';

const app = new Elysia()
  .ws('/ws', {
    open(ws) {
      console.log(`✅ Agent Connected: ${ws.id}`);
    },
    message(ws, message) {
      // 打印收到的数据
      const msg = message as any;
      if (msg.type === 'auth') {
        console.log(`🔑 Auth: ${msg.agentId} (v${msg.version})`);
      } else if (msg.type === 'report') {
        const d = msg.data;
        console.log(`📦 Report from ${d.agentId}:`);
        console.log(`   CPU: ${d.host.cpu.usagePercent}%`);
        console.log(`   Net RX Total: ${d.host.network.rxTotal}`);
        console.log(`   Containers: ${d.containers.length}`);
      }
    },
    close(ws) {
      console.log(`❌ Agent Disconnected: ${ws.id}`);
    }
  })
  .listen(3000);

console.log('🦊 Mock Server running at ws://localhost:3000/ws');