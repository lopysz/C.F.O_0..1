/* ===== Registros (menu dos três pontinhos) =====
   Guarda quem mexeu em quê (perfil logado + o que mudou). Os registros com mais de 7 dias são apagados sozinhos,
   para a base não ficar pesada. Chave 'registros' = [{ t: quando, u: login, n: nome, p: perfil, a: área, d: descrição }].
   Funciona "ouvindo" toda gravação do sistema (CFO.store.set): por isso este arquivo carrega depois dos de sincronização. */
(() => {
  const K = 'registros', DIAS = 7, MAX = 600, esc = CFO.esc;
  const AREAS = { epi: 'Planilha EPI', contratos: 'Contratos', requisicoes: 'Requisições', mapa: 'Mapa almoxarifado', mapalivre: 'Mapa livre', 'epi:mov': 'Movimentação de EPI', 'epi:min': 'Estoque mínimo',
    contagens: 'Contagem de estoque', 'contagem:rascunho': 'Contagem de estoque', req_negadas: 'Requisições (negadas)', req_retiradas: 'Requisições (retiradas)', perfis: 'Perfis e permissões', 'mensal:cfg': 'Controle mensal', 'mensal:comprov': 'Controle mensal', drive: 'Importação', drive_link: 'Importação', mapeamentos: 'Importação (colunas lembradas)', rotulos: 'Funções do menu' };
  const IGNORAR = new Set([K, 'wl:auto', 'contagem:rascunho', 'cfo_aparelho']);
  const poda = l => (Array.isArray(l) ? l : []).filter(e => e && e.t >= Date.now() - DIAS * 864e5).slice(-MAX);
  const cur = (s, n = 38) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const nomeDe = x => x && typeof x === 'object' ? (x.item || x.nome || x.num || x.req || x.id || '?') : String(x);

  // Descreve o que mudou entre duas versões de um dado
  const descrever = (k, a, b) => {
    if (k === 'epi:mov') {                                                     // lançamentos novos de entrada/saída
      const novos = (b || []).slice((a || []).length); if (!novos.length) return '';
      return novos.slice(0, 3).map(m => `${m.tipo} de ${m.qtd} × ${cur(m.item)}`).join('; ') + (novos.length > 3 ? ` e mais ${novos.length - 3}` : '');
    }
    if (Array.isArray(b) && (b.length ? b[0] && typeof b[0] === 'object' && 'id' in b[0] : Array.isArray(a))) {
      const A = new Map((a || []).filter(x => x && x.id !== undefined).map(x => [x.id, x])), B = new Map(b.filter(x => x && x.id !== undefined).map(x => [x.id, x]));
      const add = [...B.keys()].filter(i => !A.has(i)), del = [...A.keys()].filter(i => !B.has(i)), alt = [...B.keys()].filter(i => A.has(i) && JSON.stringify(A.get(i)) !== JSON.stringify(B.get(i)));
      const p = [];
      if (add.length) p.push(`${add.length} adicionado(s): ${add.slice(0, 3).map(i => cur(nomeDe(B.get(i)))).join(', ')}${add.length > 3 ? '…' : ''}`);
      if (del.length) p.push(`${del.length} removido(s): ${del.slice(0, 3).map(i => cur(nomeDe(A.get(i)))).join(', ')}${del.length > 3 ? '…' : ''}`);
      if (alt.length) p.push(`${alt.length} alterado(s): ` + alt.slice(0, 3).map(i => {
        const x = A.get(i), y = B.get(i), f = Object.keys(y).filter(c => typeof y[c] !== 'object' && JSON.stringify(x[c]) !== JSON.stringify(y[c])).slice(0, 2);
        return cur(nomeDe(y)) + (f.length ? ` (${f.map(c => `${c}: ${cur(x[c], 14)} → ${cur(y[c], 14)}`).join(', ')})` : '');
      }).join('; ') + (alt.length > 3 ? '…' : ''));
      return p.join(' · ');
    }
    if (k === 'mapa') {
      const la = (a && a.locais || []).length, lb = (b && b.locais || []).length, lay = JSON.stringify(a && a.layout) !== JSON.stringify(b && b.layout);
      return [la !== lb ? `locais de itens: ${la} → ${lb}` : (JSON.stringify(a && a.locais) !== JSON.stringify(b && b.locais) ? 'locais de itens alterados' : ''), lay ? 'desenho (layout) alterado' : ''].filter(Boolean).join(' · ');
    }
    if (k === 'epi:min' && b && typeof b === 'object') {
      const ch = Object.keys({ ...a, ...b }).filter(c => (a || {})[c] !== b[c]);
      return ch.length ? `mínimo ajustado em ${ch.length} item(ns)` : '';
    }
    if (k === 'req_negadas' || k === 'req_retiradas') {                       // { 'RQ-1': data }: marcou / desmarcou
      const x = Object.keys(b || {}), y = Object.keys(a || {}), on = x.filter(i => !y.includes(i)), off = y.filter(i => !x.includes(i)), t = k === 'req_negadas' ? 'negada' : 'retirada';
      return [on.length ? `marcou como ${t}: ${on.slice(0, 4).join(', ')}${on.length > 4 ? '…' : ''}` : '', off.length ? `desmarcou ${t}: ${off.slice(0, 4).join(', ')}${off.length > 4 ? '…' : ''}` : ''].filter(Boolean).join(' · ');
    }
    if (k === 'perfis') {
      const n = o => Object.values((o && o.novos) || {}).map(x => x.nome), ex = o => (o && o.excluidos) || [];
      const add = n(b).filter(i => !n(a).includes(i)), del = ex(b).filter(i => !ex(a).includes(i)), pm = JSON.stringify((a && a.perms) || {}) !== JSON.stringify((b && b.perms) || {});
      return [add.length ? `criou o perfil ${add.join(', ')}` : '', del.length ? `excluiu o perfil ${del.join(', ')}` : '', pm ? 'permissões de perfil alteradas' : ''].filter(Boolean).join(' · ') || 'perfis alterados';
    }
    return 'dados alterados';
  };

  const registra = (k, antes, depois, u) => {
    const d = descrever(k, antes, depois); if (!d) return;
    const log = poda(CFO.store.get(K, [])); log.push({ t: Date.now(), u: u.id, n: u.nome, p: u.perfil, a: AREAS[k] || k, d });
    CFO.store.set(K, log);
  };

  const prev = CFO.store.set;
  CFO.store.set = (k, v) => {
    if (IGNORAR.has(k) || CFO.espaco) return prev(k, v);       // setor isolado não tem tela de Registros: não gasta tempo nem espaço guardando histórico
    let antes = null; try { antes = CFO.store.get(k, null); } catch {}
    prev(k, v);
    try { const u = CFO.usuario && CFO.usuario(); if (u && JSON.stringify(antes) !== JSON.stringify(v)) registra(k, antes, v, u); } catch (e) { console.warn('registros', e); }
  };

  // Limpeza automática: ao abrir o sistema e a cada hora
  const limpar = () => { const l = CFO.store.get(K, null); if (!Array.isArray(l)) return; const n = poda(l); if (n.length !== l.length) CFO.store.set(K, n); };
  limpar(); setInterval(limpar, 3600e3);

  CFO.modules.registros = body => {
    let quem = '';
    const dia = t => { const d = new Date(t), h = new Date(), ont = new Date(); ont.setDate(h.getDate() - 1); const s = x => x.toDateString();
      return s(d) === s(h) ? 'Hoje' : s(d) === s(ont) ? 'Ontem' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }); };
    function draw() {
      limpar();
      const todos = poda(CFO.store.get(K, [])).sort((a, b) => b.t - a.t), lista = todos.filter(e => !quem || CFO.norm(e.n) === quem);
      const grupos = []; lista.forEach(e => { const g = dia(e.t), x = grupos[grupos.length - 1]; (x && x.g === g ? x : grupos[grupos.push({ g, l: [] }) - 1]).l.push(e); });
      body.innerHTML = `<div class="bar"><select id="rq" aria-label="Perfil"><option value="">Todos os perfis</option>${CFO.perfis().map(u => `<option value="${esc(u.chave)}"${u.chave === quem ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <p class="log" style="margin-top:0">Mostra o que cada perfil modificou. Registros com mais de ${DIAS} dias são apagados automaticamente. ${lista.length} registro(s).</p>
        ${grupos.map(g => `<div class="rg-dia"><h4>${esc(g.g)}</h4>${g.l.map(e => `<div class="rg-it"><span class="rg-h">${new Date(e.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <div><b>${esc(e.n)}</b> <span class="tag">${esc(e.p)}</span> <span class="rg-a">${esc(e.a)}</span><div class="rg-d">${esc(e.d)}</div></div></div>`).join('')}</div>`).join('') || '<p class="empty">Nenhuma modificação registrada nos últimos 7 dias.</p>'}`;
      body.querySelector('#rq').onchange = e => { quem = e.target.value; draw(); };
    }
    draw();
  };
})();
