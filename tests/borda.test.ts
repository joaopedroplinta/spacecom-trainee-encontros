import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brute } from '../src/brute.ts';
import { grid } from '../src/grid.ts';

const CAB = 'idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida\n';
const M = 6_371_000 * (Math.PI / 180); // metros por grau (de latitude, ou de longitude no equador)
const dir = mkdtempSync(join(tmpdir(), 'encontros-'));
let n = 0;

// linha: [id, faccao, ts, lat, lon, protegido?, restricoes?]
type L = [number, string, string, number, number, boolean?, string?];
function rodar(linhas: L[], alg: typeof grid = grid) {
  const f = join(dir, `t${n++}.txt`);
  writeFileSync(f, CAB + linhas.map((l) => `${l[0]};${l[1]};"${l[2]}";${l[3].toFixed(5)};${l[4].toFixed(5)};${l[5] ?? false};${l[6] ? `"${l[6]}"` : ''}`).join('\n'));
  return alg(f);
}
const T = '2024-01-01 00:00:00';

for (const [nome, alg] of [['grid', grid], ['brute', brute]] as const) {
  test(`${nome}: 18,9 m é encontro, 20,01 m não`, () => {
    // 5 casas decimais ≈ 1,1 m; usa latitude (1e-5° = 1,11195 m): 18 passos = 20,01 m, 17 = 18,90 m
    const base = [-25.5, -50.5] as const;
    const perto = rodar([[1, '', T, base[0], base[1]], [2, '', T, base[0] + 17e-5, base[1]]], alg);
    const longe = rodar([[1, '', T, base[0], base[1]], [2, '', T, base[0] + 18e-5, base[1]]], alg);
    assert.equal(perto.length, 1);
    assert.equal(longe.length, 0);
  });

  test(`${nome}: timestamps diferentes não se encontram`, () => {
    assert.equal(rodar([[1, '', T, 0, 0], [2, '', '2024-01-01 00:00:05', 0, 0]], alg).length, 0);
  });

  test(`${nome}: tipos e prioridade`, () => {
    const r = rodar([
      [1, 'A', T, 0, 0], [2, 'A', T, 0, 0],            // faccao
      [3, 'A', T, 1, 1], [4, 'B', T, 1, 1],            // generico (facções diferentes)
      [5, '', T, 2, 2], [6, '', T, 2, 2],              // generico (sem facção)
      [7, 'A', T, 3, 3], [8, '', T, 3, 3, true, '7'],  // protetiva (lista só na vítima)
      [9, 'A', T, 4, 4], [10, '', T, 4, 4, true, '99'], // vítima com outro agressor: generico
    ], alg);
    const tipo = (a: number, b: number) => r.find((e) => e.monitoradosEncontro.includes(a) && e.monitoradosEncontro.includes(b))?.tipo;
    assert.equal(tipo(1, 2), 'faccao');
    assert.equal(tipo(3, 4), 'generico');
    assert.equal(tipo(5, 6), 'generico');
    assert.equal(tipo(7, 8), 'protetiva');
    assert.equal(tipo(9, 10), 'generico');
    assert.equal(r.length, 5);
  });

  test(`${nome}: três pessoas juntas geram 3 pares, cada um uma vez`, () => {
    assert.equal(rodar([[1, '', T, 0, 0], [2, '', T, 0, 0], [3, '', T, 0, 0]], alg).length, 3);
  });

  test(`${nome}: mesmo ID repetido no timestamp não encontra a si mesmo`, () => {
    assert.equal(rodar([[1, '', T, 0, 0], [1, '', T, 0, 0]], alg).length, 0);
  });
}

// o grid não pode perder pares nas fronteiras de célula: compara com o brute force em nuvens densas
test('grid == brute em nuvens densas, em várias latitudes', () => {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const lat0 of [0, -25, 45, 70, -60]) {
    const linhas: L[] = [];
    for (let i = 1; i <= 400; i++) linhas.push([i, i % 3 ? 'F' : '', T, lat0 + rnd() * 6e-4, -50 + rnd() * 6e-4 / Math.cos((lat0 * Math.PI) / 180)]);
    const k = (e: { monitoradosEncontro: number[]; tipo: string }) => `${[...e.monitoradosEncontro].sort((a, b) => a - b)}|${e.tipo}`;
    const a = rodar(linhas, grid).map(k).sort();
    const b = rodar(linhas, brute).map(k).sort();
    assert.ok(b.length > 50, `poucos pares para testar (lat ${lat0}): ${b.length}`);
    assert.deepEqual(a, b, `divergência em lat ${lat0}`);
  }
});

for (const [nome, alg] of [['grid', grid], ['brute', brute]] as const) {
  test(`${nome}: linha repetida não duplica o par; IDs saem em ordem crescente`, () => {
    const r = rodar([[7, '', T, 0, 0], [3, '', T, 0, 0], [7, '', T, 0, 0]], alg);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].monitoradosEncontro, [3, 7]);
  });

  test(`${nome}: dataset fora de ordem de timestamp ainda acha os pares`, () => {
    const t2 = '2024-01-01 00:00:05';
    const r = rodar([[1, '', T, 0, 0], [2, '', t2, 5, 5], [3, '', T, 0, 0]], alg);
    assert.deepEqual(r.map((e) => e.monitoradosEncontro), [[1, 3]]);
  });
}
