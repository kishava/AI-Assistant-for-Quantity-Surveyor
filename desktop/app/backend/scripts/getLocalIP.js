import { networkInterfaces } from 'os';

const nets = networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`\n✅ LAN Access URL: http://${net.address}:3001\n`);
      console.log(`Share this with other devices on the same WiFi.\n`);
    }
  }
}
