import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const wranglerCli = join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const childEnv = { ...process.env };
let temporaryDirectory;

try {
  if (process.platform === 'win32' && !childEnv.ESBUILD_BINARY_PATH) {
    const sourceBinary = join(projectRoot, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe');
    if (existsSync(sourceBinary)) {
      temporaryDirectory = mkdtempSync(join(tmpdir(), '35-shortlink-esbuild-'));
      const temporaryBinary = join(temporaryDirectory, 'esbuild.exe');
      copyFileSync(sourceBinary, temporaryBinary);
      childEnv.ESBUILD_BINARY_PATH = temporaryBinary;
    }
  }

  const result = spawnSync(process.execPath, [wranglerCli, ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: childEnv,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
