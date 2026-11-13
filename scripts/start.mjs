// `npm start`: sobe a ponte do AVA e o servidor de desenvolvimento do Angular juntos.
import { spawn } from 'node:child_process';

const bridge = spawn(process.execPath, ['scripts/dev-api.cjs'], { stdio: 'inherit' });
const ng = spawn('npx', ['ng', 'serve', ...process.argv.slice(2)], { stdio: 'inherit', shell: true });

const stop = () => {
  bridge.kill();
  ng.kill();
};
ng.on('exit', (code) => {
  bridge.kill();
  process.exit(code ?? 0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
