import { existsSync, readFileSync } from 'node:fs';
import { brute } from './brute.ts';
import { grid } from './grid.ts';
import type { Encontro } from './comum.ts';

const chave = (e: Encontro) => `${e.timestamp}|${[...e.monitoradosEncontro].sort((a, b) => a - b)}|${e.tipo}`;
const comparar = (obtido: Encontro[], esperado: Encontro[]) => {
  const o = new Map(obtido.map((e) => [chave(e), e]));
  const e = new Map(esperado.map((x) => [chave(x), x]));
  const faltando = [...e.keys()].filter((k) => !o.has(k));
  const sobrando = [...o.keys()].filter((k) => !e.has(k));
  const dist = [...e].every(([k, x]) => !o.has(k) || Math.abs(o.get(k)!.distanciaMetros - x.distanciaMetros) < 1e-9);
  return { esperado: e.size, obtido: o.size, faltando: faltando.length, sobrando: sobrando.length, distanciasOk: dist };
};

// grid contra respostas oficiais de exemplo
for (const n of [1, 2]) {
  const esperado: Encontro[] = JSON.parse(readFileSync(`dados/respostas${n}.json`, 'utf8'));
  console.log(`grid x respostas${n}:`, comparar(grid(`dados/dataset${n}.txt`), esperado));
}
// grid contra brute force em todos os datasets presentes (até o limite de linhas)
for (let n = 1; n <= 7; n++) {
  const arq = `dados/dataset${n}.txt`;
  if (!existsSync(arq) || readFileSync(arq, 'utf8').length > 60_000_000) continue;
  const t0 = performance.now();
  const b = brute(arq);
  console.log(`grid x brute dataset${n}:`, comparar(grid(arq), b), `(brute+grid ${(performance.now() - t0).toFixed(0)} ms)`);
}
