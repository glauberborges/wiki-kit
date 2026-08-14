# @glauberborges/wiki-kit — documento de fundação

> Este arquivo é o ponto de partida do repositório. Ele não descreve o que *será construído* em
> abstrato: descreve o que **já foi construído e verificado** dentro do repositório Hive, as
> decisões que sustentam esse desenho e — o mais importante — **os modos de falha que já
> custaram tempo para achar**. Quem reimplementar isso sem ler a §5 vai reintroduzir os cinco.
>
> **Implementação de referência:** `glauberborges/hive`, PR #71. Anexe esse repositório e
> **porte** o código de lá; não reescreva do zero. Arquivos:
>
> | Onde | O quê |
> | --- | --- |
> | `wiki/scripts/lib/frontmatter.mjs` | parser de front-matter (stdlib, ~150 linhas) |
> | `wiki/scripts/lib/pages.mjs` | carga de páginas, ordem da sidebar, globs, `map` |
> | `wiki/scripts/wiki-lint.mjs` | as 10 regras + `--affected` + `--prompt` + detecção de base |
> | `wiki/scripts/wiki-llms.mjs` | `llms.txt`, `llms-full.txt`, `map.json`, bundle OKF |
> | `wiki/Makefile` | a interface neutra de linguagem que a CLI substitui |
> | `wiki/WIKI.md` | o schema de autoria (vira `references/AUTHORING.md`) |
> | `.claude/skills/wiki-kit/` | skill, template parametrizado, `BOOTSTRAP.md`, `OKF.md` |
> | `.claude/agents/wiki.md` | o subagente de ingest (um arquivo, dois consumidores) |
> | `.github/workflows/wiki.yml` · `…/template/jenkins/Jenkinsfile.wiki` | CI |
> | `tests/wiki/*.test.ts` | 47 testes — **porte, não reescreva** |

## 1. O problema

Documentação de repositório apodrece porque nada verifica se ela ainda descreve o código. E
agentes de IA não têm por onde entrar: ou leem tudo (caro — no Hive o `AGENTS.md` chegou a
108 KB) ou grepam às cegas.

As duas coisas se resolvem juntas com **um campo no front-matter**: cada página declara quais
arquivos de código ela documenta.

```yaml
---
title: "Workflow: tasks e status"
description: "Tasks, dependências, locks e fila de review."
type: Architecture
sources:
  - resource: src/workflow/*.ts
generated: { by: human:glauber, at: 2026-07-29 }
---
```

Disso saem, deterministicamente e **sem LLM no caminho crítico**:

- **staleness** — a fonte foi commitada depois da página?
- **affected** — dado um diff, quais páginas atualizar e **quais arquivos nenhuma página cobre**
  (= funcionalidade nova sem doc)
- **map.json** — índice reverso arquivo → página: "antes de editar isto, o que eu leio?"
- **gate de CI** — o PR não mergeia com a doc defasada

## 2. Uma fonte, três consumidores

`wiki/docs/**.md` é a única coisa que se escreve.

| Consumidor | Artefato |
| --- | --- |
| Humano | site Docusaurus (docs-only, busca local offline, mermaid) |
| Agente externo / RAG | `llms.txt` + `llms-full.txt` + bundle OKF |
| Agente local no repo | `llms.txt` + `map.json` lidos do disco |

**Dimensionamento, que é onde muita gente erra:** no Hive, 22 páginas dão `llms.txt` de 3,8 KB
e `llms-full.txt` de 306 KB. O **índice** é o que entra em prompt de agente; o full é para
consumo externo (colar numa conversa, indexar em RAG). Tratar os dois como intercambiáveis é o
erro clássico de quem monta `llms.txt`.

## 3. Fundamentos que o desenho adota

**[OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)**
(Google Cloud) é o vocabulário do front-matter. `type` é o único campo obrigatório;
`sources[].resource` aceita "scope descriptor", então um glob de código cabe. Dele vêm também
`status`, `stale_after` e o par `generated`/`verified`.

Descoberta que simplifica o gerador: **o `index.md` do OKF e o `llms.txt` têm o mesmo formato**
(`* [Título](url) - descrição` agrupado por seção). Não são padrões concorrentes — um gerador,
dois nomes de saída.

**[LLM Wiki (Karpathy)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)** dá
o ciclo: ingest / query / lint. Num repositório de código as três camadas dele mapeiam para
código+git (raw sources, imutável), `wiki/docs/**` (a wiki) e `WIKI.md` (o schema). O `log.md`
que ele e o OKF pedem **é gerado do `git log`** — num repositório git o histórico já existe, e
mantê-lo à mão seria duplicação que desatualiza.

**Conformance do OKF é permissiva, nosso lint não é.** A spec diz que um consumidor "MUST NOT
reject a bundle" por link quebrado ou campo faltando. Não há conflito: o OKF rege quem
**consome** bundle de terceiro; o lint rege o que **nós publicamos**. O bundle emitido é
conformante; o CI apenas exige mais que o mínimo.

## 4. Invariantes — não virar configurável

Estes não são preferência. Se viram opção, o kit perde o que o torna confiável.

**Zero dependência nos scripts de verificação.** Só stdlib do Node. É o que faz
`lint`/`affected`/`llms` rodarem **sem `npm install`** — e é isso que torna o kit palatável num
repositório Go ou PHP: *a verificação não custa nada; só publicar o site custa*. O parser de
front-matter é próprio por essa razão, não por gosto. Nem "só uma pequena para parsear YAML".

> Nuance que a virada para CLI introduz: o **pacote publicado** pode ter dependências (parser de
> argumentos, cores no terminal). O que não pode é o **caminho de verificação** depender de algo
> instalado no repositório alvo. Na dúvida, mantenha o núcleo sem dependência.

**Tudo dentro de `wiki/`.** Nunca escrever na raiz do repositório alvo — num repo Go ou PHP não
existe `package.json` lá. Exceções: o arquivo de CI e `.claude/agents/wiki.md`.

**O agente marca `generated:`, nunca `verified:`.** Carimbar a si mesmo desliga o aviso sem que
ninguém tenha conferido. Um `verified` de mentira é pior que nenhum: o campo inteiro deixa de
significar coisa alguma.

**Descoberta de arquivos por `git ls-files`**, nunca varrendo o disco. Neutro de linguagem e
respeita o `.gitignore` do repositório — não precisamos saber que Go ignora `bin/`, PHP
`vendor/`, Rust `target/`.

## 5. Modos de falha já encontrados

**Esta é a seção mais valiosa do documento.** Cada um custou tempo para achar e todos têm teste.
Reimplementar sem eles significa reintroduzi-los.

### 5.1 O lint tolerante dá falsa confiança

O parser próprio é tolerante de propósito; o do Docusaurus é YAML estrito. Uma `description`
começando com crase — comuníssima em doc técnica — **passou no lint verde e quebrou o build**.

Isso anula a razão de existir de um lint barato. A regra `yaml-safe` replica a rigidez do
parser real: escalar sem aspas começando com `` ` @ & * ! | > % , [ ] { } # ? `` ou contendo
`: ` é erro.

### 5.2 `internal/**` não casava arquivos aninhados

O `**` no fim do padrão emitia só `(?:[^/]+/)*`, sem cobrir o resto do caminho. O glob
**idiomático de Go** falharia em silêncio — no cenário principal do kit. `**/` no meio consome
segmentos; `**` no fim precisa casar tudo, inclusive separadores. Achado por teste, não em
produção.

### 5.3 Ref base inexistente fazia o gate passar verde

Sem remote, ou com branch default `master`, `git diff origin/main...HEAD` falha, o erro vaza no
stderr e o diff vem vazio — **o CI ficaria verde sem ter comparado nada**. Pior que falhar.

Na implementação de referência o `--strict` falha explícito, nomeia **de qual variável a base
veio** e imprime o `git fetch` exato. Isso pagou sozinho quando o Jenkins entrou: clone raso é
default em muitos agentes, e o diagnóstico encurta a depuração de job mal configurado.

### 5.4 O glob de workspaces absorve o `wiki/`

`wiki/` tem `package.json` próprio. Com `workspaces: ["*"]` o npm o resolve como workspace e
iça as dependências do Docusaurus (React 19) para o `node_modules` da raiz, onde colidem com o
React do monorepo. O glob padrão do Turborepo (`apps/*`, `packages/*`) não alcança e é seguro.

A falha aparece **longe da causa**, num `npm install` da raiz, como conflito de versão. Daí a
regra `workspace-absorvido`, que só dispara se o repositório de fato tiver `workspaces`.

### 5.5 Submódulo mata o motor inteiro (e em silêncio)

Testado: com `wiki/` como submódulo git,

- `git log -- wiki/docs/x.md` no repositório hospedeiro **não retorna nada** → a staleness
  simplesmente não roda e o lint **reporta verde**;
- o diff mostra `wiki` (o gitlink), nunca `wiki/docs/x.md` → o gate acusa página desatualizada
  **mesmo quando ela foi atualizada**. Vermelho em todo PR, desligado em uma semana.

Mais fundo: **um submódulo fixa uma versão; uma base de conhecimento quer estar atual.** N
repositórios com ponteiros bumpados em datas diferentes não são uma base única — são N
snapshots divergentes, e o agente lê doc velha achando que é a verdade.

**Conclusão: o cross-repo se resolve por agregação, nunca por submódulo.** Ver §8.

## 6. O que está verificado

| Cenário | Resultado |
| --- | --- |
| Hive (Node/TS, 22 páginas) | lint limpo, build verde, `llms.txt` 3,8 KB, 185 arquivos mapeados |
| Repo **Go** limpo | lint e llms **sem `node_modules`**; `internal/auth` (diretório, sem glob) casa o pacote |
| Repo **PHP** (Laravel-like) | idem; `vendor/` fora do `map.json` sozinho, via `.gitignore` |
| **Turborepo** (apps/ + packages/) | `affected` aponta a página de `apps/web`; `packages/ui` sem página cai em "sem cobertura" |
| Docusaurus 3.10 + front-matter OKF | aceita `type`/`sources`/`status`/`generated`/`verified` (build real) |
| Detecção de base | `CHANGE_TARGET`, `GITHUB_BASE_REF` e sem variável; falha correta com ref ausente |
| Gate de higiene | reprova de verdade — testado com violações introduzidas de propósito |

**Não verificado:** o `Jenkinsfile` executando num Jenkins real (é sintaxe declarativa padrão,
mas o primeiro build num job real é onde se prova).

## 7. A CLI

### Idioma: tudo em inglês, exceto este documento

O projeto é **em inglês**: código, comentários, nomes de comandos e de flags, mensagens da CLI,
`README`, `CHANGELOG`, a descrição do pacote no npm, os nomes das regras do lint, e todo o
conteúdo do template (as páginas de exemplo, o `AUTHORING.md`, o `BOOTSTRAP.md`, o `OKF.md`, o
prompt do subagente).

**As únicas exceções são este `FOUNDATION.md` e o prompt de abertura** — são registro de
decisão, escritos para o autor, não para quem consome o pacote.

Isso significa uma **passada de tradução ao portar**, porque a implementação de referência está
toda em português. Pontos concretos:

| Onde | De | Para |
| --- | --- | --- |
| Seções do template | `comecando/` `guias/` `arquitetura/` `referencia/` `contribuindo/` | `getting-started/` `guides/` `architecture/` `reference/` `contributing/` |
| Regra do lint | `workspace-absorvido` | `workspace-absorbed` |
| Saída do lint / `affected` | "Páginas a atualizar", "Sem cobertura" | "Pages to update", "Not covered" |
| `ingest-prompt` | prompt em português | prompt em inglês |
| Docs do kit | `WIKI.md`, `BOOTSTRAP.md`, `OKF.md`, `agents/wiki.md` | idem, em inglês |

As demais regras (`yaml-safe`, `okf-type`, `sources-present`, `sources-exist`, `staleness`,
`stale-after`, `unverified`, `orphan`, `links`) e os valores de `type` (`Architecture`, `Guide`,
`Reference`, `Runbook`, `Concept`) já estão em inglês.

**Nome de diretório em inglês não obriga ninguém a escrever em inglês.** É a mesma convenção de
`src/`, `test/` e `docs/`, que ninguém traduz — o *conteúdo* das páginas é escolha de cada
repositório. E o motor **não depende** desses nomes: `loadPages` lê os diretórios que existirem,
e `rules.sources-present.apply-to` na config é justamente como um repositório com outra
nomenclatura declara quais seções exigem `sources`.

Consequência prática: quando o Hive migrar para consumir a CLI (§10), ele **não precisa renomear
nada** — mantém `arquitetura/`/`referencia/` e apenas declara isso no `apply-to`. Só instalações
novas nascem com os nomes em inglês.

### Identidade e distribuição

**Nome:** `@glauberborges/wiki-kit`. Escopo pessoal por decisão de autoria — o pacote divulga o
trabalho de quem o mantém.

**Distribuição por `npx`.** Não enfraquece a neutralidade de linguagem: o Docusaurus já exige
Node, então um dev Go roda `npx @glauberborges/wiki-kit init` sem instalar nada
permanentemente. É melhor que o `cp -r` de hoje.

Três coisas no `package.json` desde o primeiro commit:

```jsonc
{
  "name": "@glauberborges/wiki-kit",
  // Pacote com escopo nasce PRIVADO no npm: sem isto, o primeiro `npm publish`
  // falha ou exige conta paga. É o tropeço mais comum com escopo.
  "publishConfig": { "access": "public" },
  // O bin curto é o que dá `wiki-kit lint` depois de instalado, em vez do nome
  // completo. Bin único também faz o `npx @glauberborges/wiki-kit` resolver sem `-p`.
  "bin": { "wiki-kit": "./bin/cli.js" },
  "engines": { "node": ">=20" }
}
```

Como o nome invocável é longo, o `README` abre mostrando as duas formas: `npx` para uso pontual,
e global (`npm i -g @glauberborges/wiki-kit` → `wiki-kit lint`) para quem usa todo dia.

### Superfície

| Comando | O que faz |
| --- | --- |
| `wiki-kit init` | detecta a stack, instala o esqueleto, substitui placeholders, escolhe o CI |
| `wiki-kit lint [--strict]` | front-matter, fonte que sumiu, staleness, links, workspace absorvido |
| `wiki-kit affected [--base <ref>]` | dado o diff: páginas a atualizar + arquivos sem cobertura |
| `wiki-kit ingest-prompt` | o mesmo, como prompt pronto para qualquer CLI de agente |
| `wiki-kit llms` | gera `llms.txt`, `llms-full.txt`, `map.json`, bundle OKF |
| `wiki-kit hub …` | agregação cross-repo (§8) |

**`init` é o comando genuinamente novo.** Hoje a instalação é `cp -r` mais `sed` nos sete
placeholders — funciona, mas é onde alguém erra. O `init` deve: detectar a stack pelo manifesto,
**perguntar** o que não dá para inferir (nome do projeto, org, locale), escrever o esqueleto,
gravar o arquivo de config, e escolher o arquivo de CI conforme o que o repositório já usa
(`.github/` presente → workflow; `Jenkinsfile` presente → estágios do Jenkins). Deve ser
**idempotente** e nunca sobrescrever página existente sem confirmar.

Placeholders a substituir: `{{PROJECT}}`, `{{ORG}}`, `{{REPO}}`, `{{LOCALE}}`,
`{{SEARCH_LANG}}`, `{{TAGLINE}}`, `{{TAGLINE_LONG}}`.

**Detecção de base é agnóstica de CI** e deve continuar: `--base` explícito → variável do CI
(`WIKI_BASE`, `GITHUB_BASE_REF`, `CHANGE_TARGET`, `ghprbTargetBranch`, `gitlabTargetBranch`,
`CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `BITBUCKET_PR_DESTINATION_BRANCH`) → `origin/HEAD` →
`origin/main`. É o que faz o mesmo comando valer em GitHub Actions, Jenkins, GitLab e Bitbucket
sem cada pipeline conhecer o formato do outro.

### Arquivo de config

Decidido: controla **regras do lint**, **vocabulário OKF** e **saída/artefatos**. Fica de fora,
deliberadamente, estrutura e nomes de diretório — `wiki/` e as cinco seções continuam convenção,
não knob (menos superfície, e preserva o invariante de "tudo num lugar só").

Nome sugerido: `wiki-kit.config.yaml` na raiz do repositório alvo (casa com o `bin`, e é
localizável sem magia).

```yaml
rules:
  sources-present: { severity: error, apply-to: [arquitetura, referencia] }
  staleness:       { severity: warn }
  unverified:      { severity: warn }
  workspace-absorvido: { severity: warn }
okf:
  types: [Architecture, Guide, Reference, Runbook, Concept]   # extensível por repo
output:
  dir: static
  artifacts: [llms, llms-full, map, okf]
  llms-max-kb: 8
```

Uma regra deve poder virar `off` **por repositório**, mas o caminho legítimo para uma página
específica continua sendo ajustar o `sources:` dela — burlar o gate não é.

### Camadas de automação (o L0 é o contrato)

| | Precisa de | O que dá |
| --- | --- | --- |
| **L0** `affected` / `ingest-prompt` | Node + git | qualquer repo, qualquer CLI de agente |
| **L1** subagente `wiki` | Claude Code / Cursor / Codex | um comando; o agente edita sozinho |
| **L2** gate no CI | qualquer CI | o PR não mergeia com doc defasada |
| **L3** agente no CI | Actions/Jenkins + chave de API | o CI empurra o commit `docs:` |
| **L4** `auto-review: ["wiki"]` | Hive | zero passo manual |

Sem Hive, **o L2 é quem segura o fluxo**, e a mensagem de erro do gate já traz o comando para
consertar.

## 8. O hub cross-repo (entra na v1)

**Contexto:** 3-5 repositórios que se relacionam (API de pagamento, worker de análise, outra
API), alguns deles monorepos Turborepo, alguns em organização pessoal e outros de empresa. A
pergunta a responder é *"onde documentamos autenticação?"* e *"se eu mudar este webhook, quem
quebra?"* — nenhum `llms.txt` isolado responde.

**Duas necessidades que não se resolvem igual:**

**(a) A doc de cada repositório fica no repositório.** Mesmo git, mesmo diff, mesmo PR — é o que
faz `sources`/staleness/`affected`/gate funcionarem (§5.5). Não mover.

**(b) Cross-repo é agregação.** Um repositório hub recebe os artefatos de cada um e publica o
índice unificado:

```
payments-api/wiki/ ─┐
worker-risco/wiki/ ─┼─→  knowledge-hub/
identity-api/wiki/ ─┘        docs/payments-api/…
                             docs/worker-risco/…
                             docs/shared/…      ← contratos entre serviços
                             llms.txt           ← ÍNDICE UNIFICADO
```

**Escala confirma a decisão sobre busca:** com 3-5 repos o índice unificado fica em ~15-25 KB,
que cabe inteiro em contexto. **`qmd` (busca híbrida BM25+embeddings) não se paga** — pagar
índice vetorial para um corpus cujo índice cabe no prompt é custo sem retorno. Revisitar acima
de ~12 repos ou ~50 páginas por wiki.

**Onde um repositório compartilhado é legítimo:** páginas de **contrato entre serviços** (o
formato do webhook que pagamentos emite e o worker consome) não pertencem a nenhum dos dois.
Essas moram em `shared/` no hub. É um *terceiro* lugar, complementar — não substituto.

**O que multi-repo destrava de novo:** relação declarada no front-matter, já que o OKF permite
`resource` como URL ou bundle path:

```yaml
depends_on:
  - resource: okf://payments-api/arquitetura/webhooks
```

Disso sai um **grafo de dependência entre sistemas**, gerado — o artefato que só existe com a
visão de todos os repositórios.

**Monorepo no hub:** um repositório Turborepo contribui **uma** wiki mas cobre vários
deployables (`apps/web`, `apps/admin`). Resolve-se sozinho, porque o agrupamento no índice é por
página, não por deployable.

### Decisões em aberto do hub

1. **Direção**: cada repo **empurra** no merge (atualiza na hora, cada um com a própria
   credencial) vs. o hub **puxa** num cron (mais fácil de montar, um token só). Push é o único
   caminho limpo com repositórios em organizações diferentes — que é o caso aqui.
2. **Consumo**: o agente **busca** o índice do hub sob demanda (sempre atual, precisa de rede)
   vs. cada repo **vendoriza** `wiki/.hub/llms.txt` (~25 KB, atualizado pelo CI, funciona
   offline, pode atrasar horas).
3. Se o hub for privado, os artefatos publicados (`llms-full.txt`, bundle OKF) concatenam
   **todo** o conteúdo — publicar num host público é decisão consciente, nunca default.

## 9. Testes

A implementação de referência tem **47 testes** em `tests/wiki/` (Vitest). **Porte-os**; eles
codificam os modos de falha da §5 e são a razão de vários bugs não estarem no código hoje.

| Arquivo | Cobre |
| --- | --- |
| `frontmatter.test.ts` | escalares, mapas/listas inline, listas de mapas em bloco, regressão do loop infinito |
| `pages.test.ts` | globs (`*` não atravessa `/`, `**` atravessa, Go e PHP), `normalizeSources`, ordem da sidebar |
| `yaml-safe.test.ts` | o valor que passa no lint tolerante e quebra o build |
| `kit-hygiene.test.ts` | denylist de identificadores, zero dependência, nada fora de `wiki/`, placeholders documentados, sem regra de processo |

Somam-se, na CLI:

- **`init` idempotente** — rodar duas vezes não duplica nem sobrescreve.
- **Instalação real** — `npm pack` → instalar num diretório temporário → rodar `wiki-kit lint`.
  É o único jeito de pegar erro de `bin`, `files` ou `publishConfig` **antes** de publicar, e com
  pacote de escopo esse é justamente o risco.
- **Gate de idioma** — um grep sobre o pacote publicável reprovando resíduo de português
  (`ção`, `ções`, `não`, `página`, `arquivo`, `código`…), com `FOUNDATION.md` e o prompt na
  allowlist. Mesma lógica do gate de higiene: a tradução passa hoje e volta a vazar na terceira
  edição se nada verificar. Barato, e pega o caso comum de um `console.log` esquecido.

## 10. Migração — e o risco de divergência

**A skill vira invólucro fino, não cópia.** Se `.claude/skills/wiki-kit/` mantiver os scripts
duplicados, as duas versões divergem — exatamente o que o gate de higiene existe para impedir.
A skill passa a chamar `npx @glauberborges/wiki-kit`.

**O Hive migra para consumir a CLI publicada**, largando o `wiki/scripts/` vendorizado. É o loop
de dogfood fechando e o primeiro teste real de instalação.

**Levar o gate de higiene junto.** Ele verifica: denylist de identificadores da origem, ausência
de dependência externa nos scripts, que nada é instalado fora de `wiki/`, que todo placeholder
está documentado, e que o kit **não embute regra de processo** (política de PR, aprovação, nome
de time — o kit descreve *como escrever uma página*, nunca *como a organização trabalha*).

Sendo agora um pacote público, some-se: **README para desconhecidos** (o de hoje pressupõe
contexto), **licença**, e **CHANGELOG** desde a 0.1.0.

## 11. Ainda a decidir

- **Licença** — MIT é o default razoável para ferramenta pública
- As duas decisões do hub em §8: **direção** (push vs. pull) e **consumo** (buscar vs.
  vendorizar). Ambas se propagam para decisões pequenas depois; não deixar implícitas.
**Já decidido:**

- nome `@glauberborges/wiki-kit`, distribuição por `npx`, bin curto `wiki-kit`
- escopo da v1 = paridade com o kit atual **mais** o hub cross-repo
- a config controla regras do lint, vocabulário OKF e saída/artefatos — estrutura e nomes de
  diretório ficam de fora de propósito
- **idioma: tudo em inglês**, exceto este documento e o prompt de abertura (§7)
