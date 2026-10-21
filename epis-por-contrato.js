/* ===== Jurídico Operacional > EPIs por contrato =====
   Cruza a planilha de Contratos com o histórico de Requisições. */
(() => {
  const esc = CFO.esc, R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const valor = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0), qtd = r => r.itens.reduce((a, i) => a + i.qa, 0);

  // Contratos cadastrados + contratos que aparecem nas requisições
  const montar = () => {
    const map = new Map();
    CFO.store.get('contratos', []).forEach(c => { if (c.num && !map.has(String(c.num))) map.set(String(c.num), { num: String(c.num), nome: c.nome || '', reqs: [] }); });
    CFO.store.get('requisicoes', []).forEach(r => {
      let c = map.get(r.contrato);
      if (!c) { c = { num: r.contrato, nome: r.contratoNome, reqs: [] }; map.set(r.contrato, c); }
      if (!c.nome) c.nome = r.contratoNome;
      c.reqs.push(r);
    });
    return [...map.values()].sort((a, b) => numCmp(a.num, b.num));
  };

  // Soma itens por nome: [{item, qtd, valor}] do maior valor para o menor
  const porItem = reqs => {
    const m = new Map();
    reqs.forEach(r => r.itens.forEach(i => { const x = m.get(i.item) || { item: i.item, qtd: 0, valor: 0 }; x.qtd += i.qa; x.valor += i.qa * i.preco; m.set(i.item, x); }));
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  };
  const tabela = rows => `<div class="tw"><table><thead><tr><th>EPI</th><th>Qtd retirada</th><th>Valor</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(x.item)}</td><td>${x.qtd}</td><td>${R$(x.valor)}</td></tr>`).join('')}</tbody></table></div>`;

  CFO.modules.epis_contrato = body => {
    const lista = montar();
    let q = '', so = false;
    body.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Buscar contrato...">
      <label class="chk"><input id="so" type="checkbox"> Só com requisições</label></div><p class="log" id="count"></p><div id="lst"></div>`;
    const $ = s => body.querySelector(s);

    function render() {
      const t = CFO.norm(q), v = lista.filter(c => (!so || c.reqs.length) && CFO.norm(c.num + ' ' + c.nome).includes(t));
      $('#count').textContent = `${v.length} contrato(s)`;
      $('#lst').innerHTML = v.map(c => `<div class="foto" data-n="${esc(c.num)}"><div><b>${esc(c.num)}</b>${c.nome ? ' - ' + esc(c.nome) : ''}<br>
        <small>${c.reqs.length} requisição(ões) · ${R$(c.reqs.reduce((a, r) => a + valor(r), 0))}</small></div></div>`).join('')
        || '<p class="empty">Nenhum contrato. Importe a planilha de contratos e as requisições.</p>';
      body.querySelectorAll('.foto').forEach(el => el.onclick = () => detalhe(lista.find(c => c.num === el.dataset.n)));
    }

    function detalhe(c) {
      CFO.open(`Contrato ${c.num}`, b => {
        const gasto = c.reqs.reduce((a, r) => a + valor(r), 0), itens = c.reqs.reduce((a, r) => a + qtd(r), 0);
        const sols = new Map();
        c.reqs.forEach(r => { const k = r.sol || '(sem nome)'; if (!sols.has(k)) sols.set(k, []); sols.get(k).push(r); });
        const ordem = [...sols.entries()].sort((a, b) => b[1].reduce((x, r) => x + valor(r), 0) - a[1].reduce((x, r) => x + valor(r), 0));
        b.innerHTML = `<h3>${esc(c.nome || 'Contrato ' + c.num)}</h3>
          <div class="cards" style="margin-top:.8rem"><div class="card"><small>Requisições</small><b>${c.reqs.length}</b></div>
            <div class="card"><small>Itens retirados</small><b>${itens}</b></div><div class="card"><small>Valor gasto</small><b>${R$(gasto)}</b></div>
            <div class="card"><small>Solicitantes</small><b>${sols.size}</b></div></div>`
          + (c.reqs.length ? `
          <h3 class="sec">Solicitantes</h3>${ordem.map(([nome, rs]) => `<details><summary><b>${esc(nome)}</b> · ${rs.length} req · ${rs.reduce((a, r) => a + qtd(r), 0)} item(ns) · ${R$(rs.reduce((a, r) => a + valor(r), 0))}</summary>
            <p class="log">${rs.map(r => esc(r.id) + ' (' + esc(r.mes) + ')').join(', ')}</p>${tabela(porItem(rs))}</details>`).join('')}
          <h3 class="sec">EPIs utilizados no contrato</h3>${tabela(porItem(c.reqs))}`
          : '<p class="empty">Nenhuma requisição importada para este contrato ainda.</p>');
      });
    }

    $('#q').oninput = e => { q = e.target.value; render(); };
    $('#so').onchange = e => { so = e.target.checked; render(); };
    render();
  };
})();
