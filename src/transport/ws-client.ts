// src/transport/ws-client.ts
import { CONFIG } from '../config';
import type { AuthPayload, ClientMessage, ServerMessage } from '../types';
import os from 'os';

type CommandHandler = (msg: ServerMessage) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private isConnected = false;
  private commandHandler: CommandHandler | null = null;

  constructor() {
    // 初始化时什么都不做，调用 connect() 才开始
  }

  /**
   * 注册收到服务端指令时的回调
   */
  public onCommand(handler: CommandHandler) {
    this.commandHandler = handler;
  }

  /**
   * 启动连接
   */
  public connect() {
    console.log(`🔌 Connecting to ${CONFIG.serverUrl}...`);

    try {
      this.ws = new WebSocket(CONFIG.serverUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);

    } catch (e) {
      console.error('Connection failed immediately:', e);
      this.scheduleReconnect();
    }
  }

  /**
   * 发送消息
   */
  public send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleOpen() {
    console.log('✅ WebSocket Connected!');
    this.isConnected = true;
    this.reconnectAttempts = 0;

    // 1. 立即发送鉴权包
    const authMsg: AuthPayload = {
      type: 'auth',
      token: CONFIG.token,
      agentId: CONFIG.agentName,
      version: '1.0.0', // 这里的版本号以后可以从 package.json 读
      os: os.type(),    // e.g. "Linux"
      arch: os.arch()   // e.g. "x64"
    };
    
    this.send(authMsg);
    console.log('🔑 Auth packet sent.');
  }

  private handleMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data.toString()) as ServerMessage;
      
      // 如果是指令，交给 Handler 处理
      if (msg.type === 'cmd' && this.commandHandler) {
        this.commandHandler(msg);
      } else {
        console.log('📩 Received unknown message:', msg);
      }
    } catch (e) {
      console.error('Failed to parse server message:', event.data);
    }
  }

  private handleClose(event: CloseEvent) {
    console.warn(`❌ Disconnected (Code: ${event.code}).`);
    this.isConnected = false;
    this.scheduleReconnect();
  }

  private handleError(event: Event) {
    // Bun 的 WebSocket error event 信息比较少，通常 close 会紧接着触发
    console.error('⚠️ WebSocket Error');
  }

  private scheduleReconnect() {
    // 指数退避：1s, 2s, 4s, 8s... 最大 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`⏳ Reconnecting in ${delay}ms...`);
    
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}

// 导出单例，方便全局使用
export const wsClient = new WsClient();