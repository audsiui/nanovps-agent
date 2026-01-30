import { CONFIG } from '../config';
import type { AuthPayload, ClientMessage, ServerMessage } from '../types';
import os from 'os';

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let commandHandler: ((msg: ServerMessage) => void) | null = null;
let reconnectTimer: Timer | null = null;


function scheduleReconnect() {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`⏳ Reconnecting in ${delay}ms...`);
  
  if (reconnectTimer) clearTimeout(reconnectTimer);
  
  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    connect();
  }, delay);
}

/**
 * 处理WebSocket连接成功后的回调函数
 * 当WebSocket连接建立时，会执行此函数
 */
function handleOpen() {
  console.log('✅ WebSocket Connected!');
  reconnectAttempts = 0;

  const authMsg: AuthPayload = {
    type: 'auth',
    token: CONFIG.token,
    agentId: CONFIG.agentName,
    version: '1.0.0',
    os: os.type(),
    arch: os.arch()
  };
  
  send(authMsg);
  console.log('🔑 Auth packet sent.');
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
 */
export function send(msg: ClientMessage) {
  if (!ws) {
    console.error('🚫 Send failed: WebSocket is null');
    return;
  }


  if (ws.readyState === WebSocket.OPEN) {
    const data = JSON.stringify(msg);
    ws.send(data);
  } else {
    console.warn(`⚠️ Send skipped. WS State is ${ws.readyState} (Not OPEN)`);
  }
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

export const wsClient = {
  connect,
  send,
  onCommand
};