/* ===== Almoxarifado Operacional > Recebimento =====
   Registra a chegada de EPIs: escolha o item e a quantidade recebida.
   Ao registrar:
   - a quantidade entra no estoque da Planilha EPI ('epi');
   - cada item vira uma "Entrada" no Histórico de movimentação ('epi:mov');
   - o recebimento fica guardado nesta aba ('recebimentos') com data, nota fiscal, observação e responsável.
   "Desfazer recebimento" tira as quantidades do estoque (só se ainda houver saldo) e marca o registro como desfeito. */
(() => {
  const esc = CFO.esc, norm = CFO.norm, K = 'recebimentos';
  const N = v => (+v || 0).toLocaleString('pt-BR');
  const pad = n => String(n).padStart(2, '0');
  const hojeStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dia = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const quando = iso => { const d = new Date(iso); return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const rotulo = r => (r.codigo ? r.codigo + ' · ' : '') + r.item;
  const eu = () => (CFO.usuario() || {}).nome || '';
  const total = rc => rc.itens.reduce((a, i) => a + (+i.qtd || 0), 0);
  // data escolhida + hora de agora (para o histórico ficar na ordem certa)
  const isoDe = ymd => { const [y, m, d] = String(ymd || hojeStr()).split('-').map(Number), n = new Date(); return new Date(y, m - 1, d, n.getHours(), n.getMinutes(), n.getSeconds()).toISOString(); };

  CFO.modules.recebimento = body => {
    const ed = CFO.pode('editar', 'recebimento') && CFO.pode('editar', 'epi');
    const f = { q: '', de: '', ate: '' };
    body.innerHTML = `<div class="bar"><input id="rq" type="search" placeholder="Buscar item, nota ou responsável...">
        <label class="hm-d">De <input id="rde" type="date"></label><label class="hm-d">Até <input id="rate" type="date"></label>
        ${ed ? '<button id="rnovo">Novo recebimento</button>' : ''}</div><div id="rout"></div>`;
    const $ = s => body.querySelector(s), out = $('#rout');

    const lista = () => CFO.store.get(K, []).filter(r => r && r.itens)
      .filter(r => (!f.q || norm([r.nf, r.obs, r.resp, ...r.itens.map(i => i.item + ' ' + (i.codigo || ''))].join(' ')).includes(norm(f.q))) && (!f.de || dia(r.data) >= f.de) && (!f.ate || dia(r.data) <= f.ate))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    function draw() {
      const L = lista(), ok = L.filter(r => !r.desfeito);
      out.innerHTML = `<div class="cards"><div class="card"><small>Recebimentos</small><b>${ok.length}</b></div>
          <div class="card hm-ce"><small>Unidades recebidas</small><b>+${N(ok.reduce((a, r) => a + total(r), 0))}</b></div></div>
        ${L.map(r => `<details class="rc-d"><summary class="sum"><span><b>${esc(quando(r.data))}</b>${r.nf ? ' · NF ' + esc(r.nf) : ''} · ${r.itens.length} item(ns)${r.desfeito ? ' <span class="tag bad">Desfeito</span>' : ''}</span><span class="val">+${N(total(r))} un.</span></summary>
          <div class="tw" style="margin-top:.5rem"><table><thead><tr><th>Código</th><th>EPI</th><th>Quantidade</th></tr></thead><tbody>
            ${r.itens.map(i => `<tr><td>${esc(i.codigo) || '-'}</td><td>${esc(i.item)}</td><td>+${N(i.qtd)}</td></tr>`).join('')}</tbody></table></div>
          <p class="sub" style="margin:.5rem 0">Responsável: ${esc(r.resp || '-')}${r.obs ? ' · ' + esc(r.obs) : ''}${r.desfeito ? ' · desfeito em ' + esc(quando(r.desfeito)) : ''}</p>
          ${ed && !r.desfeito ? `<button class="ghost danger rc-undo" data-id="${esc(r.id)}">Desfazer recebimento</button>` : ''}</details>`).join('')
          || '<p class="empty">Nenhum recebimento registrado. Use <b>Novo recebimento</b> quando chegarem EPIs.</p>'}`;
      out.querySelectorAll('.rc-undo').forEach(b => b.onclick = () => desfazer(b.dataset.id));
    }

    function desfazer(id) {
      const recs = CFO.store.get(K, []), rc = recs.find(r => r.id === id); if (!rc || rc.desfeito) return;
      const rows = CFO.store.get('epi', []), movs = CFO.store.get('epi:mov', []), faltam = [];
      rc.itens.forEach(i => { const r = rows.find(x => x.id === i.rid); if (!r) faltam.push(`${i.item} (não está mais na Planilha EPI)`); else if ((+r.qtd || 0) < i.qtd) faltam.push(`${i.item} (estoque ${N(r.qtd)}, recebido ${N(i.qtd)})`); });
      if (faltam.length) return alert('Não dá para desfazer: o estoque atual é menor que o recebido (já houve saídas) ou o item foi apagado.\n\n' + faltam.join('\n'));
      if (!confirm('Desfazer este recebimento? As quantidades saem do estoque.')) return;
      const agora = new Date().toISOString();
      rc.itens.forEach(i => { const r = rows.find(x => x.id === i.rid); r.qtd = (+r.qtd || 0) - i.qtd; movs.push({ item: r.item, tipo: 'Saída', qtd: i.qtd, resp: eu(), data: agora, rec: rc.id, estorno: true }); });
      rc.desfeito = agora;
      CFO.store.set('epi', rows); CFO.store.set('epi:mov', movs); CFO.store.set(K, recs);
      draw();
    }

    function novo() {
      CFO.open('Novo recebimento', b => {
        const epi = CFO.store.get('epi', []).filter(r => r && r.item);
        const achar = txt => { const t = norm(txt); if (!t) return null; return epi.find(r => norm(rotulo(r)) === t) || epi.find(r => norm(r.item) === t) || epi.find(r => r.codigo && norm(r.codigo) === t) || null; };
        const linha = () => `<div class="rc-l"><input class="rc-i" list="rc-dl" placeholder="Código ou nome do EPI" autocomplete="off"><input class="rc-q" type="number" min="1" step="1" inputmode="numeric" placeholder="Qtd">
          <button type="button" class="ghost rc-x" aria-label="Remover item">✕</button><small class="rc-e"></small></div>`;
        b.innerHTML = `<h3>Chegada de EPIs</h3>
          ${epi.length ? '' : '<p class="empty">A Planilha EPI está vazia. Cadastre ou importe os EPIs antes de registrar um recebimento.</p>'}
          <datalist id="rc-dl">${epi.map(r => `<option value="${esc(rotulo(r))}"></option>`).join('')}</datalist>
          <div class="rc-top"><label>Data do recebimento<input id="rc-data" type="date" value="${hojeStr()}"></label>
            <label>Nota fiscal (opcional)<input id="rc-nf" autocomplete="off"></label>
            <label>Observação (opcional)<input id="rc-obs" autocomplete="off"></label></div>
          <h3 class="sec">Itens recebidos</h3><div id="rc-ls">${linha()}</div>
          <div class="bar" style="margin-top:.8rem"><button type="button" id="rc-add" class="ghost">Adicionar item</button><button type="button" id="rc-ok">Registrar recebimento</button></div>`;
        const ls = b.querySelector('#rc-ls');
        const dica = l => {
          const r = achar(l.querySelector('.rc-i').value), q = +l.querySelector('.rc-q').value || 0, e = l.querySelector('.rc-e');
          e.textContent = !l.querySelector('.rc-i').value.trim() ? '' : !r ? 'Item não encontrado na Planilha EPI.' : `Estoque atual: ${N(r.qtd)}${q > 0 ? ' → ' + N((+r.qtd || 0) + q) : ''}`;
          e.className = 'rc-e' + (l.querySelector('.rc-i').value.trim() && !r ? ' rc-bad' : '');
        };
        ls.addEventListener('input', e => { const l = e.target.closest('.rc-l'); if (l) dica(l); });
        ls.addEventListener('click', e => { const x = e.target.closest('.rc-x'); if (!x) return; if (ls.children.length > 1) x.closest('.rc-l').remove(); else { const l = x.closest('.rc-l'); l.querySelector('.rc-i').value = ''; l.querySelector('.rc-q').value = ''; dica(l); } });
        b.querySelector('#rc-add').onclick = () => { ls.insertAdjacentHTML('beforeend', linha()); ls.lastElementChild.querySelector('.rc-i').focus(); };
        b.querySelector('#rc-ok').onclick = () => {
          const mapa = new Map(), erros = [];
          [...ls.children].forEach((l, n) => {
            const txt = l.querySelector('.rc-i').value.trim(), q = Math.round(+l.querySelector('.rc-q').value);
            if (!txt && !l.querySelector('.rc-q').value) return;                       // linha em branco
            const r = achar(txt);
            if (!r) return erros.push(`Linha ${n + 1}: item não encontrado na Planilha EPI.`);
            if (!(q > 0)) return erros.push(`Linha ${n + 1}: informe a quantidade recebida.`);
            const x = mapa.get(r.id) || { rid: r.id, codigo: r.codigo || '', item: r.item, qtd: 0 }; x.qtd += q; mapa.set(r.id, x);
          });
          if (!mapa.size && !erros.length) erros.push('Adicione pelo menos um item com a quantidade.');
          if (erros.length) return alert(erros.join('\n'));
          const itens = [...mapa.values()];
          if (!confirm(`Registrar o recebimento de ${itens.length} item(ns), ${N(itens.reduce((a, i) => a + i.qtd, 0))} unidade(s)? Elas entram no estoque da Planilha EPI.`)) return;
          const rows = CFO.store.get('epi', []), movs = CFO.store.get('epi:mov', []), recs = CFO.store.get(K, []);
          const id = 'RC' + Date.now().toString(36), data = isoDe(b.querySelector('#rc-data').value), resp = eu();
          itens.forEach(i => { const r = rows.find(x => x.id === i.rid); if (!r) return; r.qtd = (+r.qtd || 0) + i.qtd; movs.push({ item: r.item, tipo: 'Entrada', qtd: i.qtd, resp, data, rec: id }); });
          recs.push({ id, data, nf: b.querySelector('#rc-nf').value.trim(), obs: b.querySelector('#rc-obs').value.trim(), resp, itens });
          CFO.store.set('epi', rows); CFO.store.set('epi:mov', movs); CFO.store.set(K, recs);
          CFO.close(); draw();
        };
      });
    }

    $('#rq').oninput = e => { f.q = e.target.value; draw(); };
    $('#rde').onchange = e => { f.de = e.target.value; draw(); };
    $('#rate').onchange = e => { f.ate = e.target.value; draw(); };
    if ($('#rnovo')) $('#rnovo').onclick = novo;
    const re = () => { if (body.isConnected) draw(); else document.removeEventListener('cfo-sync', re); };
    document.addEventListener('cfo-sync', re);
    draw();
  };
})();
