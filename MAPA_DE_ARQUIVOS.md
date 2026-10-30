# Mapa dos arquivos: Almoxarifado de EPIs × Outros setores

## A chave que separa os dois mundos
`CFO.espaco` (definido no `login.js`, lido por todos):

| Valor | Quem | Onde ficam os dados | Nuvem |
|---|---|---|---|
| `''` (vazio) | Almoxarifado de EPIs (Rafael, Robson, Wellington, Aprendiz, perfis criados no grupo "Almoxarifado de EPIs") | `localStorage` `cfo:<chave>` e IndexedDB `cfo` | Supabase principal (`supabase-sync.js`) |
| `'s_<id>'` | Perfil de "Outros setores" (ex.: João) | `localStorage` `cfs:s_<id>:<chave>` e IndexedDB `cfo_s_<id>` | Só a pasta do próprio setor (`setor-sync.js`) |

Para achar **todo** ponto onde o sistema se comporta diferente por setor:

```
grep -n "CFO.espaco" *.js        # onde muda o comportamento
grep -n "isolado" *.js           # versão "perfil de setor" dentro de CFO.usuario()
grep -n "mapalivre" *.js         # função exclusiva (perfil principal + setores)
```

## 1) Arquivos SÓ de "Outros setores"
| Arquivo | O que faz |
|---|---|
| `setores.js` | Isolamento e extras do setor: nomes das funções e da palavra "EPI", funções/gavetas apagadas (`ocultos`), backup `.json` e apagar dados do setor |
| `setor-sync.js` | Nuvem própria do setor (pasta `<pastaEnvio>/setores/<id>/dados`, botão `#envS`); nunca toca na pasta do EPI |
| `mapa-livre.js` | **Mapa livre** (desenho livre: áreas, paredes, paletes, prateleiras) com busca de produtos no Plano e no 3D. Só abre para perfil de setor e para o perfil principal |

Pedaços "só de setor" que ficam dentro de arquivos comuns:
- `login.js`: perfil `perfil: 'setor'` (ex.: `joao`), `CFO.espaco`, criar perfil com `setorNome`/`jr`, regra `mapalivre` em `CFO.pode`.
- `config-perfis.js`: grupo "Outros setores" na lista de perfis, seção do setor (backup), seção "Nomes das funções" e "Apagar funções" (só administrador júnior).
- `app.js`: `DRAWERS_TODAS` + `CFO.ocultos()` (menu sem o que o setor apagou), botão `#envS` visível só no setor.
- `core.js`: a função `chaveLocal` e o nome do banco de fotos trocam de prefixo conforme `CFO.espaco`.

## 2) Arquivos SÓ do Almoxarifado de EPIs (não rodam / ficam escondidos no setor)
| Arquivo | Como o setor é barrado |
|---|---|
| `supabase-sync.js`, `supabase-enviar.js`, `supabase-import.js`, `supabase-config.js` | nuvem principal: `if (CFO.espaco) return`. Obs.: `supabase-config.js` (URL/chave) é lido também pelo `setor-sync.js` |
| `wl-config.js`, `wl-sync.js` | Sincronizar WL: desligado (`CFO.espaco`), botão escondido |
| `online.js` | "Quem está online": perfil `isolado` não aparece |
| `registros.js` | botão **Registros** escondido para setor |
| `painel.js` | painel do Início (aguardando retirada etc.): usa requisições/fotos do EPI; no setor aparece vazio |

## 3) Arquivos COMUNS (mesmo código nos dois; no setor os dados começam vazios e os nomes podem mudar)
- Núcleo: `core.js`, `login.js`, `app.js`, `config-perfis.js`, `index.html`, `style.css`
- Planilhas e importar/exportar: `planilhas.js`, `exportar.js`, `importar-pasta.js`, `importar-drive.js`
- Funções do menu: `epi.js` (Planilha EPI), `contratos.js`, `requisicoes.js`, `historico-movimentacao.js`, `epis-por-contrato.js`, `controle-gastos.js`, `controle-mensal.js`, `foto-separacao.js`, `gerador-identificacao.js`, `contagem-estoque.js`, `mapa-almoxarifado.js`

## Como criar uma função nova
- **Só para setores:** arquivo novo + entrada em `DRAWERS` (`app.js`) + regra em `CFO.pode` (como `mapalivre`) + `<script>` no `index.html`.
- **Só para o EPI:** o mesmo, com `if (CFO.espaco) return` no começo do arquivo (e esconda o item do menu para `CFO.espaco`).
- **Para os dois:** não precisa de regra. Dados e nuvem se separam sozinhos pelo `CFO.espaco`.
