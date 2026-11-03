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


  /* ---------- Sincronização com o WL: tabela epi_monthly_receiving (quantidade recebida por EPI em cada mês) ----------
     - A partir de INICIO (Novembro/2026) o que o WL registra ENTRA no estoque da Planilha EPI, vira "Entrada" no Histórico
       de movimentação e fica na aba Recebimento marcado "WL".
     - Meses ANTERIORES a INICIO viram um registro por mês na aba Recebimento (marcado WL e "sem estoque"), só como histórico:
       NÃO somam nem subtraem nada no estoque e não geram movimentação. O registro de cada mês é refeito a cada sincronização
       (se o WL corrigir um número antigo, o histórico acompanha).
     - Não duplica: guarda em 'wl_receb_aplicado' quanto de cada linha do WL já foi somado; se o WL corrigir a quantidade,
       entra só a diferença (positiva ou negativa).
     - EPI do WL que não existe na Planilha EPI (por código ou nome exato) NÃO é somado e fica na lista de pendências;
       entra sozinho depois que o EPI existir na planilha.
     Roda sozinho junto com o Sincronizar WL e pelo botão "Atualizar do WL" da aba Recebimento. */
  const INICIO = { ano: 2026, mes: 10 };                 // mes: 0 = janeiro ... 10 = novembro
  const MES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const mesIdx = m => MES.indexOf(String(norm(m)).toUpperCase());
  const NOME_MES = i => ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][i] || '?';
  const pick = (o, ks) => { for (const k of ks) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
  const noPeriodo = x => x.ano > INICIO.ano || (x.ano === INICIO.ano && x.mes >= INICIO.mes);
  let sincronizando = null;

  async function lerWL() {
    const C = window.CFO_WL; if (!C) throw new Error('Configuração do WL não encontrada.');
    const h = { apikey: C.key, Authorization: 'Bearer ' + C.key };
    const ler = async (t, extra = '') => {
      const tudo = [];
      for (let off = 0; ; off += 1000) {
        const r = await fetch(`${C.url}/rest/v1/${t}?select=*${extra}&limit=1000&offset=${off}`, { headers: h });
        if (!r.ok) throw new Error(`WL respondeu ${r.status} ao ler "${t}"`);
        const l = await r.json(); tudo.push(...l); if (l.length < 1000) break;
      }
      return tudo;
    };
    const [rec, cat] = await Promise.all([ler('epi_monthly_receiving', '&order=year.desc,created_at.desc'), ler(C.catalogo).catch(() => [])]);
    const porId = new Map(cat.map(c => [c.id, c]));
    return rec.map(r => {
      const c = porId.get(r.epi_id) || {};
      return { rid: String(r.id), nome: String(pick(c, ['name', 'description', 'nome', 'item', 'epi_name', 'title']) ?? '(EPI ' + String(r.epi_id).slice(0, 8) + ')'), codigo: String(pick(c, ['code', 'epi_code', 'codigo', 'sku']) ?? ''),
        mes: mesIdx(r.month), ano: +r.year || 0, qtd: +r.received_quantity || 0, notas: String(r.notes || ''), em: r.updated_at || r.created_at || '' };
    }).filter(x => x.mes >= 0 && x.ano);
  }

  function aplicarWL(linhas) {
    const ap = CFO.store.get('wl_receb_aplicado', {}), rows = CFO.store.get('epi', []), movs = CFO.store.get('epi:mov', []), recs = CFO.store.get('recebimentos', []);
    const agora = new Date().toISOString(), semMatch = new Set(), porRow = new Map(), meses = new Set();
    // Histórico (meses antes de INICIO): um registro por mês, sem mexer no estoque
    const hist = new Map(); let mudouH = false, nHist = 0;
    linhas.filter(x => !noPeriodo(x)).forEach(x => { const k = `${x.ano}-${pad(x.mes + 1)}`; if (!hist.has(k)) hist.set(k, []); hist.get(k).push(x); });
    hist.forEach((L, k) => {
      const itens = L.filter(x => x.qtd).map(x => ({ rid: '', codigo: x.codigo, item: x.nome, qtd: x.qtd, per: k })).sort((a, b) => a.item.localeCompare(b.item, 'pt-BR'));
      if (!itens.length) return;
      const id = 'WLH-' + k, novo = { id, data: L.map(x => x.em).filter(Boolean).sort().pop() || `${k}-28T12:00:00.000Z`, periodo: k, nf: '', obs: `Histórico do WL · ${NOME_MES(L[0].mes)}/${L[0].ano} (não altera o estoque)`, resp: 'WL', origem: 'WL', semEstoque: true, itens };
      const i = recs.findIndex(r => r.id === id); nHist++;
      if (i < 0) { recs.push(novo); mudouH = true; } else if (JSON.stringify(recs[i]) !== JSON.stringify(novo)) { recs[i] = novo; mudouH = true; }
    });
    const achar = x => {
      let c = x.codigo ? rows.filter(r => r.codigo && norm(r.codigo) === norm(x.codigo)) : [];
      if (c.length > 1) c = c.filter(r => norm(r.item) === norm(x.nome));
      if (c.length === 1) return c[0];
      const n = rows.filter(r => norm(r.item) === norm(x.nome)); return n.length === 1 ? n[0] : null;
    };
    linhas.filter(noPeriodo).forEach(x => {
      const delta = x.qtd - (+ap[x.rid] || 0); if (!delta) return;
      const r = achar(x); if (!r) { semMatch.add(x.nome); return; }
      r.qtd = (+r.qtd || 0) + delta;
      movs.push({ item: r.item, tipo: delta > 0 ? 'Entrada' : 'Saída', qtd: Math.abs(delta), resp: 'WL (sincronização)', data: agora, wl: x.rid });
      ap[x.rid] = x.qtd; meses.add(`${NOME_MES(x.mes)}/${x.ano}`);
      const per = `${x.ano}-${pad(x.mes + 1)}`, ch = r.id + '|' + per;
      const it = porRow.get(ch) || { rid: r.id, codigo: r.codigo || '', item: r.item, qtd: 0, per }; it.qtd += delta; porRow.set(ch, it);
    });
    if (porRow.size) {
      recs.push({ id: 'WL' + Date.now().toString(36), data: agora, nf: '', obs: 'Sincronizado do WL · ' + [...meses].join(', '), resp: 'WL', origem: 'WL', itens: [...porRow.values()] });
      CFO.store.set('epi', rows); CFO.store.set('epi:mov', movs); CFO.store.set('wl_receb_aplicado', ap);
    }
    if (porRow.size || mudouH) {
      CFO.store.set('recebimentos', recs);
      try { document.dispatchEvent(new Event('cfo-sync')); } catch { /* sem tela aberta */ }
    }
    return { meses: nHist, itens: porRow.size, unidades: [...porRow.values()].reduce((a, i) => a + i.qtd, 0), semMatch: [...semMatch], em: agora };
  }

  // Lê o WL e aplica no estoque. Chamada pelo Sincronizar WL e pelo botão da aba Recebimento.
  CFO.wlRecebimento = () => {
    if (CFO.espaco) return Promise.reject(new Error('Sincronização do WL desligada neste perfil (outro setor).'));
    if (sincronizando) return sincronizando;
    sincronizando = (async () => {
      try {
        const linhas = await lerWL(), rel = aplicarWL(linhas), em = new Date().toISOString();
        CFO.store.set('wl_receb_rel', rel);
        return { linhas, em, rel };
      } finally { sincronizando = null; }
    })();
    return sincronizando;
  };

  CFO.modules.recebimento = body => {
    const ed = CFO.pode('editar', 'recebimento') && CFO.pode('editar', 'epi');
    const f = { q: '', de: '', ate: '' };
    body.innerHTML = `<div class="bar"><input id="rq" type="search" placeholder="Buscar item, nota ou responsável...">
        <label class="hm-d">De <input id="rde" type="date"></label><label class="hm-d">Até <input id="rate" type="date"></label>
        ${ed ? '<button id="rnovo">Novo recebimento</button>' : ''}</div><div id="rwlst"></div><div id="rout"></div>`;
    const $ = s => body.querySelector(s), out = $('#rout');

    const lista = () => CFO.store.get(K, []).filter(r => r && r.itens)
      .filter(r => (!f.q || norm([r.nf, r.obs, r.resp, ...r.itens.map(i => i.item + ' ' + (i.codigo || ''))].join(' ')).includes(norm(f.q))) && (!f.de || dia(r.data) >= f.de) && (!f.ate || dia(r.data) <= f.ate))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    function draw() {
      const L = lista(), ok = L.filter(r => !r.desfeito);
      out.innerHTML = `<div class="cards"><div class="card"><small>Recebimentos</small><b>${ok.length}</b></div>
          <div class="card hm-ce"><small>Unidades recebidas</small><b>+${N(ok.reduce((a, r) => a + total(r), 0))}</b></div></div>
        ${L.map(r => `<details class="rc-d"><summary class="sum"><span><b>${esc(quando(r.data))}</b>${r.nf ? ' · NF ' + esc(r.nf) : ''} · ${r.itens.length} item(ns)${r.origem === 'WL' ? ' <span class="tag">WL</span>' : ''}${r.semEstoque ? ' <span class="tag">histórico</span>' : ''}${r.desfeito ? ' <span class="tag bad">Desfeito</span>' : ''}</span><span class="val">${total(r) > 0 ? '+' : ''}${N(total(r))} un.</span></summary>
          <div class="tw" style="margin-top:.5rem"><table><thead><tr><th>Código</th><th>EPI</th><th>Quantidade</th></tr></thead><tbody>
            ${r.itens.map(i => `<tr><td>${esc(i.codigo) || '-'}</td><td>${esc(i.item)}</td><td>+${N(i.qtd)}</td></tr>`).join('')}</tbody></table></div>
          <p class="sub" style="margin:.5rem 0">Responsável: ${esc(r.resp || '-')}${r.obs ? ' · ' + esc(r.obs) : ''}${r.desfeito ? ' · desfeito em ' + esc(quando(r.desfeito)) : ''}</p>
          ${ed && !r.desfeito && r.origem !== 'WL' ? `<button class="ghost danger rc-undo" data-id="${esc(r.id)}">Desfazer recebimento</button>` : ''}</details>`).join('')
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

    // Duplicidade: mesmo EPI e mesma quantidade já registrados no mesmo mês (pelo WL ou por aqui)
    function duplicados(itens, ymd) {
      const per = String(ymd || hojeStr()).slice(0, 7), out = [], recs = CFO.store.get(K, []).filter(r => r && r.itens && !r.desfeito);
      itens.forEach(i => {
        const nome = norm(i.item); let achou = null;
        recs.forEach(r => r.itens.forEach(x => { if (!achou && (x.per || dia(r.data).slice(0, 7)) === per && (x.rid && x.rid === i.rid || norm(x.item) === nome) && +x.qtd === +i.qtd) achou = r; }));
        if (!achou) {                                                      // também compara com o total do mês vindo do WL
          const tot = recs.filter(r => r.origem === 'WL').reduce((a, r) => a + r.itens.filter(x => (x.per || dia(r.data).slice(0, 7)) === per && (x.rid && x.rid === i.rid || norm(x.item) === nome)).reduce((s2, x) => s2 + (+x.qtd || 0), 0), 0);
          if (tot === +i.qtd) achou = recs.find(r => r.origem === 'WL');
        }
        if (achou) out.push(`${i.item}: ${N(i.qtd)} un. (já consta ${achou.origem === 'WL' ? 'no WL' : 'um recebimento seu'} em ${per.slice(5)}/${per.slice(0, 4)})`);
      });
      return out;
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
          const dupl = duplicados(itens, b.querySelector('#rc-data').value);
          if (dupl.length && !confirm('Possível duplicidade neste mês:\n\n' + dupl.join('\n') + '\n\nRegistrar mesmo assim?')) return;
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

    /* ---------- Aviso do WL (a atualização em si fica em ⋯ > Sincronizar WL e também roda sozinha) ---------- */
    function statusWL(txt, erro) {
      const rel = CFO.store.get('wl_receb_rel', null), sem = rel && rel.semMatch || [];
      $('#rwlst').innerHTML = (txt ? `<p class="log${erro ? ' down' : ''}">${esc(txt)}</p>` : rel ? `<p class="log">WL lido em ${esc(quando(rel.em))}. De ${NOME_MES(INICIO.mes)}/${INICIO.ano} em diante o que chega entra sozinho no estoque; meses anteriores ficam só como histórico (não mexem no estoque).</p>` : '')
        + (sem.length ? `<p class="log down">Não entraram no estoque (não achei na Planilha EPI): ${esc(sem.slice(0, 8).join(', '))}${sem.length > 8 ? ' e mais ' + (sem.length - 8) : ''}. Entram sozinhos quando o EPI existir na planilha.</p>` : '');
    }
    statusWL();
    const re = () => { if (body.isConnected) { statusWL(); draw(); } else document.removeEventListener('cfo-sync', re); };
    document.addEventListener('cfo-sync', re);
    draw();
  };
})();
