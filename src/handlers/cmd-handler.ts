// src/handlers/cmd.ts
import type { ServerCommand, CommandResponsePayload } from '../types';
import * as sys from '../actions/sys';
import * as podman from '../actions/podman';

export async function handleServerCommand(cmd: ServerCommand): Promise<CommandResponsePayload> {
  console.log(`🤖 Processing command: [${cmd.action}] (ID: ${cmd.id})`);
  
  let success = false;
  let message = '';
  let data: any = null;

  try {
    switch (cmd.action) {
      // --- 系统类 ---
      case 'sys:exec':
        // payload: { command: "ls -la" }
        data = await sys.execCommand(cmd.payload.command, cmd.payload.timeout);
        message = 'Command executed';
        break;

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

      default:
        throw new Error(`Unknown action type: ${cmd.action}`);
    }

    success = true;

  } catch (e: any) {
    console.error(`❌ Command failed:`, e);
    success = false;
    message = e.message || 'Internal Agent Error';
  }

  // 构造回复包
  return {
    type: 'response',
    refId: cmd.id,
    success,
    message,
    data
  };
}