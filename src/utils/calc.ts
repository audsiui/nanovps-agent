
const previousStates = new Map<string, { bytes: number; timestamp: number }>();
const MAX_AGE_MS = 5 * 60 * 1000; // 5分钟

/**
 * 清理过期的状态记录
 */
function cleanupOldStates(currentTimestamp: number) {
  for (const [key, value] of previousStates.entries()) {
    if (currentTimestamp - value.timestamp > MAX_AGE_MS) {
      previousStates.delete(key);
    }
  }
}

/**
 * 计算速率 (Bytes per second)
 * @param id 唯一标识 (例如 "eth0" 或 "container_id")
 * @param currentBytes 当前累计字节数
 * @param currentTimestamp 当前时间戳 (ms)
 */
export function calculateRate(id: string, currentBytes: number, currentTimestamp: number): number {
  // 每100次调用清理一次过期数据
  if (Math.random() < 0.01) {
    cleanupOldStates(currentTimestamp);
  }

  const prev = previousStates.get(id);

  previousStates.set(id, { bytes: currentBytes, timestamp: currentTimestamp });

  if (!prev) {
    return 0;
  }

  const timeDiff = (currentTimestamp - prev.timestamp) / 1000;
  const bytesDiff = currentBytes - prev.bytes;

  if (timeDiff <= 0 || bytesDiff < 0) {
    return 0;
  }

  return Math.floor(bytesDiff / timeDiff);
}