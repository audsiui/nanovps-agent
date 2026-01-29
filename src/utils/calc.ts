
const previousStates = new Map<string, { bytes: number; timestamp: number }>();

/**
 * 计算速率 (Bytes per second)
 * @param id 唯一标识 (例如 "eth0" 或 "container_id")
 * @param currentBytes 当前累计字节数
 * @param currentTimestamp 当前时间戳 (ms)
 */
export function calculateRate(id: string, currentBytes: number, currentTimestamp: number): number {
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