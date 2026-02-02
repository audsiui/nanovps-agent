// src/handlers/cmd.ts
import type { ServerCommand, CommandResponsePayload } from '../types';
import * as podman from '../actions/podman';
import * as net from '../actions/net';
import { createLogger } from '../utils/logger';

const logger = createLogger('Command');

export async function handleServerCommand(
  cmd: ServerCommand,
): Promise<CommandResponsePayload> {
  logger.info(`正在处理命令: [${cmd.action}] (ID: ${cmd.id})`);

  let success = false;
  let message = '';
  let data: any = null;

  try {
    switch (cmd.action) {
      // --- 容器类 ---
      case 'container:create':
        data = await podman.createContainer(cmd.payload);
        message = `Container ${cmd.payload.name} created and started`;
        break;

      // --- 容器类 ---
      case 'container:restart':
        await podman.restartContainer(cmd.payload.containerId);
        message = `Container ${cmd.payload.containerId} restarted`;
        break;

      case 'container:stop':
        await podman.stopContainer(cmd.payload.containerId);
        message = `Container ${cmd.payload.containerId} stopped`;
        break;

      case 'container:start':
        await podman.startContainer(cmd.payload.containerId);
        message = `Container ${cmd.payload.containerId} started`;
        break;
      case 'net:forward':
        await net.setupPortForwarding(cmd.payload);
        message = `Port forwarding set: :${cmd.payload.port} -> ${cmd.payload.targetIp}:${cmd.payload.targetPort || cmd.payload.port} (${cmd.payload.protocol})`;
        break;
      case 'net:unforward':
        await net.removePortForwarding(cmd.payload);
        message = `Port forwarding removed: :${cmd.payload.port} -> ${cmd.payload.targetIp}:${cmd.payload.targetPort || cmd.payload.port} (${cmd.payload.protocol})`;
        break;
      default:
        throw new Error(`Unknown action type: ${cmd.action}`);
    }

    success = true;
  } catch (e: any) {
    logger.error('命令执行失败', e);
    success = false;
    message = e.message || 'Internal Agent Error';
  }

  // 构造回复包
  return {
    type: 'response',
    refId: cmd.id,
    success,
    message,
    data,
  };
}
