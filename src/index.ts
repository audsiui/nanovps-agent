import { CONFIG } from './config';
import { wsClient } from './transport/ws-client';
import { collectHostMetrics } from './collectors/host';
import { collectContainerMetrics } from './collectors/podman';
import type { ReportPayload } from './types';
import { handleServerCommand } from './handlers/cmd-handler';
import { createLogger } from './utils/logger';

const logger = createLogger('Agent');

async function loop() {
  // 如果未连接，跳过本次上报
  if (!wsClient.isConnected) {
    return;
  }

  try {
    const [host, containers] = await Promise.all([
      collectHostMetrics().catch(e => {
        logger.error('主机采集器错误', e);
        return null;
      }),
      collectContainerMetrics().catch(e => {
        logger.error('容器采集器错误', e);
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

  } catch (e) {
    logger.error('主循环严重错误', e);
  }
}

async function main() {
  logger.info(`Agent 启动中... [ID: ${CONFIG.agentName}]`);

  wsClient.connect();

  wsClient.onCommand(async (cmd) => {
    const response = await handleServerCommand(cmd);

    wsClient.send(response);

    logger.info(`命令 ${cmd.id} 响应已发送: ${response.success ? '成功' : '失败'}`);
  });

  await loop();
  setInterval(loop, CONFIG.interval);
}

main();