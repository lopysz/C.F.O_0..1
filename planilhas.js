/* ===== Fábrica de planilhas: tabela + dashboard + importar/exportar =====
   cfg: { key, title, hints, nameKey, dedupe, columns:[{k,label,alias,type,options}], dash(rows,movs), moves, qty } */

// Lê todas as abas de um arquivo .xlsx/.xls/.csv como matrizes de texto
CFO.readBook = async file => {
  if (!(await CFO.lib('xlsx'))) throw new Error('A biblioteca de Excel não carregou. Verifique a internet e tente de novo.');
  const wb = XLSX.read(await file.arrayBuffer());
  return wb.SheetNames.map(n => ({ sheet: n, data: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false }) }));
};

/* ----- Nomes diferentes para a mesma coluna -----
   Chave = campo do sistema (k). A planilha pode chamar de qualquer um destes nomes (sem acento, maiúscula ou pontuação importar).
   Para o campo "item" vale também a palavra que o setor escolheu no lugar de "EPI" (ex.: Peça). Acrescente à vontade. */
CFO.SINONIMOS = {
  codigo: ['identificador', 'identificacao', 'ident', 'id', 'cod', 'codigo do produto', 'cod produto', 'codigo do item', 'cod item', 'codigo material', 'codigo interno', 'referencia', 'ref', 'sku', 'part number', 'pn', 'numero do item'],
  item: ['descricao do item', 'descricao do produto', 'descricao do material', 'produto', 'produtos', 'nome do produto', 'nome do item', 'nome', 'material', 'materiais', 'epis', 'equipamento', 'equipamentos', 'ferramenta', 'ferramentas', 'peca', 'pecas', 'artigo', 'mercadoria', 'insumo', 'suprimento', 'denominacao', 'discriminacao', 'especificacao', 'texto breve'],
  qtd: ['qtde', 'quant', 'qtd em estoque', 'quantidade em estoque', 'estoque', 'estoque atual', 'saldo', 'saldo atual', 'saldo em estoque', 'em estoque', 'disponivel', 'quantidade disponivel', 'qtd disponivel'],
  min: ['estoque minimo', 'qtd minima', 'quantidade minima', 'minima', 'min', 'ponto de pedido', 'estoque de seguranca'],
  num: ['numero do contrato', 'codigo do contrato', 'cod contrato'],
  nome: ['razao social', 'projeto', 'obra'],
  ini: ['data de inicio', 'inicio vigencia', 'vigencia inicio'],
  fim: ['data de termino', 'data final', 'fim vigencia', 'validade'],
  status: ['situacao do contrato']
};

// Procura o cabeçalho (em qualquer linha) e reconhece colunas por nome/apelido/sinônimo. Devolve {hi, m, n}
// Cada coluna da planilha só serve para um campo; em conflito vale o nome mais específico (ex.: "Estoque mínimo" é o mínimo, não a quantidade)
CFO.findHeader = (data, columns, min = 2) => {
  const norm = CFO.norm;
  const extra = k => k === 'item' && CFO.termo && CFO.termo.palavras ? CFO.termo.palavras() : [];
  const NOMES = columns.map(c => {
    const orig = [c.label, ...(c.alias || [])].map(norm).filter(Boolean), sin = [...(CFO.SINONIMOS[c.k] || []), ...extra(c.k)].map(norm).filter(Boolean);
    return [...orig.map((n, p) => ({ n, p, f: false })), ...sin.map((n, p) => ({ n, p: orig.length + p, f: true }))];
  });
  const mapCols = hdr => {
    const h = hdr.map(norm), cand = [];
    columns.forEach((c, ci) => NOMES[ci].forEach(({ n, p, f }) => h.forEach((x, i) => {
      if (!x) return;
      if (x === n) cand.push({ k: c.k, i, e: 1, p, l: n.length, ci });
      else if (x.includes(n) && (!f || n.length >= 5)) cand.push({ k: c.k, i, e: 0, p, l: n.length, ci });   // sinônimo curto (id, cod, qtd...) só vale se for a célula inteira
    })));
    cand.sort((a, b) => b.e - a.e || (a.e ? a.p - b.p : b.l - a.l || a.p - b.p) || a.ci - b.ci || a.i - b.i);
    const m = {}, usadas = new Set();
    cand.forEach(x => { if (m[x.k] === undefined && !usadas.has(x.i)) { m[x.k] = x.i; usadas.add(x.i); } });
    return m;
  };
  for (let i = 0; i < Math.min(data.length, 100); i++) {
    const m = mapCols(data[i]), n = Object.keys(m).length;
    if (n >= min) return { hi: i, m, n };
  }
  return { hi: -1, m: {}, n: 0 };
};

/* ----- Colunas lembradas -----
   Quando o sistema não entende alguma coluna, a pessoa escolhe uma vez e o sistema lembra para toda planilha com o mesmo cabeçalho. */
CFO.assinatura = hdr => { const c = (hdr || []).map(x => String(x ?? '').trim()); return c.filter(Boolean).length >= 2 ? c.map(CFO.norm).join('|') : ''; };
CFO.mapaSalvo = (key, data) => {
  const t = (CFO.store.get('mapeamentos', {}) || {})[key]; if (!t) return null;
  for (let i = 0; i < Math.min(data.length, 60); i++) { const a = CFO.assinatura(data[i]), e = a && t[a]; if (e) return { hi: i, m: { ...e.m } }; }
  return null;
};
CFO.mapaGuardar = (key, hdr, m) => { const a = CFO.assinatura(hdr); if (!a) return; const t = CFO.store.get('mapeamentos', {}) || {}; (t[key] = t[key] || {})[a] = { m }; CFO.store.set('mapeamentos', t); };

// Precisa perguntar? Sim se não achou o nome do item, ou se sobraram colunas na planilha e faltam campos no sistema
CFO.precisaConferir = (cfg, data, f) => {
  if (f.hi < 0) return true;
  const nome = cfg.nameKey || cfg.columns[0].k, usadas = new Set(Object.values(f.m));
  return f.m[nome] === undefined || ((data[f.hi] || []).some((x, i) => String(x ?? '').trim() && !usadas.has(i)) && cfg.columns.some(c => f.m[c.k] === undefined));
};

// Palpite para o que o cabeçalho não explicou: coluna de texto mais longa = nome; coluna só de números = quantidade
CFO.adivinhaColunas = (cfg, data, hi, m) => {
  const linhas = data.slice(hi + 1, hi + 41), ncol = Math.max(0, ...data.slice(hi, hi + 41).map(l => l.length));
  const usadas = new Set(Object.values(m)), col = i => linhas.map(l => String(l[i] ?? '').trim()).filter(Boolean);
  const num = i => { const c = col(i); return c.length ? c.filter(v => /^-?[\d.,]+$/.test(v)).length / c.length : 0; };
  const med = i => { const c = col(i); return c.length ? c.reduce((a, v) => a + v.length, 0) / c.length : 0; };
  const livres = () => [...Array(ncol).keys()].filter(i => !usadas.has(i) && col(i).length);
  const nomeK = cfg.nameKey || cfg.columns[0].k;
  if (m[nomeK] === undefined) { const b = livres().filter(i => num(i) < .3).sort((a, c) => med(c) - med(a))[0]; if (b !== undefined) { m[nomeK] = b; usadas.add(b); } }
  if (cfg.qty && m[cfg.qty] === undefined) { const b = livres().filter(i => num(i) >= .8).sort((a, c) => num(c) - num(a))[0]; if (b !== undefined) m[cfg.qty] = b; }
  return m;
};

// Janela "Conferir colunas": a pessoa liga cada campo do sistema a uma coluna da planilha (e, se a planilha não foi reconhecida, escolhe de que função ela é).
// Devolve { mod, hi, m } ou { cancel: true, todas } (todas = não perguntar mais nas próximas desta importação)
CFO.perguntarColunas = ({ nome, data, mods }) => new Promise(ok => {
  const esc = CFO.esc, T = t => CFO.termo ? CFO.termo.t(t) : t, corta = (t, n) => { t = String(t ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  const letra = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : '') + String.fromCharCode(65 + i % 26);
  const vazia = l => !(l || []).some(x => String(x ?? '').trim());
  const ncol = Math.max(1, ...data.slice(0, 60).map(l => l.length));
  let mod = mods[0], hi = 0, m = {}, res = null;
  const parte = () => {
    const f = CFO.findHeader(data, mod.cfg.columns, 1);
    hi = f.hi >= 0 ? f.hi : Math.max(0, data.findIndex(l => !vazia(l)));
    m = CFO.adivinhaColunas(mod.cfg, data, hi, f.hi >= 0 ? { ...f.m } : {});
  };
  parte();
  const d = document.createElement('dialog'); d.className = 'imp';
  const desenha = () => {
    const cols = mod.cfg.columns, nomeK = mod.cfg.nameKey || cols[0].k, hdr = hi >= 0 ? data[hi] || [] : [];
    const amostra = i => { const l = data.slice(hi + 1, hi + 40).find(x => String(x[i] ?? '').trim()); return l ? String(l[i]).trim() : ''; };
    const opcoes = sel => '<option value="">(não importar)</option>' + [...Array(ncol).keys()].filter(i => String(hdr[i] ?? '').trim() || amostra(i))
      .map(i => `<option value="${i}"${sel === i ? ' selected' : ''}>${letra(i)} · ${esc(corta(hdr[i] || '(sem título)', 24))}${amostra(i) ? ' — ex.: ' + esc(corta(amostra(i), 22)) : ''}</option>`).join('');
    d.innerHTML = `<form method="dialog"><h3>Conferir colunas</h3>
      <p class="log" style="margin-top:0">${esc(nome)}: o sistema não entendeu todas as colunas. Diga qual coluna da planilha é cada campo. Fica lembrado para as próximas planilhas com este mesmo cabeçalho.</p>
      ${mods.length > 1 ? `<label>Esta planilha é de<select id="pc-m">${mods.map((x, i) => `<option value="${i}"${x === mod ? ' selected' : ''}>${esc(T(x.cfg.title))}</option>`).join('')}</select></label>` : ''}
      <label>Linha do cabeçalho<select id="pc-h"><option value="-1"${hi < 0 ? ' selected' : ''}>Sem cabeçalho (os dados começam na linha 1)</option>${data.slice(0, 15).map((l, i) => vazia(l) ? '' : `<option value="${i}"${i === hi ? ' selected' : ''}>Linha ${i + 1} · ${esc(corta(l.filter(x => String(x ?? '').trim()).join(' | '), 40))}</option>`).join('')}</select></label>
      ${cols.map(c => `<label>${esc(T(c.label))}${c.k === nomeK ? ' *' : ''}<select data-k="${esc(c.k)}">${opcoes(m[c.k])}</select></label>`).join('')}
      <p class="log" id="pc-e" style="margin:0"></p>
      <label class="cf-ck"><input type="checkbox" id="pc-t"><span>Se eu cancelar, não perguntar das próximas planilhas desta importação</span></label>
      <div class="row"><button value="cancel" class="ghost" formnovalidate>Cancelar</button><button value="ok" id="pc-ok">Importar</button></div></form>`;
    const mm = d.querySelector('#pc-m'); if (mm) mm.onchange = () => { mod = mods[+mm.value]; parte(); desenha(); };
    d.querySelector('#pc-h').onchange = e => {
      hi = +e.target.value; m = {};
      if (hi < 0) mod.cfg.columns.forEach((c, i) => { if (i < ncol) m[c.k] = i; });     // sem cabeçalho: colunas na ordem do sistema
      else m = CFO.adivinhaColunas(mod.cfg, data, hi, { ...CFO.findHeader([data[hi] || []], mod.cfg.columns, 1).m });
      desenha();
    };
    d.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { s.value === '' ? delete m[s.dataset.k] : m[s.dataset.k] = +s.value; });
    d.querySelector('#pc-ok').onclick = ev => {
      if (m[nomeK] === undefined) { ev.preventDefault(); d.querySelector('#pc-e').textContent = 'Escolha a coluna de "' + T(cols.find(c => c.k === nomeK).label) + '" (obrigatória).'; return; }
      if (hi >= 0) CFO.mapaGuardar(mod.cfg.key, data[hi], m); res = { mod, hi, m: { ...m } };
    };
  };
  desenha();
  d.onclose = () => { const todas = !res && !!(d.querySelector('#pc-t') || {}).checked; d.remove(); ok(res && d.returnValue === 'ok' ? res : { cancel: true, todas }); };
  document.body.append(d); d.showModal();
});

// Mapa de colunas para importar uma planilha neste módulo: lembrado > reconhecido > pergunta. Devolve { hi, m } (ou { cancel: true })
CFO.mapaPara = async (mod, data, nome) => {
  const cfg = mod.cfg, salvo = CFO.mapaSalvo(cfg.key, data); if (salvo) return salvo;
  const f = CFO.findHeader(data, cfg.columns, Math.min(2, cfg.columns.length));
  return CFO.precisaConferir(cfg, data, f) ? CFO.perguntarColunas({ nome, data, mods: [mod] }) : f;
};

CFO.sheet = cfg => {
  const K = cfg.key, first = cfg.columns.find(c => c.k === cfg.nameKey) || cfg.columns[0], norm = CFO.norm;
  const dk = r => (cfg.dedupe || cfg.columns.map(c => c.k)).map(k => norm(r[k])).join('|');
  const fold = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();   // busca sem diferenciar acento nem maiúscula

  /* --- Tratamento de valores --- */
  const clean = d => {
    cfg.columns.forEach(c => {
      let v = d[c.k];
      if (c.type === 'number') { v = String(v ?? '').replace(/[^\d,.-]/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); d[c.k] = parseFloat(v) || 0; }
      else if (c.type === 'date') { const t = String(v ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (t) d[c.k] = `${t[3].length == 2 ? '20' + t[3] : t[3]}-${t[2].padStart(2, '0')}-${t[1].padStart(2, '0')}`; }
      else if (c.options && !c.options.includes(v)) d[c.k] = c.options[0];
    });
    return d;
  };

  /* --- Leitura inteligente (cabeçalho em qualquer linha, colunas por nome, apelido ou sinônimo) --- */
  const findHeader = data => CFO.findHeader(data, cfg.columns, Math.min(2, cfg.columns.length));
  const score = data => findHeader(data).n;           // quantas colunas reconhecidas (usado para rotear a pasta)
  const importData = (data, mapa) => {                // grava direto no armazenamento; mapa = { hi, m } (colunas escolhidas pela pessoa) ou automático
    const dado = !!(mapa && mapa.m);
    let { hi, m } = dado ? mapa : findHeader(data);
    if (!dado && hi < 0) { hi = 0; m = {}; cfg.columns.forEach((c, i) => m[c.k] = i); }   // sem nada reconhecido e sem escolha: colunas na ordem do sistema (a 1ª linha é o cabeçalho)
    const rows = CFO.store.get(K, []), seen = new Set(rows.map(dk)); let add = 0, dup = 0;
    data.slice(hi + 1).forEach(line => {
      const r = { id: Date.now() + Math.random().toString(36).slice(2, 7) };
      cfg.columns.forEach(c => r[c.k] = m[c.k] === undefined ? '' : String(line[m[c.k]] ?? '').trim());
      if (!r[first.k]) return;
      clean(r);
      const k = dk(r); if (seen.has(k)) { dup++; return; }
      seen.add(k); rows.push(r); add++;
    });
    CFO.store.set(K, rows);
    return { add, dup };
  };

  /* --- Tela da planilha --- */
  const api = body => {
    let rows = CFO.store.get(K, []), movs = CFO.store.get(K + ':mov', []), q = '', qv = '', solo = false, per = { m: '', y: '', t: '' };
    let cx = { cols: [], cards: [], filtro: null, todas: [] }, H = new WeakMap(), tq = null;   // H guarda o texto de busca de cada linha (some quando algo muda)
    const texto = r => { let t = H.get(r); if (t === undefined) { t = fold(Object.values(r).join(' ')); H.set(r, t); } return t; };
    const calcular = () => {                          // colunas calculadas a partir das requisições (cfg.calc) no período escolhido
      if (!cfg.calc) return { cols: [], cards: [], filtro: null, todas: [] };
      const todas = CFO.store.get('requisicoes', []), r = cfg.calc({ reqs: todas.filter(CFO.periodo.fn(per.m, per.y)).filter(CFO.motivo.fn(per.t)), rows });
      return { cols: r.cols || [], cards: r.cards || [], filtro: r.filtro, todas };
    };
    // mov = true só quando entrou/saiu estoque (assim não regrava nem reenvia à nuvem a lista de movimentações à toa)
    const save = mov => { H = new WeakMap(); CFO.store.set(K, rows); if (cfg.moves && mov) CFO.store.set(K + ':mov', movs); draw(); };
    const field = (c, v = '') => c.options
      ? `<label>${c.label}<select name="${c.k}">${c.options.map(o => `<option ${o == v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`
      : `<label>${c.label}${c.hint ? `<small>${c.hint}</small>` : ''}<input name="${c.k}" type="${c.type || 'text'}" step="any" value="${CFO.esc(v)}" ${c === first ? 'required' : ''}></label>`;
    const form = (r = {}) => cfg.columns.map(c => field(c, r[c.k])).join('');
    const filtrar = () => rows.filter(r => !q || texto(r).includes(q)).filter(r => !(solo && cx.filtro) || cx.filtro.test(r));
    const linhas = list => { const ed = CFO.pode('editar', K); return list.map(r => `<tr>${cfg.columns.map(c => `<td>${CFO.esc(r[c.k])}</td>`).join('')}${cx.cols.map(c => `<td>${CFO.esc(c.get(r))}</td>`).join('')}
            <td class="act">${ed && cfg.moves ? `<button data-m="${r.id}" title="Entrada/Saída">⇅</button>` : ''}${ed ? `<button data-e="${r.id}" title="Editar">✎</button>` : ''}${CFO.pode('apagar', K) ? `<button data-d="${r.id}" title="Excluir">🗑</button>` : ''}</td></tr>`).join('')
            || '<tr><td colspan="99" class="empty">Nenhum registro. Adicione um item ou importe uma planilha.</td></tr>'; };

    function draw() {
      const ed = CFO.pode('editar', K); cx = calcular();
      body.innerHTML = `
        <div class="cards">${[...cfg.dash(rows, movs), ...cx.cards].map(d => `<div class="card ${d[2] || ''}"><small>${d[0]}</small><b>${d[1]}</b></div>`).join('')}</div>
        <div class="bar">
          <input id="q" type="search" placeholder="Buscar..." value="${CFO.esc(qv)}">
          ${cfg.calc ? CFO.periodo.html() + CFO.motivo.html() : ''}
          ${cx.filtro ? `<button id="solo" class="ghost" data-f data-on="${solo ? 1 : 0}">${solo ? '✓ ' : ''}${cx.filtro.label}</button>` : ''}
          ${ed ? '<button id="add">+ Adicionar</button><button id="imp" class="ghost">Importar</button>' : ''}
          <button id="exp" class="ghost">Exportar</button>
          ${CFO.pode('apagar', K) ? '<button id="clr" class="ghost danger">Limpar tudo</button>' : ''}
          <input id="file" type="file" accept=".xlsx,.xls,.csv" hidden>
        </div>
        <div class="tw"><table><thead><tr>${cfg.columns.map(c => `<th>${c.label}</th>`).join('')}${cx.cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead><tbody>${linhas(filtrar())}</tbody></table></div>
        ${cfg.moves && movs.length ? `<ul class="log"><b>Últimas movimentações</b>${movs.slice(-5).reverse().map(m => `<li>${m.tipo}: ${CFO.esc(m.item)} (${m.qtd}) - ${CFO.esc(m.resp)} - ${m.data.slice(0, 10)}</li>`).join('')}</ul>` : ''}`;
      if (cfg.calc) {                                   // filtro de mês/ano
        body.querySelector('#fm').value = per.m; CFO.periodo.fill(body, cx.todas, per.y);
        body.querySelector('#fm').onchange = e => { per.m = e.target.value; draw(); };
        body.querySelector('#fa').onchange = e => { per.y = e.target.value; draw(); };
        CFO.motivo.fill(body, cx.todas, 'ft', per.t);
        body.querySelector('#ft').onchange = e => { per.t = e.target.value; draw(); };
      }
      bind(); CFO.filtros(body);
    }

    // Busca: troca só as linhas da tabela (a caixa de busca e o resto da tela não são refeitos, então não "pisca" nem perde o cursor)
    function refiltra() {
      const tb = body.querySelector('tbody'); if (!tb) return draw();
      tb.innerHTML = linhas(filtrar()); bindLinhas();
    }

    function bindLinhas() {
      const find = id => rows.find(r => r.id === id);
      body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { const r = find(b.dataset.e); CFO.dialog('Editar registro', form(r), d => { Object.assign(r, clean(d)); save(); }); });
      body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('Excluir este registro?')) { rows = rows.filter(r => r.id !== b.dataset.d); save(); } });
      body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        const r = find(b.dataset.m);
        CFO.dialog('Movimentar: ' + r[first.k],
          `<label>Tipo<select name="tipo"><option>Saída</option><option>Entrada</option></select></label>
           <label>Quantidade<input name="qtd" type="number" min="1" required></label>
           <label>Responsável<input name="resp"></label>`,
          d => { const n = +d.qtd; r[cfg.qty] = (+r[cfg.qty] || 0) + (d.tipo === 'Entrada' ? n : -n);
                 movs.push({ item: r[first.k], tipo: d.tipo, qtd: n, resp: d.resp, data: new Date().toISOString() }); save(true); });
      });
    }

    function bind() {
      const $ = s => body.querySelector(s);
      $('#q').oninput = e => { qv = e.target.value; q = fold(qv.trim()); clearTimeout(tq); tq = setTimeout(refiltra, 120); };
      if ($('#solo')) $('#solo').onclick = () => { solo = !solo; draw(); };
      if ($('#add')) $('#add').onclick = () => CFO.dialog('Novo registro', form(), d => { rows.push({ id: Date.now() + Math.random().toString(36).slice(2, 5), ...clean(d) }); save(); });
      bindLinhas();
      $('#exp').onclick = () => {
        const cols = [...cfg.columns.map(c => ({ label: c.label, get: r => r[c.k] })), ...calcular().cols.map(c => ({ label: c.label, get: c.get }))];
        const itens = cols.map((c, i) => ({ id: i, nome: c.label }));
        CFO.exportar({ titulo: 'Exportar - ' + K, itens, run: (fmt, sel, { logo }) => {
          const cs = cols.filter((c, i) => sel.has(i)), cab = cs.map(c => c.label), dados = rows.map(r => cs.map(c => c.get(r)));
          if (fmt === 'xlsx') CFO.xlsxSalvar(K + '.xlsx', [{ nome: K, aoa: [cab, ...dados], cabRow: 0, cols: cab.map((h, i) => Math.min(50, Math.max(String(h).length, ...dados.map(l => String(l[i] ?? '').length)) + 3)) }], { logo });
          else CFO.print(`<style>@page{size:A4 landscape;margin:10mm}</style><div class="rel">${CFO.cabecalhoPdf(K, logo)}<p class="meta">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
            <table><thead><tr>${cab.map(h => `<th>${CFO.esc(h)}</th>`).join('')}</tr></thead><tbody>${dados.map(l => `<tr>${l.map(v => `<td>${CFO.esc(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        } });
      };
      ($('#clr') || {}).onclick = () => { if (confirm('Apagar TODOS os registros e movimentações desta planilha?')) { rows = []; movs = []; save(true); } };
      if ($('#imp')) $('#imp').onclick = () => $('#file').click();
      if ($('#file')) $('#file').onchange = async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        let sheets; try { sheets = await CFO.readBook(f); } catch (err) { return alert(err.message || err); }
        const s = sheets.find(x => score(x.data) >= 2) || sheets.find(x => x.data.length) || sheets[0];
        const mapa = await CFO.mapaPara({ cfg }, s.data, f.name); if (mapa.cancel) return;   // colunas que o sistema não entendeu: a pessoa escolhe (e fica lembrado)
        const { add, dup } = importData(s.data, mapa);
        rows = CFO.store.get(K, []); H = new WeakMap(); draw();
        alert(`${add} registro(s) importado(s)` + (dup ? `, ${dup} duplicado(s) ignorado(s)` : '') + '.');
      };
    }

    // Chegaram dados novos pela nuvem (de outra pessoa/aparelho): atualiza a tela. Sem isso a tela ficava com a lista antiga e o próximo salvar sobrescrevia a mudança dos outros.
    const novos = () => {
      if (!body.isConnected) return document.removeEventListener('cfo-sync', novos);
      if (document.querySelector('dialog[open]')) return setTimeout(novos, 2500);     // com janela aberta espera fechar
      rows = CFO.store.get(K, []); movs = CFO.store.get(K + ':mov', []); H = new WeakMap(); draw();
    };
    document.addEventListener('cfo-sync', novos);
    draw();
  };
  return Object.assign(api, { cfg, score, importData });
};
