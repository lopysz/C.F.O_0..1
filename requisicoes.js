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
    const agora = new Date().toISOString();                 // 'chegou' = quando a requisição entrou no sistema (usado no Painel do Início)
    fresh.forEach((r, id) => { const antiga = map.get(id); antiga ? upd++ : add++; r.chegou = antiga ? antiga.chegou : agora; if (!r.chegou) delete r.chegou; map.set(id, r); });
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
    let q = '', fotos = [], base = [], limite = 100, timer = 0;
    const meta = new Map(), fotosPor = new Map();      // cache: texto de busca/totais de cada requisição e retiradas por nº (calculados 1 vez, não a cada letra digitada)
    const POR_PAGINA = 100;
    const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const negs = () => CFO.store.get('req_negadas', {});          // { 'RQ-3370': 'data/hora em que foi marcada como negada' }  (guardado à parte: a sincronização do WL não apaga)
    // Retirada vem das fotos de separação ligadas ao nº da requisição (mesma regra do Painel)
    const retirada = r => fotosPor.get(CFO.norm(r.id)) || null;
    const retHtml = x => !x ? '' : x.ok === x.total ? `<span class="rqret">✔ RETIRADA${x.ts ? `<small>${fmtDH(x.ts)}</small>` : ''}</span>`
      : x.ok ? `<span class="rqret par">Retirada parcial<small>${x.ok} de ${x.total} fotos</small></span>` : '<span class="rqret esp">Aguardando retirada</span>';
    const all = () => CFO.store.get('requisicoes', []).sort((a, b) => mesKey(b.mes).localeCompare(mesKey(a.mes)) || numCmp(b.id, a.id));
    body.innerHTML = `
      <div class="cards" id="cards"></div>
      <div class="bar"><input id="q" type="search" placeholder="Buscar nº, contrato, solicitante ou item...">
        ${CFO.periodo.html()}${CFO.motivo.html()}<select id="fn" aria-label="Negadas"><option value="">Todas</option><option value="neg">Negadas</option><option value="nao">Sem as negadas</option></select>
        <button id="imp" class="ghost">Importar</button>${CFO.pode('apagar', 'requisicoes') ? '<button id="clr" class="ghost danger">Limpar tudo</button>' : ''}
        <input id="file" type="file" accept=".xlsx,.xls,.csv" hidden></div>
      <div id="lst"></div>`;
    const $ = s => body.querySelector(s);

    // Lê tudo do armazenamento UMA vez (e quando importar/apagar); digitar na busca só filtra o que já está na memória
    function carrega() {
      base = all(); meta.clear();
      base.forEach(r => meta.set(r, { t: CFO.norm([r.id, r.contrato, r.contratoNome, r.sol, r.mes, r.motivo, ...r.itens.map(i => i.item)].join(' ')), tot: total(r), qt: qtd(r) }));
      CFO.periodo.fill(body, base); CFO.motivo.fill(body, base);
      indexaFotos(); render();
    }
    function indexaFotos() {
      fotosPor.clear();
      fotos.forEach(f => { if (!f.req) return; const k = CFO.norm(f.req), x = fotosPor.get(k) || { total: 0, ok: 0, ts: '' }; x.total++; if (f.ret) { x.ok++; if ((f.retTs || '') > x.ts) x.ts = f.retTs || ''; } fotosPor.set(k, x); });
    }
    const filtros = () => { limite = POR_PAGINA; render(); };

    function render() {
      const neg = negs(), fn = $('#fn').value, t = CFO.norm(q);
      const rs = base.filter(CFO.periodo.test(body)).filter(CFO.motivo.test(body)).filter(r => !fn || (fn === 'neg') === !!neg[r.id]);
      const v = t ? rs.filter(r => meta.get(r).t.includes(t)) : rs;
      $('#cards').innerHTML = [['Requisições', rs.length], ['Itens aprovados', rs.reduce((a, r) => a + meta.get(r).qt, 0)],
        ['Valor aprovado', R$(rs.reduce((a, r) => a + meta.get(r).tot, 0))], ['Contratos atendidos', new Set(rs.map(r => r.contrato)).size]]
        .map(d => `<div class="card"><small>${d[0]}</small><b>${d[1]}</b></div>`).join('');
      $('#lst').innerHTML = v.slice(0, limite).map(r => { const n = neg[r.id]; return `<div class="foto rq${n ? ' neg' : ''}" data-id="${esc(r.id)}"><div class="rqtxt"><b>${esc(r.id)}</b> · Contrato ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<br>${esc(r.sol)}<br>
        <small>${esc(r.mes)} · ${r.itens.length} linha(s) · ${R$(total(r))}</small></div>
        <div class="rqdir">${n ? `<span class="rqneg">🚫 NEGADA<small>${fmtDH(n)}</small></span>` : ''}${retHtml(retirada(r))}<label class="fchk rqn" title="Marcar como negada (recusada depois de aprovada)"><input type="checkbox" class="ng" ${n ? 'checked' : ''}></label></div></div>`; }).join('')
        || '<p class="empty">Nenhuma requisição. Importe a planilha de aprovações ou use "Importar pasta".</p>';
      if (v.length > limite) { $('#lst').insertAdjacentHTML('beforeend', `<div class="bar" style="justify-content:center"><button id="mais" class="ghost">Mostrar mais (${v.length - limite} restantes)</button></div>`); $('#mais').onclick = () => { limite += POR_PAGINA; render(); }; }
      body.querySelectorAll('.foto .rqn').forEach(l => l.onclick = e => e.stopPropagation());
      body.querySelectorAll('.foto .ng').forEach(c => c.onchange = () => {
        const id = c.closest('.foto').dataset.id, m = { ...negs() };
        if (c.checked) { if (!confirm('Marcar ' + id + ' como NEGADA (recusada mesmo depois de aprovada)?')) { c.checked = false; return; } m[id] = new Date().toISOString(); }
        else delete m[id];
        CFO.store.set('req_negadas', m); render();
      });
      body.querySelectorAll('.foto').forEach(el => el.onclick = () => detail(base.find(r => r.id === el.dataset.id)));
    }

    function detail(r) {
      CFO.open('Requisição ' + r.id, b => {
        b.innerHTML = `<div class="card" style="margin-bottom:1rem"><b style="font-size:1.1rem">${esc(r.id)}</b>
          <p class="log">Contrato: ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<br>Data: ${esc(r.mes)}<br>Solicitante: ${esc(r.sol)}<br>Motivo: ${esc(r.motivo)}${negs()[r.id] ? `<br><b style="color:#e74c3c">🚫 NEGADA em ${fmtDH(negs()[r.id])}</b>` : ''}${(x => x ? `<br>Retirada: ${x.ok === x.total ? '✔ ' + (fmtDH(x.ts) || 'retirada') : x.ok ? 'parcial (' + x.ok + ' de ' + x.total + ' fotos)' : 'aguardando'}` : '')(retirada(r))}</p></div>
          <div class="tw"><table><thead><tr><th>Item</th><th>Tam.</th><th>Solic.</th><th>Aprov.</th><th>Preço</th><th>Total</th></tr></thead><tbody>
          ${r.itens.map(i => `<tr><td>${esc(i.item)}</td><td>${esc(i.tam)}</td><td>${i.qs}</td><td>${i.qa}</td><td>${R$(i.preco)}</td><td>${R$(i.qa * i.preco)}</td></tr>`).join('')}
          <tr><th>Totais</th><th></th><th>${r.itens.reduce((a, i) => a + i.qs, 0)}</th><th>${qtd(r)}</th><th></th><th>${R$(total(r))}</th></tr></tbody></table></div>
          <div class="bar" style="margin-top:1rem"><button id="prn">🖨 Imprimir / PDF</button>${CFO.pode('apagar', 'requisicoes') ? '<button id="del" class="ghost danger">Excluir requisição</button>' : ''}</div>`;
        b.querySelector('#prn').onclick = () => relatorio(r);
        (b.querySelector('#del') || {}).onclick = () => {
          if (!confirm('Excluir esta requisição?')) return;
          CFO.store.set('requisicoes', CFO.store.get('requisicoes', []).filter(x => x.id !== r.id)); CFO.close(); carrega();
        };
      });
    }

    $('#q').oninput = e => { q = e.target.value; clearTimeout(timer); timer = setTimeout(filtros, 200); };   // espera parar de digitar
    $('#fm').onchange = $('#fa').onchange = $('#ft').onchange = $('#fn').onchange = filtros;
    $('#imp').onclick = () => $('#file').click();
    $('#file').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      const s = (await CFO.readBook(f)).find(x => score(x.data) >= 4);
      if (!s) { alert('Não reconheci uma planilha de requisição nesse arquivo.'); return; }
      const r = importData(s.data); carrega();
      alert(`${r.add} requisição(ões) nova(s)` + (r.upd ? `, ${r.upd} atualizada(s)` : '') + '.');
    };
    ($('#clr') || {}).onclick = () => { if (confirm('Apagar TODO o histórico de requisições?')) { CFO.store.set('requisicoes', []); carrega(); } };
    carrega();
    CFO.db.all('fotos').then(l => { fotos = l; indexaFotos(); render(); }).catch(() => {});   // traz as retiradas (fotos de separação)
  };
  CFO.modules.requisicoes = Object.assign(api, { cfg: { title: 'Requisição', hints: ['requisic', 'aprovac'] }, score, importData });
})();
