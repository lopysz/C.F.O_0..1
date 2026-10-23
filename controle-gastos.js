/* ===== Jurídico Operacional > Controle de gastos =====
   Painel no formato usado em controle de estoque (logística) e de gastos (financeiro):
   - Financeiro: cartões com variação vs. mês anterior, gasto mensal x meta x ano anterior, concentração (Pareto) por contrato,
     mapa de calor contrato x mês, ranking de EPIs e solicitantes, tabela mensal com acumulado.
   - Logística: cartões de giro/cobertura, entradas x saídas por mês com média móvel, Curva ABC (Pareto),
     posição de estoque com cobertura em meses e situação, retiradas por contrato e solicitante.
   Dados: Requisições (saídas e valores), Planilha EPI (estoque e entradas). Filtros: contrato, solicitante, mês e ano. */
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
  const chart = ({ cats, bars = [], lines = [], fmt = curto, rot = false, rotulos = true }) => {
    if (!cats.length) return '<p class="empty">Sem dados no período.</p>';
    const n = cats.length, hasPct = lines.some(l => l.pct), L = 46, R = hasPct ? 42 : 12, T = 14, B = rot ? 96 : 30, H = 250 + (rot ? 38 : 0);
    const W = Math.max(640, n * (bars.length > 1 ? 74 : 54) + L + R), base = H - B, gw = (W - L - R) / n;
    const max = Math.max(1, ...bars.flatMap(b => b.vals), ...lines.filter(l => !l.pct).flatMap(l => l.vals));
    const mag = 10 ** Math.floor(Math.log10(max)), top = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= max) || max;
    const y = v => base - (base - T) * v / top, yp = v => base - (base - T) * v;
    const cx = i => L + gw * i + gw / 2;
    const bw = Math.min(30, (gw - 10) / Math.max(bars.length, 1));
    const grade = [0, .25, .5, .75, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="var(--line)" stroke-width="${f ? .5 : 1}"/>
      <text x="${L - 6}" y="${y(top * f) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(top * f)}</text>
      ${hasPct ? `<text x="${W - R + 6}" y="${yp(f) + 3}" font-size="10" fill="var(--muted)">${Math.round(f * 100)}%</text>` : ''}`).join('');
    const barras = bars.map((b, j) => b.vals.map((v, i) => {
      const x = cx(i) - bw * bars.length / 2 + j * bw, h = base - y(v);
      return `<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(h, v > 0 ? 1 : 0)}" rx="3" fill="${b.cor}"><title>${esc(cats[i])} • ${esc(b.nome)}: ${esc(fmt(v))}</title></rect>`
        + (rotulos && n <= 12 && bars.length === 1 && v > 0 ? `<text x="${x + (bw - 2) / 2}" y="${y(v) - 4}" text-anchor="middle" font-size="10" fill="var(--text)">${fmt(v)}</text>` : '');
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
    let aba = 'fin', f = { c: '', s: '', v: '' }, det = {}, ultimo = null;
    body.style.maxWidth = '1280px';
    body.innerHTML = `<div class="tabs"><button id="tfin" class="ghost">Financeiro</button><button id="tlog" class="ghost">Logística</button></div>
      <div class="bar"><select id="fc"></select><select id="fs"></select><select id="fv" aria-label="Filtrar por valor"><option value="">Todos (com e sem valor)</option><option value="1">Só com valor</option></select>${P.html()}${CFO.motivo.html()}
        <label class="chk" id="metaL">Meta mensal (R$) <input id="meta" type="number" min="0" step="any" title="Meta mensal de gasto (opcional)" style="width:8rem"></label>
        <span class="exp"><button id="exp" class="ghost" title="Exportar o que está na tela em Excel ou PDF">Exportar</button></span></div>
      <div id="out"></div>`;
    const $ = s => body.querySelector(s);
    const todas = () => CFO.store.get('requisicoes', []);
    $('#meta').value = CFO.store.get('meta_mensal', '') || '';

    function opcoes() {
      const rs = todas(), m = new Map();
      rs.forEach(r => { if (!m.has(r.contrato)) m.set(r.contrato, r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')); });
      $('#fc').innerHTML = '<option value="">Todos os contratos</option>' + [...m].sort((a, b) => numCmp(a[0], b[0])).map(([k, t]) => `<option value="${esc(k)}" ${k === f.c ? 'selected' : ''}>${esc(t)}</option>`).join('');
      const sols = [...new Set(rs.filter(r => !f.c || r.contrato === f.c).map(r => r.sol || '(sem nome)'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      if (f.s && !sols.includes(f.s)) f.s = '';
      $('#fs').innerHTML = '<option value="">Todos os solicitantes</option>' + sols.map(s => `<option ${s === f.s ? 'selected' : ''}>${esc(s)}</option>`).join('');
      P.fill(body, rs); CFO.motivo.fill(body, rs);
      $('#metaL').hidden = aba !== 'fin';
    }

    function render() {
      $('#tfin').classList.toggle('on', aba === 'fin'); $('#tlog').classList.toggle('on', aba === 'log'); $('#metaL').hidden = aba !== 'fin';
      const m = $('#fm').value, y = $('#fa').value;
      // base: contrato + solicitante · tendência: + ano (todos os meses) · rs: + mês (o que os totais e rankings usam)
      const base = todas().filter(r => (!f.c || r.contrato === f.c) && (!f.s || (r.sol || '(sem nome)') === f.s) && CFO.motivo.fn($('#ft').value)(r));
      const tend = base.filter(P.fn('', y)), rs = tend.filter(P.fn(m, y));
      const key = r => P.key(r.mes);

      // meses contínuos (sem buracos) da tendência
      const ks = tend.map(key).filter(Boolean); let meses = [];
      if (ks.length) for (let k = Math.min(...ks); k <= Math.max(...ks); k = nextKey(k)) meses.push(k);
      const porMes = fn => { const mp = new Map(); tend.forEach(r => mp.set(key(r), (mp.get(key(r)) || 0) + fn(r))); return mp; };
      const mV = porMes(valor), mQ = porMes(qtd), mN = porMes(() => 1);
      const mVAll = new Map(); base.forEach(r => mVAll.set(key(r), (mVAll.get(key(r)) || 0) + valor(r)));
      const mesRef = m ? [...meses].reverse().find(k => k % 100 === +m) : meses[meses.length - 1];
      const nMeses = Math.max(1, meses.filter(k => !m || k % 100 === +m).length);
      const totV = rs.reduce((a, r) => a + valor(r), 0), totQ = rs.reduce((a, r) => a + qtd(r), 0);

      const grp = (lista, ch, nm) => { const mp = new Map(); lista.forEach(r => { const k = ch(r), x = mp.get(k) || { k, nome: nm(r), n: 0, valor: 0, qtd: 0 }; x.n++; x.valor += valor(r); x.qtd += qtd(r); mp.set(k, x); }); return [...mp.values()]; };
      const porContrato = campo => grp(rs, r => r.contrato, r => r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')).filter(x => !f.v || x.valor > 0).sort((a, b) => b[campo] - a[campo]);
      const porSol = campo => grp(rs, r => r.sol || '(sem nome)', r => r.sol || '(sem nome)').sort((a, b) => b[campo] - a[campo]);
      const itens = new Map();
      rs.forEach(r => r.itens.forEach(i => { const x = itens.get(i.item) || { nome: i.item, qtd: 0, valor: 0 }; x.qtd += i.qa; x.valor += i.qa * i.preco; itens.set(i.item, x); }));
      const porItem = campo => [...itens.values()].sort((a, b) => b[campo] - a[campo]);
      const semMes = rs.filter(r => !key(r)).length;
      const aviso = semMes ? `<p class="log">${semMes} requisição(ões) sem mês reconhecido não entram nos gráficos mensais.</p>` : '';

      const painel = (titulo, corpo, cls = 'w12', sub = '') => `<section class="pn ${cls}"><header><h3>${titulo}</h3>${sub ? `<small>${sub}</small>` : ''}</header>${corpo}</section>`;
      const rk = (lista, v, fmt, n = 6, total = 0) => ranking(lista.slice(0, n).map(x => ({ rot: x.nome, v: x[v], extra: total ? pct(x[v] / total) : '' })), fmt);
      let detalhes = {}, detAtual = null;
      const { kpis, paineis } = aba === 'fin' ? financeiro() : logistica();
      $('#out').innerHTML = `<div class="cards kpis">${kpis.join('')}</div><div class="dash">${paineis}
        <section class="pn w12"><header><h3>Detalhamento</h3><div class="subtabs" id="subtabs"></div></header><div id="det" class="scroll"></div></section></div>${aviso}`;
      ultimo = { aba, kpis, paineis, detalhes, filtros: filtrosAtuais() };
      const nomes = Object.keys(detalhes);
      if (!nomes.includes(det[aba])) det[aba] = nomes[0];
      const drawDet = () => {
        $('#subtabs').innerHTML = nomes.map(n => `<button class="ghost ${n === det[aba] ? 'on' : ''}" data-d="${esc(n)}">${esc(n)}</button>`).join('');
        $('#det').innerHTML = detalhes[det[aba]];
        body.querySelectorAll('#subtabs button').forEach(b => b.onclick = () => { det[aba] = b.dataset.d; drawDet(); });
      };
      drawDet();

      /* ================= FINANCEIRO ================= */
      function financeiro() {
        const meta = +CFO.store.get('meta_mensal', 0) || 0, vRef = mesRef ? mV.get(mesRef) || 0 : 0, vAnt = mesRef ? mV.get(prevKey(mesRef)) || 0 : 0;
        const ctr = porContrato('valor'), topC = ctr[0];
        const kpis = [
          tile('Gasto no período', R$(totV), `<small>${rs.length} req. · ${N(totQ)} itens</small>`),
          tile(`Mês de referência${mesRef ? ' (' + lbl(mesRef) + ')' : ''}`, R$(vRef), mesRef ? delta(vRef, vAnt) : ''),
          tile('Média mensal', R$(totV / nMeses), `<small>em ${nMeses} mês(es)</small>`),
          tile('Ticket médio', R$(rs.length ? totV / rs.length : 0), '<small>por requisição</small>'),
          tile('Maior contrato', topC ? pct(totV ? topC.valor / totV : 0) : '-', `<small>${topC ? esc(topC.nome) : ''}</small>`),
          ...(meta ? [tile('Meta x realizado', mesRef ? pct(vRef / meta) : '-', `<small class="${vRef > meta ? 'down' : 'up'}">${vRef > meta ? 'acima' : 'dentro'} da meta de ${R$(meta)}</small>`)] : [])];

        const vals = meses.map(k => mV.get(k) || 0), ant = meses.map(k => mVAll.get(k - 100) || 0);
        const lines = [...(meta ? [{ nome: 'Meta mensal', cor: COR.ruim, vals: meses.map(() => meta), dash: true }] : []),
                       ...(ant.some(v => v > 0) ? [{ nome: 'Mesmo mês do ano anterior', cor: COR.b, vals: ant }] : [])];

        let acum = 0, anoAcum = 0;
        const linhasMes = meses.map(k => { if (Math.floor(k / 100) !== anoAcum) { anoAcum = Math.floor(k / 100); acum = 0; } const v = mV.get(k) || 0; acum += v; const a = mV.get(prevKey(k)) || 0;
          const dv = a ? (v - a) / a : null;
          return `<tr><td>${lbl(k)}</td><td>${mN.get(k) || 0}</td><td>${N(mQ.get(k) || 0)}</td><td>${R$(v)}</td>
            <td class="${dv === null ? '' : dv > 0 ? 'up' : dv < 0 ? 'down' : ''}">${dv === null ? '-' : (dv > 0 ? '▲ ' : dv < 0 ? '▼ ' : '') + pct(Math.abs(dv))}</td><td>${R$(acum)}</td>${meta ? `<td>${pct(v / meta)}</td>` : ''}</tr>`; }).reverse();
        let ac = 0; const linhasC = ctr.map(x => { ac += x.valor; return `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${R$(x.valor)}</td><td>${pct(totV ? x.valor / totV : 0)}</td><td>${pct(totV ? ac / totV : 0)}</td></tr>`; });
        const sols = porSol('valor'), its = porItem('valor');

        const mm = meses.slice(-12), top10 = grp(tend, r => r.contrato, r => r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')).sort((a, b) => b.valor - a.valor).slice(0, 10);
        const cel = new Map(); tend.forEach(r => { const k = r.contrato + '|' + key(r); cel.set(k, (cel.get(k) || 0) + valor(r)); });
        const mx = Math.max(1, ...top10.flatMap(c => mm.map(k => cel.get(c.k + '|' + k) || 0)));

        detalhes['Resumo mensal'] = tab(['Mês', 'Req.', 'Itens', 'Gasto', 'Var. mês ant.', 'Acumulado no ano', ...(meta ? ['% da meta'] : [])], linhasMes);
        if (!f.c) detalhes['Por contrato'] = tab(['Contrato', 'Req.', 'Gasto', '% do total', '% acumulado'], linhasC);
        if (!f.s) detalhes['Por solicitante'] = tab(['Solicitante', 'Req.', 'Gasto', '% do total'], sols.map(x => `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${R$(x.valor)}</td><td>${pct(totV ? x.valor / totV : 0)}</td></tr>`));
        detalhes['Por EPI'] = tab(['EPI', 'Qtd', 'Gasto', '% do total'], its.map(x => `<tr><td>${esc(x.nome)}</td><td>${N(x.qtd)}</td><td>${R$(x.valor)}</td><td>${pct(totV ? x.valor / totV : 0)}</td></tr>`));
        if (!f.c) detalhes['Mapa de calor'] = `<table class="heat"><thead><tr><th>Contrato</th>${mm.map(k => `<th>${lbl(k)}</th>`).join('')}</tr></thead><tbody>
          ${top10.map(c => `<tr><td>${esc(c.nome)}</td>${mm.map(k => { const v = cel.get(c.k + '|' + k) || 0; return `<td style="background:rgba(61,139,253,${v ? .12 + .7 * v / mx : 0})" title="${R$(v)}">${v ? curto(v) : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;

        const paineis =
          painel('Gasto mensal', chart({ cats: meses.map(lbl), bars: [{ nome: 'Gasto', cor: COR.a, vals }], lines, fmt: curto }), 'w8', meta ? 'com meta' : '')
          + painel(f.c ? 'EPIs de maior gasto' : 'Concentração por contrato', f.c ? rk(its, 'valor', R$, 6, totV) : rk(ctr, 'valor', R$, 6, totV), 'w4', 'top 6 · % do total')
          + (f.s ? '' : painel('Gasto por solicitante', rk(sols, 'valor', R$, 5, totV), f.c ? 'w12' : 'w6', 'top 5'))
          + (f.c ? '' : painel('EPIs de maior gasto', rk(its, 'valor', R$, 5, totV), f.s ? 'w12' : 'w6', 'top 5'));
        return { kpis, paineis };
      }

      /* ================= LOGÍSTICA ================= */
      function logistica() {
        const epi = CFO.store.get('epi', []), movs = CFO.store.get('epi:mov', []), achar = CFO.casarEpi(epi);
        const saiu = new Map(), sem = new Set();
        rs.forEach(r => r.itens.forEach(i => { const e = achar(i.item); if (e) saiu.set(e.id, (saiu.get(e.id) || 0) + i.qa); else sem.add(i.item); }));
        const ent = new Map(); let totEnt = 0;
        movs.filter(x => x.tipo === 'Entrada').forEach(x => { const d = x.data.slice(0, 7).split('-'), k = +d[0] * 100 + +d[1];
          if ((!y || +d[0] === +y) && (!f.c && !f.s)) { ent.set(k, (ent.get(k) || 0) + x.qtd); if (!m || +d[1] === +m) totEnt += x.qtd; } });
        const ksAll = [...new Set([...meses, ...ent.keys()])].sort((a, b) => a - b); let mesesE = [];
        if (ksAll.length) for (let k = ksAll[0]; k <= ksAll[ksAll.length - 1]; k = nextKey(k)) mesesE.push(k);

        const pos = epi.map(e => { const s = saiu.get(e.id) || 0, med = s / nMeses, cob = med > 0 ? (+e.qtd || 0) / med : Infinity;
          const sit = med === 0 ? 'Sem giro' : cob < 1 ? 'Crítico' : cob < 2 ? 'Atenção' : 'OK'; return { e, s, med, cob, sit }; });
        const ordem = { 'Crítico': 0, 'Atenção': 1, 'OK': 2, 'Sem giro': 3 };
        pos.sort((a, b) => ordem[a.sit] - ordem[b.sit] || a.cob - b.cob || b.s - a.s);
        const cont = s => pos.filter(p => p.sit === s).length, crit = cont('Crítico'), parados = cont('Sem giro');
        const estTot = epi.reduce((a, e) => a + (+e.qtd || 0), 0), giro = estTot ? totQ / estTot : 0;
        const tag = s => `<span class="tag ${s === 'Crítico' ? 'bad' : s === 'Atenção' ? 'warn' : s === 'OK' ? 'ok' : ''}">${s}</span>`;

        const kpis = [
          tile('Itens retirados', N(totQ), `<small>${rs.length} requisição(ões)</small>`),
          tile(`Mês de referência${mesRef ? ' (' + lbl(mesRef) + ')' : ''}`, N(mesRef ? mQ.get(mesRef) || 0 : 0), mesRef ? delta(mQ.get(mesRef) || 0, mQ.get(prevKey(mesRef)) || 0) : ''),
          tile('Entradas no período', f.c || f.s ? '-' : N(totEnt), `<small>${f.c || f.s ? 'não são por contrato' : 'Planilha EPI'}</small>`),
          tile('Giro do estoque', epi.length ? giro.toFixed(2).replace('.', ',') + 'x' : '-', '<small>saídas ÷ estoque atual</small>'),
          tile('Cobertura crítica', epi.length ? crit : '-', '<small>menos de 1 mês</small>'),
          tile('Itens sem giro', epi.length ? parados : '-', '<small>sem saída no período</small>')];

        const saidas = mesesE.map(k => mQ.get(k) || 0), mm3 = saidas.map((_, i) => { const j = saidas.slice(Math.max(0, i - 2), i + 1); return j.reduce((a, b) => a + b, 0) / j.length; });
        const bars = [{ nome: 'Saídas (requisições)', cor: COR.a, vals: saidas }, ...(ent.size ? [{ nome: 'Entradas (estoque)', cor: COR.c, vals: mesesE.map(k => ent.get(k) || 0) }] : [])];

        const abc = porItem('qtd').filter(x => x.qtd > 0); let ac = 0;
        const abcL = abc.map(x => { const antes = totQ ? ac / totQ : 0; ac += x.qtd; return { ...x, p: totQ ? ac / totQ : 0, cls: antes < .8 ? 'A' : antes < .95 ? 'B' : 'C' }; });
        const nCls = c => abcL.filter(x => x.cls === c).length, cod = nome => (achar(nome) || {}).codigo || '-';

        // Situação do estoque: contagem por situação + os 5 mais urgentes
        const situ = epi.length ? `<div class="sit">${['Crítico', 'Atenção', 'OK', 'Sem giro'].map(s => `<div><b>${cont(s)}</b>${tag(s)}</div>`).join('')}</div>
          <div class="urg">${pos.filter(p => p.sit === 'Crítico' || p.sit === 'Atenção').slice(0, 5).map(p => `<div><span title="${esc(p.e.item)}">${esc(p.e.item)}</span><small>${N(p.e.qtd)} em estoque · ${N(p.cob)} mês(es)</small></div>`).join('') || '<p class="empty">Nenhum item em risco.</p>'}</div>`
          : '<p class="empty">Importe a Planilha EPI para ver estoque e cobertura.</p>';
        const abcResumo = `<div class="sit">${['A', 'B', 'C'].map(c => `<div><b>${nCls(c)}</b><span class="tag">Classe ${c}</span></div>`).join('')}</div>
          <p class="log" style="margin-top:.6rem">A: até 80% das retiradas · B: até 95% · C: o restante.</p>`;

        detalhes['Posição de estoque'] = epi.length ? tab(['Código', 'EPI', 'Estoque', 'Saiu', 'Média/mês', 'Cobertura', 'Situação'], pos.map(p => `<tr><td>${esc(p.e.codigo)}</td><td>${esc(p.e.item)}</td><td>${N(p.e.qtd)}</td><td>${N(p.s)}</td><td>${N(p.med)}</td><td>${p.cob === Infinity ? '-' : N(p.cob) + ' mês(es)'}</td><td>${tag(p.sit)}</td></tr>`))
          + `<p class="log">Cobertura = estoque atual ÷ média mensal de saídas. Crítico: menos de 1 mês · Atenção: menos de 2.${sem.size ? ` ${sem.size} item(ns) das requisições não existem na Planilha EPI.` : ''}</p>` : '<p class="empty">Importe a Planilha EPI.</p>';
        detalhes['Curva ABC'] = tab(['#', 'Código', 'EPI', 'Qtd', '% do total', '% acum.', 'Classe'], abcL.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(cod(x.nome))}</td><td>${esc(x.nome)}</td><td>${N(x.qtd)}</td><td>${pct(x.qtd / totQ)}</td><td>${pct(x.p)}</td><td><b>${x.cls}</b></td></tr>`));
        if (!f.c) detalhes['Por contrato'] = tab(['Contrato', 'Req.', 'Itens'], porContrato('qtd').map(x => `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${N(x.qtd)}</td></tr>`));
        if (!f.s) detalhes['Por solicitante'] = tab(['Solicitante', 'Req.', 'Itens'], porSol('qtd').map(x => `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${N(x.qtd)}</td></tr>`));

        const paineis =
          painel('Entradas x saídas por mês', chart({ cats: mesesE.map(lbl), bars, lines: [{ nome: 'Média móvel 3 meses (saídas)', cor: COR.b, vals: mm3 }], fmt: curto }), 'w8', 'unidades')
          + painel('Situação do estoque', situ, 'w4', 'cobertura em meses')
          + painel('Curva ABC (Pareto)', chart({ cats: abcL.slice(0, 12).map(x => x.nome), bars: [{ nome: 'Qtd retirada', cor: COR.a, vals: abcL.slice(0, 12).map(x => x.qtd) }], lines: [{ nome: '% acumulado', cor: COR.b, vals: abcL.slice(0, 12).map(x => x.p), pct: true }], rot: true, rotulos: false }), 'w8', 'top 12 itens')
          + painel('Classificação ABC', abcResumo, 'w4', 'por quantidade')
          + (f.c ? '' : painel('Retiradas por contrato', rk(porContrato('qtd'), 'qtd', N, 5), 'w6', 'top 5'))
          + (f.s ? '' : painel('Retiradas por solicitante', rk(porSol('qtd'), 'qtd', N, 5), 'w6', 'top 5'));
        return { kpis, paineis };
      }
    }

    /* ---------- Exportar o que está na tela (respeita contrato, solicitante, mês, ano e a aba) ---------- */
    const txtSel = id => { const e = $(id); return e && e.selectedOptions[0] ? e.selectedOptions[0].text : ''; };
    function filtrosAtuais() {
      const meta = +CFO.store.get('meta_mensal', 0) || 0;
      return [['Contrato', txtSel('#fc')], ['Solicitante', txtSel('#fs')], ['Tipo', txtSel('#ft')], ['Mês', txtSel('#fm')], ['Ano', txtSel('#fa')],
        ...(aba === 'fin' && meta ? [['Meta mensal', R$(meta)]] : [])];
    }
    const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const tituloRel = () => 'Controle de gastos - ' + (ultimo.aba === 'fin' ? 'Financeiro' : 'Logística');
    const dom = html => { const d = document.createElement('div'); d.innerHTML = html; return d; };
    const COLS_TEXTO = ['Contrato', 'Código', 'EPI', 'Solicitante', 'Mês'];
    const num = t => parseFloat(t.replace(/\./g, '').replace(',', '.'));
    // Converte o texto da célula (formato pt-BR) em número do Excel, para dar para somar/ordenar
    function celula(td, col) {
      const t = td.textContent.replace(/\s+/g, ' ').trim(), ti = td.getAttribute('title') || '';
      if (!t) return '';
      if (/^R\$/.test(ti)) return { t: 'n', v: num(ti.replace(/^R\$\s*/, '')), z: '"R$" #,##0.00' };   // mapa de calor
      if (COLS_TEXTO.includes(col)) return t;
      let m = t.match(/^R\$\s*(-?[\d.]+,\d+)$/); if (m) return { t: 'n', v: num(m[1]), z: '"R$" #,##0.00' };
      m = t.match(/^([▲▼])?\s*(-?[\d.]+(?:,\d+)?)%$/); if (m) return { t: 'n', v: (m[1] === '▼' ? -1 : 1) * num(m[2]) / 100, z: '0.0%' };
      if (/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(t) && !/^0\d/.test(t)) return { t: 'n', v: num(t), z: t.includes(',') ? '#,##0.0' : '#,##0' };
      return t;
    }
    const abaNome = (nome, usados) => { let n = nome.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Planilha', i = 2; while (usados.has(n)) n = n.slice(0, 28) + ' ' + i++; usados.add(n); return n; };
    const largura = aoa => aoa[0].map((_, c) => ({ wch: Math.min(60, Math.max(8, ...aoa.map(r => { const x = r[c]; return String(x && x.t === 'n' ? '99.999,99' : x ?? '').length; }) ) + 2) }));

    function exportar() {
      if (!ultimo) return;
      const itens = [{ id: 'kpi', nome: 'Indicadores (resumo)' }, { id: 'graf', nome: 'Gráficos e painéis' }, ...Object.keys(ultimo.detalhes).map(n => ({ id: 'd:' + n, nome: n }))];
      CFO.exportar({ titulo: 'Exportar - ' + tituloRel(), itens, run: (fmt, sel, { logo }) => fmt === 'xlsx' ? excel(sel, logo) : pdf(sel, logo) });
    }
    function excel(sel, logo) {
      const usados = new Set(), folhas = [];
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
        folhas.push({ nome, aoa, cabRow: 0, cols: largura(aoa) });
      });
      CFO.xlsxSalvar(`controle-de-gastos-${ultimo.aba === 'fin' ? 'financeiro' : 'logistica'}-${new Date().toISOString().slice(0, 10)}.xlsx`, folhas, { logo, svgs: sel.has('graf') ? CFO.extraiSvgs(ultimo.paineis) : [] });
    }
    function pdf(sel, logo) {
      const limpa = CFO.limpaCores;
      const tabelas = Object.entries(ultimo.detalhes).filter(([nome]) => sel.has('d:' + nome)).map(([nome, html]) => `<div class="sub">${esc(nome)}</div>${limpa(html)}`).join('');
      CFO.print(`<style>@page{size:A4 landscape;margin:10mm}</style><div class="rel">
        ${CFO.cabecalhoPdf(tituloRel(), logo)}
        <p class="meta">${ultimo.filtros.filter(x => x[1]).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' &nbsp;·&nbsp; ')}</p>
        <p class="meta">Gerado em ${esc(agora())}</p>
        ${sel.has('kpi') ? `<div class="cards">${ultimo.kpis.join('')}</div>` : ''}
        ${sel.has('graf') ? `<div class="dash">${limpa(ultimo.paineis)}</div>` : ''}
        ${tabelas ? `<h2>Detalhamento</h2>${tabelas}` : ''}</div>`);
    }

    $('#exp').onclick = exportar;
    $('#tfin').onclick = () => { aba = 'fin'; render(); };
    $('#tlog').onclick = () => { aba = 'log'; render(); };
    $('#fc').onchange = e => { f.c = e.target.value; opcoes(); render(); };
    $('#fs').onchange = e => { f.s = e.target.value; render(); };
    $('#fv').onchange = e => { f.v = e.target.value; render(); };
    $('#fm').onchange = $('#fa').onchange = $('#ft').onchange = render;
    $('#meta').oninput = e => { CFO.store.set('meta_mensal', +e.target.value || 0); render(); };
    opcoes(); render();
  };
})();
