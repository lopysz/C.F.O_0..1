/* ===== Ferramentas > Contagem de estoque =====
   - Tela inicial: botão "Fazer nova contagem" + histórico de contagens (filtro mês/ano)
   - Nova contagem: já lista os itens da Planilha EPI (só informar a quantidade) + adicionar item novo
   - Ao salvar: a Planilha EPI é atualizada com as quantidades contadas
   - Gráficos de evolução (aumento/queda) e exportação para Excel ou PDF
   Dados: 'contagens' (histórico) e 'contagem:rascunho' (contagem em andamento) no localStorage. */

CFO.modules.contagem = (() => {
  /* ---------- Utilitários ---------- */
  const esc = CFO.esc;
  const fmt = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const sg = v => v == null || v === '' ? '-' : (v > 0 ? '+' : '') + fmt(v);          // +12 / -3 / 0
  const cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '';
  const seta = v => v > 0 ? '▲' : v < 0 ? '▼' : '■';
  const dBR = dia => dia.split('-').reverse().join('/');                               // 2026-10-21 -> 21/10/2026
  const curto = dia => dia.slice(8, 10) + '/' + dia.slice(5, 7) + '/' + dia.slice(2, 4);
  const hojeLocal = () => new Date().toLocaleDateString('en-CA');
  const lista = () => CFO.store.get('contagens', []).sort((a, b) => (a.dia + a.ts).localeCompare(b.dia + b.ts));

  /* ---------- Cálculos ---------- */
  // Quantidade do item na contagem anterior em que ele apareceu
  const anterior = (all, i, rid) => {
    for (let j = i - 1; j >= 0; j--) { const x = all[j].itens.find(y => y.rid === rid); if (x) return x.qtd; }
    return null;
  };
  // Linhas de uma contagem, com diferença para o sistema e variação para a contagem anterior
  const linhas = (all, i) => all[i].itens.map(it => {
    const ant = anterior(all, i, it.rid);
    return { ...it, dif: it.sis == null ? null : it.qtd - it.sis, ant, v: ant == null ? null : it.qtd - ant };
  });
  const resumo = (all, i) => {
    const L = linhas(all, i), comp = L.filter(x => x.v != null);
    return { n: L.length, total: L.reduce((s, x) => s + x.qtd, 0), tem: comp.length > 0, v: comp.reduce((s, x) => s + x.v, 0),
             novos: L.filter(x => x.novo).length, div: L.filter(x => x.dif).length };
  };
  const serieTotal = L => L.map(c => ({ label: curto(c.dia), v: c.itens.reduce((s, x) => s + x.qtd, 0) }));
  const serieItem = (L, rid) => L.filter(c => c.itens.some(x => x.rid === rid)).map(c => ({ label: curto(c.dia), v: c.itens.find(x => x.rid === rid).qtd }));

  /* ---------- Gráficos (SVG puro: aparecem na tela, no PDF e viram imagem no Excel) ---------- */
  const TH = {
    dark: { bg: '', txt: '#e8eef9', mut: '#8fa3c4', grid: '#24406b', line: '#3d8bfd', up: '#4cd08a', dn: '#ff6b73' },
    light: { bg: '#ffffff', txt: '#111111', mut: '#555555', grid: '#d5dbe6', line: '#1f5fbf', up: '#1a8a4f', dn: '#c9363e' }
  };
  const svg = (w, h, t, inner) => ({ w, h, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Arial,Helvetica,sans-serif">${t.bg ? `<rect width="${w}" height="${h}" fill="${t.bg}"/>` : ''}${inner}</svg>` });

  // Linha: evolução ao longo das contagens (ponto verde = subiu, vermelho = caiu)
  const grafLinha = (titulo, pts, t) => {
    if (!pts.length) return null;
    const W = 720, H = 300, l = 60, r = 24, top = 46, b = 48, pw = W - l - r, ph = H - top - b, n = pts.length;
    let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v));
    if (lo === hi) { lo -= 1; hi += 1; }
    const mg = (hi - lo) * .12; lo = Math.max(0, lo - mg); hi += mg;
    const x = i => n === 1 ? l + pw / 2 : l + pw * i / (n - 1), y = v => top + ph - (v - lo) / (hi - lo) * ph;
    const passo = Math.ceil(n / 8);
    let s = `<text x="${l}" y="26" font-size="15" font-weight="700" fill="${t.txt}">${esc(titulo)}</text>`;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, yy = y(v);
      s += `<line x1="${l}" x2="${W - r}" y1="${yy}" y2="${yy}" stroke="${t.grid}"/><text x="${l - 8}" y="${yy + 4}" font-size="11" text-anchor="end" fill="${t.mut}">${fmt(Math.round(v * 10) / 10)}</text>`;
    }
    s += `<polyline fill="none" stroke="${t.line}" stroke-width="2.5" points="${pts.map((p, i) => x(i) + ',' + y(p.v)).join(' ')}"/>`;
    pts.forEach((p, i) => {
      const cor = i === 0 || p.v === pts[i - 1].v ? t.line : p.v > pts[i - 1].v ? t.up : t.dn;
      s += `<circle cx="${x(i)}" cy="${y(p.v)}" r="5" fill="${cor}"/>`;
      if (n <= 14) s += `<text x="${x(i)}" y="${y(p.v) - 10}" font-size="11" text-anchor="middle" fill="${t.txt}">${fmt(p.v)}</text>`;
      if (i % passo === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 20}" font-size="11" text-anchor="middle" fill="${t.mut}">${esc(p.label)}</text>`;
    });
    return svg(W, H, t, s);
  };

  // Barras: variação por item (verde = aumento, vermelho = queda)
  const grafBarras = (titulo, rows, t) => {
    if (!rows.length) return null;
    const W = 720, rh = 26, top = 46, lw = 250, area = W - lw - 30, H = top + rows.length * rh + 14;
    const zero = lw + area / 2, mx = Math.max(...rows.map(x => Math.abs(x.v))) || 1, k = (area / 2 - 44) / mx;
    let s = `<text x="20" y="26" font-size="15" font-weight="700" fill="${t.txt}">${esc(titulo)}</text><line x1="${zero}" x2="${zero}" y1="${top - 6}" y2="${H - 8}" stroke="${t.grid}"/>`;
    rows.forEach((r, i) => {
      const yy = top + i * rh, len = Math.abs(r.v) * k, nome = r.name.length > 34 ? r.name.slice(0, 33) + '…' : r.name, cor = r.v >= 0 ? t.up : t.dn;
      s += `<text x="${lw - 10}" y="${yy + 16}" font-size="11" text-anchor="end" fill="${t.txt}">${esc(nome)}</text>`
        + `<rect x="${r.v >= 0 ? zero : zero - len}" y="${yy + 3}" width="${len}" height="${rh - 8}" rx="3" fill="${cor}"/>`
        + `<text x="${r.v >= 0 ? zero + len + 6 : zero - len - 6}" y="${yy + 16}" font-size="11" text-anchor="${r.v >= 0 ? 'start' : 'end'}" fill="${t.txt}">${sg(r.v)}</text>`;
    });
    return svg(W, H, t, s);
  };

  const grafVar = (all, i, t) => grafBarras(`Maiores variações vs contagem anterior (${dBR(all[i].dia)})`,
    linhas(all, i).filter(x => x.v).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 15).map(x => ({ name: x.item, v: x.v })), t);
  // Gráficos padrão: evolução do total (até a contagem i) + variações da contagem i
  const graficos = (all, L, i, t) => [L.length > 1 ? grafLinha('Evolução do total do estoque', serieTotal(L), t) : null, i > 0 ? grafVar(all, i, t) : null].filter(Boolean);

  /* ---------- Tabelas (usadas no Excel e no PDF) ---------- */
  const tabDetalhe = (all, i) => ({
    nome: 'Contagem ' + dBR(all[i].dia).replace(/\//g, '-'),
    cab: ['Código', 'Item', 'Sistema', 'Contado', 'Diferença', 'Contagem anterior', 'Variação'],
    linhas: linhas(all, i).map(x => [x.codigo, x.item + (x.novo ? ' (novo)' : ''), x.sis ?? '', x.qtd, x.dif ?? '', x.ant ?? '', x.v ?? ''])
  });
  const tabResumo = (all, L) => ({
    nome: 'Resumo', cab: ['Data', 'Itens contados', 'Total', 'Variação vs anterior', 'Itens novos', 'Divergências vs sistema'],
    linhas: L.map(c => { const s = resumo(all, all.indexOf(c)); return [dBR(c.dia), s.n, s.total, s.tem ? s.v : '', s.novos, s.div]; })
  });
  const tabHist = L => {
    const ids = [], info = {};
    L.forEach(c => c.itens.forEach(x => { if (!info[x.rid]) { info[x.rid] = x; ids.push(x.rid); } }));
    return {
      nome: 'Histórico', cab: ['Código', 'Item', ...L.map(c => dBR(c.dia)), 'Variação (1ª a última)'],
      linhas: ids.map(id => {
        const q = L.map(c => c.itens.find(x => x.rid === id)?.qtd ?? ''), v = q.filter(x => x !== '');
        return [info[id].codigo, info[id].item, ...q, v.length > 1 ? v[v.length - 1] - v[0] : ''];
      })
    };
  };

  /* ---------- Exportação ---------- */
  const baixar = (blob, nome) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  const png = g => new Promise(res => {                                   // SVG -> PNG (para colocar o gráfico dentro do Excel)
    const i = new Image();
    i.onload = () => { const k = 2, c = document.createElement('canvas'); c.width = g.w * k; c.height = g.h * k; const x = c.getContext('2d'); x.scale(k, k); x.drawImage(i, 0, 0, g.w, g.h); res(c.toDataURL('image/png')); };
    i.onerror = () => res(null);
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(g.svg);
  });

  async function exportarXlsx(arquivo, tabelas, graf, logo) {
    const nomeAba = n => n.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    if (!window.ExcelJS) {                                                // sem a biblioteca (ex.: sem internet): só as tabelas
      const wb = XLSX.utils.book_new();
      tabelas.forEach(t => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.cab, ...t.linhas]), nomeAba(t.nome)));
      XLSX.writeFile(wb, arquivo);
      if (graf.length || logo) alert('A logo e os gráficos não puderam ser incluídos no Excel (biblioteca não carregada). Use o PDF para levar a logo e os gráficos.');
      return;
    }
    const wb = new ExcelJS.Workbook();
    tabelas.forEach(t => {
      const ws = wb.addWorksheet(nomeAba(t.nome)), off = logo ? CFO.xlsxLogo(wb, ws) : 0;
      ws.addRow(t.cab).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16294A' } }; });
      t.linhas.forEach(l => ws.addRow(l));
      t.cab.forEach((h, i) => { ws.getColumn(i + 1).width = Math.min(50, Math.max(String(h).length, ...t.linhas.map(l => String(l[i] ?? '').length)) + 3); });
      ws.views = [{ state: 'frozen', ySplit: off + 1 }];
    });
    if (graf.length) {
      const ws = wb.addWorksheet('Gráficos'); let row = logo ? CFO.xlsxLogo(wb, ws) + 1 : 1;
      for (const g of graf) {
        const p = await png(g); if (!p) continue;
        ws.addImage(wb.addImage({ base64: p, extension: 'png' }), { tl: { col: 0, row: row - 1 }, ext: { width: g.w, height: g.h } });
        row += Math.ceil(g.h / 20) + 2;
      }
    }
    baixar(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), arquivo);
  }

  // PDF: usa a impressão do navegador (escolha "Salvar como PDF")
  const celula = (h, v) => v === '' || v == null ? '' : typeof v !== 'number' ? v : /Diferen|Varia/.test(h) ? sg(v) : fmt(v);
  const tabHtml = t => `<table><thead><tr>${t.cab.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.linhas.map(l => `<tr>${l.map((c, j) => `<td class="${typeof c === 'number' ? 'n' : ''}">${esc(celula(t.cab[j], c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const pdf = (titulo, tabs, graf, logo) => CFO.print(`<div class="cnt-pdf">${CFO.cabecalhoPdf(titulo, logo)}<p class="sub">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
    ${graf.map(g => `<div class="gr">${g.svg}</div>`).join('')}${tabs.map(t => `<h2>${esc(t.nome)}</h2>${tabHtml(t)}`).join('')}</div>`);

  // Abre a janela de exportação: o usuário escolhe formato, o que levar e se quer a logo
  const janelaExport = (titulo, tabs, graf, arquivoXlsx, tituloPdf, tabsPdf) => {
    const itens = [...(graf.length ? [{ id: 'g', nome: 'Gráficos' }] : []), ...tabs.map((t, k) => ({ id: 't' + k, nome: t.nome }))];
    CFO.exportar({ titulo, itens, run: (fmt, sel, { logo }) => {
      const g = sel.has('g') ? graf : [];
      if (fmt === 'xlsx') exportarXlsx(arquivoXlsx, tabs.filter((t, k) => sel.has('t' + k)), g, logo);
      else pdf(tituloPdf, (tabsPdf || tabs).filter((t, k) => sel.has('t' + k)), g, logo);
    } });
  };
  const exportarContagem = (all, i) => {
    const graf = graficos(all, all.slice(0, i + 1), i, TH.light), tabs = [tabDetalhe(all, i)];
    janelaExport('Exportar contagem', tabs, graf, `contagem-${all[i].dia}.xlsx`, 'Contagem de estoque - ' + dBR(all[i].dia));
  };
  // extras: funções (tema) => gráfico, ex.: o gráfico do item escolhido
  const exportarPeriodo = (all, L, extras) => {
    if (!L.length) return alert('Nenhuma contagem no período escolhido.');
    const graf = [...graficos(all, L, all.indexOf(L[L.length - 1]), TH.light), ...extras.map(f => f(TH.light)).filter(Boolean)];
    // PDF: últimas 8 contagens no histórico (o Excel leva todas)
    janelaExport('Exportar histórico', [tabResumo(all, L), tabHist(L)], graf, 'contagens-estoque.xlsx', 'Contagem de estoque - histórico', [tabResumo(all, L), tabHist(L.slice(-8))]);
  };

  /* ---------- Nova contagem ---------- */
  function nova(done) {
    const epi = CFO.store.get('epi', []);
    let st = CFO.store.get('contagem:rascunho', null);
    if (st && !confirm('Há uma contagem em andamento. Continuar de onde parou?\n\nOK = continuar · Cancelar = começar uma nova do zero')) st = null;
    st = st || { dia: hojeLocal(), vals: {}, novos: [] };
    const grava = () => CFO.store.set('contagem:rascunho', st);
    const num = id => { const v = st.vals[id]; return v === undefined || v === '' ? null : Number(v); };

    CFO.open('Nova contagem', b => {
      const $ = s => b.querySelector(s);
      b.innerHTML = `
        <div class="bar"><input id="dia" type="date" value="${esc(st.dia)}" title="Data da contagem" style="width:auto">
          <input id="q" type="search" placeholder="Buscar item ou código..."><button id="nv" class="ghost">+ Novo item</button></div>
        <p class="log" id="prog"></p><div id="lst"></div>
        <div class="sticky-bot"><button id="sv">Salvar contagem</button></div>`;

      const todos = () => [...st.novos.map(n => ({ id: n.rid, codigo: n.codigo, item: n.item, sis: null, novo: true })),
                           ...epi.map(r => ({ id: r.id, codigo: r.codigo, item: r.item, sis: +r.qtd || 0 }))];
      const progresso = () => { const t = todos(); $('#prog').textContent = `${t.filter(r => num(r.id) !== null).length} de ${t.length} itens contados`; };
      const dv = el => {                                                   // mostra a diferença para o estoque do sistema enquanto digita
        const v = el.querySelector('input').value, s = el.dataset.s;
        el.querySelector('.dv').textContent = v === '' || s === '' ? '' : ' · Dif.: ' + sg(+v - +s);
      };

      function render() {
        const q = CFO.norm($('#q').value), v = todos().filter(r => !q || CFO.norm(r.item + r.codigo).includes(q));
        $('#lst').innerHTML = v.map(r => `
          <div class="crow" data-id="${esc(r.id)}" data-s="${r.sis ?? ''}">
            <div><b>${esc(r.item)}</b>${r.novo ? ' <span class="nv">Novo</span>' : ''}<br>
              <small>${r.codigo ? 'Cód. ' + esc(r.codigo) + ' · ' : ''}${r.novo ? 'Item novo' : 'Sistema: ' + fmt(r.sis)}</small><small class="dv"></small></div>
            <input type="number" inputmode="decimal" min="0" step="any" placeholder="Qtd" value="${esc(st.vals[r.id] ?? '')}"></div>`).join('')
          || '<p class="empty">Nenhum item. Importe a Planilha EPI ou toque em "+ Novo item".</p>';
        b.querySelectorAll('.crow').forEach(el => {
          dv(el);
          el.querySelector('input').oninput = e => { const v = e.target.value; if (v === '') delete st.vals[el.dataset.id]; else st.vals[el.dataset.id] = v; grava(); dv(el); progresso(); };
        });
        progresso();
      }

      $('#dia').onchange = e => { st.dia = e.target.value || hojeLocal(); grava(); };
      $('#q').oninput = render;
      $('#nv').onclick = () => CFO.dialog('Novo item',
        `<label>Código<input name="codigo"></label><label>Item / Descrição<input name="item" required></label><label>Quantidade contada<input name="qtd" type="number" min="0" step="any" required></label>`,
        d => {
          const nomes = new Set([...epi.map(r => CFO.norm(r.item)), ...st.novos.map(n => CFO.norm(n.item))]);
          if (nomes.has(CFO.norm(d.item))) return alert('Este item já está na lista. Procure por ele e informe a quantidade.');
          const rid = 'n' + Date.now() + Math.random().toString(36).slice(2, 5);
          st.novos.push({ rid, codigo: d.codigo.trim(), item: d.item.trim() }); st.vals[rid] = d.qtd; grava(); render();
        });

      $('#sv').onclick = () => {
        const itens = [];
        epi.forEach(r => { const q = num(r.id); if (q !== null) itens.push({ rid: r.id, codigo: r.codigo, item: r.item, sis: +r.qtd || 0, qtd: q }); });
        st.novos.forEach(n => itens.push({ rid: n.rid, codigo: n.codigo, item: n.item, sis: null, qtd: num(n.rid) ?? 0, novo: true }));
        if (!itens.length) return alert('Informe a quantidade de pelo menos um item.');
        if (itens.some(x => !(x.qtd >= 0))) return alert('Há quantidades inválidas (use números iguais ou maiores que zero).');
        const falta = epi.length - itens.filter(x => !x.novo).length, novos = itens.filter(x => x.novo).length;
        if (!confirm(`Salvar a contagem de ${itens.length} item(ns)?\n\n• A Planilha EPI será atualizada com as quantidades contadas.`
          + (falta ? `\n• ${falta} item(ns) sem quantidade ficam fora da contagem e mantêm o estoque atual.` : '')
          + (novos ? `\n• ${novos} item(ns) novo(s) será(ão) adicionado(s) à Planilha EPI.` : ''))) return;

        // 1) Atualiza a Planilha EPI (quantidades contadas + itens novos) e registra a movimentação
        const rows = CFO.store.get('epi', []), movs = CFO.store.get('epi:mov', []), agora = new Date().toISOString();
        itens.forEach(x => {
          const r = rows.find(y => y.id === x.rid);
          if (r) r.qtd = x.qtd; else rows.push({ id: x.rid, codigo: x.codigo, item: x.item, qtd: x.qtd });
          if (x.sis !== x.qtd) movs.push({ item: x.item, tipo: 'Contagem', qtd: x.qtd, ant: x.sis, resp: 'Contagem de estoque', data: agora });
        });
        CFO.store.set('epi', rows); CFO.store.set('epi:mov', movs);

        // 2) Guarda no histórico e limpa o rascunho
        const dia = st.dia || hojeLocal(), all = CFO.store.get('contagens', []);
        all.push({ id: Date.now() + Math.random().toString(36).slice(2, 5), dia, mes: dia.slice(0, 7), ts: agora, itens });
        CFO.store.set('contagens', all); CFO.store.set('contagem:rascunho', null);
        CFO.close(); done();
        alert('Contagem salva e Planilha EPI atualizada.');
      };
      render();
    });
  }

  /* ---------- Detalhe de uma contagem ---------- */
  function detalhe(all, i, refresh) {
    const c = all[i];
    CFO.open('Contagem de ' + dBR(c.dia), b => {
      const L = linhas(all, i), s = resumo(all, i), serie = all.slice(0, i + 1);
      const gt = serie.length > 1 ? grafLinha('Evolução do total do estoque', serieTotal(serie), TH.dark) : null, gv = i > 0 ? grafVar(all, i, TH.dark) : null;
      b.innerHTML = `
        <div class="cards">${[['Itens contados', s.n], ['Total contado', fmt(s.total)],
          ['Vs contagem anterior', s.tem ? `${seta(s.v)} ${sg(s.v)}` : '-', cls(s.v)], ['Divergências vs sistema', s.div, s.div ? 'warn' : ''], ['Itens novos', s.novos]]
          .map(d => `<div class="card ${d[2] || ''}"><small>${d[0]}</small><b>${d[1]}</b></div>`).join('')}</div>
        <div class="bar"><button id="ex">Exportar</button><button id="del" class="ghost danger">Excluir contagem</button></div>
        ${[gt, gv].filter(Boolean).map(g => `<div class="gr">${g.svg}</div>`).join('')}
        <div class="tw"><table><thead><tr><th>Código</th><th>Item</th><th>Sistema</th><th>Contado</th><th>Dif.</th><th>Anterior</th><th>Variação</th></tr></thead><tbody>
          ${L.map(x => `<tr><td>${esc(x.codigo)}</td><td>${esc(x.item)}${x.novo ? ' <span class="nv">Novo</span>' : ''}</td><td>${x.sis == null ? '-' : fmt(x.sis)}</td><td><b>${fmt(x.qtd)}</b></td>
            <td class="${cls(x.dif)}">${sg(x.dif)}</td><td>${x.ant == null ? '-' : fmt(x.ant)}</td><td class="${cls(x.v)}">${x.v == null ? '-' : seta(x.v) + ' ' + sg(x.v)}</td></tr>`).join('')}
        </tbody></table></div>`;
      b.querySelector('#ex').onclick = () => exportarContagem(all, i);
      b.querySelector('#del').onclick = () => {
        if (!confirm('Excluir esta contagem do histórico?\n\nO estoque da Planilha EPI não é alterado.')) return;
        CFO.store.set('contagens', all.filter(x => x.id !== c.id)); CFO.close(); refresh();
      };
    });
  }

  /* ---------- Tela de gráficos ---------- */
  function graficosTela(all, L) {
    CFO.open('Gráficos da contagem', b => {
      let rid = '';
      const itens = new Map(); L.forEach(c => c.itens.forEach(x => itens.set(x.rid, x.item)));
      b.innerHTML = `<div class="bar"><select id="it"><option value="">Total do estoque</option>${[...itens].sort((a, z) => a[1].localeCompare(z[1])).map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join('')}</select>
        <button id="ex">Exportar</button></div><div id="g"></div>`;
      const gi = t => grafLinha(rid ? 'Evolução: ' + itens.get(rid) : 'Evolução do total do estoque', rid ? serieItem(L, rid) : serieTotal(L), t);
      const draw = () => {
        const i = all.indexOf(L[L.length - 1]), g = [gi(TH.dark), i > 0 ? grafVar(all, i, TH.dark) : null].filter(Boolean);
        b.querySelector('#g').innerHTML = (L.length < 2 ? '<p class="empty">Faça pelo menos 2 contagens para acompanhar aumento e queda ao longo do tempo.</p>' : '')
          + g.map(x => `<div class="gr">${x.svg}</div>`).join('');
      };
      b.querySelector('#it').onchange = e => { rid = e.target.value; draw(); };
      b.querySelector('#ex').onclick = () => exportarPeriodo(all, L, rid ? [gi] : []);
      draw();
    });
  }

  /* ---------- Tela inicial da ferramenta ---------- */
  const api = body => {
    let per = { m: '', y: '' };
    function draw() {
      const all = lista(), L = all.filter(CFO.periodo.fn(per.m, per.y)), rasc = CFO.store.get('contagem:rascunho', null);
      body.innerHTML = `
        <button id="nova" class="big">+ Fazer nova contagem</button>
        ${rasc ? '<p class="log">Há uma contagem em andamento. Toque em "Fazer nova contagem" para continuar.</p>' : ''}
        <div class="bar">${CFO.periodo.html()}<button id="gr" class="ghost">📈 Gráficos</button><button id="ex" class="ghost">Exportar</button></div>
        <h3 class="sec">Contagens anteriores</h3>
        <div id="lst">${L.slice().reverse().map(c => {
          const i = all.indexOf(c), s = resumo(all, i);
          return `<div class="foto cnt" data-i="${i}"><div><b>${dBR(c.dia)}</b><br><small>${s.n} item(ns) · total ${fmt(s.total)}${s.novos ? ` · ${s.novos} novo(s)` : ''}</small></div>
            <div class="vr ${s.tem ? cls(s.v) : ''}">${s.tem ? `${seta(s.v)} ${sg(s.v)}` : 'Primeira'}</div></div>`;
        }).join('') || `<p class="empty">${all.length ? 'Nenhuma contagem neste período.' : 'Nenhuma contagem ainda. Toque em "Fazer nova contagem".'}</p>`}</div>`;
      body.querySelector('#fm').value = per.m; CFO.periodo.fill(body, all, per.y);
      body.querySelector('#fm').onchange = e => { per.m = e.target.value; draw(); };
      body.querySelector('#fa').onchange = e => { per.y = e.target.value; draw(); };
      body.querySelector('#nova').onclick = () => nova(draw);
      body.querySelector('#gr').onclick = () => L.length ? graficosTela(all, L) : alert('Nenhuma contagem no período escolhido.');
      body.querySelector('#ex').onclick = () => L.length ? exportarPeriodo(all, L, []) : alert('Nenhuma contagem no período escolhido.');
      body.querySelectorAll('.cnt').forEach(el => el.onclick = () => detalhe(all, +el.dataset.i, draw));
    }
    draw();
  };
  return Object.assign(api, { charts: { grafLinha, grafBarras } });
})();
