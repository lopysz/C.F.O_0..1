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

  // Impressão / PDF da requisição (modelo "Relatório de Requisição"): cabeçalho com logo, dados, resumo dos itens aprovados e aviso.
  // Não mostra nome de colaborador - só código, item, tamanho e quantidade.
  const relatorio = r => {
    const achar = CFO.casarEpi(CFO.store.get('epi', []));
    const resumo = new Map();
    r.itens.filter(i => i.qa > 0).forEach(i => { const k = CFO.norm(i.item) + '|' + CFO.norm(i.tam), x = resumo.get(k) || { item: i.item, tam: i.tam || 'N/A', qa: 0 }; x.qa += i.qa; resumo.set(k, x); });
    const linhas = [...resumo.values()], vS = r.itens.reduce((a, i) => a + i.qs * i.preco, 0);
    const card = (t, v, cls = '') => `<div class="rq-c"><small>${t}</small><b class="${cls}">${v}</b></div>`;
    const html = `<style>
      .rq{padding:14mm 12mm;font-family:Arial,Helvetica,sans-serif;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .rq-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.rq-top img{height:64px;max-width:160px;object-fit:contain}
      .rq-top h1{margin:0;font-size:20px;color:#058a5b;text-transform:uppercase;text-align:right}
      .rq-g{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
      .rq-c{border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;break-inside:avoid}.rq-c small{display:block;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:#7b889c;margin-bottom:5px}
      .rq-ck{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;font-weight:700}.rq-ck span{display:flex;align-items:center;gap:6px}.rq-ck i{display:inline-block;width:14px;height:14px;border:1.5px solid #0f172a;border-radius:3px}
      .rq-c b{font-size:13px}.rq-c b.ok{color:#058a5b}
      .rq-box{border:1px solid #058a5b;border-radius:8px;padding:10px 12px;margin-bottom:14px}.rq-box h2{margin:0 0 8px;font-size:11px;color:#058a5b;text-transform:uppercase}
      .rq table{width:100%;border-collapse:collapse;font-size:11px}.rq th{background:#f4f6fa;border:1px solid #cbd5e1;padding:8px;font-size:9px;text-transform:uppercase}
      .rq td{border:1px solid #cbd5e1;padding:10px 8px;text-align:center;white-space:normal}.rq td.l{text-align:left;font-weight:700}.rq td.q{font-weight:700;color:#058a5b;font-size:14px}
      .rq tr{break-inside:avoid}
      .rq-av{border:1px solid #e5646b;background:#fdf0f0;color:#b91c1c;border-radius:8px;padding:12px;text-align:center;font-weight:700;font-size:11px;text-transform:uppercase}
      .rq-ft{margin-top:24px;border-top:4px solid #0f172a}
    </style>
    <div class="rq">
      <div class="rq-top"><img src="${CFO.LOGO}" alt=""><h1>C.F.O - Requisição</h1></div>
      <div class="rq-g">
        ${card('Solicitante', esc(r.sol || '-'))}${card('Número requisição', '# ' + esc(r.id))}
        ${card('Contrato / Unidade', esc(r.contrato) + (r.contratoNome ? ' - ' + esc(r.contratoNome) : ''))}${card('Mês / Ano', esc(r.mes || '-'))}
        ${card('Valor total solicitado', R$(vS))}${card('Valor total aprovado', R$(total(r)), 'ok')}
        ${card('Data e horário da impressão', new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(',', ' às'))}
        <div class="rq-c"><small>Controle</small><div class="rq-ck"><span><i></i>Separado</span><span><i></i>Nota feita</span><span><i></i>Retirado</span></div></div>
      </div>
      <div class="rq-box"><h2>Quadro de resumo total de itens aprovados</h2>
        <table><thead><tr><th>Código</th><th>Item / Descrição</th><th>Tamanho</th><th>Total aprovado</th></tr></thead><tbody>
        ${linhas.map(x => `<tr><td>${esc((achar(x.item) || {}).codigo || '-')}</td><td class="l">${esc(x.item)}</td><td>${esc(x.tam)}</td><td class="q">${x.qa}</td></tr>`).join('') || '<tr><td colspan="4">Nenhum item aprovado</td></tr>'}
        </tbody></table></div>
      <div class="rq-av">⚠ Atenção: você tem o prazo de 5 dias para retirar. Se não retirar, o produto irá voltar para o estoque. Obrigado.</div>
      <div class="rq-ft"></div>
    </div>`;
    const antes = document.title; document.title = 'Requisicao ' + r.id;
    window.addEventListener('afterprint', () => { document.title = antes; }, { once: true });
    CFO.print(html);
  };

  const api = body => {
    let q = '';
    const all = () => CFO.store.get('requisicoes', []).sort((a, b) => mesKey(b.mes).localeCompare(mesKey(a.mes)) || numCmp(b.id, a.id));
    body.innerHTML = `
      <div class="cards" id="cards"></div>
      <div class="bar"><input id="q" type="search" placeholder="Buscar nº, contrato, solicitante ou item...">
        ${CFO.periodo.html()}${CFO.motivo.html()}
        <button id="imp" class="ghost">Importar</button>${CFO.pode('apagar', 'requisicoes') ? '<button id="clr" class="ghost danger">Limpar tudo</button>' : ''}
        <input id="file" type="file" accept=".xlsx,.xls,.csv" hidden></div>
      <div id="lst"></div>`;
    const $ = s => body.querySelector(s);

    function render() {
      const todas = all(); CFO.periodo.fill(body, todas); CFO.motivo.fill(body, todas);
      const rs = todas.filter(CFO.periodo.test(body)).filter(CFO.motivo.test(body)), t = CFO.norm(q);
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
          <div class="bar" style="margin-top:1rem"><button id="prn">🖨 Imprimir / PDF</button>${CFO.pode('apagar', 'requisicoes') ? '<button id="del" class="ghost danger">Excluir requisição</button>' : ''}</div>`;
        b.querySelector('#prn').onclick = () => relatorio(r);
        (b.querySelector('#del') || {}).onclick = () => {
          if (!confirm('Excluir esta requisição?')) return;
          CFO.store.set('requisicoes', CFO.store.get('requisicoes', []).filter(x => x.id !== r.id)); CFO.close(); render();
        };
      });
    }

    $('#q').oninput = e => { q = e.target.value; render(); };
    $('#fm').onchange = $('#fa').onchange = $('#ft').onchange = render;
    $('#imp').onclick = () => $('#file').click();
    $('#file').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const s = (await CFO.readBook(f)).find(x => score(x.data) >= 4);
      if (!s) { alert('Não reconheci uma planilha de requisição nesse arquivo.'); return; }
      const r = importData(s.data); render();
      alert(`${r.add} requisição(ões) nova(s)` + (r.upd ? `, ${r.upd} atualizada(s)` : '') + '.');
    };
    ($('#clr') || {}).onclick = () => { if (confirm('Apagar TODO o histórico de requisições?')) { CFO.store.set('requisicoes', []); render(); } };
    render();
  };
  CFO.modules.requisicoes = Object.assign(api, { cfg: { title: 'Requisição', hints: ['requisic', 'aprovac'] }, score, importData });
})();
