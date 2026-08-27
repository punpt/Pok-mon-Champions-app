# Champions Lab

Assistente de teambuilder para **Pokémon Champions**, focado no competitivo
oficial de double battles (VGC). Roda como PWA instalável no celular e no PC.

## O que ele faz

Tres telas, sem rodeios:

**Time** — monta o time e responde tipagem na mesma tela. Cada Pokemon entra
com o set mais jogado do ladder (ability, item, nature, Stat Points e golpes)
e mostra no proprio card, sem precisar abrir nada, a tipagem, o que o machuca,
o que ele resiste e a que e imune. Abaixo do time, dois blocos de cobertura:

- **Ofensiva** — contra quais tipos o time bate super efetivo. Serve para achar
  o buraco antes da partida: um time sem nada de Aco ou Veneno nao tem resposta
  ofensiva para Fada, e isso decide matchup em doubles.
- **Defensiva** — quais tipos machucam o time, contando quantos sofrem contra
  quantos resistem. O que importa nao e ter fraqueza, e ter fraqueza empilhada
  sem ninguem que segure.

**Calculadora** — dano nos dois sentidos, com os quatro golpes de cada lado
editaveis a partir do movepool inteiro (nao so dos quatro mais jogados), tempo,
telas, Helping Hand, boosts e comparacao de Speed.

**Dex** — o ladder por usage, com tipagem e fraquezas, e um toque para levar
qualquer um para o time.

## Regras do formato que o app respeita

Verificadas em fontes oficiais e comunitárias em 27/08/2026:

| Regra | Valor |
| --- | --- |
| Formato | Doubles, traz 6 escolhe 4 |
| Team preview | 90s, **Open Team Sheets** |
| Timers | 20 min de partida / 7 min por jogador / 45s por turno |
| Clauses | **Item Clause** e **Species Clause** |
| Nível | 50 fixo |
| Stats | **Stat Points**: 66 no total, teto de 32 por stat, IVs sempre perfeitos |
| Mega | Legal, ativada pela Mega Stone no slot de item, **1 por partida** |
| Tera | **Ilegal** na Reg M-B |
| Banidos | Restricted, Paradox, Treasures of Ruin, Mythical |

O builder trava Item e Species Clause, esconde Terastalização enquanto ela for
ilegal e resolve a forma Mega a partir da pedra (incluindo as Megas novas de
Legends Z-A, como Floette-Mega e Baxcalibur-Mega).

### Matemática dos Stat Points

O Champions aposentou EVs e IVs. A fórmula usada aqui:

```
HP     = base + SP + 75
outros = floor((base + SP + 20) × nature)
```

Cada SP vale exatamente **+1 ponto** antes da nature. A fórmula é validada
contra o `@smogon/calc` em 1800 combinações de espécie × nature × stat ×
investimento, sem divergência (`npm test`).

## De onde vêm os dados

Duas fontes, com responsabilidades separadas:

- **Mecânica** (tipagem, base stats, movepools, abilities, itens, tabela de
  tipos) vem dos dados do Pokémon Showdown empacotados no app. Não muda por
  regulation e funciona offline.
- **Meta ao vivo** (usage, movesets do ladder, itens, spreads, teammates e o
  roster legal da regulation vigente) vem da API pública de battle data, buscada
  a cada abertura. O endereço é configurável em **Ajustes**.

A última resposta bem-sucedida fica em cache. Se a rede falhar, o app abre com
esse recorte e **marca na tela** que o dado é antigo e de quando ele é — nunca
apresenta cache como se fosse ao vivo.

Como a API pública não tem contrato versionado, a leitura é tolerante a
variações de nome de campo, e **Ajustes › Diagnóstico** mostra cada endpoint
tentado, o status e uma amostra da resposta. Se a API mudar, dá para ver
exatamente o que quebrou sem sair do app.

## Rodando

```bash
npm install
npm run dev        # desenvolvimento
npm test           # testes dos motores
npm run build      # build de produção
```

### Testando sem depender da API pública

O repositório traz um servidor que imita a API de battle data, para você poder
usar o app inteiro offline (e para exercitar o normalizador contra um payload em
formato realista: `snake_case`, usage em escala 0-100, spread como string).

> Os Pokémon e percentuais do mock são **inventados** — não são o roster de
> nenhuma regulation. Servem só para exercitar o app. Quem está legal vem
> sempre da API ao vivo.

```bash
npm run demo       # sobe o mock na 4321 e o app na 5173
```

Depois, em **Ajustes › Endereço da API**, aponte para `http://localhost:4321` e
recarregue. `npm run smoke` dirige o app com Playwright e salva screenshots de
todas as telas em `/tmp/shots`.

### Instalando no celular

O workflow em `.github/workflows/deploy.yml` publica no GitHub Pages a cada
push. Habilite Pages no repositório (Settings › Pages › Source: GitHub Actions),
abra a URL no celular e use "Adicionar à tela inicial". O app passa a abrir em
tela cheia, com ícone próprio, e funciona offline.

### Gerando um APK

O projeto já vem com `capacitor.config.ts` pronto:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build
npx cap add android
npx cap sync
npx cap open android
```

## Estrutura

```
src/
├── data/       regras do formato, matemática de SP, dex, itens legais
├── api/        cliente HTTP, normalizador tolerante, cache
├── engine/     dano, cobertura de tipos, sets presumidos, validação
├── store/      estado de meta e de times
├── components/ UI compartilhada
└── pages/      Time, Calculadora, Dex, Ajustes
```

### Legalidade: o que vem de onde

| O quê | Fonte |
| --- | --- |
| Quais Pokémon são legais | API ao vivo, cruzada com os grupos banidos da regulation |
| Movepool | Learnsets do Showdown, percorrendo **toda a cadeia evolutiva** e filtrando para o que é alcançável na geração 9 |
| Itens | Itens padrão da geração 9, mais a Mega Stone da própria espécie; sem Poké Balls, cristais Z ou itens presos a outro dono |
| Usage, spreads e movesets do ladder | API ao vivo |

O detalhe do movepool é sutil e custou um bug: os learnsets guardam só o que
cada estágio aprende por conta própria. Sucker Punch aparece em Pawniard, não em
Kingambit — quem não sobe a cadeia esconde metade do movepool de todo Pokémon
completamente evoluído. No sentido oposto, cada golpe registra em que gerações
pode ser obtido, e mostrar os de gerações antigas seria oferecer sets
impossíveis de montar.

## Limitações conhecidas

- O formato exato da API pública de battle data não pôde ser testado durante o
  desenvolvimento (o ambiente de build não tem acesso de rede a ela). O
  adaptador tenta uma lista de endpoints candidatos e aceita várias formas de
  payload; se nenhum encaixar, **Ajustes › Diagnóstico** mostra o que voltou e
  o endereço base é editável na própria tela.
- Quando a API ainda não devolveu o detalhe de um Pokémon, o app monta um set
  plausível a partir do movepool e marca o card como **"set estimado"**, em vez
  de esconder que aquilo é uma inferência.
- As regulations ficam cadastradas em `src/data/rules.ts`. Quando a M-B vencer
  (09/09/2026), o app avisa que as regras podem estar desatualizadas até a
  próxima ser adicionada.
- **Quem está legal na regulation vem da API, não de uma lista mantida à mão.**
  O app cruza o que a API devolve com os grupos banidos pela regulation e
  remove o que não deveria estar lá, avisando no Diagnóstico — se um Pokémon
  banido aparecer no índice, é sinal de que aquele endpoint não está recortado
  pela regulation vigente. Sem dados ao vivo, o seletor cai numa estimativa
  pelas regras e a tela marca **"legalidade não confirmada"**; nesse modo as
  abas de Ameaças e Sinergia se recusam a analisar, em vez de ranquear contra
  um meta que não existe.
