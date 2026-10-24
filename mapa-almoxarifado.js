/* ===== Ferramentas > Mapa almoxarifado =====
   Mapa do almoxarifado: pesquise um item e veja em que corredor, fileira, prateleira e andar ele está.
   Engrenagem ⚙️ = modo configurar: toque numa prateleira e escolha os itens de cada andar (ou use "Definir local" no resultado da busca).
   O desenho do almoxarifado (fileiras, corredores, nº de prateleiras e andares) também se ajusta na engrenagem.
   Os itens vêm da Planilha EPI. Dados no localStorage, chave 'mapa': { layout: [...], locais: [...] }. */

CFO.modules.mapa = body => {
  const esc = CFO.esc, K = 'mapa';
  const nrm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Desenho padrão (planilha do almoxarifado): 7 fileiras de 25 prateleiras (5 em 5), 5 andares, 3 corredores
  const padrao = () => {
    let nf = 0, nc = 0;
    return { layout: ['f', 'c', 'f', 'f', 'c', 'f', 'f', 'c', 'f', 'f'].map(t => t === 'f' ? { id: 'f' + (++nf), t, nome: 'Fileira ' + nf, p: 25, a: 5 } : { id: 'c' + (++nc), t, nome: 'Corredor ' + nc }), locais: [] };
  };
  let D = CFO.store.get(K, null);
  if (!D || !Array.isArray(D.layout) || !D.layout.length) D = padrao();
  if (!Array.isArray(D.locais)) D.locais = [];
  const salvar = () => CFO.store.set(K, D);

  let q = '', semLocal = false, edit = false, foco = null, sel = null;
  const rows = () => CFO.store.get('epi', []);
  const rowOf = rid => rows().find(r => r.id === rid);
  const fil = id => D.layout.find(x => x.id === id && x.t === 'f');
  const nomeDe = l => { const r = rowOf(l.rid); return r ? r.item : (l.nome || '(item removido)'); };
  const at = (f, p) => D.locais.filter(l => l.f === f && l.p === p);
  const doItem = rid => D.locais.filter(l => l.rid === rid && fil(l.f));
  // Corredor que atende a fileira: o vizinho direto; se não houver, o mais próximo
  const corredorDe = id => {
    const L = D.layout, i = L.findIndex(x => x.id === id); if (i < 0) return null;
    for (let d = 1; d < L.length; d++) for (const j of [i - d, i + d]) if (L[j] && L[j].t === 'c') return L[j];
    return null;
  };
  const textoLocal = l => { const f = fil(l.f), c = f && corredorDe(f.id); return f ? `${c ? c.nome + ' · ' : ''}${f.nome} · Prateleira ${l.p} · Andar ${l.a}` : 'local removido'; };

  body.style.maxWidth = '1280px';
  body.innerHTML = `<details class="sobre"><summary>ℹ️ Para que serve esta tela</summary><p><b>Mapa almoxarifado</b> mostra onde cada item está guardado: digite o nome ou o código e o mapa destaca a prateleira, com o <b>corredor</b>, a <b>fileira</b>, a <b>prateleira</b> e o <b>andar</b>. Toque na <b>⚙️ engrenagem</b> para configurar: toque numa prateleira e escolha os itens de cada andar, ou use <b>Definir local</b> no resultado da busca. Em <b>Layout</b> você muda o desenho (fileiras, corredores, prateleiras e andares).</p></details>
    <div class="bar mp-bar"><input id="mq" type="search" placeholder="🔎 Pesquisar item ou código..." autocomplete="off"><button id="mg" class="ghost" aria-label="Configurar" title="Configurar o mapa">⚙️</button></div>
    <div id="mp-info"></div><div id="mp-out"></div><datalist id="mp-dl"></datalist>`;
  const $ = s => body.querySelector(s);

  /* ---------- Busca ---------- */
  const resultados = () => {
    const todos = rows(), palavras = nrm(q).split(/\s+/).filter(Boolean);
    if (semLocal) return todos.filter(r => !doItem(r.id).length).slice(0, 200);
    if (!palavras.length) return [];
    return todos.filter(r => { const t = nrm(r.item + ' ' + (r.codigo || '')); return palavras.every(w => t.includes(w)); }).slice(0, 40);
  };
  const resHTML = () => {
    const rs = resultados(), todos = rows();
    if (semLocal) { if (!rs.length) return '<p class="empty">Todos os itens da Planilha EPI já têm local.</p>'; }
    else if (!nrm(q).trim()) return todos.length ? '' : '<p class="empty">A Planilha EPI está vazia. Cadastre ou importe os itens em Almoxarifado Operacional > Planilha EPI.</p>';
    else if (!rs.length) return '<p class="empty">Nenhum item encontrado.</p>';
    return `<div class="mp-res">${rs.map(r => { const ls = doItem(r.id);
      return `<div class="mp-it${r.id === foco ? ' on' : ''}" data-rid="${esc(r.id)}"><div class="mp-t"><b>${esc(r.item)}</b><small>${r.codigo ? esc(r.codigo) + ' · ' : ''}estoque ${r.qtd ?? '-'}</small></div>
        <div class="mp-ls">${ls.map(l => `<button class="mp-loc" data-l="${l.id}">📍 ${esc(textoLocal(l))}</button>`).join('') || '<small class="mut">sem local definido</small>'}<button class="ghost mp-def" data-def="${esc(r.id)}">+ local</button></div></div>`; }).join('')}</div>`;
  };

  /* ---------- Mapa ---------- */
  const hitAndares = (f, p) => foco ? D.locais.filter(l => l.rid === foco && l.f === f && l.p === p).map(l => l.a) : [];
  const mapaHTML = () => `<div class="mp-map">${D.layout.map(r => r.t === 'c'
    ? `<div class="mp-cor">${esc(r.nome)}</div>`
    : `<div class="mp-fil"><div class="mp-grade"><span class="mp-nome" title="${esc(r.nome)}">${esc(r.nome)}</span>${Array.from({ length: r.p }, (_, i) => {
        const p = i + 1, n = at(r.id, p).length, h = hitAndares(r.id, p);
        return `<button class="mp-c${n ? ' has' : ''}${h.length ? ' hit' : ''}${sel && sel.f === r.id && sel.p === p ? ' sel' : ''}${p % 5 === 0 && p < r.p ? ' gap' : ''}" data-f="${r.id}" data-p="${p}" title="${esc(r.nome)} · prateleira ${p}${n ? ' · ' + n + ' item(ns)' : ''}">${p}${h.length ? `<i>A${h.join(',')}</i>` : ''}</button>`;
      }).join('')}</div></div>`).join('')}</div>
    <p class="mp-leg"><span class="lg c1"></span> prateleira vazia <span class="lg c2"></span> com itens <span class="lg c3"></span> item procurado <span class="lg c4"></span> corredor</p>`;

  /* ---------- Painel da prateleira (andares) ---------- */
  const painelHTML = () => {
    if (!sel) return ''; const f = fil(sel.f); if (!f) return '';
    const c = corredorDe(f.id);
    return `<section class="mp-pn"><header><b>${esc(c ? c.nome + ' · ' : '')}${esc(f.nome)} · Prateleira ${sel.p}</b><button class="ghost" data-x="1" aria-label="Fechar">✕</button></header>
      ${Array.from({ length: f.a }, (_, i) => f.a - i).map(a => { const its = D.locais.filter(l => l.f === f.id && l.p === sel.p && l.a === a);
        return `<div class="mp-and${its.some(l => l.rid === foco) ? ' hit' : ''}"><span class="mp-an">Andar ${a}</span>
          <div class="mp-its">${its.map(l => `<span class="mp-chip${l.rid === foco ? ' hit' : ''}">${esc(nomeDe(l))}${edit ? ` <button class="x" data-del="${l.id}" aria-label="Remover">✕</button>` : ''}</span>`).join('') || '<small class="mut">vazio</small>'}</div>
          ${edit ? `<div class="mp-add"><input list="mp-dl" data-in="${a}" placeholder="Adicionar item..."><button data-ad="${a}">+</button></div>` : ''}</div>`; }).join('')}
      ${edit ? '' : '<p class="log">Para trocar os itens desta prateleira, toque na ⚙️.</p>'}</section>`;
  };

  function desenhar() {
    $('#mg').classList.toggle('on', edit);
    const com = new Set(D.locais.filter(l => fil(l.f)).map(l => l.rid)), todos = rows();
    const sem = todos.filter(r => !com.has(r.id)).length;
    $('#mp-info').innerHTML = (edit ? `<div class="mp-edit"><span>⚙️ Modo configurar: toque numa prateleira para escolher os itens de cada andar.</span><button class="ghost" id="ml">Layout</button></div>` : '')
      + `<p class="mp-sum"><span>${com.size} item(ns) com local</span> · <button class="lnk${semLocal ? ' on' : ''}" id="ms">${sem} sem local${semLocal ? ' (mostrando)' : ''}</button></p>`;
    $('#mp-out').innerHTML = resHTML() + painelHTML() + mapaHTML();
    $('#mp-dl').innerHTML = edit ? todos.map(r => `<option value="${esc(r.item)}">`).join('') : '';
    const ml = $('#ml'); if (ml) ml.onclick = layout;
    $('#ms').onclick = () => { semLocal = !semLocal; foco = null; desenhar(); };
  }

  const abrir = (l, rolar) => { foco = l.rid; sel = { f: l.f, p: l.p }; desenhar(); if (rolar) { const c = body.querySelector(`.mp-c[data-f="${l.f}"][data-p="${l.p}"]`); c && c.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } };

  /* ---------- Escolher local de um item (busca) ---------- */
  function definirLocal(row) {
    const fs = D.layout.filter(x => x.t === 'f');
    CFO.dialog('Definir local - ' + row.item,
      `<label>Fileira<select name="f">${fs.map(f => `<option value="${f.id}">${esc((corredorDe(f.id) || { nome: '' }).nome ? corredorDe(f.id).nome + ' · ' : '')}${esc(f.nome)}</option>`).join('')}</select></label>
       <label>Prateleira<input name="p" type="number" min="1" value="1" required></label>
       <label>Andar<input name="a" type="number" min="1" value="1" required></label>`,
      d => {
        const f = fil(d.f), p = +d.p, a = +d.a;
        if (!f || !(p >= 1 && p <= f.p) || !(a >= 1 && a <= f.a)) return alert(f ? `${f.nome} tem prateleiras de 1 a ${f.p} e andares de 1 a ${f.a}.` : 'Fileira inválida.');
        const l = { id: uid(), rid: row.id, nome: row.item, f: f.id, p, a };
        if (!D.locais.some(x => x.rid === l.rid && x.f === l.f && x.p === l.p && x.a === l.a)) D.locais.push(l);
        salvar(); abrir(l, true);
      });
  }

  /* ---------- Editar o desenho (fileiras / corredores) ---------- */
  function layout() {
    const d = document.createElement('dialog'); d.className = 'mp-dlg';
    let L = JSON.parse(JSON.stringify(D.layout));
    const draw = () => {
      d.innerHTML = `<form method="dialog"><h3>Layout do almoxarifado</h3><p class="log" style="margin-top:0">De cima para baixo, como no mapa. Cada fileira tem um número de prateleiras e de andares.</p>
        <div class="mp-lay">${L.map((r, i) => `<div class="mp-lr" data-i="${i}"><span class="tag">${r.t === 'f' ? 'Fileira' : 'Corredor'}</span><input data-k="nome" value="${esc(r.nome)}" aria-label="Nome">
          ${r.t === 'f' ? `<label>Prat.<input type="number" min="1" max="60" data-k="p" value="${r.p}"></label><label>Andares<input type="number" min="1" max="12" data-k="a" value="${r.a}"></label>` : ''}
          <button type="button" class="ghost" data-mv="-1" aria-label="Subir">↑</button><button type="button" class="ghost" data-mv="1" aria-label="Descer">↓</button><button type="button" class="ghost" data-rm aria-label="Remover">✕</button></div>`).join('')}</div>
        <div class="row"><button type="button" class="ghost" data-add="f">+ Fileira</button><button type="button" class="ghost" data-add="c">+ Corredor</button></div>
        <div class="row"><button type="button" class="ghost" data-pad>Restaurar padrão</button><button value="cancel" class="ghost" formnovalidate>Cancelar</button><button value="ok">Salvar</button></div></form>`;
      d.querySelectorAll('.mp-lr').forEach(el => {
        const i = +el.dataset.i;
        el.querySelectorAll('input').forEach(inp => inp.oninput = () => { L[i][inp.dataset.k] = inp.dataset.k === 'nome' ? inp.value : Math.max(1, +inp.value || 1); });
        el.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const j = i + +b.dataset.mv; if (L[j]) { [L[i], L[j]] = [L[j], L[i]]; draw(); } });
        el.querySelector('[data-rm]').onclick = () => { L.splice(i, 1); draw(); };
      });
      d.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const t = b.dataset.add, n = L.filter(x => x.t === t).length + 1; L.push(t === 'f' ? { id: 'f' + uid(), t, nome: 'Fileira ' + n, p: 25, a: 5 } : { id: 'c' + uid(), t, nome: 'Corredor ' + n }); draw(); });
      d.querySelector('[data-pad]').onclick = () => { if (confirm('Voltar ao desenho padrão do almoxarifado?')) { L = padrao().layout.map((x, i) => ({ ...x, id: D.layout[i] && D.layout[i].t === x.t ? D.layout[i].id : x.id })); draw(); } };
    };
    draw();
    d.onclose = () => {
      if (d.returnValue === 'ok') {
        const ok = L.filter(x => x.t === 'c' || x.t === 'f');
        const fl = id => ok.find(x => x.id === id && x.t === 'f');
        const orfaos = D.locais.filter(l => { const f = fl(l.f); return !f || l.p > f.p || l.a > f.a; });
        if (!orfaos.length || confirm(`${orfaos.length} local(is) de item ficam fora do novo desenho e serão apagados. Continuar?`)) {
          D.layout = ok.map(x => ({ ...x, nome: String(x.nome || '').trim() || (x.t === 'f' ? 'Fileira' : 'Corredor') }));
          D.locais = D.locais.filter(l => !orfaos.includes(l)); if (sel && !fil(sel.f)) sel = null;
          salvar(); desenhar();
        }
      }
      d.remove();
    };
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });   // Enter não pode cancelar/salvar sem querer
    document.body.append(d); d.showModal();
  }

  /* ---------- Eventos ---------- */
  $('#mq').oninput = e => { q = e.target.value; if (q) semLocal = false; foco = null; desenhar(); };
  $('#mg').onclick = () => { edit = !edit; desenhar(); };
  body.addEventListener('click', e => {
    const t = e.target.closest('button, .mp-it'); if (!t || !body.contains(t)) return;
    if (t.dataset.l) return abrir(D.locais.find(l => l.id === t.dataset.l), true);
    if (t.dataset.def) return definirLocal(rowOf(t.dataset.def));
    if (t.dataset.x) { sel = null; return desenhar(); }
    if (t.dataset.del) { D.locais = D.locais.filter(l => l.id !== t.dataset.del); salvar(); return desenhar(); }
    if (t.dataset.ad) {
      const inp = body.querySelector(`input[data-in="${t.dataset.ad}"]`), row = rows().find(r => nrm(r.item).trim() === nrm(inp.value).trim());
      if (!row) return alert('Escolha um item da lista (Planilha EPI): comece a digitar e toque na sugestão.');
      const l = { id: uid(), rid: row.id, nome: row.item, f: sel.f, p: sel.p, a: +t.dataset.ad };
      if (!D.locais.some(x => x.rid === l.rid && x.f === l.f && x.p === l.p && x.a === l.a)) D.locais.push(l);
      salvar(); return desenhar();
    }
    if (t.classList.contains('mp-c')) { sel = { f: t.dataset.f, p: +t.dataset.p }; const aqui = at(sel.f, sel.p); if (!aqui.some(l => l.rid === foco)) foco = null; return desenhar(); }
    if (t.classList.contains('mp-it')) { const ls = doItem(t.dataset.rid); foco = t.dataset.rid; if (ls.length) return abrir(ls[0], true); sel = null; return desenhar(); }
  });
  desenhar();
};
