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
- Chat sem IA: entende palavras da pergunta e responde com os dados já existentes (Planilha EPI, Requisições, Mapa, Contratos, Movimentações, Contagens). Respeita as permissões do perfil.
- Some sozinho no Mapa almoxarifado e no Mapa livre.
- Para ensinar uma pergunta nova: linha em `INTENCOES` + função em `H` dentro do arquivo.
