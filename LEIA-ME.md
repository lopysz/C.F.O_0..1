# Automação de NF (Ferramentas > Automação de NF)

## Arquivos
- `automacao-nf.js`        NOVO -> pasta do sistema (junto dos outros .js)
- `automacao-nf-pacote.js` NOVO -> pasta do sistema (contém o agente para o botão "Baixar agente")
- `app.js`           1 linha trocada (entrada em Ferramentas)
- `index.html`       1 linha nova (<script> do automacao-nf.js)
- `agente-windows/`  vai para o PC da empresa. SEM instalar nada (usa o PowerShell do Windows).
- `agente/`          alternativa em Python (não precisa se usar a de cima)

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
