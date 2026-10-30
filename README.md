# Detecção de Encontros — Trainee Tech Spacecom 2027

Lê posições GPS de monitorados (tornozeleiras) e vítimas (rastreadores) e detecta encontros a menos de 20 m, classificados como `generico`, `faccao` ou `protetiva`.

## Como executar

Requer Node 22.18 ou mais novo (roda TypeScript direto, sem build e sem dependências; desenvolvido e testado no Node 26).

```bash
node src/index.ts                                         # processa todos os dados/datasetN.txt (ou passe os arquivos)
node src/index.ts dados/dataset1.txt                      # gera saida/resultadoN.json e mostra o tempo
node src/validar.ts                                       # confere com respostas1/2.json e com o brute force
node --test tests/                                        # testes de borda
```

Os datasets ficam em `dados/` (`datasetN.txt`, `respostasN.json`). `npm install` só é necessário para o editor reconhecer os tipos (`@types/node`); a execução não depende dele.

## Lógica

1. **Leitura.** O CSV (`;`) é lido em blocos (sem carregar o arquivo inteiro na memória) e entregue em grupos por `timestamp`. Só posições com timestamp idêntico são comparadas, então cada grupo é pequeno e independente. Os datasets vêm ordenados por timestamp; se um timestamp reaparecer, descarta o parcial e refaz o agrupamento inteiro em memória (correto, só mais pesado). A lista `idsRestricaoMedida` fica como texto e só é consultada quando já há um encontro.
2. **Candidatos com grid espacial.** Dentro de cada grupo, o mapa é dividido em células de pelo menos 20 m e cada ponto só é comparado com os da sua célula e das 8 vizinhas.
   - Faixas de latitude com altura de 20 m (`20 / (R·π/180)` graus).
   - A largura em longitude muda com a latitude (`1 / cos(lat)`); ela é calculada pela latitude mais extrema da faixa, para a célula nunca ficar mais estreita que 20 m.
   - Dois pontos a menos de 20 m caem, por construção, em células vizinhas, então nenhum encontro é perdido.
3. **Distância exata.** Antes da trigonometria, descarta o par se a diferença de latitude já é ≥ 20 m (a distância nunca é menor que isso). Para o restante, Haversine com R = 6.371.000 m. Há encontro se a distância for `< 20`.
4. **Tipo.** Um registro por par e timestamp, com o tipo mais específico:
   - `protetiva`: um dos dois tem medida protetiva e o ID do outro está em `idsRestricaoMedida` dele;
   - `faccao`: mesma facção, não vazia;
   - `generico`: qualquer outro par.
5. **Unicidade.** Cada ponto só olha candidatos com índice maior que o seu no grupo, então cada par aparece uma vez. Um mesmo ID repetido no timestamp não encontra a si mesmo, e linhas repetidas não duplicam o par (a saída é deduplicada por timestamp e par). `monitoradosEncontro` sai em ordem crescente, como nos exemplos.

A regra "um registro por par, tipo mais específico" não está no enunciado; foi deduzida de `respostas1.json` (os monitorados 7 e 8, da mesma facção, aparecem só como `faccao`, não como `generico` também).

## Por que esta abordagem

- **Corretude:** o grid só reduz os candidatos; quem decide é o Haversine. Existe também um brute force O(k²) por timestamp (`src/brute.ts`) usado como gabarito: o grid dá resultado idêntico a ele nos datasets 1 a 7 e em nuvens aleatórias densas, e idêntico às respostas oficiais dos datasets 1 e 2.
- **Desempenho:** o brute force compara todos os pares de cada timestamp; o grid compara só os vizinhos, então o custo cresce com a densidade local e não com o quadrado do número de pessoas. Nos datasets recebidos os grupos têm no máximo 80 posições e a leitura e conversão do texto dominam o tempo (cerca de 60% no dataset 5); a vantagem do grid cresce quando muitos monitorados compartilham o mesmo timestamp.
- **Simplicidade:** nenhuma dependência de execução, um arquivo por responsabilidade (`comum.ts` regras, `grid.ts` algoritmo, `index.ts` CLI).

## Limitações

- O grid não trata o antimeridiano (lon ±180) nem os polos (lat acima de 89,9). Os datasets 1 a 7 ficam entre lat −34 e 5,3 e lon −74 e −34,8.
- Latitude e longitude têm 5 casas decimais (~1,1 m), o que limita a precisão do corte de 20 m.

## Resultados dos datasets de teste

| dataset | encontros | tempo (grid) |
|---|---|---|
| 1 | 4 | 16 ms |
| 2 | 6 | 43 ms |
| 3 | 10 | 141 ms |
| 4 | 15 | 587 ms |
| 5 | 21 | 1.435 ms |
| 6 | 27 | 12.372 ms |
| 7 | 35 | 18.622 ms |

Saídas em `saida/`. Tempos medidos num notebook, Node 26. Os datasets 6 e 7 (8 e 12 milhões de linhas) rodam com pico de ~930 MB de memória graças à leitura em blocos.
