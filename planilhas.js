/* ===== Fábrica de planilhas: tabela + dashboard + importar/exportar =====
   cfg: { key, title, hints, nameKey, dedupe, columns:[{k,label,alias,type,options}], dash(rows,movs), moves, qty } */

// Lê todas as abas de um arquivo .xlsx/.xls/.csv como matrizes de texto
CFO.readBook = async file => {
  const wb = XLSX.read(await file.arrayBuffer());
  return wb.SheetNames.map(n => ({ sheet: n, data: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false }) }));
};

// Procura o cabeçalho (em qualquer linha) e reconhece colunas por nome/apelido. Devolve {hi, m, n}
CFO.findHeader = (data, columns, min = 2) => {
  const norm = CFO.norm, names = c => [c.label, ...(c.alias || [])].map(norm);
  const mapCols = hdr => {
    const m = {}, used = new Set(), h = hdr.map(norm);
    [true, false].forEach(exact => columns.forEach(c => {
      if (m[c.k] !== undefined) return;
      const i = h.findIndex((x, j) => x && !used.has(j) && names(c).some(n => exact ? x === n : x.includes(n)));
      if (i >= 0) { m[c.k] = i; used.add(i); }
    }));
    return m;
  };
  for (let i = 0; i < Math.min(data.length, 100); i++) {
    const m = mapCols(data[i]), n = Object.keys(m).length;
    if (n >= min) return { hi: i, m, n };
  }
  return { hi: -1, m: {}, n: 0 };
};

CFO.sheet = cfg => {
  const K = cfg.key, first = cfg.columns.find(c => c.k === cfg.nameKey) || cfg.columns[0], norm = CFO.norm;
  const dk = r => (cfg.dedupe || cfg.columns.map(c => c.k)).map(k => norm(r[k])).join('|');

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

  /* --- Leitura inteligente (cabeçalho em qualquer linha, colunas por nome) --- */
  const findHeader = data => CFO.findHeader(data, cfg.columns, Math.min(2, cfg.columns.length));
  const score = data => findHeader(data).n;           // quantas colunas reconhecidas (usado para rotear a pasta)
  const importData = data => {                        // grava direto no armazenamento
    let { hi, m } = findHeader(data);
    if (hi < 0) { hi = 0; cfg.columns.forEach((c, i) => m[c.k] = i); }
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
    let rows = CFO.store.get(K, []), movs = CFO.store.get(K + ':mov', []), q = '';
    const save = () => { CFO.store.set(K, rows); CFO.store.set(K + ':mov', movs); draw(); };
    const field = (c, v = '') => c.options
      ? `<label>${c.label}<select name="${c.k}">${c.options.map(o => `<option ${o == v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`
      : `<label>${c.label}<input name="${c.k}" type="${c.type || 'text'}" step="any" value="${CFO.esc(v)}" ${c === first ? 'required' : ''}></label>`;
    const form = (r = {}) => cfg.columns.map(c => field(c, r[c.k])).join('');

    function draw() {
      const list = rows.filter(r => JSON.stringify(Object.values(r)).toLowerCase().includes(q));
      body.innerHTML = `
        <div class="cards">${cfg.dash(rows, movs).map(d => `<div class="card ${d[2] || ''}"><small>${d[0]}</small><b>${d[1]}</b></div>`).join('')}</div>
        <div class="bar">
          <input id="q" type="search" placeholder="Buscar..." value="${CFO.esc(q)}">
          <button id="add">+ Adicionar</button>
          <button id="imp" class="ghost">Importar</button>
          <button id="exp" class="ghost">Exportar</button>
          <button id="clr" class="ghost danger">Limpar tudo</button>
          <input id="file" type="file" accept=".xlsx,.xls,.csv" hidden>
        </div>
        <div class="tw"><table><thead><tr>${cfg.columns.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr></thead><tbody>
          ${list.map(r => `<tr>${cfg.columns.map(c => `<td>${CFO.esc(r[c.k])}</td>`).join('')}
            <td class="act">${cfg.moves ? `<button data-m="${r.id}" title="Entrada/Saída">⇅</button>` : ''}<button data-e="${r.id}" title="Editar">✎</button><button data-d="${r.id}" title="Excluir">🗑</button></td></tr>`).join('')
            || '<tr><td colspan="99" class="empty">Nenhum registro. Adicione um item ou importe uma planilha.</td></tr>'}
        </tbody></table></div>
        ${cfg.moves && movs.length ? `<ul class="log"><b>Últimas movimentações</b>${movs.slice(-5).reverse().map(m => `<li>${m.tipo}: ${CFO.esc(m.item)} (${m.qtd}) - ${CFO.esc(m.resp)} - ${m.data.slice(0, 10)}</li>`).join('')}</ul>` : ''}`;
      bind();
    }

    function bind() {
      const $ = s => body.querySelector(s), find = id => rows.find(r => r.id === id);
      $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); const n = $('#q'); n.focus(); n.setSelectionRange(99, 99); };
      $('#add').onclick = () => CFO.dialog('Novo registro', form(), d => { rows.push({ id: Date.now() + Math.random().toString(36).slice(2, 5), ...clean(d) }); save(); });
      body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { const r = find(b.dataset.e); CFO.dialog('Editar registro', form(r), d => { Object.assign(r, clean(d)); save(); }); });
      body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('Excluir este registro?')) { rows = rows.filter(r => r.id !== b.dataset.d); save(); } });
      body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
        const r = find(b.dataset.m);
        CFO.dialog('Movimentar: ' + r[first.k],
          `<label>Tipo<select name="tipo"><option>Saída</option><option>Entrada</option></select></label>
           <label>Quantidade<input name="qtd" type="number" min="1" required></label>
           <label>Responsável<input name="resp"></label>`,
          d => { const n = +d.qtd; r[cfg.qty] = (+r[cfg.qty] || 0) + (d.tipo === 'Entrada' ? n : -n);
                 movs.push({ item: r[first.k], tipo: d.tipo, qtd: n, resp: d.resp, data: new Date().toISOString() }); save(); });
      });
      $('#exp').onclick = () => {
        const ws = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(cfg.columns.map(c => [c.label, r[c.k]]))));
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, K); XLSX.writeFile(wb, K + '.xlsx');
      };
      $('#clr').onclick = () => { if (confirm('Apagar TODOS os registros e movimentações desta planilha?')) { rows = []; movs = []; save(); } };
      $('#imp').onclick = () => $('#file').click();
      $('#file').onchange = async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        const sheets = await CFO.readBook(f), s = sheets.find(x => score(x.data) >= 2) || sheets[0];
        const { add, dup } = importData(s.data);
        rows = CFO.store.get(K, []); draw();
        alert(`${add} registro(s) importado(s)` + (dup ? `, ${dup} duplicado(s) ignorado(s)` : '') + '.');
      };
    }
    draw();
  };
  return Object.assign(api, { cfg, score, importData });
};
