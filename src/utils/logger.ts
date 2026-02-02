/**
 * 统一日志工具模块 - 基于 Winston
 * 格式: [时间] [级别] [模块] 消息
 *
 * 环境变量配置:
 *   LOG_MODE=console|file|both    输出模式 (默认: console)
 *   LOG_DIR=./logs                日志目录 (默认: ./logs)
 *   LOG_MAX_SIZE=5m               单个文件最大大小 (默认: 5m)
 *   LOG_MAX_FILES=5               保留文件数量 (默认: 5)
 */

import { createLogger as createWinstonLogger, format, transports, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { existsSync, mkdirSync } from 'fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 日志输出模式 */
const LOG_MODE = (process.env.LOG_MODE || 'console') as 'console' | 'file' | 'both';

/** 日志目录 */
const LOG_DIR = process.env.LOG_DIR || './logs';

/** 单个文件最大大小 */
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '5m';

/** 保留文件数量 */
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES || '5', 10);

// 日志级别颜色映射（用于终端显示）
const levelColors: Record<string, string> = {
  debug: '\x1b[90m', // 灰色
  info: '\x1b[32m',   // 绿色
  warn: '\x1b[33m',   // 黄色
  error: '\x1b[31m',  // 红色
};

const resetColor = '\x1b[0m';

/**
 * 安全地将对象序列化为 JSON 字符串
 * 处理循环引用、BigInt 等特殊情况
 */
function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, (_key, value) => {
      // 处理 BigInt
      if (typeof value === 'bigint') {
        return value.toString() + 'n';
      }
      // 处理函数
      if (typeof value === 'function') {
        return '[Function]';
      }
      // 处理 Symbol
      if (typeof value === 'symbol') {
        return value.toString();
      }
      // 处理 undefined
      if (value === undefined) {
        return '[undefined]';
      }
      // 处理 Error 对象
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    });
  } catch (err) {
    // 如果还是失败（比如循环引用），使用备用方案
    return '[Unable to stringify: ' + (err instanceof Error ? err.message : String(err)) + ']';
  }
}

/**
 * 确保日志目录存在
 */
function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * 格式化日志消息（纯文本，用于文件）
 */
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf((info) => {
    const { timestamp, level, message, module, ...rest } = info;
    const extraArgs = Object.keys(rest).length > 0
      ? ' ' + safeStringify(rest)
      : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${extraArgs}`;
  })
);

/**
 * 格式化日志消息（带颜色，用于控制台）
 */
const consoleFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf((info) => {
    const { timestamp, level, message, module, ...rest } = info;
    const color = levelColors[level] || '';
    const extraArgs = Object.keys(rest).length > 0
      ? ' ' + safeStringify(rest)
      : '';
    return `${color}[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${extraArgs}${resetColor}`;
  })
);

/**
 * 创建 Winston 日志实例
 */
function createWinstonInstance(moduleName: string): Logger {
  const transportList: (transports.ConsoleTransportInstance | DailyRotateFile)[] = [];

  // 控制台输出
  if (LOG_MODE === 'console' || LOG_MODE === 'both') {
    transportList.push(
      new transports.Console({
        format: consoleFormat,
      })
    );
  }

  // 文件输出（带轮转）
  if (LOG_MODE === 'file' || LOG_MODE === 'both') {
    ensureLogDir();
    transportList.push(
      new DailyRotateFile({
        dirname: LOG_DIR,
        filename: 'agent-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: LOG_MAX_SIZE,
        maxFiles: LOG_MAX_FILES,
        format: fileFormat,
      })
    );
  }

  return createWinstonLogger({
    level: 'debug',
    defaultMeta: { module: moduleName },
    transports: transportList,
  });
}

/**
 * 创建指定模块的日志记录器
 * 保持与原接口兼容
 */
export function createLogger(moduleName: string) {
  const winstonLogger = createWinstonInstance(moduleName);

  return {
    /**
     * 调试日志
     */
    debug: (message: string, ...args: unknown[]): void => {
      winstonLogger.debug(message, ...args);
    },

    /**
     * 信息日志
     */
    info: (message: string, ...args: unknown[]): void => {
      winstonLogger.info(message, ...args);
    },

    /**
     * 警告日志
     */
    warn: (message: string, ...args: unknown[]): void => {
      winstonLogger.warn(message, ...args);
    },

    /**
     * 错误日志
     */
    error: (message: string, ...args: unknown[]): void => {
      winstonLogger.error(message, ...args);
    },
  };
}

/**
 * 默认日志记录器（无模块名）
 */
export const logger = createLogger('Agent');
