/**
 * 统一日志工具模块
 * 格式: [时间] [级别] [模块] 消息
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// 日志级别颜色映射（用于终端显示）
const levelColors: Record<LogLevel, string> = {
  DEBUG: '\x1b[90m', // 灰色
  INFO: '\x1b[32m',   // 绿色
  WARN: '\x1b[33m',   // 黄色
  ERROR: '\x1b[31m',  // 红色
};

const resetColor = '\x1b[0m';

/**
 * 获取当前格式化时间
 * 格式: YYYY-MM-DD HH:mm:ss
 */
function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化日志消息
 */
function formatLog(level: LogLevel, module: string, message: string): string {
  const timestamp = getTimestamp();
  return `[${timestamp}] [${level}] [${module}] ${message}`;
}

/**
 * 输出彩色日志到控制台
 */
function outputLog(level: LogLevel, module: string, message: string, ...args: unknown[]): void {
  const formatted = formatLog(level, module, message);
  const color = levelColors[level];

  if (args.length > 0) {
    console.log(`${color}${formatted}${resetColor}`, ...args);
  } else {
    console.log(`${color}${formatted}${resetColor}`);
  }
}

/**
 * 创建指定模块的日志记录器
 */
export function createLogger(moduleName: string) {
  return {
    /**
     * 调试日志
     */
    debug: (message: string, ...args: unknown[]): void => {
      outputLog('DEBUG', moduleName, message, ...args);
    },

    /**
     * 信息日志
     */
    info: (message: string, ...args: unknown[]): void => {
      outputLog('INFO', moduleName, message, ...args);
    },

    /**
     * 警告日志
     */
    warn: (message: string, ...args: unknown[]): void => {
      outputLog('WARN', moduleName, message, ...args);
    },

    /**
     * 错误日志
     */
    error: (message: string, ...args: unknown[]): void => {
      outputLog('ERROR', moduleName, message, ...args);
    },
  };
}

/**
 * 默认日志记录器（无模块名）
 */
export const logger = createLogger('Agent');
