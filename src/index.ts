import { collectHostMetrics } from './collectors/host';
import { collectContainerMetrics } from './collectors/podman';
import os from 'os';

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
  console.log(`--- 🚀 Agent Started on ${os.hostname()} ---`);
  console.log('Press Ctrl+C to stop.\n');

  setInterval(async () => {
    try {
      console.clear();
      const time = new Date().toLocaleTimeString();
      console.log(`[${time}] Refreshing metrics...`);

      const [host, containers] = await Promise.all([
        collectHostMetrics(),
        collectContainerMetrics()
      ]);

      console.log('\n📦 HOST STATUS');
      console.log(`CPU: ${host.cpu.usagePercent}% | Mem: ${host.memory.usagePercent}%`);
      console.log(`Net: ↓${formatBytes(host.network.rxRate)}/s  ↑${formatBytes(host.network.txRate)}/s`);

    console.log(`\n🐳 CONTAINERS (${containers.length} active)`);
      if (containers.length > 0) {
        console.table(containers.map(c => ({
          Name: c.name,
          CPU: c.cpuPercent.toFixed(1) + '%',
          Mem: formatBytes(c.memory.usage),
          'Net ↓': formatBytes(c.network.rxRate) + '/s',
          'Net ↑': formatBytes(c.network.txRate) + '/s',
          'Total ↓': formatBytes(c.network.rxTotal),
          'Total ↑': formatBytes(c.network.txTotal)
        })));
      } else {
        console.log('No running containers.');
      }

    } catch (e) {
      console.error(e);
    }
  }, 2000);
}

main();