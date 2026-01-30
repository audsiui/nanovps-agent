// src/actions/net.ts
import { spawn } from 'bun';

interface ForwardOptions {
  protocol: 'tcp' | 'udp' | 'all';
  port: number;
  targetIp: string;
  targetPort?: number;
  ipType: 'ipv4' | 'ipv6' | 'all';
}

/**
 * 执行 iptables/ip6tables 命令 (安全版)
 */
async function runNetCommand(bin: string, args: string[]) {
  console.log(`🛡️ 执行防火墙规则: ${bin} ${args.join(' ')}`);
  
  const proc = spawn([bin, ...args], {
    stdout: 'ignore', // 不需要输出，除非报错
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    // 忽略一些常见的非致命错误（例如规则已存在）
    if (!stderr.includes('File exists') && !stderr.includes('Chain already exists')) {
      throw new Error(`Firewall Error: ${stderr.trim()}`);
    }
  }
}

/**
 * 设置单条转发规则
 */
async function applyRule(bin: 'iptables' | 'ip6tables', protocol: string, port: number, targetIp: string, targetPort: number) {
  const comment = `agent-fwd-${port}-${protocol}`;

  // 1. DNAT (端口映射): 把宿主机的流量转给局域网IP
  // 命令等同于: iptables -t nat -I PREROUTING -p tcp --dport 8080 -j DNAT --to-destination 10.88.0.2:80 -m comment ...
  await runNetCommand(bin, [
    '-t', 'nat',
    '-I', 'PREROUTING',
    '-p', protocol,
    '--dport', String(port),
    '-j', 'DNAT',
    '--to-destination', bin === 'ip6tables' ? `[${targetIp}]:${targetPort}` : `${targetIp}:${targetPort}`,
    '-m', 'comment', '--comment', comment
  ]);

  // 2. FORWARD (允许转发): 允许流量通过网桥进入容器
  // 命令等同于: iptables -I FORWARD -p tcp -d 10.88.0.2 --dport 80 -j ACCEPT -m comment ...
  await runNetCommand(bin, [
    '-I', 'FORWARD',
    '-p', protocol,
    '-d', targetIp,
    '--dport', String(targetPort),
    '-j', 'ACCEPT',
    '-m', 'comment', '--comment', comment
  ]);
}

/**
 * 入口函数：处理复杂的 all/all 逻辑
 */
export async function setupPortForwarding(opts: ForwardOptions) {
  const { port, targetIp, ipType } = opts;
  const targetPort = opts.targetPort || port; // 如果没传目标端口，默认和外网端口一致

  // 1. 确定协议列表
  const protocols = opts.protocol === 'all' ? ['tcp', 'udp'] : [opts.protocol];

  // 2. 确定 IP 工具列表 (ipv4 -> iptables, ipv6 -> ip6tables)
  const tools: ('iptables' | 'ip6tables')[] = [];
  if (ipType === 'ipv4' || ipType === 'all') tools.push('iptables');
  if (ipType === 'ipv6' || ipType === 'all') tools.push('ip6tables');

  // 3. 双重循环执行
  for (const tool of tools) {
    for (const proto of protocols) {
      try {
        await applyRule(tool, proto, port, targetIp, targetPort);
      } catch (err: any) {
        console.error(`⚠️ 设置规则失败 [${tool}/${proto}]: ${err.message}`);
        // 这里可以选择是否 throw，或者继续执行下一个协议
        throw err;
      }
    }
  }

  return true;
}

/**
 * 删除单条转发规则
 */
async function removeRule(bin: 'iptables' | 'ip6tables', protocol: string, port: number, targetIp: string, targetPort: number) {
  const comment = `agent-fwd-${port}-${protocol}`;

  // 1. 删除 DNAT 规则
  await runNetCommand(bin, [
    '-t', 'nat',
    '-D', 'PREROUTING',
    '-p', protocol,
    '--dport', String(port),
    '-j', 'DNAT',
    '--to-destination', bin === 'ip6tables' ? `[${targetIp}]:${targetPort}` : `${targetIp}:${targetPort}`,
    '-m', 'comment', '--comment', comment
  ]);

  // 2. 删除 FORWARD 规则
  await runNetCommand(bin, [
    '-D', 'FORWARD',
    '-p', protocol,
    '-d', targetIp,
    '--dport', String(targetPort),
    '-j', 'ACCEPT',
    '-m', 'comment', '--comment', comment
  ]);
}

/**
 * 入口函数：移除端口转发规则
 */
export async function removePortForwarding(opts: ForwardOptions) {
  const { port, targetIp, ipType } = opts;
  const targetPort = opts.targetPort || port;

  // 1. 确定协议列表
  const protocols = opts.protocol === 'all' ? ['tcp', 'udp'] : [opts.protocol];

  // 2. 确定 IP 工具列表
  const tools: ('iptables' | 'ip6tables')[] = [];
  if (ipType === 'ipv4' || ipType === 'all') tools.push('iptables');
  if (ipType === 'ipv6' || ipType === 'all') tools.push('ip6tables');

  // 3. 双重循环执行删除
  for (const tool of tools) {
    for (const proto of protocols) {
      try {
        await removeRule(tool, proto, port, targetIp, targetPort);
      } catch (err: any) {
        console.error(`⚠️ 删除规则失败 [${tool}/${proto}]: ${err.message}`);
        // 忽略不存在的规则错误
        if (!err.message?.includes('No chain/target/match by that name')) {
          throw err;
        }
      }
    }
  }

  return true;
}