# Prompt de abertura — sessão nova em `glauberborges/wiki-kit`

> Cole o bloco abaixo como primeira mensagem, depois de ter criado o repositório e commitado o
> `FOUNDATION.md` na raiz.

---

Estou construindo `@glauberborges/wiki-kit`, uma CLI pública a partir de uma implementação de
referência **já construída e verificada**. Não é greenfield: o objetivo é **portar e
empacotar**, não redesenhar.

**Comece lendo o `FOUNDATION.md` na raiz deste repositório.** Ele traz o problema, os
fundamentos (OKF v0.2 + o padrão LLM Wiki do Karpathy), os invariantes que não podem virar
configuração, e — a parte que mais importa — **cinco modos de falha já encontrados na prática**,
cada um com sintoma, causa e a razão de o código ser como é. Reimplementar sem eles significa
reintroduzi-los.

**A implementação de referência está em `glauberborges/hive`, PR #71.** Anexe esse repositório
à sessão e porte o código de `wiki/scripts/`, `wiki/Makefile`, `wiki/WIKI.md`,
`.claude/skills/wiki-kit/`, `.claude/agents/wiki.md`, `.github/workflows/wiki.yml` e
`tests/wiki/`. Os 47 testes existentes codificam os modos de falha — porte-os, não os reescreva.

**Escopo da v1:** paridade com o kit atual (`init`, `lint`, `affected`, `ingest-prompt`, `llms`)
**mais** o hub cross-repo descrito na §8 do FOUNDATION.

**Já decidido, não relitigar:**
- nome `@glauberborges/wiki-kit`, distribuição por `npx`, `publishConfig.access: public`, bin
  curto `wiki-kit`
- a config controla regras do lint, vocabulário OKF e saída/artefatos — **estrutura e nomes de
  diretório ficam de fora de propósito** (`wiki/` e as cinco seções são convenção, não knob)
- os quatro invariantes da §4, em especial: o caminho de verificação roda **sem `npm install`**
  no repositório alvo, e o agente marca `generated:` mas nunca `verified:`

**Idioma — importante, porque a referência está em português.** O projeto inteiro é **em
inglês**: código, comentários, nomes de comandos e flags, mensagens da CLI, README, CHANGELOG,
descrição no npm, nomes das regras do lint, e todo o conteúdo do template (páginas de exemplo,
`AUTHORING.md`, `BOOTSTRAP.md`, `OKF.md`, prompt do subagente).

As **únicas** exceções são este prompt e o `FOUNDATION.md` — são registro de decisão, não
material de consumo.

Portar exige, então, uma **passada de tradução**. A §7 do FOUNDATION lista os pontos concretos;
os principais: as seções do template viram `getting-started/` `guides/` `architecture/`
`reference/` `contributing/`, a regra `workspace-absorvido` vira `workspace-absorbed`, e toda
saída de `lint`/`affected`/`ingest-prompt` vai para inglês. Nada de misturar.

**Em aberto, e eu preciso decidir com você:** as duas questões do hub na §8 — direção
(cada repo empurra vs. o hub puxa) e consumo (o agente busca sob demanda vs. cada repo
vendoriza o índice). Os repositórios estão em organizações diferentes (pessoal e empresa).

**Primeiro passo:** proponha a arquitetura do pacote e a superfície da CLI — estrutura de
diretórios, o que vira módulo público vs. interno, como o `init` descobre e escreve, e como os
templates são embarcados no pacote. **Não escreva código ainda.**

---

## Notas para você (não fazem parte do prompt)

- Se o Claude Code na sessão nova não conseguir anexar `glauberborges/hive`, peça explicitamente:
  *"anexe o repositório glauberborges/hive para eu portar o código de referência"*.
- O `FOUNDATION.md` pressupõe o PR #71. Se ele já tiver sido mergeado, troque a referência por
  `main` — o conteúdo é o mesmo.
- Vale reservar `@glauberborges/wiki-kit` no npm com um `0.0.1` vazio antes de começar. Além de
  garantir o nome, valida o fluxo de publicação com escopo (que é onde o
  `publishConfig.access` morde) enquanto ainda não há código a perder.
- O `FOUNDATION.md` em português num repositório público em inglês é uma escolha consciente: é
  registro de decisão, não documentação de uso. Se incomodar, mova para `docs/decisions/` em vez
  de traduzir — traduzi-lo custaria a nuance que o torna útil.
- Peça o **gate de idioma** (§9 do FOUNDATION) já no primeiro milestone. Um grep sobre o pacote
  publicável reprovando resíduo de português, com o `FOUNDATION.md` e este prompt na allowlist.
  Sem isso, a tradução passa agora e volta a vazar num `console.log` daqui a três edições.
