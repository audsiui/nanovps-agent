import { getPodmanSocket } from '../utils/socket';
import { calculateRate } from '../utils/calc';
import type { ContainerStat } from '../types';

export async function collectContainerMetrics(): Promise<ContainerStat[]> {
  const socketPath = await getPodmanSocket();
  if (!socketPath) return [];

  try {
    const response = await fetch('http://d/v5.0.0/libpod/containers/stats?stream=false', {
      unix: socketPath,
    });

    if (!response.ok) {
      throw new Error(`Podman API Error: ${response.status}`);
    }

    const json = await response.json() as any;
    
    
    let rawStats: any[] = [];

    if (Array.isArray(json.Stats)) {
      rawStats = json.Stats;
    } 
    else if (json.Stats && typeof json.Stats === 'object') {
      rawStats = Object.values(json.Stats);
    }
    else if (Array.isArray(json)) {
      rawStats = json;
    }

    if (rawStats.length === 0 && json.Stats) {
      console.log('⚠️ [调试] Stats 结构异常:', JSON.stringify(json).substring(0, 100));
    }

    const timestamp = Date.now();
    const results: ContainerStat[] = [];

    for (const s of rawStats) {
      const idRaw = s.ID || s.id || s.ContainerID || '';
      const nameRaw = s.Name || s.name || 'unknown';
      
      if (!idRaw) continue;

      const id = idRaw.substring(0, 12);

      let rxTotal = 0;
      let txTotal = 0;

      if (s.Network) {
        for (const ifaceName in s.Network) {
          const iface = s.Network[ifaceName];
          rxTotal += iface.RxBytes || 0;
          txTotal += iface.TxBytes || 0;
        }
      } else if (s.NetInput !== undefined) {
        rxTotal = s.NetInput || 0;
        txTotal = s.NetOutput || 0;
      }

      const rxRate = calculateRate(`container_${id}_rx`, rxTotal, timestamp);
      const txRate = calculateRate(`container_${id}_tx`, txTotal, timestamp);

      let cpuVal = 0;
      if (typeof s.CPU === 'string') {
        cpuVal = parseFloat(s.CPU.replace('%', ''));
      } else {
        cpuVal = s.CPU || 0;
      }

      const memUsage = s.MemUsage || 0;
      const memLimit = s.MemLimit || 0;
      let memPerc = s.MemPerc || 0;
      if (typeof s.MemPerc === 'string') {
        memPerc = parseFloat(s.MemPerc.replace('%', ''));
      }

      // 解析容器状态
      let state: ContainerStat['state'] = 'unknown';
      const rawState = s.State || s.status || s.Status || '';
      if (typeof rawState === 'string') {
        const stateLower = rawState.toLowerCase();
        if (stateLower.includes('running')) state = 'running';
        else if (stateLower.includes('exited') || stateLower.includes('stopped')) state = 'exited';
        else if (stateLower.includes('paused')) state = 'paused';
        else if (stateLower.includes('created')) state = 'created';
      }

      results.push({
        id: id,
        name: nameRaw,
        image: s.Image || s.image || 'unknown',
        state: state,

        cpuPercent: cpuVal,
        
        memory: {
          usage: memUsage,
          limit: memLimit,
          usagePercent: memPerc,
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
    console.warn(`⚠️ [Podman 采集器] 失败: ${error.message}`);
    return [];
  }
}