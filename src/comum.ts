import { closeSync, openSync, readSync } from 'node:fs';

export type Pos = {
  id: number;
  faccao: string;
  ts: string;
  lat: number;
  lon: number;
  protegido: boolean;
  restricoes: string; // "1,2,3" como veio; só é consultado quando há encontro
};

export type Encontro = {
  tipo: 'generico' | 'faccao' | 'protetiva';
  monitoradosEncontro: [number, number];
  timestamp: string;
  posicoes: Record<string, { lat: number; lon: number }>;
  distanciaMetros: number;
};

const R = 6_371_000;
export const rad = Math.PI / 180;
export const ALTURA = 20 / (R * rad); // graus de latitude equivalentes a 20 m

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const sem = (s: string) => (s.charCodeAt(0) === 34 ? s.slice(1, -1) : s);

function parsear(linha: string): Pos {
  const [id, faccao, ts, lat, lon, prot, restr = ''] = linha.split(';');
  return { id: +id, faccao, ts: sem(ts), lat: +lat, lon: +lon, protegido: prot === 'true', restricoes: sem(restr) };
}

// lê o arquivo em blocos, sem carregá-lo inteiro na memória
function* posicoes(arquivo: string): Generator<Pos> {
  const fd = openSync(arquivo, 'r');
  const buf = Buffer.allocUnsafe(1 << 24);
  const dec = new TextDecoder();
  let resto = '';
  try {
    for (let fim = false; !fim; ) {
      const n = readSync(fd, buf, 0, buf.length, null);
      fim = n === 0;
      const linhas = (resto + (fim ? dec.decode() : dec.decode(buf.subarray(0, n), { stream: true }))).split('\n');
      resto = fim ? '' : linhas.pop()!;
      for (const l of linhas) {
        const t = l.trim();
        if (t && !t.startsWith('idMonitorado')) yield parsear(t);
      }
    }
  } finally {
    closeSync(fd);
  }
}

class ForaDeOrdem extends Error {}

// um grupo por timestamp (só posições com timestamp idêntico se comparam), em streaming
function* grupos(arquivo: string): Generator<Pos[]> {
  const vistos = new Set<string>();
  let atual: Pos[] = [];
  for (const p of posicoes(arquivo)) {
    if (atual.length && atual[0].ts !== p.ts) {
      yield atual;
      atual = [];
    }
    if (!atual.length) {
      if (vistos.has(p.ts)) throw new ForaDeOrdem();
      vistos.add(p.ts);
    }
    atual.push(p);
  }
  if (atual.length) yield atual;
}

// aplica `processar` a cada grupo. Arquivo ordenado por timestamp (caso normal): streaming.
// Se um timestamp reaparecer, descarta o parcial e refaz agrupando tudo em memória.
export function porGrupo(arquivo: string, processar: (g: Pos[], out: Encontro[]) => void): Encontro[] {
  let out: Encontro[] = [];
  try {
    for (const g of grupos(arquivo)) processar(g, out);
  } catch (e) {
    if (!(e instanceof ForaDeOrdem)) throw e;
    out = [];
    const mapa = new Map<string, Pos[]>();
    for (const p of posicoes(arquivo)) mapa.get(p.ts)?.push(p) ?? mapa.set(p.ts, [p]);
    for (const g of mapa.values()) processar(g, out);
  }
  return unicos(out);
}

// um registro por par/timestamp, tipo mais específico: protetiva > faccao > generico
export function classificar(a: Pos, b: Pos, d: number): Encontro {
  const lista = (p: Pos, id: number) => p.protegido && `,${p.restricoes},`.includes(`,${id},`);
  const protetiva = lista(a, b.id) || lista(b, a.id);
  const tipo = protetiva ? 'protetiva' : a.faccao && a.faccao === b.faccao ? 'faccao' : 'generico';
  return {
    tipo,
    monitoradosEncontro: a.id < b.id ? [a.id, b.id] : [b.id, a.id],
    timestamp: a.ts,
    posicoes: { [a.id]: { lat: a.lat, lon: a.lon }, [b.id]: { lat: b.lat, lon: b.lon } },
    distanciaMetros: d,
  };
}

// encontro entre dois monitorados no mesmo timestamp, ou null; mesmo ID repetido não é encontro
export function encontrar(a: Pos, b: Pos): Encontro | null {
  if (a.id === b.id || Math.abs(a.lat - b.lat) >= ALTURA) return null; // distância ≥ diferença de latitude
  const d = haversine(a.lat, a.lon, b.lat, b.lon);
  return d < 20 ? classificar(a, b, d) : null;
}

// garante 1 registro por par e timestamp mesmo com linhas repetidas no dataset
export function unicos(es: Encontro[]): Encontro[] {
  const vistos = new Set<string>();
  return es.filter((e) => {
    const k = `${e.timestamp}|${e.monitoradosEncontro}`;
    return !vistos.has(k) && vistos.add(k);
  });
}
