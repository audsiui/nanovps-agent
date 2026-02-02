import { getPodmanSocket } from '../utils/socket';
import { calculateRate } from '../utils/calc';
import { createLogger } from '../utils/logger';
import type { ContainerStat } from '../types';

const logger = createLogger('Podman');

// 定义 API 返回的数据结构类型
interface PodmanNetInterface {
  RxBytes?: number;
  TxBytes?: number;
  [key: string]: any;
}

interface PodmanStatsEntry {
  ID?: string;
  id?: string;
  ContainerID?: string;
  Name?: string;
  name?: string;
  Image?: string;
  image?: string;
  Network?: Record<string, PodmanNetInterface | undefined>; // 这里显式标记可能为 undefined
  NetInput?: number;
  NetOutput?: number;
  CPU?: string | number;
  MemUsage?: number;
  MemLimit?: number;
  MemPerc?: string | number;
  [key: string]: any; 
}

interface PodmanStatsResponse {
  Stats?: PodmanStatsEntry[];
  [key: string]: any;
}

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

    const json = await response.json() as PodmanStatsResponse | PodmanStatsEntry[];
    
    let rawStats: PodmanStatsEntry[] = [];

    if (!Array.isArray(json) && json.Stats && Array.isArray(json.Stats)) {
      rawStats = json.Stats;
    } 
    else if (!Array.isArray(json) && json.Stats && typeof json.Stats === 'object') {
      rawStats = Object.values(json.Stats);
    }
    else if (Array.isArray(json)) {
      rawStats = json;
    }

    if (rawStats.length === 0 && !Array.isArray(json) && (json as PodmanStatsResponse).Stats) {
      logger.debug('Stats 结构异常: ' + JSON.stringify(json).substring(0, 100));
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
          if (ifaceName === 'lo') continue;

          const iface = s.Network[ifaceName];
          if (!iface) continue;

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
      } else if (typeof s.CPU === 'number') {
        cpuVal = s.CPU;
      }

      const memUsage = s.MemUsage || 0;
      const memLimit = s.MemLimit || 0;
      let memPerc = 0;
      if (typeof s.MemPerc === 'string') {
        memPerc = parseFloat(s.MemPerc.replace('%', ''));
      } else if (typeof s.MemPerc === 'number') {
        memPerc = s.MemPerc;
      }


      results.push({
        id: id,
        name: nameRaw,
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
    logger.warn(`采集失败: ${error.message}`);
    return [];
  }
}