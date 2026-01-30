import { CONFIG } from '../config';
import type { ClientMessage, ServerMessage } from '../types';
import { getMachineKey } from '../utils/machine-key';

const machineKey = getMachineKey();
const MAX_RECONNECT_ATTEMPTS = 20;

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let commandHandler: ((msg: ServerMessage) => void) | null = null;
let reconnectTimer: Timer | null = null;
let isConnected = false;
let isConnecting = false;

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`❌ 已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，放弃连接。`);
    isConnecting = false;
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`⏳ ${delay}ms 后重连... (第 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} 次尝试)`);

  if (reconnectTimer) clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

function handleOpen() {
  console.log('✅ WebSocket 已连接！');
  reconnectAttempts = 0;
  isConnected = true;
  isConnecting = false;
}

function handleMessage(event: MessageEvent) {
  try {
    const msg = JSON.parse(event.data.toString()) as ServerMessage;

    if (msg.type === 'cmd' && commandHandler) {
      commandHandler(msg);
    } else {
      console.log('📩 收到未知消息:', msg);
    }
  } catch (e) {
    console.error('解析服务器消息失败:', event.data);
  }
}

function handleClose(event: CloseEvent) {
  console.warn(`❌ 连接断开 (代码: ${event.code})`);
  isConnected = false;
  scheduleReconnect();
}

function handleError(event: Event) {
  console.error('⚠️ WebSocket 错误');
}

/**
 * 注册指令回调
 */
export function onCommand(handler: (msg: ServerMessage) => void) {
  commandHandler = handler;
}

/**
 * 发送消息
 * 必须确保连接成功后再调用，否则抛出错误
 */
export function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return;
  }
  throw new Error('WebSocket is not connected');
}

/**
 * 启动连接
 */
export function connect() {
  if (isConnected || isConnecting) return;

  console.log(`🔌 正在连接到 ${CONFIG.serverUrl}...`);
  isConnecting = true;

  try {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    }

    // 构建带认证参数的 URL
    const wsUrl = new URL(CONFIG.serverUrl);
    wsUrl.searchParams.set('key', machineKey);

    ws = new WebSocket(wsUrl.toString());

    ws.onopen = handleOpen;
    ws.onmessage = handleMessage;
    ws.onclose = handleClose;
    ws.onerror = handleError;

  } catch (e) {
    console.error('连接立即失败:', e);
    isConnecting = false;
    scheduleReconnect();
  }
}

/**
 * 等待连接建立
 * @param timeout 超时时间(ms)
 * @returns 是否成功连接
 */
export function waitForConnection(timeout = 10000): Promise<boolean> {
  if (isConnected && ws?.readyState === WebSocket.OPEN) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (isConnected && ws?.readyState === WebSocket.OPEN) {
        clearInterval(checkInterval);
        clearTimeout(timeoutTimer);
        resolve(true);
      }
    }, 100);

    const timeoutTimer = setTimeout(() => {
      clearInterval(checkInterval);
      resolve(false);
    }, timeout);
  });
}

export const wsClient = {
  connect,
  send,
  onCommand,
  waitForConnection,
  get isConnected() { return isConnected; }
};
