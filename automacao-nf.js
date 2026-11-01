/* ===== Ferramentas > Automação de NF (autoclick) =====
   Tela própria em Ferramentas: liga ao agente local (agente-windows/agente.ps1, em 127.0.0.1:8765), edita o roteiro
   e preenche a nota de uma requisição. Também põe os botões 🤖/🧪 dentro do detalhe da Requisição (atalho).
   Só para o Almoxarifado de EPIs (CFO.espaco vazio). Remover = apagar este arquivo, a linha <script> e a entrada em app.js. */
(() => {
  if (CFO.espaco) return;
  const esc = CFO.esc, URL = 'http://127.0.0.1:8765', TK = 'cfo:nf_token';     // token fica só neste navegador (não vai para a nuvem)
  const token = () => localStorage.getItem(TK) || '';
  const chamar = async (rota, corpo) => {
    const r = await fetch(URL + rota, { method: corpo ? 'POST' : 'GET', headers: { 'X-Token': token(), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { localStorage.removeItem(TK); throw new Error('Token inválido. Clique em "Colar token" e cole o que aparece na janela do agente.'); }
    if (!r.ok) throw new Error(j.erro || 'erro ' + r.status);
    return j;
  };
  const ligado = () => fetch(URL + '/ping').then(r => r.ok).catch(() => false);
  const VMIN = 3;                                                // versão mínima do agente (a que entende se/senão, perguntar, teclar...)
  const versao = () => fetch(URL + '/ping').then(r => r.json()).then(x => x.versao || 1).catch(() => 0);
  const ANTIGO = 'O agente que está aberto neste computador é ANTIGO e não entende os comandos novos.\n\nClique em "⬇️ Baixar agente", troque a pasta agente-windows e abra o iniciar.bat de novo.';
  const pedeToken = () => { const t = prompt('Cole o TOKEN que aparece na janela do agente:'); if (t) localStorage.setItem(TK, t.trim()); return !!token(); };
  const garante = async () => {
    if (!await ligado()) { alert('O agente não está ligado neste computador.\nAbra o "iniciar.bat" (pasta agente-windows) e tente de novo.'); return false; }
    if (await versao() < VMIN) { alert(ANTIGO); return false; }
    return token() || pedeToken();
  };

  // Requisição no formato do agente: itens aprovados somados por item+tamanho, com o código do EPI
  const montar = r => {
    const achar = CFO.casarEpi(CFO.store.get('epi', [])), mapa = new Map();
    r.itens.filter(i => i.qa > 0).forEach(i => {
      const k = CFO.norm(i.item) + '|' + CFO.norm(i.tam), x = mapa.get(k) || { item: i.item, tam: i.tam || '', qa: 0, preco: i.preco, codigo: (achar(i.item) || {}).codigo || '' };
      x.qa += i.qa; mapa.set(k, x);
    });
    return { id: r.id, contrato: r.contrato, contratoNome: r.contratoNome, sol: r.sol, mes: r.mes, motivo: r.motivo, itens: [...mapa.values()] };
  };
  async function rodar(r, simular, aoIniciar) {
    if (!await garante()) return;
    const q = montar(r);
    if (!q.itens.length) { alert('Esta requisição não tem itens aprovados.'); return; }
    if (!simular && !confirm(`Preencher a nota da ${r.id}?\n\nContrato ${r.contrato} · ${q.itens.length} produto(s).\nO agente vai controlar o mouse e o teclado.\nPara interromper: jogue o mouse no canto superior esquerdo da tela.`)) return;
    try { await chamar(simular ? '/testar' : '/executar', { requisicao: q }); aoIniciar ? aoIniciar() : tela(r); }
    catch (e) { alert(e.message); }
  }

  // Acompanha o andamento (log do agente)
  function acompanhar(el, parar) {
    const t = setInterval(async () => {
      if (!el.isConnected) return clearInterval(t);
      try { const s = await chamar('/estado'); el.textContent = s.log.join('\n'); el.scrollTop = el.scrollHeight; if (parar) parar.hidden = !s.rodando; } catch { clearInterval(t); }
    }, 700);
  }
  function tela(r) {
    CFO.open('Preenchendo ' + r.id, b => {
      b.innerHTML = '<div class="nf"><div class="nf-row" style="margin:0 0 .8rem"><button id="p" class="ghost danger">⏹ Parar</button></div><pre class="nf-log" id="l"></pre></div>';
      const p = b.querySelector('#p'); p.onclick = () => chamar('/parar', {}).catch(() => {}); acompanhar(b.querySelector('#l'), p);
    });
  }

  const MODELO_NF = "# ROTEIRO DA NOTA FISCAL (versao simples)\n#\n# Como ler: cada linha e uma acao. O que vem depois de # e so explicacao.\n# Onde estiver 0,0 -> troque pelo X,Y do botao/campo\n# (use o descobrir-posicao-do-mouse.bat). Se esquecer algum 0,0,\n# o teste mostra o aviso e o agente para sozinho.\n#\n# Mais comandos (fechar janela, voltar, perguntar, avisar, abrir site...):\n#   veja a lista \"Comandos que o roteiro entende\" na tela do sistema.\n# Se algum campo nao aceitar colar texto, troque \"digitar\" por \"teclar\".\n#\n# O sistema preenche sozinho estes campos:\n#   {data}  {hora}  {contrato}  {contrato_nome}  {nome} (solicitante)  {requisicao}\n#   e, dentro de \"para cada produto\": {codigo}  {produto}  {quantidade}  {tamanho}\n\nfocar janela \"TROQUE PELO TITULO DA JANELA DO EMISSOR\"\nesperar 1\n\n# ---------- ABA 1: data e destinatario ----------\nclicar em 0,0                 # campo Data\ndigitar {data}\nclicar em 0,0                 # campo Destinatario\ndigitar TROQUE PELO DESTINATARIO\n\n# ---------- ABA 2: precos ----------\nclicar em 0,0                 # aba Precos\nclicar em 0,0                 # campo que precisa preencher\ndigitar TROQUE PELO VALOR\n\n# ---------- ABA 3: produtos ----------\nclicar em 0,0                 # aba Produtos\nclicar em 0,0                 # campo NATOP\ndigitar TROQUE PELO NATOP\n\npara cada produto\n  se produto com codigo\n    # o emissor acha o produto pelo codigo\n    clicar em 0,0             # campo Codigo\n    digitar {codigo}\n    tecla enter\n    esperar 1\n    clicar em 0,0             # campo Quantidade\n    digitar {quantidade}\n    tecla enter\n  senao\n    # produto sem codigo: caminho do botao extra\n    clicar em 0,0             # botao extra\n    esperar 1\n    clicar em 0,0             # opcao que voce seleciona la\n    clicar em 0,0             # campo Nome do produto\n    digitar {produto}\n    clicar em 0,0             # campo Quantidade\n    digitar {quantidade}\n    tecla enter\n  fim se\nfim para cada\n\n# ---------- ABA 4: outras informacoes ----------\nclicar em 0,0                 # aba Outras informacoes\nclicar em 0,0                 # campo que precisa preencher\ndigitar TROQUE PELO TEXTO\n\n# ---------- ABA 5: texto padronizado ----------\nclicar em 0,0                 # aba do Texto\nclicar em 0,0                 # onde vai o numero do contrato\ndigitar {contrato} - {contrato_nome}\nclicar em 0,0                 # onde vai o solicitante\ndigitar {nome}\nclicar em 0,0                 # onde vai o numero da requisicao\ndigitar {requisicao}\n\n# Botao Finalizar: tire o # da linha de baixo SO depois de testar tudo\n# clicar em 0,0               # botao Finalizar NF\n";
  const MODELO = '# Roteiro vazio. Escreva aqui, uma instrução por linha.\n# Exemplo:\n#   focar janela "Nome da janela"\n#   clicar em 300,200\n#   digitar {contrato}\n#   para cada produto\n#     digitar {produto}\n#   fim\n';

  // ---------- Estilo próprio (o CSS do sistema deixa <b> grande e <input> largo dentro de .card; por isso não usamos .card aqui) ----------
  const css = document.createElement('style');
  css.textContent = `
  .nf{max-width:860px;margin:0 auto}
  .nf-box{background:var(--panel);border:1px solid var(--line);border-radius:var(--r,12px);padding:1rem 1.1rem;margin-bottom:1rem}
  .nf-box h3{margin:0 0 .5rem;font-size:1.05rem;font-weight:700}
  .nf-box p{margin:.3rem 0 .8rem;color:var(--muted);font-size:.9rem;line-height:1.55}
  .nf-box p b,.nf-box p i,.nf-box li b{display:inline;font-size:inherit;margin:0;font-style:normal}
  .nf-box code{background:rgba(128,128,128,.18);padding:.05rem .35rem;border-radius:5px;font-size:.85em}
  .nf-row{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.7rem}
  .nf-row button{flex:0 0 auto}
  .nf-box textarea{display:block;width:100%;min-height:42vh;font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.5;box-sizing:border-box}
  .nf-box input[type=search]{display:block;width:100%;box-sizing:border-box}
  .nf-st{display:flex;align-items:center;gap:.6rem;font-size:.95rem;line-height:1.4}
  .nf-st i{flex:none;width:11px;height:11px;border-radius:50%;background:#e5646b}.nf-st.ok i{background:#2ecc71}.nf-st.av i{background:#f0b429}
  .nf-req{display:flex;align-items:flex-start;gap:.75rem;padding:.7rem .8rem;margin:.45rem 0;border:1px solid var(--line);border-radius:10px;cursor:pointer}
  .nf-req.on{border-color:var(--accent);background:rgba(46,204,113,.08)}
  .nf-req input{flex:none;width:18px;height:18px;margin:.15rem 0 0;padding:0}
  .nf-req span{flex:1;min-width:0;line-height:1.45;font-size:.95rem}
  .nf-req b{display:inline;font-size:1rem;margin:0}.nf-req small{display:block;margin-top:.1rem;color:var(--muted)}
  .nf-log{margin:0;padding:1rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:.85rem;line-height:1.55;max-height:70vh;overflow:auto}`;
  document.head.append(css);

  // ---------- Tela da gaveta Ferramentas ----------
  CFO.modules.autonf = Object.assign(body => {
    const reqs = () => CFO.store.get('requisicoes', []).slice().sort((a, b) => String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    let sel = null;
    body.innerHTML = `<div class="nf">
      <div class="nf-box"><h3>1) Agente no computador</h3>
        <div class="nf-st" id="st"><i></i><span>Verificando...</span></div>
        <div class="nf-row"><button id="ver" class="ghost">Verificar de novo</button><button id="tk" class="ghost">Colar token</button><button id="bx" class="ghost">⬇️ Baixar agente</button><button id="zr" class="ghost danger">🗑 Zerar</button></div></div>
      <div class="nf-box"><h3>2) Roteiro (passo a passo)</h3>
        <p>Escreva uma instrução por linha. Para repetir por produto, use <b>para cada produto</b> ... <b>fim</b>.</p>
        <p>Campos: <code>{data}</code> <code>{hora}</code> <code>{contrato}</code> <code>{contrato_nome}</code> <code>{nome}</code> <code>{requisicao}</code> e, dentro do bloco de produtos, <code>{produto}</code> <code>{quantidade}</code> <code>{tamanho}</code> <code>{codigo}</code>.</p>
        <details style="margin:.3rem 0 .8rem"><summary style="cursor:pointer;font-weight:600">📖 Comandos que o roteiro entende</summary>
          <p><b>Mouse:</b> <code>clicar em X,Y</code> <code>duplo clique em X,Y</code> <code>clique direito em X,Y</code> <code>mover mouse para X,Y</code> <code>rolar 3 para baixo</code></p>
          <p><b>Escrever:</b> <code>digitar qualquer texto e {campos}</code> (cola o texto) · <code>teclar texto</code> (letra por letra, para campo que não aceita colar)</p>
          <p><b>Teclas:</b> <code>tecla enter</code> <code>tecla tab 3 vezes</code> <code>atalho ctrl+s</code> · prontos: <code>fechar janela</code> <code>fechar aba</code> <code>nova aba</code> <code>voltar</code> <code>avancar</code> <code>atualizar</code> <code>selecionar tudo</code> <code>copiar</code> <code>colar</code> <code>salvar</code></p>
          <p><b>Programas e páginas:</b> <code>abrir "caminho do programa"</code> <code>abrir site "https://..."</code> <code>focar janela "Título"</code> <code>esperar janela "Título"</code> <code>esperar 2</code></p>
          <p><b>Seus próprios campos:</b> <code>definir numero = 123</code> · <code>perguntar "Qual o número?" em numero</code> (abre uma caixinha, você digita na hora, e depois usa <code>{numero}</code>)</p>
          <p><b>Decisões e repetições:</b> <code>se produto sem codigo</code> · <code>se {campo} vazio</code> · <code>se {campo} for "x"</code> · <code>se {campo} contem "x"</code> ... <code>senao</code> ... <code>fim se</code> · <code>para cada produto</code> ... <code>fim para cada</code> · <code>repetir 3 vezes</code> ... <code>fim</code></p>
          <p><b>Outros:</b> <code>avisar "faça tal coisa e clique OK"</code> (pausa até você clicar OK) · <code>ignorar erros</code> · <code>parar</code></p></details>
        <textarea id="rt" spellcheck="false" placeholder="Ligue o agente para carregar o roteiro"></textarea>
        <div class="nf-row"><button id="sv">💾 Salvar roteiro</button><button id="md" class="ghost">📄 Modelo da NF</button></div></div>
      <div class="nf-box"><h3>3) Preencher uma nota</h3>
        <input id="q" type="search" placeholder="Buscar nº, contrato ou solicitante...">
        <div id="lst" style="margin-top:.5rem"></div>
        <div class="nf-row"><button id="go" disabled>🤖 Preencher NF</button><button id="ts" class="ghost" disabled>🧪 Testar (sem clicar)</button></div>
        <p style="margin-top:.8rem">Faça sempre o teste antes: ele mostra todos os passos com os dados da requisição, sem mexer no mouse.</p></div></div>`;
    const $ = s => body.querySelector(s);
    const dizer = (cls, txt) => { const e = $('#st'); e.className = 'nf-st ' + cls; e.lastElementChild.textContent = txt; };
    async function status() {
      const on = await ligado();
      if (!on) return dizer('', 'Agente desligado. No computador da empresa, abra o iniciar.bat (use "Baixar agente" se ainda não tem).');
      if (await versao() < VMIN) return dizer('av', 'Agente ANTIGO aberto. Clique em "⬇️ Baixar agente", troque a pasta e abra o iniciar.bat de novo.');
      if (!token()) return dizer('av', 'Agente ligado, mas falta o token. Clique em "Colar token".');
      try { $('#rt').value = (await chamar('/roteiro')).texto; dizer('ok', 'Agente ligado e pronto.'); } catch (e) { dizer('av', e.message); }
    }
    $('#ver').onclick = status; $('#tk').onclick = async () => { if (pedeToken()) status(); }; $('#bx').onclick = baixarAgente;
    // Zerar: apaga o roteiro aprendido (no agente) e esquece o token deste navegador
    $('#zr').onclick = async () => {
      if (!confirm('ZERAR a automação?\n\nIsso apaga o roteiro (passo a passo) e esquece o token deste navegador.\nDepois você terá que escrever o roteiro de novo e colar o token outra vez.')) return;
      let msg = 'Token esquecido neste navegador.', roteiroApagado = false;
      if (token() && await ligado()) { try { await chamar('/roteiro', { texto: MODELO }); roteiroApagado = true; } catch (e) { msg += '\nNão consegui apagar o roteiro: ' + e.message; } }
      else msg += '\nO agente está desligado, então o roteiro NÃO foi apagado. Ligue o iniciar.bat e use Zerar de novo, ou apague o arquivo roteiro.txt na pasta do agente.';
      localStorage.removeItem(TK); $('#rt').value = roteiroApagado ? MODELO : '';
      dizer('av', 'Zerado. Cole o token para voltar a usar.'); alert((roteiroApagado ? 'Roteiro apagado. ' : '') + msg);
    };
    $('#sv').onclick = async () => { if (!await garante()) return; try { await chamar('/roteiro', { texto: $('#rt').value }); alert('Roteiro salvo. Vale para todas as requisições.'); } catch (e) { alert('Não salvei: ' + e.message); } };
    // Modelo simples da NF (abas, produto com/sem código, texto final)
    $('#md').onclick = () => { if ($('#rt').value.trim() && $('#rt').value.trim() !== MODELO.trim() && !confirm('Trocar o roteiro que está na tela pelo modelo da NF?\n\n(Só vale depois de clicar em Salvar roteiro.)')) return; $('#rt').value = MODELO_NF; $('#rt').focus(); };
    const lista = () => {
      const t = CFO.norm($('#q').value);
      const v = reqs().filter(r => !t || CFO.norm([r.id, r.contrato, r.contratoNome, r.sol].join(' ')).includes(t)).slice(0, 30);
      $('#lst').innerHTML = v.map(r => `<label class="nf-req${sel === r.id ? ' on' : ''}"><input type="radio" name="rq" value="${esc(r.id)}"${sel === r.id ? ' checked' : ''}><span><b>${esc(r.id)}</b> · Contrato ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<small>${esc(r.sol)} · ${esc(r.mes)}</small></span></label>`).join('') || '<p>Nenhuma requisição encontrada.</p>';
      $('#lst').querySelectorAll('input').forEach(i => i.onchange = () => { sel = i.value; $('#go').disabled = $('#ts').disabled = false; lista(); });
    };
    let tm = 0; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(lista, 200); };
    const atual = () => reqs().find(r => r.id === sel);
    $('#go').onclick = () => atual() && rodar(atual(), false); $('#ts').onclick = () => atual() && rodar(atual(), true);
    lista(); status();
  }, { cfg: { title: 'Automação de NF', hints: [] } });

  // ---------- Baixar o agente (pasta do agente em um .zip) ----------
  function baixarAgente() {
    const ir = () => CFO.baixarAgenteNF();
    if (CFO.baixarAgenteNF) return ir();
    const sc = document.createElement('script'); sc.src = 'automacao-nf-pacote.js?v=20261031c'; sc.onload = ir;
    sc.onerror = () => alert('Não achei o arquivo automacao-nf-pacote.js. Confira se ele foi enviado ao GitHub junto com os outros.');
    document.head.append(sc);
  }
  // Botão nos 3 pontos (menu do topo)
  { const m = document.querySelector('.topbtns'); if (m && !document.getElementById('nfdl')) { const x = document.createElement('button'); x.id = 'nfdl'; x.className = 'ghost'; x.textContent = '⬇️ Baixar agente NF'; x.onclick = baixarAgente; m.append(x); } }

  // Atalho dentro do detalhe da Requisição (sem editar requisicoes.js)
  const abrirOriginal = CFO.open;
  CFO.open = (title, render) => abrirOriginal(title, b => {
    render(b);
    try {
      const m = /^Requisição (.+)$/.exec(title), bar = b.querySelector('#prn') && b.querySelector('#prn').parentElement;
      if (!m || !bar || !CFO.pode('editar', 'requisicoes')) return;
      const r = CFO.store.get('requisicoes', []).find(x => x.id === m[1]); if (!r) return;
      const add = (txt, cls, fn) => { const x = document.createElement('button'); x.className = cls; x.textContent = txt; x.onclick = fn; bar.append(x); };
      add('🤖 Preencher NF', '', () => rodar(r, false)); add('🧪 Testar', 'ghost', () => rodar(r, true));
    } catch (e) { console.warn('automacao-nf', e); }
  });
})();
