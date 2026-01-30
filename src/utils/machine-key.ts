import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const KEY_DIR = join(homedir(), '.nanovps');
const KEY_FILE = join(KEY_DIR, 'agent.key');

/**
 * 生成随机机器指纹 key
 */
function generateKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 确保 key 文件目录存在
 */
function ensureKeyDir(): void {
  if (!existsSync(KEY_DIR)) {
    mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * 读取或生成机器指纹 key
 * 首次调用会生成并持久化，后续调用会读取已保存的 key
 */
export function getMachineKey(): string {
  try {
    // 如果 key 文件已存在，直接读取
    if (existsSync(KEY_FILE)) {
      const key = readFileSync(KEY_FILE, 'utf-8').trim();
      if (key && key.length === 64) {
        return key;
      }
    }

    // 生成新 key 并保存
    ensureKeyDir();
    const newKey = generateKey();
    writeFileSync(KEY_FILE, newKey, { mode: 0o600 });

    console.log(`🔐 机器密钥已生成: ${KEY_FILE}`);
    return newKey;
  } catch (error: any) {
    console.error('获取机器密钥失败:', error.message);
    // 回退：返回临时 key（不持久化，仅本次运行有效）
    return generateKey();
  }
}

/**
 * 重置机器指纹 key（用于重新注册场景）
 */
export function resetMachineKey(): string {
  try {
    ensureKeyDir();
    const newKey = generateKey();
    writeFileSync(KEY_FILE, newKey, { mode: 0o600 });

    console.log(`🔐 机器密钥已重置: ${KEY_FILE}`);
    return newKey;
  } catch (error: any) {
    console.error('重置机器密钥失败:', error.message);
    throw error;
  }
}
