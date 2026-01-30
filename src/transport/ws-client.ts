import { CONFIG } from '../config';
import type { AuthPayload, ClientMessage, ServerMessage } from '../types';
import os from 'os';

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let commandHandler: ((msg: ServerMessage) => void) | null = null;
let reconnectTimer: Timer | null = null;
let isConnected = false;
const messageQueue: ClientMessage[] = [];
const MAX_QUEUE_SIZE = 100;

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`⏳ Reconnecting in ${delay}ms... (attempt ${reconnectAttempts})`);

  if (reconnectTimer) clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

function flushMessageQueue() {
  while (messageQueue.length > 0 && ws?.readyState === WebSocket.OPEN) {
    const msg = messageQueue.shift();
    if (msg) {
      ws.send(JSON.stringify(msg));
    }
  }
}

/**
 * 处理WebSocket连接成功后的回调函数
 * 当WebSocket连接建立时，会执行此函数
 */
function handleOpen() {
  console.log('✅ WebSocket Connected!');
  reconnectAttempts = 0;
  isConnected = true;

  const authMsg: AuthPayload = {
    type: 'auth',
    token: CONFIG.token,
    agentId: CONFIG.agentName,
    version: '1.0.0',
    os: os.type(),
    arch: os.arch()
  };

  ws?.send(JSON.stringify(authMsg));
  console.log('🔑 Auth packet sent.');

  // 发送队列中的消息
  flushMessageQueue();
}

function handleMessage(event: MessageEvent) {
  try {
    const msg = JSON.parse(event.data.toString()) as ServerMessage;
    
    if (msg.type === 'cmd' && commandHandler) {
      commandHandler(msg);
    } else {
      console.log('📩 Received unknown message:', msg);
    }
  } catch (e) {
    console.error('Failed to parse server message:', event.data);
  }
}

function handleClose(event: CloseEvent) {
  console.warn(`❌ Disconnected (Code: ${event.code}).`);
  isConnected = false;
  scheduleReconnect();
}

function handleError(event: Event) {
  console.error('⚠️ WebSocket Error');
}


/**
 * 注册指令回调
 */
export function onCommand(handler: (msg: ServerMessage) => void) {
  commandHandler = handler;
}

/**
 * 发送消息
 * 如果未连接，消息会被暂存到队列，连接成功后自动发送
 */
export function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return;
  }

  // 未连接时加入队列
  if (messageQueue.length >= MAX_QUEUE_SIZE) {
    messageQueue.shift(); // 移除最旧的消息
  }
  messageQueue.push(msg);
}

/**
 * 启动连接
 */
export function connect() {
  console.log(`🔌 Connecting to ${CONFIG.serverUrl}...`);

  try {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    }

    ws = new WebSocket(CONFIG.serverUrl);
    
    ws.onopen = handleOpen;
    ws.onmessage = handleMessage;
    ws.onclose = handleClose;
    ws.onerror = handleError;

  } catch (e) {
    console.error('Connection failed immediately:', e);
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