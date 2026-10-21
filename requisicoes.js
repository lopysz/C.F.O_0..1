/* ===== Almoxarifado Operacional > Requisição =====
   Cada requisição guarda cabeçalho + itens. Reimportar o mesmo nº atualiza a requisição. */
(() => {
  const esc = CFO.esc, R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });

  // Colunas do modelo "Relatório de Aprovações de EPI"
  const COLS = [
    { k: 'req', label: 'Nº Requisição', alias: ['nreq', 'requisicao', 'req'] },
    { k: 'sol', label: 'Solicitante' }, { k: 'motivo', label: 'Motivo' }, { k: 'contrato', label: 'Contrato' },
    { k: 'mes', label: 'Mês/Ano', alias: ['mes', 'data'] }, { k: 'item', label: 'Item' }, { k: 'tam', label: 'Tam.', alias: ['tamanho'] },
    { k: 'qs', label: 'Solic.', alias: ['solicitado', 'quantidade solicitada'] }, { k: 'qa', label: 'Aprov.', alias: ['aprovado', 'quantidade aprovada'] },
    { k: 'preco', label: 'Preço unit', alias: ['preco', 'preco unitario', 'valor unitario'] }
  ];
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mesKey = s => { const m = CFO.norm(s).match(/^([a-z]+)(\d{4})$/), i = m ? MESES.indexOf(m[1]) : -1; return i >= 0 ? m[2] + String(i + 1).padStart(2, '0') : '000000'; };
  const parseContrato = s => { s = String(s || '').trim(); const m = s.match(/^(\d+)\s*[-–]?\s*(.*)$/); return m ? { num: m[1], nome: m[2].trim() } : { num: s, nome: '' }; };
  const total = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0), qtd = r => r.itens.reduce((a, i) => a + i.qa, 0);

  const score = data => CFO.findHeader(data, COLS, 4).n;   // só reconhece se achar 4+ colunas do modelo

  const importData = data => {
    const { hi, m } = CFO.findHeader(data, COLS, 4);
    if (hi < 0) return { add: 0, dup: 0, upd: 0 };
    const map = new Map(CFO.store.get('requisicoes', []).map(r => [r.id, r])), fresh = new Map();
    let add = 0, upd = 0;
    data.slice(hi + 1).forEach(line => {
      const g = k => m[k] === undefined ? '' : String(line[m[k]] ?? '').trim(), id = g('req'), item = g('item');
      if (!id || !item) return;                              // ignora a linha de totais
      let r = fresh.get(id);
      if (!r) { const c = parseContrato(g('contrato')); r = { id, sol: g('sol'), motivo: g('motivo'), contrato: c.num, contratoNome: c.nome, mes: g('mes'), itens: [] }; fresh.set(id, r); }
      r.itens.push({ item, tam: g('tam'), qs: CFO.toNum(g('qs')), qa: CFO.toNum(g('qa')), preco: CFO.toNum(g('preco')) });
    });
    fresh.forEach((r, id) => { map.has(id) ? upd++ : add++; map.set(id, r); });
    CFO.store.set('requisicoes', [...map.values()]);
    return { add, dup: 0, upd };
  };

  const api = body => {
    let q = '';
    const all = () => CFO.store.get('requisicoes', []).sort((a, b) => mesKey(b.mes).localeCompare(mesKey(a.mes)) || numCmp(b.id, a.id));
    body.innerHTML = `
      <div class="cards" id="cards"></div>
      <div class="bar"><input id="q" type="search" placeholder="Buscar nº, contrato, solicitante ou item...">
        <button id="imp" class="ghost">Importar</button><button id="clr" class="ghost danger">Limpar tudo</button>
        <input id="file" type="file" accept=".xlsx,.xls,.csv" hidden></div>
      <div id="lst"></div>`;
    const $ = s => body.querySelector(s);

    function render() {
      const rs = all(), t = CFO.norm(q);
      const v = rs.filter(r => CFO.norm([r.id, r.contrato, r.contratoNome, r.sol, r.mes, r.motivo, ...r.itens.map(i => i.item)].join(' ')).includes(t));
      $('#cards').innerHTML = [['Requisições', rs.length], ['Itens aprovados', rs.reduce((a, r) => a + qtd(r), 0)],
        ['Valor aprovado', R$(rs.reduce((a, r) => a + total(r), 0))], ['Contratos atendidos', new Set(rs.map(r => r.contrato)).size]]
        .map(d => `<div class="card"><small>${d[0]}</small><b>${d[1]}</b></div>`).join('');
      $('#lst').innerHTML = v.map(r => `<div class="foto" data-id="${esc(r.id)}"><div><b>${esc(r.id)}</b> · Contrato ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<br>${esc(r.sol)}<br>
        <small>${esc(r.mes)} · ${r.itens.length} linha(s) · ${R$(total(r))}</small></div></div>`).join('')
        || '<p class="empty">Nenhuma requisição. Importe a planilha de aprovações ou use "Importar pasta".</p>';
      body.querySelectorAll('.foto').forEach(el => el.onclick = () => detail(rs.find(r => r.id === el.dataset.id)));
    }

    function detail(r) {
      CFO.open('Requisição ' + r.id, b => {
        b.innerHTML = `<div class="card" style="margin-bottom:1rem"><b style="font-size:1.1rem">${esc(r.id)}</b>
          <p class="log">Contrato: ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<br>Data: ${esc(r.mes)}<br>Solicitante: ${esc(r.sol)}<br>Motivo: ${esc(r.motivo)}</p></div>
          <div class="tw"><table><thead><tr><th>Item</th><th>Tam.</th><th>Solic.</th><th>Aprov.</th><th>Preço</th><th>Total</th></tr></thead><tbody>
          ${r.itens.map(i => `<tr><td>${esc(i.item)}</td><td>${esc(i.tam)}</td><td>${i.qs}</td><td>${i.qa}</td><td>${R$(i.preco)}</td><td>${R$(i.qa * i.preco)}</td></tr>`).join('')}
          <tr><th>Totais</th><th></th><th>${r.itens.reduce((a, i) => a + i.qs, 0)}</th><th>${qtd(r)}</th><th></th><th>${R$(total(r))}</th></tr></tbody></table></div>
          <div class="bar" style="margin-top:1rem"><button id="del" class="ghost danger">Excluir requisição</button></div>`;
        b.querySelector('#del').onclick = () => {
          if (!confirm('Excluir esta requisição?')) return;
          CFO.store.set('requisicoes', CFO.store.get('requisicoes', []).filter(x => x.id !== r.id)); CFO.close(); render();
        };
      });
    }

    $('#q').oninput = e => { q = e.target.value; render(); };
    $('#imp').onclick = () => $('#file').click();
    $('#file').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const s = (await CFO.readBook(f)).find(x => score(x.data) >= 4);
      if (!s) { alert('Não reconheci uma planilha de requisição nesse arquivo.'); return; }
      const r = importData(s.data); render();
      alert(`${r.add} requisição(ões) nova(s)` + (r.upd ? `, ${r.upd} atualizada(s)` : '') + '.');
    };
    $('#clr').onclick = () => { if (confirm('Apagar TODO o histórico de requisições?')) { CFO.store.set('requisicoes', []); render(); } };
    render();
  };
  CFO.modules.requisicoes = Object.assign(api, { cfg: { title: 'Requisição', hints: ['requisic', 'aprovac'] }, score, importData });
})();
