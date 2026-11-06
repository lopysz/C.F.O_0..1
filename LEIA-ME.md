# Automação de NF (Ferramentas > Automação de NF)

## Arquivos
- `automacao-nf.js`        NOVO -> pasta do sistema (junto dos outros .js)
- `automacao-nf-pacote.js` NOVO -> pasta do sistema (contém o agente para o botão "Baixar agente")
- `app.js`           1 linha trocada (entrada em Ferramentas)
- `index.html`       1 linha nova (<script> do automacao-nf.js)
- `agente-windows/`  vai para o PC da empresa. SEM instalar nada (usa o PowerShell do Windows).

## No PC da empresa
1. Copie a pasta `agente-windows` (ex.: C:\CFO\agente-windows). Tem que ser a pasta inteira.
2. Se o Windows bloquear: botão direito no .zip > Propriedades > "Desbloquear" ANTES de extrair.
3. Dê dois cliques em `iniciar.bat`. Janela preta com o TOKEN. Deixe aberta.
4. No sistema: Ferramentas > Automação de NF > "Colar token" (só na 1ª vez).
5. Escreva o roteiro, Salvar, escolha a requisição, Testar e depois Preencher NF.

## Descobrir X,Y dos cliques
`descobrir-posicao-do-mouse.bat` mostra a posição do mouse. (Use a tela do outro sistema na mesma posição/tamanho de sempre.)

## Parar
Mouse no canto superior esquerdo da tela, ou botão Parar.


## Se aparecer "Concluído" mas nada acontecer
1. **Testar não clica nem digita** (só mostra os passos). Para valer use **Preencher NF**.
2. O log agora diz quantos passos foram feitos. Roteiro só com `#` (vazio) dá erro em vez de "Concluído".
3. Programa da NF rodando como **Administrador**: use `iniciar-como-administrador.bat`.
4. Campo que não aceita colar: troque `digitar` por `teclar`.

## Comandos novos (agente versão 3)
`teclar`, `abrir site "..."`, `fechar janela`, `fechar aba`, `nova aba`, `voltar`, `avancar`, `atualizar`, `selecionar tudo`, `copiar`, `colar`, `mover mouse para X,Y`, `rolar 3 para baixo`, `esperar janela "..."`, `definir nome = valor`, `perguntar "..." em nome`, `avisar "..."`, `repetir 3 vezes`, `se {campo} vazio/for/contem`, `ignorar erros`, `parar`. Lista completa na tela (📖 Comandos).

## Passo a passo (blocos)
Na tela da Automação de NF, o botão **🧩 Passo a passo** troca o campo de texto por blocos: toque em **＋ Adicionar passo**, escolha o bloco (Clicar, Escrever data, Apertar tecla, Abrir site, Para cada produto, Se tem código...) e só preencha os espaços (X, Y, texto). Os blocos entram em ordem (depois do bloco que você tocou por último), dá para subir/descer, copiar e apagar. **Para cada produto** e **Se** já vêm com o **Fim**. Ao **Salvar roteiro**, os blocos viram o texto normal do roteiro; **Voltar ao texto** mostra esse texto, e dá para ir e voltar entre os dois.

## Assistente (botão flutuante)
- `assistente.js` NOVO -> pasta do sistema; `index.html` 1 linha nova (`<script src="assistente.js...">`, antes do `app.js`).
- Chat sem IA: entende palavras da pergunta e responde com os dados já existentes (Planilha EPI, Requisições, Mapa, Contratos, Movimentações, Contagens). Respeita as permissões do perfil e o espaço de dados (almoxarifado × outros setores).
- Some sozinho no Mapa almoxarifado e no Mapa livre.
- Para ensinar uma pergunta nova: linha em `INTENCOES` + função em `H` dentro do arquivo. Abreviações novas: `ABREV`.

### Cérebro v2 (baseado no "Projeto Cérebro do Assistente")
- **Contexto (10 min):** "e o mês passado?", "e do contrato 130?", "quanto dura dele?", "e o saldo?", "não, o outro", "voltar", "cancelar", "mais detalhes". Se a pergunta ficou incompleta, ele pergunta (qual item? qual contrato?) e aceita só "125" como resposta.
- **Erro de digitação:** palavras de comando são corrigidas sozinhas ("estoke", "previzão"); nome de item vira sugestão "Você quis dizer…" (nunca troca sozinho); números e códigos nunca são alterados.
- **Frase vaga** ("valor", "pedido", "histórico"): não adivinha, oferece botões. Vários itens parecidos: botões para escolher.
- **Transparência:** toda resposta mostra a fonte dos dados e a hora da consulta; previsões mostram base, o que inclui/não inclui e a confiabilidade (quantos dos 3 meses têm dados).
- **Novas perguntas:** vencimento de contratos ("quando vence o contrato 125?", "contratos vencendo"), "quando entrou a última luva", "últimas saídas/entradas", "como faço a contagem?" (com botão para abrir a tela).
- **Frases não entendidas:** ficam salvas só neste aparelho (sem números). Pergunte "não entendi" ao assistente para ver as últimas 10 e ensinar palavras novas.

## IA no assistente (Gemini, opcional)
- `assistente.js` ATUALIZADO + `supabase/functions/assistente-ia/index.ts` NOVO (vai para o Supabase, não para a pasta do sistema).
- A IA só entra quando as regras não entendem a frase: ela reescreve a pergunta num modelo conhecido e o sistema consulta os dados. Não recebe quantidades nem preços.
- A chave do Gemini fica no Supabase (secret `GEMINI_API_KEY`). Modelo trocável pelo secret `GEMINI_MODEL` (padrão `gemini-2.5-flash`).
- Sem a função publicada, o assistente funciona como antes. Desligar: `assistenteIA: false` em `supabase-config.js`.

## Assistente que altera o sistema (sempre com confirmação)
- Frases aceitas: `dar saída de 5 luva nitrílica` · `entrada de 20 capacete` · `chegaram 30 luvas` · `contei 40 bota PVC` · `ajustar estoque da luva para 40` · `marcar RQ 3370 como retirada` · `negar requisição 3370` · `desfazer`.
- Fluxo: o assistente mostra "Entendi: … Saldo 20 → 15" com **Confirmar** / **Recusar**. Nada muda antes de Confirmar; Recusar (ou qualquer outra frase) descarta. O pedido vale 3 minutos.
- Respeita o perfil: precisa poder abrir e editar a Planilha EPI (ou Requisições). Perfil "só visualizar" é barrado.
- Grava igual às telas: Planilha EPI + Histórico de movimentação (responsável: "Assistente (nome)"). Saída maior que o saldo é barrada.
- **Desfazer** (botão ou texto, até 10 min) também pede confirmação.
- A IA (Gemini) pode traduzir frases diferentes para esses comandos, mas a confirmação continua obrigatória. Para ela entender as alterações, cole de novo o `index.ts` na função (opcional).


## Botão flutuante com atalhos (chat, bloco de notas, agenda)
- `notas-agenda.js` NOVO -> pasta do sistema; `assistente.js` ATUALIZADO; `index.html` 1 linha nova (`notas-agenda.js`, antes do `assistente.js`) + versões trocadas.
- O botão fica com 50% de opacidade. Ao tocar, abrem 3 bolinhas (50%): chat, bloco de notas e agenda; enquanto elas aparecem o botão geral fica com 45%. Toque fora, no botão de novo ou Esc para fechar.
- Bloco de notas e Agenda abrem numa janela no meio da tela (não cobre tudo). Salvam sozinhos, um por PERFIL (`notas_<perfil>` e `agenda_<perfil>`), e vão para a nuvem pelo mesmo caminho dos outros dados (almoxarifado: Supabase principal | outros setores: pasta do setor).
- Perfil sem acesso ao assistente continua vendo as bolinhas de notas e agenda.
- Para desfazer: apague `notas-agenda.js` e a linha dele no `index.html` (sobra só o chat).

## Capturar lista de outra tela -> Bloco de Notas -> PDF (agente versão 6)
- `automacao-nf.js` e `automacao-nf-pacote.js` ATUALIZADOS (+ `index.html` com a versão do script trocada). Baixe o agente de novo ("Baixar agente") e troque a pasta `agente-windows`.
- Em **🧩 Passo a passo** há o grupo **📥 Capturar para Bloco de Notas/PDF**:
  - **Capturar uma lista de outra tela**: nome, X,Y do início, X,Y do fim, rolar (lista maior que a tela) e modo (Shift+clique ou arrastar). Texto: `capturar lista "Nome" de X1,Y1 ate X2,Y2 [rolar N | arrastar]`.
  - **Gerar o documento**: título, onde salvar, formato (`txt+pdf`, `txt`, `pdf`) e como mostrar (`tabela` = colunas alinhadas, `texto`). Texto: `gerar documento "Título" em "C:/pasta/arquivo" formato txt+pdf como tabela`.
- O `.txt` abre sozinho no Bloco de Notas; o PDF é gerado pelo próprio agente (texto simples, fonte Courier). Não precisa de Word.
- Pode capturar várias listas (de telas diferentes) e gerar um documento só no fim. Aceita `{requisicao}`, `{data}` etc. no título/arquivo. Sem caminho, salva em `documentos` ao lado do agente. Não use `#` no título/caminho.

## Controle remoto: iniciar a automação pelo celular, executando no PC
- `automacao-nf.js` ATUALIZADO (+ versão do script no `index.html`). Não muda o agente: se o agente já é o versão 6 (ou o 3+ para roteiros comuns), nada precisa ser baixado de novo.
- Usa o Realtime do Supabase (o mesmo do "Quem está online"); nada é gravado em banco. Canal protegido por um código de 12 letras/números.
- **No PC** (Ferramentas > Automação de NF > 4) Controle remoto): toque em "Este aparelho é o PC". Aparece o código. Deixe o `iniciar.bat` ligado, o token colado e a aba do sistema aberta (desative a "suspensão de abas" do navegador, se houver).
- **No celular**: mesma tela, "Este aparelho é o celular", digite o código uma vez. Escolha a requisição normalmente e toque em **📱 ▶ Iniciar no PC** (ou **📱 🧪 Testar no PC**). Aparecem o status do PC, o andamento e os botões Pausar/Continuar/Parar.
- O celular só envia o número da requisição e o comando; os itens vêm dos dados do PC (por isso o PC precisa estar sincronizado ☁️). O mesmo comando nunca roda duas vezes. Se o PC não responder em 8 s, o celular avisa.
- Para bloquear: "Desligar receptor" no PC, ou "Gerar novo código".

## Roteiro salvo vira um bloco (🧱 Roteiros prontos)
- `automacao-nf.js` ATUALIZADO (+ versão do script no `index.html`). O agente NÃO muda: ele continua lendo só texto comum.
- Monte um roteiro, toque em **🧱 Salvar como bloco** (ou ☁️ Salvar na nuvem) e dê um nome. No 🧩 Passo a passo, **＋ Adicionar passo > 🧱 Roteiros prontos** mostra o Modelo da NF e cada roteiro salvo: um toque coloca o roteiro inteiro como **um bloco só**, que dá para subir, descer, copiar e apagar como os outros.
- Ao salvar, o texto do roteiro é copiado para dentro do roteiro final, entre `# [roteiro ID] Nome` e `# [/roteiro]` (comentários que o agente ignora). Ao reabrir, essas linhas voltam a ser um bloco só.
- Se você mudar o roteiro salvo, o bloco usa a versão nova no próximo Salvar roteiro. Se apagar o roteiro salvo, vale a cópia que já está no roteiro (o editor avisa).
- Roteiro dentro de roteiro é permitido: as marcações são achatadas (sem aninhar). O editor avisa se o roteiro usado deixa um bloco aberto (falta Fim) ou tem Fim sobrando.

## Várias requisições numa NF só
- `automacao-nf.js` ATUALIZADO (+ versão do script no `index.html`). O agente não muda.
- No passo 3) da Automação de NF a lista agora tem **caixinhas**: marque quantas requisições quiser. Os itens iguais (mesmo item e tamanho) são **somados** e a NF é preenchida uma vez só. Itens com quantidade aprovada 0 ficam de fora, como sempre.
- Com mais de uma marcada, `{requisicao}` vira `RQ1 + RQ2`, `{nome}`/`{mes}`/`{motivo}` juntam os textos diferentes (separados por ` / `) e `{contrato}` junta os contratos diferentes (` + `). Se os contratos forem diferentes, a confirmação avisa.
- Funciona igual no **📱 Iniciar no PC** (o celular manda a lista de requisições; o PC junta). Marcar só uma requisição funciona exatamente como antes.

## Nome completo do contrato nas requisições (04/11/2026)
- A requisição vem da planilha/WL com o nome do contrato encurtado (ex.: "Franco da Rocha"). Agora o sistema troca pelo nome COMPLETO do cadastro (Almoxarifado Operacional > Contratos), casando pelo número (1382, 0130 = 130).
- Vale em todo lugar que lê as requisições: lista, detalhe, impressão/PDF, Automação de NF (`{contrato_nome}`), Controle de gastos/mensal, EPIs por contrato, Assistente.
- `core.js` NOVO: `CFO.contratoNome(num, curto)` e a leitura de 'requisicoes' já devolve o nome completo. `requisicoes.js` e `wl-sync.js`: ao importar/sincronizar já gravam o nome completo.
- Contrato que NÃO está no cadastro continua com o nome curto da requisição -> cadastre o contrato (número + nome completo) em Contratos.
- Cadastro alterado depois reflete sozinho nas requisições antigas (não precisa reimportar).

## Nome do funcionário vindo do WL (04/11/2026)
- `wl-sync.js`: lê `employee_name` (item, senão requisição) e salva em `item.func` (e o cargo em `item.cargo`). CPF não é lido.
- O nome NÃO aparece em nenhuma tela nem na busca. Só aparece na IMPRESSÃO/PDF da requisição (`requisicoes.js`), em letra pequena embaixo de cada item (com a quantidade entre parênteses quando for mais de 1).
- Depois de trocar os arquivos: Ferramentas > Sincronizar WL > sincronização COMPLETA para preencher as requisições antigas. Itens sem nome no WL imprimem sem nome embaixo.

## Planilha EPI: coluna Valor + botão ⚙ (04/11/2026)
- Nova coluna **Valor (R$)** na Planilha EPI, antes de **Estoque** (visível só para quem pode ver Gastos). A gaveta "Valores dos EPIs" foi apagada do menu.
- Valores que já estavam na gaveta antiga são trazidos sozinhos para a coluna; EPI ainda sem valor recebe o preço da requisição mais recente (uma vez). Depois é só editar na planilha.
- Os cálculos de gasto continuam iguais: usam o preço da requisição e, se vier zerado, o Valor da Planilha EPI (`valores-epi.js`).
- Importar/Exportar a Planilha EPI agora também tem a coluna Valor (cabeçalhos aceitos: Valor, Valor unitário, Preço...).
- Botão **⚙** (barra da Planilha EPI): modo "editar tudo". Todas as linhas viram campos editáveis (Enter desce para a linha de baixo); **Salvar alterações** grava tudo de uma vez, **Cancelar** descarta. Os lápis ✎ continuam funcionando fora desse modo.

## Código SG x Código NF (04/11/2026)
- A Planilha EPI agora tem **Código SG** (o do WL) e **Código NF** (o do sistema de NF da empresa), lado a lado.
- A Automação de NF lança o **Código NF**; se ele estiver vazio, usa o Código SG (como era antes). `{codigo}` do roteiro = esse código.
- A sincronização do WL passa a guardar o código do WL em cada item da requisição (`cod`); o sistema acha a linha da planilha por esse código e, se não bater, pelo nome.
- Para ir corrigindo com o tempo: lápis ✎ (um item) ou ⚙ (todos de uma vez). Botão **Códigos NF**: traz uma planilha com a lista do sistema de NF (Código NF + Descrição, ou Código SG + Código NF), mostra o que vai mudar e só grava depois de confirmar.
- Importar a Planilha EPI aceita as colunas "Código SG" e "Código NF" (e "Código" sozinho vale como SG).

## Logo da empresa nas impressões (04/11/2026)
- Configurações > Aparência > **Logo da empresa**: importe um PNG (ou JPG). Ele vale no lugar da logo padrão em tudo que é impresso/exportado: PDF das telas e relatórios, impressão da requisição e Excel.
- A imagem é reduzida (máx. 500 px), mantém o fundo transparente e fica em 'logo_empresa' (sincroniza com a nuvem). "Voltar à logo padrão" desfaz.
- A logo do C.F.O dentro do sistema (menu, login) não muda. `CFO.LOGO` agora devolve a logo que vale (própria ou padrão); a padrão ficou em `CFO.LOGO_PADRAO`.

## Código na NF sem os 2 zeros do início (05/11/2026)
- A Automação de NF lança o código sem os 2 primeiros zeros: 0012 -> 12, 00105 -> 105. Vale para o Código NF e para o Código SG (quando o NF está vazio). A planilha e as impressões continuam mostrando o código completo.

## OCR: ler os códigos da tela do sistema de NF (05/11/2026)
- Ferramentas > **OCR** > **📷 Ler códigos da tela** (`ocr-nf.js`; a gaveta OCR também vai receber outras leituras no futuro). O botão saiu da Planilha EPI. Compartilhe a janela do sistema de NF (lista de produtos) e toque em **Capturar** (role e capture de novo quantas vezes quiser), ou cole um print (Ctrl+V) / escolha imagens.
- O OCR (Tesseract.js 5.1.1, baixado do jsdelivr na 1ª vez; precisa de internet) lê as linhas "código + descrição" e liga cada uma a uma linha da Planilha EPI pelo nome (nome sem tamanho = todos os tamanhos do EPI).
- Tela de conferência: marque/desmarque, corrija o código digitado, **trocar** a ligação. Itens "parecido: conferir" vêm desmarcados. Só grava em **Código NF** depois de **Aplicar** + confirmação.
- O OCR pode errar dígitos: sempre confira. Se o sistema de NF exportar a lista (Excel/CSV), o botão **Códigos NF** é mais seguro.
- `CFO.linhasPorNome(rows, nome)` (epi.js) é usado pelo OCR e pelo importador de códigos NF.

## NOVO (agente versão 7): conferir cada item + rolagem automática no OCR
Arquivos: `ocr-nf.js`, `automacao-nf.js`, `automacao-nf-pacote.js` (traz o agente novo), `index.html` (só o número ?v= dos scripts). Depois de subir, use **Baixar agente** em Ferramentas > Automação de NF, troque a pasta `agente-windows` e abra o `iniciar.bat` de novo (o agente antigo não conhece os comandos novos; o sistema avisa).

### Bloco "Lançar os itens: CÓDIGO + conferir" (Automação de NF > 🧩 Passo a passo > 📦 Itens da requisição)
Para cada item: escreve o código número por número, dá o 1º Enter (busca), **abre uma caixa "Está correto?"** e só então dá os outros Enter e escreve a quantidade.
- **Sim**: segue sozinho.
- **Não**: o agente para; você corrige na mão e aperta a tecla escolhida (padrão **F8**; também F9, Espaço ou Ctrl). O item vale como concluído e ele vai para o próximo código.
- Deixe o mouse em cima do campo do código ao iniciar: o agente guarda esse ponto (`lembrar mouse`) e clica de novo nele antes de cada item (`voltar mouse`), mesmo depois de você mexer o mouse para corrigir.
- Cuidado com a tecla **Espaço**: ela também digita um espaço no campo. Por isso o padrão é F8.
- Comandos novos no texto do roteiro: `confirmar "Está correto?" em confere tecla f8` (guarda sim/nao em `{confere}`), `lembrar mouse`, `voltar mouse`.

### OCR: rolagem automática (Ferramentas > OCR > Ler códigos da tela > ⚙️ Rolagem automática)
Marque "Rolar a lista sozinho e capturar até o fim", use "Pegar posição do mouse (4 s)" levando o mouse até cima da lista do sistema de NF, e toque em **📷 Capturar rolando**. O sistema captura, o agente gira a roda do mouse, captura de novo, e para quando a tela deixa de mudar (ou no máximo de capturas). Deixe a janela do sistema de NF visível ao lado do navegador. Opções: giros por passo, espera depois de rolar, máximo de capturas e "voltar ao topo antes de começar". Itens repetidos entre capturas são ignorados. Continua tudo sendo conferido antes de gravar.
