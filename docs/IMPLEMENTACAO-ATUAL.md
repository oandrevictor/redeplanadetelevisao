# Últimas implementações — audiência, transmissão e editor

> Escopo deste documento: alterações recebidas no último `git pull`, entre os commits `e099607` e `f4393d6`.

## Resumo da atualização

Esta atualização adicionou um novo sistema segmentado de audiência e integrou seus resultados ao fluxo de edição, transmissão, votação, eliminação e final da temporada.

O pacote alterou **34 arquivos**, com aproximadamente **9.376 linhas adicionadas** e **323 removidas**. Os principais commits incorporados foram:

- `a59ee8b` — criação da simulação de audiência por coortes;
- `1cc27d9` — integração do relatório de audiência ao fluxo posterior ao episódio;
- `279a2e1` — correção do escopo de materiais obrigatórios por episódio;
- `134bf7e` — contenção dos controles na timeline do editor;
- `d2136a5` — preservação canônica das transmissões e seus resultados de audiência.

## 1. Novo modelo segmentado de audiência

Foi criado um domínio específico em `game/audience/`, responsável por representar diferentes grupos de público e calcular como cada grupo reage ao episódio transmitido.

O público deixou de ser tratado apenas como um valor geral. Agora a simulação considera combinações de:

- faixa etária;
- gênero;
- região do país;
- urbanidade;
- composição do domicílio;
- perfil socioeconômico;
- acesso à mídia;
- plataforma de consumo;
- hábitos de visualização;
- interesses editoriais;
- valores como justiça, autenticidade e representação.

Também foram adicionados três modos para a engine de audiência:

| Modo | Comportamento |
|---|---|
| `legacy` | Mantém o cálculo anterior para compatibilidade. |
| `shadow` | Executa o modelo novo e registra resultados, mas não o utiliza como autoridade final da competição. |
| `clustered` | Usa a simulação por coortes como resultado oficial de audiência e votação. |

### Arquivos centrais

| Arquivo | Responsabilidade |
|---|---|
| `game/audience/catalog.ts` | Catálogo de coortes, interesses e características do público. |
| `game/audience/initial-state.ts` | Criação do estado inicial do mercado e dos grupos de audiência. |
| `game/audience/math.ts` | Funções matemáticas compartilhadas pela simulação. |
| `game/audience/signals.ts` | Conversão do conteúdo transmitido em sinais editoriais. |
| `game/audience/simulation.ts` | Execução da simulação do episódio. |
| `game/audience/forecast.ts` | Previsão de desempenho antes da consolidação do resultado. |
| `game/audience/selectors.ts` | Leituras derivadas para interface e regras. |
| `game/audience/fandom.ts` | Evolução do apoio e dos fandoms dos participantes. |
| `game/audience/votes.ts` | Fechamento e consumo dos votos da audiência. |
| `game/audience/validation.ts` | Validação das estruturas e resultados produzidos. |

## 2. Sinais produzidos pelos acontecimentos e cortes

Os acontecimentos agora carregam sinais capazes de influenciar grupos diferentes da audiência. Esses sinais são congelados no material transmitido para garantir que o resultado não seja recalculado com dados diferentes no futuro.

A simulação leva em consideração:

- categoria dos acontecimentos exibidos;
- participantes presentes;
- perspectiva escolhida no corte;
- tom editorial aplicado;
- duração e ordem dos segmentos;
- repetição de participantes;
- variedade de conteúdo;
- contexto competitivo do episódio;
- tipo do episódio: estreia, prova, votação, eliminação ou final;
- afinidade de cada coorte com os sinais apresentados.

Isso permite que o mesmo corte tenha desempenho diferente entre públicos distintos.

## 3. Previsão e simulação da transmissão

Foi implementado um fluxo em duas etapas:

1. **Previsão:** estima o desempenho do episódio a partir da montagem atual.
2. **Resultado consolidado:** simula a reação dos grupos quando a transmissão é efetivamente fechada.

O resultado inclui informações como:

- audiência linear esperada e realizada;
- alcance único;
- alcance digital;
- retenção;
- engajamento;
- propensão a voto;
- pico de audiência;
- evolução por checkpoints;
- fatores positivos e negativos;
- grupos mais afetados em cada trecho.

Os resultados são salvos no estado da partida. Uma transmissão já concluída permanece canônica e não muda retroativamente quando o catálogo, a montagem atual ou a lógica da engine são alterados.

## 4. Checkpoints e explicação dos resultados

A transmissão passou a registrar checkpoints ao longo do episódio. Cada checkpoint pode informar:

- audiência naquele ponto;
- retenção acumulada;
- fatores que elevaram ou reduziram o resultado;
- contribuição dos elementos editoriais;
- coortes mais impactadas pelo trecho.

O objetivo é tornar o sistema explicável: o jogador não vê apenas um número final, mas consegue identificar quais decisões de edição afetaram o desempenho.

## 5. Relatório pós-episódio

Foi criado o componente `app/audience-report.tsx`, com uma tela completa de **Leitura da Transmissão**.

O relatório contém:

### Resultado consolidado

- previsão do episódio;
- resultado efetivo;
- alcance único;
- alcance digital;
- indicadores gerais de desempenho.

### Curva real da transmissão

- audiência linear por checkpoint;
- identificação do pico;
- seleção de trechos para leitura detalhada;
- causas persistidas do trecho;
- coortes mais afetadas.

### Retenção por coorte

- tamanho e perfil de cada público;
- retenção;
- alcance;
- alcance digital;
- engajamento;
- propensão a votar.

### Recortes ponderados

Os resultados podem ser agrupados por:

- idade;
- gênero;
- região;
- domicílio;
- acesso e plataforma;
- afinidade de interesse.

### Fandom e causas editoriais

- movimentos positivos e negativos de fandom;
- participantes beneficiados ou prejudicados;
- impulsos positivos da edição;
- pressões negativas;
- explicações sobre a composição do painel.

Quando ainda não existe uma transmissão compatível, a interface apresenta um estado vazio específico em vez de tentar exibir dados inexistentes.

## 6. Integração ao fluxo do jogo

O relatório foi conectado ao fluxo posterior ao fechamento do corte.

Depois de transmitir, o jogo pode apresentar a leitura da audiência antes de avançar definitivamente para a próxima etapa. O estado da transmissão passou a reconhecer os estágios:

- edição;
- transmissão;
- resumo;
- votação da audiência.

Essa integração também atualizou:

- comandos de domínio;
- reducer principal;
- hook da engine;
- estado inicial;
- tipos persistidos;
- interface da página principal;
- inspetor interno do jogo.

## 7. Votação da audiência

A votação foi integrada ao novo modelo segmentado.

### Eliminação

- exige uma transmissão válida antes do fechamento do voto no modo segmentado;
- calcula o resultado entre os participantes indicados;
- persiste os percentuais;
- trava o participante selecionado;
- utiliza esse resultado como fonte oficial da eliminação;
- impede que a eliminação seja resolvida com um voto ausente ou incompatível.

### Final

- exige exatamente três finalistas;
- depende da transmissão do episódio final;
- fecha e persiste o voto da audiência;
- utiliza o resultado travado para definir o vencedor;
- impede que o resultado seja recalculado durante a resolução.

O relatório informa se o voto está travado ou já foi resolvido e exibe os percentuais persistidos.

Para partidas no modo legado, foi criado um seletor de compatibilidade em `game/selectors/legacy-audience-vote.ts`.

## 8. Evolução de fandom

Foi adicionado um modelo próprio para acompanhar a relação do público com cada participante.

Após cada transmissão, o sistema pode registrar:

- crescimento ou queda de apoio;
- reconhecimento;
- controvérsia;
- força do fandom;
- rejeição;
- variação por coorte;
- efeitos específicos provocados pelo episódio.

Essas mudanças ficam associadas à transmissão que as produziu e podem ser exibidas no relatório.

## 9. Ajustes no editor

A atualização também corrigiu pontos específicos da tela de Edição.

### Contenção da timeline

Os controles dos cartões da Linha do Programa foram ajustados para permanecer dentro da área de cada corte ou intervalo. Isso evita que botões e textos invadam cartões vizinhos ou escapem da timeline.

### Materiais obrigatórios por episódio

A seleção de material obrigatório passou a respeitar o episódio ao qual cada acontecimento pertence. Com isso:

- uma âncora de outra etapa não bloqueia o fechamento do corte atual;
- o painel de obrigatórios contabiliza apenas o material relevante;
- o banco de acontecimentos sinaliza corretamente os conteúdos exigidos naquele episódio.

### Leitura editorial

O editor passou a incorporar novas informações de análise relacionadas à audiência, preservando os alertas já existentes de duração, foco, variedade e ritmo.

## 10. Persistência e migrações

As estruturas de salvamento foram ampliadas para incluir:

- modo da engine de audiência;
- composição do mercado e das coortes;
- estado dos fandoms;
- histórico de transmissões;
- resultados consolidados;
- checkpoints;
- histórico de votos;
- voto pendente ou travado;
- dados necessários para compatibilidade com o modelo anterior.

Foram adicionadas migrações para que partidas anteriores possam receber os novos campos com valores iniciais válidos.

Também foram ampliadas as invariantes do jogo para detectar:

- transmissões inconsistentes;
- referências inválidas;
- votos sem episódio de origem;
- resultados com candidatos incorretos;
- estados pendentes incompatíveis com a fase da temporada;
- divergências entre o conteúdo canônico transmitido e o conteúdo usado pela audiência.

## 11. Simulador e ferramentas internas

O simulador de temporadas foi atualizado para exercitar o novo fluxo de audiência, incluindo transmissões, votos, eliminações e final.

O inspetor interno do jogo também recebeu painéis adicionais para observar:

- estado do mercado de audiência;
- resultados das transmissões;
- votação pendente;
- histórico de votos;
- informações usadas na depuração do novo modelo.

## 12. Testes adicionados e ampliados

Foi criado `tests/audience-engine.test.ts`, com aproximadamente 750 linhas dedicadas ao novo sistema.

Os testes cobrem, entre outros pontos:

- criação determinística do mercado de audiência;
- composição e validação das coortes;
- derivação de sinais editoriais;
- previsão e simulação dos episódios;
- checkpoints e fatores de resultado;
- atualização dos fandoms;
- persistência das transmissões;
- fechamento e consumo de votos;
- eliminação baseada no voto travado;
- votação final;
- funcionamento dos modos `legacy`, `shadow` e `clustered`;
- rejeição de transmissões alteradas ou inconsistentes;
- migração de saves anteriores.

Também foram ampliados:

- `tests/game-engine.test.ts`, cobrindo a integração com o fluxo principal;
- `tests/rendered-html.test.mjs`, cobrindo a presença das novas áreas na interface;
- o comando `test:domain`, que agora executa os testes do motor do jogo e da audiência.

## 13. Arquivos impactados

### Novos arquivos principais

- `app/audience-report.tsx`;
- `game/audience/catalog.ts`;
- `game/audience/fandom.ts`;
- `game/audience/forecast.ts`;
- `game/audience/index.ts`;
- `game/audience/initial-state.ts`;
- `game/audience/math.ts`;
- `game/audience/selectors.ts`;
- `game/audience/signals.ts`;
- `game/audience/simulation.ts`;
- `game/audience/validation.ts`;
- `game/audience/votes.ts`;
- `game/selectors/legacy-audience-vote.ts`;
- `tests/audience-engine.test.ts`;
- `public/og-audience.png`.

### Arquivos principais atualizados

- `app/page.tsx`;
- `app/globals.css`;
- `app/editor-analysis.ts`;
- `app/game-inspector.tsx`;
- `app/use-game-engine.ts`;
- `game/types.ts`;
- `game/state.ts`;
- `game/reducer.ts`;
- `game/commands.ts`;
- `game/invariants.ts`;
- `game/simulator.ts`;
- `game/persistence/migrations.ts`;
- `game/selectors/event-view.ts`;
- `tests/game-engine.test.ts`;
- `tests/rendered-html.test.mjs`.

## 14. Resultado prático

Depois desta atualização, a edição de um episódio não termina apenas em uma pontuação genérica. A montagem produz uma transmissão canônica, essa transmissão é avaliada por grupos distintos de público, o jogador recebe um relatório explicável e, nos episódios decisivos, o mesmo sistema alimenta a votação oficial da audiência.

O fluxo agora conecta diretamente:

```text
Acontecimentos gravados
        ↓
Montagem e leitura editorial
        ↓
Transmissão canônica
        ↓
Simulação por coortes
        ↓
Relatório pós-episódio
        ↓
Fandom e votação
        ↓
Eliminação ou resultado final
```
