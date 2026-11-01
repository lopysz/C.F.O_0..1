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
      b.innerHTML = '<div class="bar"><button id="p" class="ghost danger">⏹ Parar</button></div><pre class="log" id="l" style="white-space:pre-wrap"></pre>';
      const p = b.querySelector('#p'); p.onclick = () => chamar('/parar', {}).catch(() => {}); acompanhar(b.querySelector('#l'), p);
    });
  }

  // ---------- Tela da gaveta Ferramentas ----------
  CFO.modules.autonf = Object.assign(body => {
    const reqs = () => CFO.store.get('requisicoes', []).slice().sort((a, b) => String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    let sel = null;
    body.innerHTML = `
      <div class="card" style="margin-bottom:1rem"><b>1) Agente no computador</b>
        <p class="log" id="st">Verificando...</p>
        <div class="bar"><button id="ver" class="ghost">Verificar de novo</button><button id="tk" class="ghost">Colar token</button></div></div>
      <div class="card" style="margin-bottom:1rem"><b>2) Roteiro (passo a passo)</b>
        <p class="log">Uma instrução por linha. Campos: <b>{contrato}</b> <b>{nome}</b> e, dentro de <b>para cada produto … fim</b>: <b>{produto}</b> <b>{quantidade}</b> <b>{tamanho}</b> <b>{codigo}</b>.<br>
        Passos: <i>focar janela "Título" · esperar 2 · clicar em X,Y · digitar … · tecla tab/enter · atalho ctrl+s</i></p>
        <textarea id="rt" spellcheck="false" style="width:100%;min-height:40vh;font-family:monospace;font-size:13px" placeholder="Ligue o agente para carregar o roteiro"></textarea>
        <div class="bar" style="margin-top:.6rem"><button id="sv">💾 Salvar roteiro</button></div></div>
      <div class="card"><b>3) Preencher uma nota</b>
        <div class="bar" style="margin-top:.6rem"><input id="q" type="search" placeholder="Buscar nº, contrato ou solicitante..."></div>
        <div id="lst"></div>
        <div class="bar" style="margin-top:.6rem"><button id="go" disabled>🤖 Preencher NF</button><button id="ts" class="ghost" disabled>🧪 Testar (sem clicar)</button></div>
        <p class="log">Testar mostra todos os passos com os dados da requisição, sem mexer no mouse. Faça sempre antes.</p></div>`;
    const $ = s => body.querySelector(s);
    async function status() {
      const on = await ligado(); let txt;
      if (!on) txt = '○ Agente desligado. Abra o iniciar.bat no computador da empresa.';
      else if (!token()) txt = '● Agente ligado, mas falta o token. Clique em "Colar token".';
      else txt = '● Agente ligado e pronto.';
      $('#st').textContent = txt;
      if (on && token()) { try { $('#rt').value = (await chamar('/roteiro')).texto; } catch (e) { $('#st').textContent = e.message; } }
    }
    $('#ver').onclick = status; $('#tk').onclick = async () => { if (pedeToken()) status(); };
    $('#sv').onclick = async () => { if (!await garante()) return; try { await chamar('/roteiro', { texto: $('#rt').value }); alert('Roteiro salvo. Vale para todas as requisições.'); } catch (e) { alert('Não salvei: ' + e.message); } };
    const lista = () => {
      const t = CFO.norm($('#q').value);
      const v = reqs().filter(r => !t || CFO.norm([r.id, r.contrato, r.contratoNome, r.sol].join(' ')).includes(t)).slice(0, 30);
      $('#lst').innerHTML = v.map(r => `<label class="foto rq" style="cursor:pointer"><input type="radio" name="rq" value="${esc(r.id)}"${sel === r.id ? ' checked' : ''}> <span class="rqtxt"><b>${esc(r.id)}</b> · Contrato ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<br><small>${esc(r.sol)} · ${esc(r.mes)}</small></span></label>`).join('') || '<p class="empty">Nenhuma requisição.</p>';
      $('#lst').querySelectorAll('input').forEach(i => i.onchange = () => { sel = i.value; $('#go').disabled = $('#ts').disabled = false; });
    };
    let tm = 0; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(lista, 200); };
    const atual = () => reqs().find(r => r.id === sel);
    $('#go').onclick = () => atual() && rodar(atual(), false); $('#ts').onclick = () => atual() && rodar(atual(), true);
    lista(); status();
  }, { cfg: { title: 'Automação de NF', hints: [] } });

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
