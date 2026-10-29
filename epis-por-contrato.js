/* ===== Jurídico Operacional > EPIs por contrato =====
   Cruza a planilha de Contratos com o histórico de Requisições. */
(() => {
  const esc = CFO.esc, R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const valor = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0), qtd = r => r.itens.reduce((a, i) => a + i.qa, 0);

  // Contratos cadastrados + contratos que aparecem nas requisições
  const montar = ok => {
    const map = new Map();
    CFO.store.get('contratos', []).forEach(c => { if (c.num && !map.has(String(c.num))) map.set(String(c.num), { num: String(c.num), nome: c.nome || '', reqs: [] }); });
    CFO.store.get('requisicoes', []).filter(ok).forEach(r => {
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
  // Código do item: procura na Planilha EPI (nome igual; se não achar, nome parecido)
  const codigos = () => {
    const epi = CFO.store.get('epi', []).filter(e => e.item);
    const exato = new Map(epi.map(e => [CFO.norm(e.item), e.codigo]));
    return nome => {
      const n = CFO.norm(nome);
      if (exato.has(n)) return exato.get(n) || '';
      const p = epi.find(e => { const m = CFO.norm(e.item); return m && n && (m.includes(n) || n.includes(m)); });
      return p ? p.codigo || '' : '';
    };
  };
  // EPIs do contrato: só código e nome, sem repetir
  const tabela = (rows, cod) => `<div class="tw"><table><thead><tr><th>Código</th><th>EPI</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td>${esc(cod(x.item)) || '-'}</td><td>${esc(x.item)}</td></tr>`).join('')}</tbody></table></div>`;
  // Uma requisição do solicitante: cabeçalho + itens
  const reqCard = r => `<div class="card" style="margin-top:.6rem"><b style="font-size:1rem">${esc(r.id)}</b> <small>· ${esc(r.mes)}${r.motivo ? ' · ' + esc(r.motivo) : ''}</small>
    <div class="tw" style="margin-top:.5rem"><table><thead><tr><th>Item</th><th>Tam.</th><th>Aprov.</th></tr></thead><tbody>
    ${r.itens.map(i => `<tr><td>${esc(i.item)}</td><td>${esc(i.tam)}</td><td>${i.qa}</td></tr>`).join('')}</tbody></table></div></div>`;

  // Contratos que usam um EPI (pelo nome), com base nas requisições. Nome igual tem prioridade; senão, nome parecido.
  // Todos os tamanhos do item contam juntos: "Botina de couro" (ou "Botina de couro (42)") -> contratos que usam qualquer tamanho dela.
  CFO.contratosDoEpi = nome => {
    const n = CFO.norm(CFO.baseEpi(nome)); if (!n) return [];
    const reqs = CFO.store.get('requisicoes', []), nomes = new Set(reqs.flatMap(r => r.itens.map(i => i.item)));
    const igual = [...nomes].filter(x => CFO.norm(CFO.baseEpi(x)) === n);
    const usa = igual.length ? igual : [...nomes].filter(x => { const m = CFO.norm(CFO.baseEpi(x)); return m.includes(n) || (m.length > 3 && n.includes(m)); });
    const set = new Set(usa);
    return [...new Set(reqs.filter(r => r.contrato && r.itens.some(i => set.has(i.item))).map(r => String(r.contrato)))].sort(numCmp);
  };

  CFO.modules.epis_contrato = body => {
    let lista = montar(() => true);
    let q = '', so = false;
    body.innerHTML = `<div class="bar"><input id="q" type="search" placeholder="Buscar contrato...">
      ${CFO.periodo.html()}
      <label class="chk"><input id="so" type="checkbox"> Só com requisições</label></div><p class="log" id="count"></p><div id="lst"></div>`;
    CFO.filtros(body);
    const $ = s => body.querySelector(s);

    function render() {
      CFO.periodo.fill(body, CFO.store.get('requisicoes', []));
      lista = montar(CFO.periodo.test(body));
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
        const cod = codigos();
        b.innerHTML = `<h3>${esc(c.nome || 'Contrato ' + c.num)}</h3>
          <div class="cards" style="margin-top:.8rem"><div class="card"><small>Requisições</small><b>${c.reqs.length}</b></div>
            <div class="card"><small>Itens retirados</small><b>${itens}</b></div><div class="card"><small>Valor gasto</small><b>${R$(gasto)}</b></div>
            <div class="card"><small>Solicitantes</small><b>${new Set(c.reqs.map(r => r.sol || '(sem nome)')).size}</b></div></div>`
          + (c.reqs.length ? `
          <h3 class="sec">Histórico por solicitante</h3><div class="bar">${CFO.motivo.html()}</div><div id="sup"></div>
          <h3 class="sec">EPIs utilizados no contrato</h3>${tabela(porItem(c.reqs), cod)}`
          : '<p class="empty">Nenhuma requisição importada para este contrato ainda.</p>');
        const fs = b.querySelector('#ft');
        if (fs) {                                                         // filtro por tipo (Admissão, Mensal, Troca...) só na parte dos solicitantes
          CFO.motivo.fill(b, c.reqs);
          const drawSup = () => {
            const sols = new Map();
            c.reqs.filter(CFO.motivo.fn(fs.value)).forEach(r => { const k = r.sol || '(sem nome)'; if (!sols.has(k)) sols.set(k, []); sols.get(k).push(r); });
            const ordem = [...sols.entries()].sort((a, z) => z[1].reduce((x, r) => x + valor(r), 0) - a[1].reduce((x, r) => x + valor(r), 0));
            b.querySelector('#sup').innerHTML = ordem.map(([nome, rs]) => `<details><summary class="sum"><span><b>${esc(nome)}</b> • ${rs.length} requisição(ões)</span><span class="val">${R$(rs.reduce((x, r) => x + valor(r), 0))}</span></summary>
              ${rs.map(reqCard).join('')}</details>`).join('') || '<p class="empty">Nenhuma requisição deste tipo neste contrato.</p>';
          };
          fs.onchange = drawSup; drawSup();
        }
      });
    }

    $('#q').oninput = e => { q = e.target.value; render(); };
    $('#fm').onchange = $('#fa').onchange = render;
    $('#so').onchange = e => { so = e.target.checked; render(); };
    render();
  };
})();
