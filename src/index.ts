import { collectHostMetrics } from './collectors/host';

async function main() {
  console.log('--- 🔵 Phase 2 (Host) Test ---');
  console.log('Collecting metrics... (Press Ctrl+C to stop)');

  setInterval(async () => {
    try {
      const data = await collectHostMetrics();
      
      console.clear(); 
      console.log('--- Host Metrics ---');
      console.log(`CPU: ${data.cpu.usagePercent}% (${data.cpu.cores} Cores)`);
      console.log(`Mem: ${data.memory.usagePercent}% (${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)})`);
      console.log(`Net: ↓${formatBytes(data.network.rxRate)}/s  ↑${formatBytes(data.network.txRate)}/s`);
      console.log(`Uptime: ${Math.floor(data.uptime / 60)} min`);
      console.table(data.disks.map(d => ({ fs: d.fs, use: d.usePercent + '%' })));
      
    } catch (e) {
      console.error(e);
    }
  }, 2000);
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

main();