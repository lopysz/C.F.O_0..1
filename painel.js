/* ===== Início > Painel gerencial =====
   Duas divisórias no topo do Início:
   1) Aguardando retirada  - requisições já separadas (Foto de Separação) que ainda não foram retiradas; o quadradinho dá baixa
   2) Últimas requisições  - as 3 mais recentes; quando chega uma nova, ela entra por cima e as outras descem
   Os dados vêm de CFO.store ('requisicoes', 'epi') e do banco de fotos (CFO.db 'fotos'): nada novo para configurar. */
(() => {
  const esc = CFO.esc, P = CFO.periodo, norm = CFO.norm;
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const total = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0);
  const LS = 'cfo_painel_ult';           // últimas 3 já mostradas neste aparelho (só para saber quando animar)
  let host = null, abrir = () => {}, timer = null, token = 0;

  const idade = iso => {
    const m = (Date.now() - new Date(iso)) / 60000;
    if (!(m >= 0)) return '';
    return m < 1 ? 'agora' : m < 60 ? `há ${Math.floor(m)} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} d`;
  };
  const dias = iso => (Date.now() - new Date(iso)) / 864e5;
  const acao = (m, txt) => CFO.pode('abrir', m) ? `<button class="pg-a" data-go="${m}">${txt}</button>` : '';
  const tile = (cls, titulo, extra, corpo) => `<section class="pg-t ${cls}"><header><h3>${titulo}</h3>${extra || ''}</header>${corpo}</section>`;

  /* 1) Aguardando retirada */
  function sepHtml(fotos, reqs) {
    const sol = new Map(reqs.map(r => [norm(r.id), r.sol]));
    const g = new Map();
    fotos.filter(f => !f.ret && f.req && f.req.trim()).forEach(f => {
      const k = norm(f.req), x = g.get(k) || { req: f.req.trim(), sol: '', ts: f.ts, ids: [] };
      x.sol = x.sol || f.sol || sol.get(k) || ''; x.ids.push(f.id); if (f.ts < x.ts) x.ts = f.ts; g.set(k, x);
    });
    const lista = [...g.values()].sort((a, b) => a.ts.localeCompare(b.ts));      // quem espera há mais tempo fica em cima
    const rows = lista.map(x => {
      const atraso = dias(x.ts) >= 5;                                              // prazo de retirada do relatório: 5 dias
      return `<div class="pg-r" data-ids="${esc(x.ids.join(','))}"><span class="pg-n"><b>${esc(x.req)}</b>${x.sol ? ' - ' + esc(x.sol) : ''}</span>
        <small class="${atraso ? 'late' : ''}">${idade(x.ts)}</small><input type="checkbox" aria-label="Marcar ${esc(x.req)} como retirada"></div>`;
    }).join('');
    return tile('pg-sep', 'Aguardando retirada', (lista.length ? `<span class="pg-c">${lista.length}</span>` : '') + acao('fotos', 'Fotos'),
      rows ? `<div class="pg-list">${rows}</div>` : '<p class="pg-vazio">Nenhuma requisição aguardando retirada.</p>');
  }

  /* 4) Últimas 3 requisições (a nova entra por cima, as outras descem e a 3ª sai) */
  const ordem = (a, b) => numCmp(b.id, a.id);   // pelo número da requisição (RQ maior = mais recente), não pela data em que entrou no sistema
  function ultHtml(reqs) {
    const top = [...reqs].sort(ordem).slice(0, 3), ids = top.map(r => r.id);
    let prev = []; try { prev = JSON.parse(localStorage.getItem(LS)) || []; } catch {}
    const muda = prev.length && prev.join('|') !== ids.join('|');
    try { localStorage.setItem(LS, JSON.stringify(ids)); } catch {}
    const row = (r, cls = '') => `<div class="pg-u ${cls}"><div><b>#${esc(r.id)}</b><span>${esc(r.sol || '-')}</span></div>
      <small>${r.contrato ? 'Contrato ' + esc(r.contrato) : ''}${r.contrato && r.chegou ? ' · ' : ''}<span class="pg-v">${r.contrato && !r.chegou ? ' · ' : ''}${R$(total(r))}${r.chegou ? ' · ' : ''}</span>${r.chegou ? idade(r.chegou) : ''}</small></div>`;
    const html = top.map((r, i) => { const j = prev.indexOf(r.id); return row(r, !muda ? '' : j < 0 ? 'ent' : j < i ? 'desc' : ''); }).join('');
    const saiu = muda ? prev.filter(id => !ids.includes(id)).map(id => reqs.find(r => r.id === id)).filter(Boolean)[0] : null;
    return tile('pg-ult', 'Últimas requisições', acao('requisicoes', 'Ver todas'),
      html ? `<div class="pg-stack">${html}${saiu ? row(saiu, 'ghost') : ''}</div>` : '<p class="pg-vazio">Nenhuma requisição ainda.</p>');
  }

  /* Montagem */
  async function desenhar() {
    if (!host || !host.isConnected) return;
    const eu = ++token;
    let fotos = []; try { fotos = await CFO.db.all('fotos'); } catch {}
    if (eu !== token || !host.isConnected) return;
    const reqs = CFO.store.get('requisicoes', []).filter(r => r && r.itens);
    const rolou = host.querySelector('.pg-list')?.scrollTop || 0;       // mantém a rolagem da lista ao redesenhar
    host.innerHTML = `<div class="pg-grid">${sepHtml(fotos, reqs)}${ultHtml(reqs)}</div>`;
    const lista = host.querySelector('.pg-list'); if (lista) lista.scrollTop = rolou;
    host.querySelectorAll('.pg-a').forEach(b => b.onclick = () => abrir(b.dataset.go));
    host.querySelectorAll('.pg-r input').forEach(c => c.onchange = async () => {
      const row = c.closest('.pg-r'), ids = row.dataset.ids.split(',');
      row.classList.add('sai');
      await new Promise(r => setTimeout(r, 260));
      try {
        const agora = new Date().toISOString();
        for (const f of await CFO.db.all('fotos')) if (ids.includes(f.id)) { f.ret = true; f.retTs = agora; await CFO.db.put('fotos', f); }
      } catch {}
      desenhar();
    });
  }

  // Redesenha só quando o Início está visível (com telas abertas, deixa para quando fechar)
  function atualizar() {
    if (!host) return;
    if (CFO.screens.length) return;
    clearTimeout(timer); timer = setTimeout(desenhar, 60);
  }

  CFO.painel = {
    montar(el, irPara) { host = el; abrir = irPara; desenhar(); },
    atualizar, aoMudarTela() { if (!CFO.screens.length && host) atualizar(); }
  };

  // Atualiza quando chega requisição/estoque novo (gravação local, nuvem ou WL) e a cada minuto (horários "há x min")
  const grava = CFO.store.set;
  CFO.store.set = (k, v) => { grava(k, v); if (k === 'requisicoes' || k === 'epi') atualizar(); };
  document.addEventListener('cfo-sync', atualizar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(); });
  setInterval(() => { if (!document.hidden) atualizar(); }, 60000);
})();
