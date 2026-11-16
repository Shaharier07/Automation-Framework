/** Parses feature files into scenarios with their effective tags (feature + scenario + Examples). */
import fs from 'fs';
import path from 'path';
import { paths, type ExecutionType } from '../support/config';
import { listFiles } from '../scripts/lib';

export interface ParsedScenario {
  type: ExecutionType;
  file: string; // relative to project root
  line: number;
  name: string;
  feature: string;
  tags: string[];
}

export function parseFeatures(types: ExecutionType[] = ['web', 'mobile', 'api']): ParsedScenario[] {
  const out: ParsedScenario[] = [];
  for (const type of types) {
    for (const file of listFiles(path.join(paths.root, 'features', type), (f) => f.endsWith('.feature'))) {
      const rel = path.relative(paths.root, file);
      let pending: string[] = [];
      let featureTags: string[] = [];
      let feature = '';
      let current: ParsedScenario | null = null;
      const flush = () => {
        if (current) out.push(current);
        current = null;
      };
      fs.readFileSync(file, 'utf8').split('\n').forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        if (line.startsWith('@')) {
          pending.push(...line.split(/\s+/).filter((t) => t.startsWith('@')));
          return;
        }
        if (/^Feature:/.test(line)) {
          featureTags = pending;
          feature = line.replace(/^Feature:\s*/, '');
        } else if (/^(Scenario|Scenario Outline|Scenario Template|Example):/.test(line)) {
          flush();
          current = { type, file: rel, line: i + 1, name: line.replace(/^[^:]+:\s*/, ''), feature, tags: [...featureTags, ...pending] };
        } else if (/^(Examples|Scenarios):/.test(line) && current) {
          current.tags.push(...pending);
        }
        pending = [];
      });
      flush();
    }
  }
  return out;
}
