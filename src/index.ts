import { CONFIG } from './config';
import { getPodmanSocket } from './utils/socket';
import os from 'os';

async function main() {
  console.log('--- 🐧 Linux Agent Init Test ---');
  console.log(`System: ${os.type()} ${os.release()}`);
  console.log(`Agent:  ${CONFIG.agentName}`);
  console.log(`Server: ${CONFIG.serverUrl}`);

  console.log('\n🔍 Probing Podman Socket...');
  const socket = await getPodmanSocket();

  if (socket) {
    console.log(`🎉 Ready to monitor containers via ${socket}`);
  } else {
    console.log(`⚠️ Podman not detected (or socket not active).`);
    console.log(`   Hint: systemctl --user enable --now podman.socket`);
  }
}

main();