import { ALTURA, encontrar, porGrupo, rad, type Encontro, type Pos } from './comum.ts';

const MAX_LAT = 89.9; // ponytail: acima disso a faixa vira uma célula larga, polos não tratados

const largura = new Map<number, number>();
// graus de longitude equivalentes a 20 m na latitude mais extrema da faixa (célula nunca < 20 m)
function larguraFaixa(f: number): number {
  let w = largura.get(f);
  if (w === undefined) {
    const lat = Math.min(MAX_LAT, Math.max(Math.abs(f), Math.abs(f + 1)) * ALTURA);
    w = ALTURA / Math.cos(lat * rad);
    largura.set(f, w);
  }
  return w;
}

const chave = (faixa: number, idx: number) => (faixa + 2_000_000) * 16_777_216 + (idx + 8_000_000);

function processar(g: Pos[], out: Encontro[]): void {
  const celulas = new Map<number, number[]>();
  const faixas = new Int32Array(g.length);
  for (let i = 0; i < g.length; i++) {
    const f = Math.floor(g[i].lat / ALTURA);
    faixas[i] = f;
    const k = chave(f, Math.floor(g[i].lon / larguraFaixa(f)));
    const c = celulas.get(k);
    c ? c.push(i) : celulas.set(k, [i]);
  }
  for (let i = 0; i < g.length; i++) {
    for (let f = faixas[i] - 1; f <= faixas[i] + 1; f++) {
      const idx = Math.floor(g[i].lon / larguraFaixa(f));
      for (let x = idx - 1; x <= idx + 1; x++) {
        const c = celulas.get(chave(f, x));
        if (!c) continue;
        for (const j of c) {
          if (j <= i) continue; // cada par uma vez
          const e = encontrar(g[i], g[j]);
          if (e) out.push(e);
        }
      }
    }
  }
}

export const grid = (arquivo: string): Encontro[] => porGrupo(arquivo, processar);
