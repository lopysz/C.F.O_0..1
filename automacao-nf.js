/* ===== Ferramentas > Automação de NF (autoclick) =====
   Tela própria em Ferramentas: liga ao agente local (agente-windows/agente.ps1 ou agente/agente_nf.py, em 127.0.0.1:8765), edita o roteiro
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
  const pedeToken = () => { const t = prompt('Cole o TOKEN que aparece na janela do agente:'); if (t) localStorage.setItem(TK, t.trim()); return !!token(); };
  const garante = async () => {
    if (!await ligado()) { alert('O agente não está ligado neste computador.\nAbra o "iniciar.bat" (pasta agente-windows) e tente de novo.'); return false; }
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
        <div class="nf-row"><button id="ver" class="ghost">Verificar de novo</button><button id="tk" class="ghost">Colar token</button><button id="bx" class="ghost">⬇️ Baixar agente</button></div></div>
      <div class="nf-box"><h3>2) Roteiro (passo a passo)</h3>
        <p>Escreva uma instrução por linha. Para repetir por produto, use <b>para cada produto</b> ... <b>fim</b>.</p>
        <p>Campos: <code>{contrato}</code> <code>{nome}</code> <code>{requisicao}</code> e, dentro do bloco de produtos, <code>{produto}</code> <code>{quantidade}</code> <code>{tamanho}</code> <code>{codigo}</code>.</p>
        <p>Passos: <code>focar janela "Título"</code> <code>esperar 2</code> <code>clicar em X,Y</code> <code>duplo clique em X,Y</code> <code>digitar ...</code> <code>tecla tab</code> <code>tecla enter</code> <code>atalho ctrl+s</code></p>
        <textarea id="rt" spellcheck="false" placeholder="Ligue o agente para carregar o roteiro"></textarea>
        <div class="nf-row"><button id="sv">💾 Salvar roteiro</button></div></div>
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
      if (!token()) return dizer('av', 'Agente ligado, mas falta o token. Clique em "Colar token".');
      try { $('#rt').value = (await chamar('/roteiro')).texto; dizer('ok', 'Agente ligado e pronto.'); } catch (e) { dizer('av', e.message); }
    }
    $('#ver').onclick = status; $('#tk').onclick = async () => { if (pedeToken()) status(); }; $('#bx').onclick = baixarAgente;
    $('#sv').onclick = async () => { if (!await garante()) return; try { await chamar('/roteiro', { texto: $('#rt').value }); alert('Roteiro salvo. Vale para todas as requisições.'); } catch (e) { alert('Não salvei: ' + e.message); } };
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
    const sc = document.createElement('script'); sc.src = 'automacao-nf-pacote.js?v=20261031a'; sc.onload = ir;
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
