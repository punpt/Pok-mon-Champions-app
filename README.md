# Champions Lab

Assistente de teambuilder para **Pokémon Champions**, focado no competitivo
oficial de double battles (VGC). Roda como PWA instalável no celular e no PC.

## O que ele faz de diferente

A maioria das ferramentas de teambuilder responde "quem é fraco contra o quê"
pela tabela de tipos. Isso não é suficiente em VGC. Este app parte dos **sets
reais do ladder** e do **cálculo de dano**, e responde as perguntas que decidem
partida:

- **Quem ameaça este Pokémon**, ranqueado por usage, com o motivo em texto.
  O motor resolve ordem de ação por **prioridade antes de Speed** — é o que
  faz Kingambit matar Basculegion com Sucker Punch mesmo sendo mais lento.
  Ameaças assim ganham marcação própria em vez de sumirem numa média.
- **Quem joga bem AO LADO dele.** Em vez de "resiste ao que ele sofre", o
  motor levanta as ameaças reais do âncora e procura quem **resolve justamente
  essas ameaças** sem abrir buraco novo. Clicando no Basculegion, ele acha
  respostas ao Kingambit (Sneasler e afins) e mostra por quê.
- **Quem joga bem CONTRA ele**, para montar plano de jogo.
- **Ameaças ao time inteiro**, com uma matriz e uma lista separada do que
  **ninguém no time responde** — os buracos que o Open Team Sheets entrega
  de graça para o adversário.
- **Otimizador de Stat Points.** Você declara o que precisa aguentar, matar e
  superar em Speed; ele devolve a menor distribuição que cumpre tudo. HP é
  resolvido em conjunto entre defesa física e especial, então você não paga
  duas vezes pelo mesmo ponto.
- **Calculadora de dano** integrada aos sets do time, nos dois sentidos.

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
npm test           # 25 testes dos motores
npm run build      # build de produção
```

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
├── data/       regras do formato, matemática de SP, camada de dex
├── api/        cliente HTTP, normalizador tolerante, cache
├── engine/     dano, ameaças, sinergia, otimizador, validação
├── store/      estado de meta e de times
├── components/ UI compartilhada
└── pages/      Time, Ameaças, Sinergia, Calc, SP, Dex, Ajustes
```

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
