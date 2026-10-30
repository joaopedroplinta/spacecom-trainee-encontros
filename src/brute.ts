import { encontrar, porGrupo, type Encontro, type Pos } from './comum.ts';

// referência O(n²) por timestamp: gabarito para validar a versão com grid
function processar(g: Pos[], out: Encontro[]): void {
  for (let i = 0; i < g.length; i++)
    for (let j = i + 1; j < g.length; j++) {
      const e = encontrar(g[i], g[j]);
      if (e) out.push(e);
    }
}

export const brute = (arquivo: string): Encontro[] => porGrupo(arquivo, processar);
