import { getPodmanSocket } from '../utils/socket';
import { calculateRate } from '../utils/calc';
import type { ContainerStat } from '../types';

export async function collectContainerMetrics(): Promise<ContainerStat[]> {
  const socketPath = await getPodmanSocket();
  
  if (!socketPath) return [];

  try {
    const response = await fetch("http://d/v4.0.0/libpod/containers/stats?stream=false", {
      unix: socketPath
    });

    if (!response.ok) {
      throw new Error(`Podman API Error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as any;
    
    const rawStats = json.Stats || [];
    const timestamp = Date.now();

    const results: ContainerStat[] = [];

    for (const s of rawStats) {
      let rxTotal = 0;
      let txTotal = 0;

      if (s.Network) {
        for (const ifaceName in s.Network) {
          const iface = s.Network[ifaceName];
          rxTotal += iface.RxBytes || 0;
          txTotal += iface.TxBytes || 0;
        }
      }

      const rxRate = calculateRate(`container_${s.ID}_rx`, rxTotal, timestamp);
      const txRate = calculateRate(`container_${s.ID}_tx`, txTotal, timestamp);

      results.push({
        id: s.ID.substring(0, 12),
        name: s.Name || 'unknown',
        image: s.Image || 'unknown',
        state: 'running',
        
        cpuPercent: s.CPU || 0,
        
        memory: {
          usage: s.MemUsage || 0,
          limit: s.MemLimit || 0,
          usagePercent: s.MemPerc || 0,
        },

        network: {
          rxRate,
          txRate,
          rxTotal,
          txTotal
        }
      });
    }

    return results;

  } catch (error: any) {
    console.warn(`⚠️ [Podman Collector] Failed: ${error.message}`);
    return [];
  }
}