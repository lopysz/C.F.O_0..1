/* ===== Início > Painel gerencial =====
   Quatro telinhas no topo do Início:
   1) Aguardando retirada  - requisições já separadas (Foto de Separação) que ainda não foram retiradas; o quadradinho dá baixa
   2) Gasto do mês         - soma do valor aprovado das requisições do mês atual (atualiza sozinho quando chega requisição)
   3) Estoque              - os 5 itens com mais e os 5 com menos unidades na Planilha EPI
   4) Últimas requisições  - as 3 mais recentes; quando chega uma nova, ela entra por cima e as outras descem
   Os dados vêm de CFO.store ('requisicoes', 'epi') e do banco de fotos (CFO.db 'fotos'): nada novo para configurar. */
(() => {
  const esc = CFO.esc, P = CFO.periodo, norm = CFO.norm;
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const total = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0);
  const LS = 'cfo_painel_ult';           // últimas 3 já mostradas neste aparelho (só para saber quando animar)
  let host = null, abrir = () => {}, sujo = false, timer = null, token = 0;

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
      return `<label class="pg-r" data-ids="${esc(x.ids.join(','))}"><span class="pg-n"><b>${esc(x.req)}</b>${x.sol ? ' - ' + esc(x.sol) : ''}</span>
        <small class="${atraso ? 'late' : ''}">${idade(x.ts)}</small><input type="checkbox" aria-label="Marcar ${esc(x.req)} como retirada"></label>`;
    }).join('');
    return tile('pg-sep', 'Aguardando retirada', (lista.length ? `<span class="pg-c">${lista.length}</span>` : '') + acao('fotos', 'Fotos'),
      rows ? `<div class="pg-list">${rows}</div>` : '<p class="pg-vazio">Nenhuma requisição aguardando retirada.</p>');
  }

  /* 2) Gasto do mês */
  function gastoHtml(reqs) {
    const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear(), pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    const doMes = (mm, yy) => reqs.filter(r => { const p = P.parse(r.mes); return p && p.m === mm && p.y === yy; });
    const atual = doMes(m, y), ant = doMes(pm, py), v = atual.reduce((a, r) => a + total(r), 0), va = ant.reduce((a, r) => a + total(r), 0);
    const dif = va ? (v - va) / va : null;
    const cmp = dif === null ? '<span>sem mês anterior para comparar</span>'
      : `<span>${dif > 0 ? '▲' : dif < 0 ? '▼' : '='} ${(Math.abs(dif) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% vs ${P.NOMES[pm - 1].slice(0, 3).toLowerCase()}</span>`;
    return tile('pg-gasto', 'Gasto do mês', acao('controle_gastos', 'Detalhes'),
      `<div class="pg-big">${R$(v)}</div><div class="pg-meta"><span>${P.NOMES[m - 1]}/${y}</span><span>${atual.length} requisição(ões)</span>${cmp}</div>`);
  }

  /* 3) Estoque: mais e menos - só itens que têm saída nas requisições (item parado, sem saída, não entra) */
  function estoqueHtml(reqs) {
    const epi = CFO.store.get('epi', []).filter(r => r.item), achar = CFO.casarEpi(epi), saem = new Set();
    reqs.forEach(q => q.itens.forEach(i => { if (i.qa > 0) { const r = achar(i.item); if (r) saem.add(r.id); } }));
    const rows = epi.filter(r => saem.has(r.id)).map(r => ({ nome: r.item, q: +r.qtd || 0 }));
    if (!rows.length) return tile('pg-est', 'Estoque', acao('epi', 'Planilha'), '<p class="pg-vazio">Sem itens com saída nas requisições.</p>');
    const n = Math.min(3, Math.ceil(rows.length / 2)), mais = [...rows].sort((a, b) => b.q - a.q).slice(0, n), usados = new Set(mais);
    const menos = rows.filter(r => !usados.has(r)).sort((a, b) => a.q - b.q).slice(0, n);
    const col = (cls, tit, l) => `<div class="pg-col ${cls}"><h4>${tit}</h4>${l.map(r => `<div class="pg-s${r.q <= 0 ? ' zero' : ''}"><span title="${esc(r.nome)}">${esc(r.nome)}</span><b>${N(r.q)}</b></div>`).join('')}</div>`;
    return tile('pg-est', 'Estoque', acao('epi', 'Planilha'), `<div class="pg-st">${col('mais', '▲ Mais', mais)}${col('menos', '▼ Menos', menos)}</div>`);
  }

  /* 4) Últimas 3 requisições (a nova entra por cima, as outras descem e a 3ª sai) */
  const ordem = (a, b) => (b.chegou || '').localeCompare(a.chegou || '') || P.key(b.mes) - P.key(a.mes) || numCmp(b.id, a.id);
  function ultHtml(reqs) {
    const top = [...reqs].sort(ordem).slice(0, 3), ids = top.map(r => r.id);
    let prev = []; try { prev = JSON.parse(localStorage.getItem(LS)) || []; } catch {}
    const muda = prev.length && prev.join('|') !== ids.join('|');
    try { localStorage.setItem(LS, JSON.stringify(ids)); } catch {}
    const row = (r, cls = '') => `<div class="pg-u ${cls}"><div><b>#${esc(r.id)}</b><span>${esc(r.sol || '-')}</span></div>
      <small>${r.contrato ? 'Contrato ' + esc(r.contrato) + ' · ' : ''}${R$(total(r))}${r.chegou ? ' · ' + idade(r.chegou) : ''}</small></div>`;
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
    host.innerHTML = `<div class="pg-grid">${sepHtml(fotos, reqs)}${CFO.pode('abrir', 'controle_gastos') ? gastoHtml(reqs) : '<section class="pg-t"></section>'}${estoqueHtml(reqs)}${ultHtml(reqs)}</div>`;
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
    if (CFO.screens.length) { sujo = true; return; }
    sujo = false; clearTimeout(timer); timer = setTimeout(desenhar, 60);
  }

  CFO.painel = {
    montar(el, irPara) { host = el; abrir = irPara; desenhar(); },
    atualizar, aoMudarTela() { if (!CFO.screens.length && host) { sujo = false; atualizar(); } }
  };

  // Atualiza quando chega requisição/estoque novo (gravação local, nuvem ou WL) e a cada minuto (horários "há x min")
  const grava = CFO.store.set;
  CFO.store.set = (k, v) => { grava(k, v); if (k === 'requisicoes' || k === 'epi') atualizar(); };
  document.addEventListener('cfo-sync', atualizar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizar(); });
  setInterval(() => { if (!document.hidden) atualizar(); }, 60000);
})();
