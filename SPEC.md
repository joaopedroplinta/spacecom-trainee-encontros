# SPEC: Detecção de Encontros (Trainee Tech Spacecom 2027)

Estado: implementado e validado. O grid bate 100% com `respostas1.json` e `respostas2.json` e com o brute force nos datasets 1 a 7.

## Objetivo

Ler um dataset de posições GPS e gerar um JSON com os encontros entre monitorados. Score = encontros corretos − falsos positivos. Desempate: menor tempo médio de execução.

## Entrada

CSV com separador `;` e cabeçalho:

`idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida`

- `timestamp` e `idsRestricaoMedida` podem vir entre aspas; o parser remove as aspas.
- `faccaoMonitorado` é vazio para vítimas e para quem não tem facção.
- `medidaProtetiva = true` marca a vítima; `idsRestricaoMedida` lista os agressores dela (`"1,2,3"`).
- Posições são geradas a cada 5 s.

## Regras de negócio

1. Só se comparam posições com o **mesmo timestamp**.
2. Distância pela fórmula de Haversine, R = 6.371.000 m. Há encontro se `distância < 20` (estritamente menor).
3. Cada par de IDs gera **no máximo 1 registro por timestamp**; a ordem dos IDs não importa.
3a. Um ID repetido no mesmo timestamp não forma encontro consigo mesmo, e linhas repetidas não duplicam o par (decisão nossa; o email só exige unicidade por par e timestamp).
3b. `monitoradosEncontro` sai em ordem crescente de ID, como nos exemplos.
4. Tipo do registro, o mais específico que se aplica (confirmado nos exemplos):
   - `protetiva`: um dos dois tem `medidaProtetiva` e o ID do outro está em `idsRestricaoMedida` dele.
   - `faccao`: ambos têm facção não vazia e igual.
   - `generico`: qualquer outro par (inclui vítimas entre si).
5. Prioridade `protetiva` > `faccao` > `generico`. Protetiva e facção não coincidem na prática, pois a vítima não tem facção.

## Saída

Array JSON, um objeto por encontro:

```json
{
  "tipo": "faccao",
  "monitoradosEncontro": [40, 44],
  "timestamp": "2024-01-01 00:01:50",
  "posicoes": { "40": { "lat": -10.07996, "lon": -37.08384 }, "44": { "lat": -10.07987, "lon": -37.08389 } },
  "distanciaMetros": 11.406788673336607
}
```

`distanciaMetros` sai sem arredondar. A ordem dos encontros no array não é especificada; usamos timestamp e depois IDs, para a saída ser determinística.

## Algoritmo

Duas implementações, a segunda validada contra a primeira:

1. **Brute force** (`src/brute.ts`): para cada timestamp, testa todos os pares. O(k²) por grupo de k posições. Serve de gabarito.
2. **Grid espacial** (entrega): para cada timestamp, divide o mapa em células de pelo menos 20 m e só compara pontos da mesma célula e das 8 vizinhas.
   - Faixas de latitude com altura `20 / (R · π/180)` graus.
   - Largura de célula em longitude por faixa: `20 / (R · π/180 · cos(|lat| máxima da faixa))` graus, para a célula nunca ficar mais estreita que 20 m.
   - Para cada ponto, olha as faixas `f−1, f, f+1`; em cada uma calcula o índice de longitude com a largura daquela faixa e visita `i−1, i, i+1`.
   - Para não duplicar o par, cada ponto só olha candidatos com índice maior que o seu no grupo (`j > i`); a relação de vizinhança é simétrica, então todo par é visto uma vez.
   - Haversine continua sendo o critério final; o grid só reduz candidatos.

Por que é correto: dois pontos a menos de 20 m diferem em menos de uma célula nos dois eixos, então caem em células vizinhas. Por que é rápido: o custo passa a depender da densidade local e não do tamanho do grupo.

## Limitações conhecidas

- A leitura em blocos pressupõe arquivo ordenado por timestamp (caso dos datasets). Se um timestamp reaparecer, refaz o agrupamento em memória: correto, só mais pesado.
- Não trata cruzamento do antimeridiano (lon ±180) nem os polos. Os datasets 1 a 7 ficam entre lat −34 e 5,3 e lon −74 e −34,8.
- Latitude/longitude têm 5 casas decimais (~1,1 m); a precisão do dado limita a precisão do corte em 20 m.

## Critérios de aceite

- `node src/validar.ts` mostra `faltando=0 sobrando=0 distanciasOk=true` para os datasets 1 e 2.
- A versão com grid gera saída idêntica à do brute force em todos os datasets onde o brute force terminar em tempo razoável.
- Roda com `node` puro, sem dependências, sem build.
- Gera um JSON por dataset (`saida/resultadoN.json`) e imprime o tempo de execução.
- `npm test` passa: casos de borda (corte de 20 m, timestamps diferentes, tipos, mesmo ID) e grid == brute force em nuvens densas de 5 latitudes.
