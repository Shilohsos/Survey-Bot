const { spawn } = require('child_process');
const fs = require('fs');
const log = fs.createWriteStream('/tmp/bot_output.log', { flags: 'a' });

log.write(`=== Bot started at ${new Date().toISOString()} ===\n`);

const bot = spawn('npx', ['tsx', 'bot.ts'], {
  cwd: '/root/topsurveys-bot',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '0', NODE_OPTIONS: '' }
});

bot.stdout.on('data', (d) => log.write(d));
bot.stderr.on('data', (d) => log.write(d));

bot.on('exit', (code) => {
  log.write(`=== Bot exited with code ${code} at ${new Date().toISOString()} ===\n`);
  log.end();
  // Don't exit - the parent process should handle this
});

// Don't exit when parent shell exits
process.on('SIGINT', () => {});
process.on('SIGTERM', () => {});