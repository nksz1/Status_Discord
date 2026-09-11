import { spawn } from 'child_process';
import { platform } from 'os';

const npmCmd = platform() === 'win32' ? 'npm.cmd' : 'npm';

const child = spawn(npmCmd, ['start'], { stdio: 'inherit', shell: true });

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (err) => {
  console.error('Failed to start child process.', err);
  process.exit(1);
});
