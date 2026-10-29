/* ===== Jurídico Operacional > Gastos em EPIs =====
   Só o que se refere ao gasto com EPIs: gasto por mês, Curva ABC (custo e quantidade) e previsão dos próximos meses
   com base na média dos meses anteriores. Dados: Requisições (valores e quantidades). Filtros: contrato, tipo, mês e ano.
   (Pedidos MENSAIS por contrato, teto e revisão ficam no Controle mensal.) */
(() => {
  const esc = CFO.esc, P = CFO.periodo;
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const pct = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const curto = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : v >= 1e3 ? (v / 1e3).toFixed(1).replace('.', ',') + ' mil' : String(Math.round(v * 10) / 10).replace('.', ',');
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const valor = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0), qtd = r => r.itens.reduce((a, i) => a + i.qa, 0);
  const NOME_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const lbl = k => NOME_MES[k % 100 - 1] + '/' + Math.floor(k / 100);
  const prevKey = k => k % 100 === 1 ? k - 100 + 11 : k - 1;
  const nextKey = k => k % 100 === 12 ? k + 89 : k + 1;
  const COR = { a: '#3d8bfd', b: '#f5b84a', c: '#4cc38a', ruim: '#ff8a8f', mut: '#8fa3c4' };

  /* ---------- gráficos (SVG) ---------- */
  // bars: [{nome, cor, vals}] · lines: [{nome, cor, vals, dash, pct}] · cats: rótulos. pct = linha no eixo da direita (0-100%)
  const chart = ({ cats, bars = [], lines = [], fmt = curto, rot = false, rotulos = true, sobrepor = false }) => {
    if (!cats.length) return '<p class="empty">Sem dados no período.</p>';
    const n = cats.length, hasPct = lines.some(l => l.pct), L = 46, R = hasPct ? 42 : 12, T = 14, B = rot ? 96 : 30, H = 250 + (rot ? 38 : 0);
    const W = Math.max(640, n * (bars.length > 1 ? 74 : 54) + L + R), base = H - B, gw = (W - L - R) / n;
    const max = Math.max(1, ...bars.flatMap(b => b.vals), ...lines.filter(l => !l.pct).flatMap(l => l.vals));
    const mag = 10 ** Math.floor(Math.log10(max)), top = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= max) || max;
    const y = v => base - (base - T) * v / top, yp = v => base - (base - T) * v;
    const cx = i => L + gw * i + gw / 2;
    const bw = Math.min(30, (gw - 10) / (sobrepor ? 1 : Math.max(bars.length, 1)));
    const grade = [0, .25, .5, .75, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="var(--line)" stroke-width="${f ? .5 : 1}"/>
      <text x="${L - 6}" y="${y(top * f) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(top * f)}</text>
      ${hasPct ? `<text x="${W - R + 6}" y="${yp(f) + 3}" font-size="10" fill="var(--muted)">${Math.round(f * 100)}%</text>` : ''}`).join('');
    const barras = bars.map((b, j) => b.vals.map((v, i) => {
      const x = sobrepor ? cx(i) - bw / 2 : cx(i) - bw * bars.length / 2 + j * bw, h = base - y(v);
      return `<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(h, v > 0 ? 1 : 0)}" rx="3" fill="${b.cor}"><title>${esc(cats[i])} • ${esc(b.nome)}: ${esc(fmt(v))}</title></rect>`
        + (rotulos && n <= 12 && (bars.length === 1 || sobrepor) && v > 0 ? `<text x="${x + (bw - 2) / 2}" y="${y(v) - 4}" text-anchor="middle" font-size="10" fill="var(--text)">${fmt(v)}</text>` : '');
    }).join('')).join('');
    const linhas = lines.map(l => {
      const pts = l.vals.map((v, i) => [cx(i), l.pct ? yp(v) : y(v), v]);
      return `<polyline points="${pts.map(p => p.slice(0, 2).join(',')).join(' ')}" fill="none" stroke="${l.cor}" stroke-width="2" ${l.dash ? 'stroke-dasharray="6 4"' : ''}/>`
        + (l.dash ? '' : pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${l.cor}"><title>${esc(cats[i])} • ${esc(l.nome)}: ${esc(l.pct ? pct(p[2]) : fmt(p[2]))}</title></circle>`).join(''));
    }).join('');
    const rotulosX = cats.map((c, i) => rot
      ? `<text transform="translate(${cx(i)},${base + 12}) rotate(-35)" text-anchor="end" font-size="10" fill="var(--muted)"><title>${esc(c)}</title>${esc(c.length > 22 ? c.slice(0, 21) + '…' : c)}</text>`
      : `<text x="${cx(i)}" y="${base + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(c)}</text>`).join('');
    const leg = [...bars, ...lines].map(s => `<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('');
    return `<div class="legend">${leg}</div><div class="tw chart"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:560px;height:auto" role="img">${grade}${barras}${linhas}${rotulosX}</svg></div>`;
  };

  // Barras horizontais de ranking: [{rot, v, extra}]
  const ranking = (dados, fmt) => {
    if (!dados.length) return '<p class="empty">Sem dados no período.</p>';
    const max = Math.max(...dados.map(d => d.v), 1);
    return `<div class="hbars">${dados.map(d => `<div class="hb"><span class="hl">${esc(d.rot)}</span><span class="hv">${fmt(d.v)}${d.extra ? ' · ' + d.extra : ''}</span>
      <span class="ht"><i style="width:${Math.max(2, 100 * d.v / max)}%"></i></span></div>`).join('')}</div>`;
  };
  const tab = (cab, linhas) => `<div class="tw"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('') || `<tr><td colspan="${cab.length}" class="empty">Sem dados</td></tr>`}</tbody></table></div>`;
  const delta = (atual, ant) => ant ? `<small class="${atual > ant ? 'up' : atual < ant ? 'down' : ''}">${atual > ant ? '▲' : atual < ant ? '▼' : '='} ${pct(Math.abs(atual - ant) / ant)} vs mês anterior</small>` : '<small>sem mês anterior para comparar</small>';
  const tile = (t, v, sub = '') => `<div class="card"><small>${t}</small><b>${v}</b>${sub}</div>`;

  CFO.modules.controle_gastos = body => {
    let f = { c: '', b: 3 }, det = null, ultimo = null;
    body.style.maxWidth = '1280px';
    body.innerHTML = `<details class="sobre"><summary>ℹ️ Para que serve esta tela</summary><p><b>Gastos em EPIs</b> mostra <b>quanto se gasta com cada EPI</b>: gasto por mês, <b>Curva ABC</b> (custo e quantidade) e a <b>previsão dos próximos meses</b>, calculada pela média dos meses anteriores. Os valores contam no <b>mês da requisição</b>, de qualquer tipo de pedido (use o filtro Tipo para separar).</p><p>Para acompanhar e planejar os pedidos <b>MENSAIS</b> de cada contrato (mês de retirada, teto, revisão), use o <b>Controle mensal</b>.</p></details>
      <div class="bar"><select id="fc"></select>${P.html()}${CFO.motivo.html()}
        <select id="fb" aria-label="Base da previsão"><option value="3">Previsão: média de 3 meses</option><option value="6">Previsão: média de 6 meses</option><option value="12">Previsão: média de 12 meses</option></select>
        <span class="exp"><button id="exp" class="ghost" title="Exportar o que está na tela em Excel ou PDF">Exportar</button></span></div>
      <div id="out"></div>`;
    CFO.filtros(body);
    const $ = s => body.querySelector(s);
    const todas = () => CFO.store.get('requisicoes', []);
    const curKey = () => { const d = new Date(); return d.getFullYear() * 100 + d.getMonth() + 1; };
    const NPREV = 3;

    function opcoes() {
      const rs = todas(), m = new Map();
      rs.forEach(r => { if (!m.has(r.contrato)) m.set(r.contrato, r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')); });
      $('#fc').innerHTML = '<option value="">Todos os contratos</option>' + [...m].sort((a, b) => numCmp(a[0], b[0])).map(([k, t]) => `<option value="${esc(k)}" ${k === f.c ? 'selected' : ''}>${esc(t)}</option>`).join('');
      P.fill(body, rs); CFO.motivo.fill(body, rs);
    }

    function render() {
      const m = $('#fm').value, y = $('#fa').value;
      // base: contrato + tipo · tend: + ano (todos os meses) · rs: + mês (o que totais e Curva ABC usam)
      const base = todas().filter(r => (!f.c || r.contrato === f.c) && CFO.motivo.fn($('#ft').value)(r));
      const tend = base.filter(P.fn('', y)), rs = tend.filter(P.fn(m, y));
      const key = r => P.key(r.mes);
      const seq = lista => { const ks = lista.map(key).filter(Boolean); const o = []; if (ks.length) for (let k = Math.min(...ks); k <= Math.max(...ks); k = nextKey(k)) o.push(k); return o; };
      const porMes = (lista, fn) => { const mp = new Map(); lista.forEach(r => mp.set(key(r), (mp.get(key(r)) || 0) + fn(r))); return mp; };

      const meses = seq(tend), mV = porMes(tend, valor), mQ = porMes(tend, qtd), mN = porMes(tend, () => 1);
      const mesRef = m ? [...meses].reverse().find(k => k % 100 === +m) : meses[meses.length - 1];
      const nMeses = Math.max(1, meses.filter(k => !m || k % 100 === +m).length);
      const totV = rs.reduce((a, r) => a + valor(r), 0), totQ = rs.reduce((a, r) => a + qtd(r), 0);

      /* ---- Previsão: média dos meses anteriores (o mês em andamento não entra na média) ---- */
      const hist = seq(base), cur = curKey(), fechados = hist.filter(k => k < cur), W = (fechados.length ? fechados : hist).slice(-f.b);
      const ultMes = hist[hist.length - 1];
      const prevMeses = []; if (ultMes) { let k = ultMes; for (let i = 0; i < NPREV; i++) { k = nextKey(k); prevMeses.push(k); } }
      const wSet = new Set(W), eV = new Map();
      base.filter(r => wSet.has(key(r))).forEach(r => r.itens.forEach(i => { const b = CFO.baseEpi(i.item), x = eV.get(b) || { nome: b, qtd: 0, valor: 0 }; x.qtd += i.qa; x.valor += i.qa * i.preco; eV.set(b, x); }));
      const nW = Math.max(1, W.length);
      const prevItens = [...eV.values()].filter(x => x.valor > 0 || x.qtd > 0).map(x => ({ ...x, mq: x.qtd / nW, mv: x.valor / nW, pu: x.qtd ? x.valor / x.qtd : 0 })).sort((a, b) => b.mv - a.mv);
      const prevMes = prevItens.reduce((a, x) => a + x.mv, 0);
      const baseTxt = W.length ? `média de ${W.length} mês(es) fechado(s): ${lbl(W[0])}${W.length > 1 ? ' a ' + lbl(W[W.length - 1]) : ''}` : 'sem meses anteriores';

      /* ---- Curva ABC: classe pelo % acumulado (até 80% = A, até 95% = B, resto = C) ---- */
      const itens = new Map();
      rs.forEach(r => r.itens.forEach(i => { const b = CFO.baseEpi(i.item), x = itens.get(b) || { nome: b, qtd: 0, valor: 0 }; x.qtd += i.qa; x.valor += i.qa * i.preco; itens.set(b, x); }));   // todos os tamanhos juntos
      const curva = (campo, tot) => { let ac = 0; return [...itens.values()].filter(x => x[campo] > 0).sort((a, b) => b[campo] - a[campo]).map((x, i) => { ac += x[campo]; const p = tot ? ac / tot : 0; return { ...x, p, cls: i === 0 || p <= .8 ? 'A' : p <= .95 ? 'B' : 'C' }; }); };
      const abcC = curva('valor', totV), abcQ = curva('qtd', totQ);
      const resC = ['A', 'B', 'C'].map(k => { const l = abcC.filter(x => x.cls === k); return { k, n: l.length, p: totV ? l.reduce((a, x) => a + x.valor, 0) / totV : 0 }; });

      const semMes = rs.filter(r => !key(r)).length;
      const aviso = semMes ? `<p class="log">${semMes} requisição(ões) sem mês reconhecido não entram nos gráficos mensais.</p>` : '';
      const painel = (titulo, corpo, cls = 'w12', sub = '') => `<section class="pn ${cls}"><header><h3>${titulo}</h3>${sub ? `<small>${sub}</small>` : ''}</header>${corpo}</section>`;

      const vRef = mesRef ? mV.get(mesRef) || 0 : 0, vAnt = mesRef ? mV.get(prevKey(mesRef)) || 0 : 0, tA = resC[0];
      const kpis = [
        tile('Gasto no período', R$(totV), `<small>${rs.length} req. · ${N(totQ)} itens</small>`),
        tile(`Mês de referência${mesRef ? ' (' + lbl(mesRef) + ')' : ''}`, R$(vRef), mesRef ? delta(vRef, vAnt) : ''),
        tile('Média mensal', R$(totV / nMeses), `<small>em ${nMeses} mês(es)</small>`),
        tile(`Previsão ${prevMeses.length ? lbl(prevMeses[0]) : ''}`, R$(prevMes), `<small>${baseTxt}</small>`),
        tile(`Previsão ${NPREV} meses`, R$(prevMes * NPREV), `<small>${prevMeses.length ? lbl(prevMeses[0]) + ' a ' + lbl(prevMeses[NPREV - 1]) : ''}</small>`),
        tile('Classe A', abcC.length ? pct(tA.p) : '-', `<small>${tA.n} EPI(s) = maior parte do custo</small>`)];

      // Gasto mensal + previsão (previsão só aparece quando o filtro mostra até o último mês)
      const comPrev = prevMeses.length && !m && meses.includes(ultMes);
      const cats = [...meses.map(lbl), ...(comPrev ? prevMeses.map(lbl) : [])];
      const barras = [{ nome: 'Gasto', cor: COR.a, vals: [...meses.map(k => mV.get(k) || 0), ...(comPrev ? prevMeses.map(() => 0) : [])] },
        ...(comPrev ? [{ nome: 'Previsão', cor: COR.b, vals: [...meses.map(() => 0), ...prevMeses.map(() => prevMes)] }] : [])];
      const listaPrev = prevMeses.length ? ranking(prevMeses.map(k => ({ rot: lbl(k), v: prevMes })), R$) + `<p class="log" style="margin-top:.6rem">Previsão = ${baseTxt}. O mês em andamento não entra na média.</p>` : '<p class="empty">Sem dados para prever.</p>';

      const sit = `<div class="sit">${resC.map(c => `<div><b>${c.n}</b><span class="tag">Classe ${c.k}</span></div>`).join('')}</div>
        <p class="log" style="margin-top:.6rem">${resC.map(c => `${c.k}: ${pct(c.p)} do custo`).join(' · ')}<br>A: até 80% do custo · B: até 95% · C: o restante.</p>`;
      const top = abcC.slice(0, 12);
      const paineis =
        painel('Gasto mensal e previsão', chart({ cats, bars: barras, fmt: curto, sobrepor: true }), 'w8', 'previsão em laranja')
        + painel('Previsão dos próximos meses', listaPrev, 'w4', 'valor por mês')
        + painel('Curva ABC (Pareto) - custo', chart({ cats: top.map(x => x.nome), bars: [{ nome: 'Custo', cor: COR.a, vals: top.map(x => x.valor) }], lines: [{ nome: '% acumulado', cor: COR.b, vals: top.map(x => x.p), pct: true }], rot: true, rotulos: false }), 'w8', 'top 12 EPIs')
        + painel('Classificação ABC', sit, 'w4', 'por custo');

      /* ---- Detalhamento ---- */
      const detalhes = {};
      detalhes['Curva ABC (custo)'] = tab(['#', 'EPI', 'Qtd', 'Custo', '% do total', '% acum.', 'Classe'], abcC.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nome)}</td><td>${N(x.qtd)}</td><td>${R$(x.valor)}</td><td>${pct(totV ? x.valor / totV : 0)}</td><td>${pct(x.p)}</td><td><b>${x.cls}</b></td></tr>`));
      detalhes['Curva ABC (quantidade)'] = tab(['#', 'EPI', 'Qtd', '% do total', '% acum.', 'Classe'], abcQ.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.nome)}</td><td>${N(x.qtd)}</td><td>${pct(totQ ? x.qtd / totQ : 0)}</td><td>${pct(x.p)}</td><td><b>${x.cls}</b></td></tr>`));
      detalhes['Previsão por EPI'] = `<p class="log">${esc(baseTxt)} · valor = quantidade média × preço médio do período. Previsão ${NPREV} meses = valor/mês × ${NPREV}.</p>`
        + tab(['EPI', 'Qtd média/mês', 'Preço médio', 'Valor/mês', `Previsão ${NPREV} meses`], prevItens.map(x => `<tr><td>${esc(x.nome)}</td><td>${N(x.mq)}</td><td>${R$(x.pu)}</td><td>${R$(x.mv)}</td><td>${R$(x.mv * NPREV)}</td></tr>`));
      let acum = 0, anoAcum = 0;
      const linhasMes = meses.map(k => { if (Math.floor(k / 100) !== anoAcum) { anoAcum = Math.floor(k / 100); acum = 0; } const v = mV.get(k) || 0; acum += v; const a = mV.get(prevKey(k)) || 0, dv = a ? (v - a) / a : null;
        return `<tr><td>${lbl(k)}</td><td>${mN.get(k) || 0}</td><td>${N(mQ.get(k) || 0)}</td><td>${R$(v)}</td><td class="${dv === null ? '' : dv > 0 ? 'up' : dv < 0 ? 'down' : ''}">${dv === null ? '-' : (dv > 0 ? '▲ ' : dv < 0 ? '▼ ' : '') + pct(Math.abs(dv))}</td><td>${R$(acum)}</td></tr>`; }).reverse();
      const linhasPrev = (comPrev ? [...prevMeses].reverse() : []).map(k => `<tr><td>${lbl(k)} (previsão)</td><td>-</td><td>-</td><td>${R$(prevMes)}</td><td>-</td><td>-</td></tr>`);
      detalhes['Resumo mensal'] = tab(['Mês', 'Req.', 'Itens', 'Gasto', 'Var. mês ant.', 'Acumulado no ano'], [...linhasPrev, ...linhasMes]);

      $('#out').innerHTML = `<div class="cards kpis">${kpis.join('')}</div><div class="dash">${paineis}
        <section class="pn w12"><header><h3>Detalhamento</h3><div class="subtabs" id="subtabs"></div></header><div id="det" class="scroll"></div></section></div>${aviso}`;
      ultimo = { kpis, paineis, detalhes, filtros: filtrosAtuais() };
      const nomes = Object.keys(detalhes);
      if (!nomes.includes(det)) det = nomes[0];
      const drawDet = () => {
        $('#subtabs').innerHTML = nomes.map(n => `<button class="ghost ${n === det ? 'on' : ''}" data-d="${esc(n)}">${esc(n)}</button>`).join('');
        $('#det').innerHTML = detalhes[det];
        body.querySelectorAll('#subtabs button').forEach(b => b.onclick = () => { det = b.dataset.d; drawDet(); });
      };
      drawDet();
    }

    /* ---------- Exportar o que está na tela (respeita contrato, tipo, mês, ano e base da previsão) ---------- */
    const txtSel = id => { const e = $(id); return e && e.selectedOptions[0] ? e.selectedOptions[0].text : ''; };
    const filtrosAtuais = () => [['Contrato', txtSel('#fc')], ['Tipo', txtSel('#ft')], ['Mês', txtSel('#fm')], ['Ano', txtSel('#fa')], ['Previsão', txtSel('#fb')]];
    const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const tituloRel = () => 'Gastos em EPIs';
    const dom = html => { const d = document.createElement('div'); d.innerHTML = html; return d; };
    const COLS_TEXTO = ['Contrato', 'Código', 'EPI', 'Solicitante', 'Mês'];
    const num = t => parseFloat(t.replace(/\./g, '').replace(',', '.'));
    // Converte o texto da célula (formato pt-BR) em número do Excel, para dar para somar/ordenar
    function celula(td, col) {
      const t = td.textContent.replace(/\s+/g, ' ').trim();
      if (!t) return '';
      if (COLS_TEXTO.includes(col)) return t;
      let m = t.match(/^R\$\s*(-?[\d.]+,\d+)$/); if (m) return { t: 'n', v: num(m[1]), z: '"R$" #,##0.00' };
      m = t.match(/^([▲▼])?\s*(-?[\d.]+(?:,\d+)?)%$/); if (m) return { t: 'n', v: (m[1] === '▼' ? -1 : 1) * num(m[2]) / 100, z: '0.0%' };
      if (/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t) && !/^0\d/.test(t)) return { t: 'n', v: num(t), z: t.includes(',') ? '#,##0.0' : '#,##0' };
      return t;
    }
    const largura = aoa => aoa[0].map((_, c) => ({ wch: Math.min(60, Math.max(8, ...aoa.map(r => { const x = r[c]; return String(x && x.t === 'n' ? '99.999,99' : x ?? '').length; })) + 2) }));

    function exportar() {
      if (!ultimo) return;
      const itens = [{ id: 'kpi', nome: 'Indicadores (resumo)' }, { id: 'graf', nome: 'Gráficos e painéis' }, ...Object.keys(ultimo.detalhes).map(n => ({ id: 'd:' + n, nome: n }))];
      CFO.exportar({ titulo: 'Exportar - ' + tituloRel(), itens, run: (fmt, sel, { logo }) => fmt === 'xlsx' ? excel(sel, logo) : pdf(sel, logo) });
    }
    function excel(sel, logo) {
      const folhas = [];
      if (sel.has('kpi')) {
        const cards = [...dom(ultimo.kpis.join('')).querySelectorAll('.card')].map(c => { const sm = [...c.querySelectorAll('small')]; return [sm[0].textContent, c.querySelector('b').textContent, sm.slice(1).map(x => x.textContent).join(' ')]; });
        folhas.push({ nome: 'Resumo', cabRow: 5 + ultimo.filtros.length, cols: [30, 28, 46], aoa: [[tituloRel()], ['Gerado em', agora()], [], ['Filtros aplicados'], ...ultimo.filtros.map(([k, v]) => [k, v]), [], ['Indicador', 'Valor', 'Observação'], ...cards] });
      }
      Object.entries(ultimo.detalhes).forEach(([nome, html]) => {
        if (!sel.has('d:' + nome)) return;
        const t = dom(html).querySelector('table'); if (!t) return;
        const cab = [...t.rows[0].cells].map(c => c.textContent.trim());
        const aoa = [cab, ...[...t.tBodies[0].rows].map(r => [...r.cells].map((c, i) => celula(c, cab[i])))];
        if (aoa.length === 2 && aoa[1].length === 1) return;   // "Sem dados"
        folhas.push({ nome: nome.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31), aoa, cabRow: 0, cols: largura(aoa) });
      });
      CFO.xlsxSalvar(`gastos-em-epis-${new Date().toISOString().slice(0, 10)}.xlsx`, folhas, { logo, svgs: sel.has('graf') ? CFO.extraiSvgs(ultimo.paineis) : [] });
    }
    function pdf(sel, logo) {
      const limpa = CFO.limpaCores;
      const tabelas = Object.entries(ultimo.detalhes).filter(([nome]) => sel.has('d:' + nome)).map(([nome, html]) => `<div class="sub">${esc(nome)}</div>${limpa(html)}`).join('');
      CFO.print(`<style>@page{size:A4 landscape;margin:10mm}</style><div class="rel">
        ${CFO.cabecalhoPdf(tituloRel(), logo)}
        <p class="meta">${ultimo.filtros.filter(x => x[1]).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' &nbsp;·&nbsp; ')}</p>
        <p class="meta">Gerado em ${esc(agora())}</p>
        ${sel.has('kpi') ? `<div class="cards">${kpis_html()}</div>` : ''}
        ${sel.has('graf') ? `<div class="dash">${limpa(ultimo.paineis)}</div>` : ''}
        ${tabelas ? `<h2>Detalhamento</h2>${tabelas}` : ''}</div>`);
    }
    const kpis_html = () => ultimo.kpis.join('');

    $('#exp').onclick = exportar;
    $('#fc').onchange = e => { f.c = e.target.value; render(); };
    $('#fb').onchange = e => { f.b = +e.target.value; render(); };
    $('#fm').onchange = $('#fa').onchange = $('#ft').onchange = render;
    opcoes(); render();
  };
})();
