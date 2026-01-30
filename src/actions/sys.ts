// src/actions/sys.ts
import { spawn } from 'bun';

/**
 * 执行 Shell 命令并获取结果
 * @param command 完整的命令字符串 (e.g. "iptables -L")
 * @param timeout 超时时间 (默认 10秒)
 */
export async function execCommand(command: string, timeout = 10000): Promise<string> {
  // 1. 启动子进程
  // 使用 sh -c 来执行复杂命令 (支持管道符 | 和 &&)
  const proc = spawn(['sh', '-c', command], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // 2. 超时控制
  const timeoutSignal = setTimeout(() => {
    proc.kill(); // 杀掉进程
    throw new Error(`Command timed out after ${timeout}ms`);
  }, timeout);

  // 3. 等待执行结束
  const exitCode = await proc.exited;
  clearTimeout(timeoutSignal);

  // 4. 读取输出
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  // 5. 判断结果
  if (exitCode !== 0) {
    // 即使报错，也把 stderr 返回去，方便服务端调试
    throw new Error(`Exit Code ${exitCode}: ${stderr || stdout}`);
  }

  return stdout.trim();
}

/**
 * 写文件 (用于下发配置)
 */
export async function writeFile(path: string, content: string) {
  await Bun.write(path, content);
  return `File wrote to ${path}`;
}