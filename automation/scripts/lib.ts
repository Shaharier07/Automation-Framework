/** Small helpers shared by the CLI scripts. */
import fs from 'fs';
import path from 'path';
import { spawnSync, type SpawnSyncOptions } from 'child_process';
import { paths } from '../support/config';

export const isWin = process.platform === 'win32';

export function bin(name: string): string {
  return path.join(paths.root, 'node_modules', '.bin', isWin ? `${name}.cmd` : name);
}

export function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): number {
  const r = spawnSync(cmd, args, { cwd: paths.root, stdio: 'inherit', shell: isWin, ...opts });
  if (r.error) console.error(`Failed to start ${cmd}: ${r.error.message}`);
  return r.status ?? 1;
}

export function capture(cmd: string, args: string[]): { ok: boolean; out: string; stdout: string } {
  const r = spawnSync(cmd, args, { cwd: paths.root, encoding: 'utf8', shell: isWin });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), stdout: (r.stdout ?? '').trim() };
}

/** Empty a directory but keep .gitkeep. */
export function cleanDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) {
    if (f !== '.gitkeep') fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  }
}

export function listFiles(dir: string, filter: (f: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full, filter);
    return filter(e.name) ? [full] : [];
  });
}

/** Parse "--key value" / "--flag" pairs; everything else is returned in `rest`. */
export function parseArgs(argv: string[], known: string[]) {
  const opts: Record<string, string | true> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const key = a.replace(/^--/, '');
    if (a.startsWith('--') && known.includes(key)) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        opts[key] = next;
        i++;
      } else opts[key] = true;
    } else rest.push(a);
  }
  return { opts, rest };
}

export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
