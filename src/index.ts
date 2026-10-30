import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { grid } from './grid.ts';

// uso: node src/index.ts [dados/dataset1.txt ...]  (sem argumentos: todos os dados/datasetN.txt existentes)
const padrao = readdirSync('dados').filter((f) => /^dataset\d+\.txt$/.test(f)).sort().map((f) => `dados/${f}`);
const arquivos = process.argv.length > 2 ? process.argv.slice(2) : padrao;
mkdirSync('saida', { recursive: true });
for (const arq of arquivos) {
  const t0 = performance.now();
  const r = grid(arq);
  const ordem = (e: (typeof r)[number]) => `${e.timestamp}|${[...e.monitoradosEncontro].sort((a, b) => a - b)}`;
  r.sort((a, b) => (ordem(a) < ordem(b) ? -1 : 1));
  const ms = performance.now() - t0;
  const saida = `saida/resultado${basename(arq).match(/\d+/)![0]}.json`;
  writeFileSync(saida, JSON.stringify(r, null, 2));
  console.log(`${arq}: ${r.length} encontros em ${ms.toFixed(0)} ms -> ${saida}`);
}
