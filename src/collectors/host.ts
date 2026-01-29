import si from 'systeminformation';
import { calculateRate } from '../utils/calc';
import type { HostStat } from '../types';

export async function collectHostMetrics(): Promise<HostStat> {
  const timestamp = Date.now();

  const [cpu, mem, netStats, fs, time] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.networkStats(),
    si.fsSize(),
    si.time(),
  ]);

  let totalRx = 0;
  let totalTx = 0;
  
  for (const iface of netStats) {
    totalRx += iface.rx_bytes;
    totalTx += iface.tx_bytes;
  }

  const rxRate = calculateRate('host_total_rx', totalRx, timestamp);
  const txRate = calculateRate('host_total_tx', totalTx, timestamp);

  const stat: HostStat = {
    uptime: time.uptime,
    cpu: {
      cores: cpu.cpus.length,
      usagePercent: Number(cpu.currentLoad.toFixed(2)),
    },
    memory: {
      total: mem.total,
      used: mem.active,
      usagePercent: Number(((mem.active / mem.total) * 100).toFixed(2)),
    },
    network: {
      rxRate,
      txRate,
      rxTotal: totalRx,
      txTotal: totalTx,
    },
    disks: fs
      .filter(d => d.size > 0 && !d.fs.includes('overlay')) 
      .map(d => ({
        fs: d.fs,
        type: d.type,
        size: d.size,
        used: d.used,
        usePercent: Number(d.use.toFixed(2)),
      })),
  };

  return stat;
}