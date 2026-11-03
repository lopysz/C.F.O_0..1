/* ===== Jurídico Operacional > Valores dos EPIs =====
   Planilha dos EPIs com o valor unitário de cada um.
   - Na primeira vez, o valor de cada EPI é preenchido SOZINHO com o preço da requisição mais recente que tem o item
     (a busca olha todo o histórico de requisições, começando pelas mais novas, então cobre bem mais que 3 meses).
   - Depois de preenchido, o valor fica GUARDADO e não muda mais sozinho: para aumentar ou diminuir, digite ou cole o novo valor.
   - EPI sem nenhuma requisição fica vazio; quando aparecer uma requisição com ele, o valor é preenchido uma vez.
   - Apagar o campo deixa o EPI vazio de propósito (não preenche de novo).
   - Tamanhos contam juntos: "Botina (42)" e "Botina (43)" são o mesmo EPI "Botina".
   Os valores ficam em 'valores_epi' (sincroniza pela nuvem). Para usar em outro lugar: CFO.valorEpi('nome do item') devolve o número (ou null). */
(() => {
  const esc = CFO.esc, norm = CFO.norm, LS = 'valores_epi';
  const num = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const chave = nome => norm(CFO.baseEpi(nome));

  // Lista: EPIs da Planilha EPI + EPIs que só aparecem nas requisições. valor = guardado (se houver); senão o da requisição mais recente
  function calcular() {
    const salvo = CFO.store.get(LS, {});
    const epi = CFO.store.get('epi', []).filter(e => e && e.item);
    const achar = CFO.casarEpi(epi), rows = new Map();
    epi.forEach(e => {
      const k = chave(e.item); if (!k) return;
      const x = rows.get(k);
      if (!x) rows.set(k, { k, item: CFO.baseEpi(e.item), codigo: e.codigo || '' }); else if (!x.codigo && e.codigo) x.codigo = e.codigo;
    });
    const reqs = CFO.store.get('requisicoes', []).filter(r => r && r.itens).sort((a, b) => cmp(b.id, a.id));   // mais recente primeiro
    reqs.forEach(r => r.itens.forEach(i => {
      if (!(+i.preco > 0)) return;
      const m = achar(i.item), nome = m ? m.item : i.item, k = chave(nome); if (!k) return;
      let x = rows.get(k); if (!x) { x = { k, item: CFO.baseEpi(nome), codigo: '' }; rows.set(k, x); }
      if (x.auto == null) x.auto = +i.preco;
    }));
    rows.forEach(x => { x.valor = salvo[x.k] !== undefined ? salvo[x.k] : x.auto != null ? x.auto : null; });
    return { lista: [...rows.values()].sort((a, b) => a.item.localeCompare(b.item, 'pt-BR')), salvo };
  }
  // Guarda o valor que veio das requisições (uma vez só) para ele não mudar sozinho depois
  function fixar() {
    const { lista, salvo } = calcular(); let mudou = false;
    lista.forEach(x => { if (salvo[x.k] === undefined && x.auto != null) { salvo[x.k] = x.auto; mudou = true; } });
    if (mudou) CFO.store.set(LS, salvo);
    return lista;
  }

  // Preço de um item de requisição para os cálculos de gasto: vale o da requisição; se vier sem preço (ou zero), usa o valor guardado nesta tabela
  let cache = null, quando = 0;
  const tabela = () => {
    const agora = Date.now(); if (cache && agora - quando < 1500) return cache;
    cache = { salvo: CFO.store.get(LS, {}), achar: CFO.casarEpi(CFO.store.get('epi', []).filter(e => e && e.item)), memo: new Map() }; quando = agora;
    return cache;
  };
  CFO.preco = i => {
    const p = +i.preco; if (p > 0) return p;
    const t = tabela(); let k = t.memo.get(i.item);
    if (k === undefined) { const m = t.achar(i.item); k = chave(m ? m.item : i.item); t.memo.set(i.item, k); }
    const v = t.salvo[k]; return v > 0 ? +v : 0;
  };
  CFO.preco.limpar = () => { cache = null; };

  // Preenche a tabela sozinha (sem precisar abrir a tela), pouco depois de carregar e quando chegam dados novos da nuvem
  let espera = null;
  const auto = () => { clearTimeout(espera); espera = setTimeout(() => { try { if (CFO.usuario && CFO.usuario()) { fixar(); CFO.preco.limpar(); } } catch { /* sem dados ainda */ } }, 2500); };
  document.addEventListener('cfo-sync', auto); window.addEventListener('cfo-user', auto); auto();

  CFO.valorEpi = nome => { const k = chave(nome), x = calcular().lista.find(r => r.k === k); return x ? x.valor : null; };

  CFO.modules.valores_epi = body => {
    const ed = CFO.pode('editar', 'valores_epi');
    let lista = [], q = '', filtro = '';
    body.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Buscar EPI ou código...">
      <select id="f" aria-label="Filtro"><option value="">Todos</option><option value="sem">Sem valor</option></select></div>
      <p class="log" id="count"></p>
      <div class="tw"><table><thead><tr><th>Código</th><th>EPI</th><th>Valor unitário</th></tr></thead><tbody id="tb"></tbody></table></div>
      <p class="sub" style="margin-top:.6rem">Os valores vêm das requisições na primeira vez e depois ficam guardados. Para aumentar ou diminuir, digite ou cole o novo valor e dê Enter.</p>`;
    const $ = s => body.querySelector(s);

    const linha = x => `<tr data-k="${esc(x.k)}"><td>${esc(x.codigo) || '-'}</td><td>${esc(x.item)}</td>
      <td><input class="ve-in" inputmode="decimal" autocomplete="off" placeholder="sem valor" value="${x.valor != null ? num(x.valor) : ''}"${ed ? '' : ' readonly'} aria-label="Valor unitário de ${esc(x.item)}"></td></tr>`;
    const visiveis = () => {
      const t = norm(q);
      return lista.filter(x => (!t || norm(x.item + ' ' + x.codigo).includes(t)) && (filtro === 'sem' ? x.valor == null : true));
    };
    function resumo() {
      const com = lista.filter(x => x.valor != null).length;
      $('#count').textContent = `${lista.length} EPI(s) · ${com} com valor · ${lista.length - com} sem valor`;
    }
    function render() {
      lista = fixar();                                  // preenche (uma vez) o que ainda não tem valor e veio de requisição
      lista = calcular().lista;
      $('#tb').innerHTML = visiveis().map(linha).join('') || `<tr><td colspan="3"><p class="empty">${lista.length ? 'Nenhum EPI nesse filtro.' : 'Nenhum EPI ainda. Importe a Planilha EPI e as requisições.'}</p></td></tr>`;
      resumo();
    }

    $('#tb').addEventListener('change', e => {
      const inp = e.target.closest('.ve-in'); if (!inp || !ed) return;
      const k = inp.closest('tr').dataset.k, t = inp.value.trim(), m = CFO.store.get(LS, {});
      if (!t) m[k] = null;                              // apagado de propósito: fica vazio e não é preenchido de novo
      else { const n = CFO.toNum(t); if (!(n >= 0)) { inp.value = ''; return; } m[k] = Math.round(n * 100) / 100; }
      CFO.store.set(LS, m); CFO.preco.limpar();
      lista = calcular().lista;
      const x = lista.find(r => r.k === k); inp.value = x && x.valor != null ? num(x.valor) : '';
      resumo();
    });
    $('#tb').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('ve-in')) e.target.blur(); });
    $('#q').oninput = e => { q = e.target.value; render(); };
    $('#f').onchange = e => { filtro = e.target.value; render(); };
    const re = () => { if (body.isConnected) { if (!document.activeElement || !document.activeElement.classList.contains('ve-in')) render(); } else document.removeEventListener('cfo-sync', re); };
    document.addEventListener('cfo-sync', re);
    render();
  };
})();
