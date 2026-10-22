/* ===== Jurídico Operacional > Controle de mensal =====
   Foco nos pedidos MENSAIS (tipo MENSAL da requisição), por contrato: o que já foi (passado), o do mês atual e o que ainda vem
   (programado nas planilhas + previsão pela média). Três abas:
   - Financeiro: faturamento por contrato e mês, teto (orçamento) por contrato, itens a faturar, maiores despesas
   - Previsão: quantidade e compra sugerida por item, cobertura do estoque (Planilha EPI), itens parados ou em falta
   - Auditoria: duplicidades, consumo fora do padrão, acima do teto, aprovado acima do solicitado e conferência de recibos
   Dados: Requisições (histórico), Planilha EPI (estoque), Contratos. Parâmetros por contrato (teto e nº de trabalhadores) são digitados aqui. */
(() => {
  const esc = CFO.esc, P = CFO.periodo;
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const pct = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const curto = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : v >= 1e3 ? (v / 1e3).toFixed(1).replace('.', ',') + ' mil' : String(Math.round(v * 10) / 10).replace('.', ',');
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const valor = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0), qtd = r => r.itens.reduce((a, i) => a + i.qa, 0);

  /* ---------- Meses (chave AAAAMM) ---------- */
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const lbl = k => MES[k % 100 - 1] + '/' + Math.floor(k / 100);
  const nextKey = k => k % 100 === 12 ? k + 89 : k + 1, prevKey = k => k % 100 === 1 ? k - 89 : k - 1;
  const add = (k, n) => { for (; n > 0; n--) k = nextKey(k); for (; n < 0; n++) k = prevKey(k); return k; };
  const diff = (k, b) => (Math.floor(k / 100) - Math.floor(b / 100)) * 12 + k % 100 - b % 100;
  const curKey = () => { const d = new Date(); return d.getFullYear() * 100 + d.getMonth() + 1; };

  const SC = { 'Acima': 'bad', 'Falta': 'bad', 'Previsto acima': 'warn', 'Atenção': 'warn', 'Excesso': 'warn', 'Sem giro': 'warn', 'Sem cadastro': 'warn', 'OK': 'ok', 'Dentro': 'ok' };
  const COR = { passado: '#3d8bfd', atual: '#f5b84a', prog: '#4cc38a', prev: '#8fa3c4', teto: '#ff8a8f' };

  /* ---------- Tabelas: cab = [[título, tipo]]; tipos: t texto · $ moeda · n número · % percentual · s situação · c conferido (caixa) ---------- */
  const celHtml = (v, t, pdf) => {
    if (v === '' || v == null) return '';
    if (t === '$') return R$(v); if (t === 'n') return N(v); if (t === '%') return pct(v);
    if (t === 's') return `<span class="tag ${SC[v] || ''}">${esc(v)}</span>`;
    if (t === 'c') return pdf ? (v.ok ? 'Sim' : 'Não') : `<input type="checkbox" data-r="${esc(v.id)}" ${v.ok ? 'checked' : ''} aria-label="Recibo conferido">`;
    return esc(v);
  };
  const tabHtml = (s, pdf) => `<div class="tw ${s.scroll && !pdf ? 'scroll' : ''}"><table><thead><tr>${s.cab.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>
    ${s.linhas.map(l => `<tr>${l.map((v, i) => `<td>${celHtml(v, s.cab[i][1], pdf)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.cab.length}" class="empty">Sem dados</td></tr>`}</tbody></table></div>`;
  const tile = k => `<div class="card"><small>${esc(k.t)}</small><b>${esc(k.v)}</b>${k.s ? `<small>${esc(k.s)}</small>` : ''}</div>`;
  const painel = (titulo, corpo, sub = '', cls = 'w12') => `<section class="pn ${cls}"><header><h3>${titulo}</h3>${sub ? `<small>${sub}</small>` : ''}</header>${corpo}</section>`;

  // Gráfico de barras por mês (cada barra com a cor da sua situação) + linha tracejada do teto
  const grafico = (meses, vals, cores, teto) => {
    const n = meses.length; if (!n) return '<p class="empty">Sem dados.</p>';
    const W = Math.max(640, n * 54 + 70), H = 260, L = 56, R = 12, T = 16, B = 30, base = H - B, gw = (W - L - R) / n, bw = Math.min(34, gw - 10);
    const max = Math.max(1, ...vals, teto || 0), mag = 10 ** Math.floor(Math.log10(max)), top = [1, 2, 2.5, 5, 10].map(m => m * mag).find(m => m >= max) || max;
    const y = v => base - (base - T) * v / top, cx = i => L + gw * i + gw / 2;
    const grade = [0, .25, .5, .75, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="var(--line)" stroke-width="${f ? .5 : 1}"/><text x="${L - 6}" y="${y(top * f) + 3}" text-anchor="end" font-size="10" fill="var(--muted)">${curto(top * f)}</text>`).join('');
    const barras = vals.map((v, i) => `<rect x="${cx(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${Math.max(base - y(v), v > 0 ? 1 : 0)}" rx="3" fill="${cores[i]}"><title>${lbl(meses[i])}: ${esc(R$(v))}</title></rect>`
      + (n <= 14 && v > 0 ? `<text x="${cx(i)}" y="${y(v) - 4}" text-anchor="middle" font-size="10" fill="var(--text)">${curto(v)}</text>` : '')).join('');
    const rot = meses.map((k, i) => `<text x="${cx(i)}" y="${base + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${lbl(k)}</text>`).join('');
    const lt = teto ? `<line x1="${L}" x2="${W - R}" y1="${y(teto)}" y2="${y(teto)}" stroke="${COR.teto}" stroke-width="2" stroke-dasharray="6 4"/>` : '';
    const leg = [['Realizado', COR.passado], ['Mês atual', COR.atual], ['Programado (planilhas)', COR.prog], ['Previsão (média)', COR.prev], ...(teto ? [['Teto mensal', COR.teto]] : [])].map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
    return `<div class="legend">${leg}</div><div class="tw chart"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:560px;height:auto" role="img">${grade}${barras}${lt}${rot}</svg></div>`;
  };

  CFO.modules.controle_mensal = body => {
    let aba = 'fin', f = { c: '', t: 'MENSAL', h: 3, m: 0 }, det = {}, ultimo = null;
    body.style.maxWidth = '1280px';
    body.innerHTML = `<div class="tabs"><button id="tfin" class="ghost">Financeiro</button><button id="tprev" class="ghost">Previsão</button><button id="taud" class="ghost">Auditoria</button></div>
      <div class="bar"><select id="fc"></select>${CFO.motivo.html()}<select id="fh">${[1, 3, 6, 12].map(n => `<option value="${n}">Previsão: ${n === 1 ? '1 mês' : n + ' meses'}</option>`).join('')}</select>
        <span class="exp"><button id="xls" class="ghost">Exportar Excel</button><button id="pdf" class="ghost">Exportar PDF</button></span></div>
      <div id="out"></div>`;
    const $ = s => body.querySelector(s);
    const keep = fn => { const sc = body.closest('.screen'), y = sc ? sc.scrollTop : 0; fn(); if (sc) sc.scrollTop = y; };

    function opcoes() {
      const rs = CFO.store.get('requisicoes', []);
      const m = new Map(CFO.store.get('contratos', []).filter(c => c.num).map(c => [String(c.num), String(c.num) + (c.nome ? ' - ' + c.nome : '')]));
      rs.forEach(r => { if (r.contrato && !m.has(r.contrato)) m.set(r.contrato, r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')); });
      $('#fc').innerHTML = '<option value="">Todos os contratos</option>' + [...m].sort((a, b) => numCmp(a[0], b[0])).map(([k, t]) => `<option value="${esc(k)}" ${k === f.c ? 'selected' : ''}>${esc(t)}</option>`).join('');
      CFO.motivo.fill(body, rs, 'ft', f.t); $('#fh').value = f.h;
    }

    function render() {
      ['fin', 'prev', 'aud'].forEach(a => $('#t' + a).classList.toggle('on', aba === a));
      const cur = curKey(), H = f.h, hTxt = H === 1 ? '1 mês' : H + ' meses', key = r => P.key(r.mes), mr = f.m || cur;
      const cfg = CFO.store.get('mensal:cfg', {}), comp = CFO.store.get('mensal:comprov', {});
      const base = CFO.store.get('requisicoes', []).filter(r => (!f.c || r.contrato === f.c) && CFO.motivo.fn(f.t)(r));
      const reqs = base.filter(key), semMes = base.length - reqs.length;
      const nomes = new Map(CFO.store.get('contratos', []).map(c => [String(c.num), c.nome || '']));
      const nomeC = c => c.num + (c.nome ? ' - ' + c.nome : '');

      // média dos 3 meses anteriores ao atual (só conta meses a partir do primeiro com dados) e projeção: programado (se existe) senão média
      const media3 = m => { const ks = [...m.keys()], pr = ks.length ? Math.min(...ks) : cur, u = [1, 2, 3].map(i => add(cur, -i)).filter(k => k >= pr); return u.length ? u.reduce((a, k) => a + (m.get(k) || 0), 0) / u.length : (m.get(cur) || 0); };
      const projetar = m => { const md = media3(m); return Array.from({ length: H }, (_, j) => { const k = add(cur, j + 1); return m.has(k) ? m.get(k) : md; }); };

      // por contrato (inclui contratos da planilha que ainda não têm mensal)
      const ctr = new Map();
      const novo = (num, nome) => ({ num, nome: nome || nomes.get(String(num)) || '', v: new Map(), q: new Map(), reqs: [] });
      reqs.forEach(r => {
        const c = ctr.get(r.contrato) || novo(r.contrato, r.contratoNome); ctr.set(r.contrato, c);
        const k = key(r); c.v.set(k, (c.v.get(k) || 0) + valor(r)); c.q.set(k, (c.q.get(k) || 0) + qtd(r)); c.reqs.push(r);
      });
      nomes.forEach((nm, num) => { if (!ctr.has(num) && (!f.c || f.c === num)) ctr.set(num, novo(num, nm)); });
      const stats = [...ctr.values()].sort((a, b) => numCmp(a.num, b.num)).map(c => {
        let passado = 0, prog = 0; c.v.forEach((v, k) => { if (k < cur) passado += v; else if (k > cur) prog += v; });
        const atual = c.v.get(cur) || 0, proj = projetar(c.v), teto = +(cfg[c.num] || {}).teto || 0, trab = +(cfg[c.num] || {}).trab || 0;
        const sit = !teto ? 'Sem teto' : atual > teto ? 'Acima' : proj[0] > teto ? 'Previsto acima' : atual >= teto * .8 ? 'Atenção' : 'Dentro';
        return { c, passado, atual, prog, proj, prev: proj.reduce((a, b) => a + b, 0), media: media3(c.v), teto, trab, sit };
      });
      const soma = fn => stats.reduce((a, s) => a + fn(s), 0);

      // linha do tempo: até 12 meses para trás + próximos meses da previsão
      const ks = reqs.map(key), ini = Math.max(Math.min(ks.length ? Math.min(...ks) : cur, cur), add(cur, -11)), meses = [];
      for (let k = ini; k <= add(cur, H); k = nextKey(k)) meses.push(k);
      const totMes = k => k <= cur ? soma(s => s.c.v.get(k) || 0) : soma(s => s.proj[diff(k, cur) - 1]);
      const corMes = k => k < cur ? COR.passado : k === cur ? COR.atual : stats.some(s => s.c.v.has(k)) ? COR.prog : COR.prev;
      const unico = f.c ? stats.find(s => s.c.num === f.c) : null;

      /* ================= FINANCEIRO ================= */
      function financeiro() {
        const vAt = soma(s => s.atual), vAnt = soma(s => s.c.v.get(prevKey(cur)) || 0), top = [...stats].sort((a, b) => b.atual - a.atual)[0];
        const acima = stats.filter(s => s.sit === 'Acima').length, comTeto = stats.filter(s => s.teto).length;
        const kpis = [
          { t: 'Realizado (meses passados)', v: R$(soma(s => s.passado)) },
          { t: `Mês atual (${lbl(cur)})`, v: R$(vAt), s: vAnt ? `${vAt > vAnt ? '▲' : vAt < vAnt ? '▼' : '='} ${pct(Math.abs(vAt - vAnt) / vAnt)} vs mês anterior` : 'sem mês anterior' },
          { t: 'Já programado (planilhas)', v: R$(soma(s => s.prog)), s: 'meses futuros nas requisições' },
          { t: `Previsão próximos ${hTxt}`, v: R$(soma(s => s.prev)), s: 'programado + média' },
          { t: 'Contratos acima do teto', v: `${acima} de ${comTeto}`, s: comTeto ? 'no mês atual' : 'defina o teto abaixo' },
          { t: 'Maior gasto no mês', v: top && top.atual ? pct(vAt ? top.atual / vAt : 0) : '-', s: top && top.atual ? nomeC(top.c) : '' }];

        const porC = { nome: 'Por contrato', scroll: true,
          cab: [['Contrato', 't'], ['Passado', '$'], [`Mês atual`, '$'], ['Programado', '$'], [`Previsão ${hTxt}`, '$'], ['Média mensal', '$'], ['Teto mensal', '$'], ['Atual / teto', '%'], ['Situação', 's']],
          linhas: [...stats.map(s => [nomeC(s.c), s.passado, s.atual, s.prog, s.prev, s.media, s.teto || '', s.teto ? s.atual / s.teto : '', s.sit]),
            ['TOTAL', soma(s => s.passado), vAt, soma(s => s.prog), soma(s => s.prev), soma(s => s.media), '', '', '']] };

        const mReais = meses.filter(k => k <= cur || stats.some(s => s.c.v.has(k)));
        const piv = { nome: 'Faturamento por mês', scroll: true,
          cab: [['Contrato', 't'], ...mReais.map(k => [lbl(k) + (k === cur ? ' (atual)' : k > cur ? ' (prog.)' : ''), '$']), ['Total', '$']],
          linhas: [...stats.map(s => [nomeC(s.c), ...mReais.map(k => s.c.v.get(k) || ''), mReais.reduce((a, k) => a + (s.c.v.get(k) || 0), 0)]),
            ['TOTAL', ...mReais.map(k => soma(s => s.c.v.get(k) || 0) || ''), soma(s => mReais.reduce((a, k) => a + (s.c.v.get(k) || 0), 0))]] };

        const g = new Map();                                               // itens a faturar no mês escolhido (contrato + item + tam. + preço)
        reqs.filter(r => key(r) === mr).forEach(r => r.itens.forEach(i => {
          const kk = [r.contrato, i.item, i.tam, i.preco].join('|'), x = g.get(kk) || { c: r.contrato, item: i.item, tam: i.tam, q: 0, p: i.preco };
          x.q += i.qa; g.set(kk, x);
        }));
        const itensF = [...g.values()].sort((a, b) => numCmp(a.c, b.c) || b.q * b.p - a.q * a.p);
        const fat = { nome: 'Itens a faturar', sheet: `Itens a faturar - ${lbl(mr)}`, pre: '', scroll: true, cab: [['Contrato', 't'], ['Item', 't'], ['Tam.', 't'], ['Qtd', 'n'], ['Preço unit.', '$'], ['Valor', '$']],
          linhas: [...itensF.map(x => [x.c, x.item, x.tam, x.q, x.p, x.q * x.p]), ...(itensF.length ? [['TOTAL', '', '', itensF.reduce((a, x) => a + x.q, 0), '', itensF.reduce((a, x) => a + x.q * x.p, 0)]] : [])] };

        const sg = new Map(); let tm = 0;                                  // maiores despesas do mês por solicitante (setor/centro de custo)
        reqs.filter(r => key(r) === mr).forEach(r => { const k = r.sol || '(sem nome)', x = sg.get(k) || { n: 0, q: 0, v: 0, cs: new Set() }; x.n++; x.q += qtd(r); x.v += valor(r); x.cs.add(r.contrato); sg.set(k, x); tm += valor(r); });
        const sol = { nome: 'Por solicitante', sheet: `Despesas por solicitante - ${lbl(mr)}`, scroll: true, cab: [['Solicitante', 't'], ['Contratos', 't'], ['Req.', 'n'], ['Itens', 'n'], ['Valor', '$'], ['% do mês', '%']],
          linhas: [...sg].sort((a, b) => b[1].v - a[1].v).map(([k, x]) => [k, [...x.cs].join(', '), x.n, x.q, x.v, tm ? x.v / tm : 0]) };

        const opMes = [...new Set([cur, ...reqs.map(key)])].filter(k => k <= add(cur, H)).sort((a, b) => b - a);
        const seletor = `<select id="fr" aria-label="Mês de referência">${opMes.map(k => `<option value="${k}" ${k === mr ? 'selected' : ''}>${lbl(k)}</option>`).join('')}</select>`;
        const params = `<div class="tw scroll"><table><thead><tr><th>Contrato</th><th>Teto mensal (R$)</th><th>Trabalhadores</th></tr></thead><tbody>
          ${stats.map(s => `<tr><td>${esc(nomeC(s.c))}</td><td><input type="number" min="0" step="any" data-c="${esc(s.c.num)}" data-k="teto" value="${s.teto || ''}" placeholder="Sem teto"></td>
            <td><input type="number" min="0" step="1" data-c="${esc(s.c.num)}" data-k="trab" value="${s.trab || ''}" placeholder="-"></td></tr>`).join('') || '<tr><td colspan="3" class="empty">Sem contratos</td></tr>'}</tbody></table></div>`;
        const chartHtml = grafico(meses, meses.map(totMes), meses.map(corMes), unico ? unico.teto : 0);
        fat.pre = seletor;
        const rk = stats.filter(s => s.atual > 0).sort((a, b) => b.atual - a.atual).slice(0, 6);
        const rkHtml = rk.length ? `<div class="hbars">${rk.map(s => `<div class="hb"><span class="hl">${esc(nomeC(s.c))}</span><span class="hv">${R$(s.atual)}${vAt ? ' · ' + pct(s.atual / vAt) : ''}</span><span class="ht"><i style="width:${Math.max(2, 100 * s.atual / rk[0].atual)}%"></i></span></div>`).join('')}</div>` : '<p class="empty">Sem gasto no mês atual.</p>';
        return { kpis, chartHtml, secoes: [porC, piv, fat, sol, { nome: 'Parâmetros', tela: true, sub: 'teto mensal (orçamento) e nº de trabalhadores alocados em cada contrato', custom: params }],
          paineis: [painel('Mensais por mês', chartHtml, 'realizado, mês atual, programado e previsão', 'w8'), painel('Maiores gastos no mês', rkHtml, lbl(cur), 'w4')] };
      }

      /* ================= PREVISÃO ================= */
      function previsao() {
        const achar = CFO.casarEpi(CFO.store.get('epi', [])), it = new Map();
        reqs.forEach(r => r.itens.forEach(i => {
          const x = it.get(i.item) || { nome: i.item, q: new Map(), preco: 0, ult: 0 }, k = key(r);
          x.q.set(k, (x.q.get(k) || 0) + i.qa); if (k >= x.ult && i.preco) { x.ult = k; x.preco = i.preco; } it.set(i.item, x);
        }));
        const PR = { 'Falta': 0, 'Atenção': 1, 'Sem cadastro': 2, 'Excesso': 3, 'Sem giro': 4, 'OK': 5 };
        const itens = [...it.values()].map(x => {
          const proj = projetar(x.q), md = media3(x.q), pq = proj.reduce((a, b) => a + b, 0), row = achar(x.nome), est = row ? +row.qtd || 0 : null;
          const cob = est != null && md > 0 ? est / md : null, sug = est == null ? Math.ceil(pq) : Math.max(0, Math.ceil(pq - est));
          const sit = est == null ? 'Sem cadastro' : md === 0 && est > 0 ? 'Sem giro' : cob != null && cob < 1 ? 'Falta' : cob != null && cob < 2 ? 'Atenção' : cob != null && cob > 6 ? 'Excesso' : 'OK';
          return { nome: x.nome, md, proj, pq, est, cob, sug, val: sug * x.preco, sit };
        }).sort((a, b) => PR[a.sit] - PR[b.sit] || b.val - a.val);
        const kpis = [
          { t: 'Itens em falta ou atenção', v: itens.filter(x => x.sit === 'Falta' || x.sit === 'Atenção').length, s: 'cobertura menor que 2 meses' },
          { t: 'Itens parados / excesso', v: itens.filter(x => x.sit === 'Excesso' || x.sit === 'Sem giro').length, s: 'capital parado em estoque' },
          { t: `Unidades previstas (${hTxt})`, v: N(itens.reduce((a, x) => a + x.pq, 0)) },
          { t: 'Compra sugerida', v: R$(itens.reduce((a, x) => a + x.val, 0)), s: 'previsão menos estoque, no último preço' }];
        const tI = { nome: 'Por item', scroll: true, cab: [['EPI', 't'], ['Média/mês', 'n'], [`Previsão ${hTxt}`, 'n'], ['Estoque', 'n'], ['Cobertura (meses)', 'n'], ['Sugestão de compra', 'n'], ['Valor estimado', '$'], ['Situação', 's']],
          linhas: itens.map(x => [x.nome, x.md, x.pq, x.est ?? '', x.cob ?? '', x.sug, x.val, x.sit]) };
        const mf = Array.from({ length: H }, (_, j) => add(cur, j + 1));
        const tQ = { nome: 'Quantidade por mês', scroll: true, cab: [['EPI', 't'], ...mf.map(k => [lbl(k), 'n'])], linhas: itens.map(x => [x.nome, ...x.proj]) };
        const tC = { nome: 'Valor por contrato', scroll: true, cab: [['Contrato', 't'], ...mf.map(k => [lbl(k) + (stats.some(s => s.c.v.has(k)) ? ' *' : ''), '$']), ['Total', '$']],
          linhas: [...stats.map(s => [nomeC(s.c), ...s.proj, s.prev]), ['TOTAL', ...mf.map((_, j) => soma(s => s.proj[j])), soma(s => s.prev)]] };
        const chartHtml = grafico(meses, meses.map(totMes), meses.map(corMes), 0);
        const sits = ['Falta', 'Atenção', 'OK', 'Excesso', 'Sem giro', 'Sem cadastro'];
        const sitHtml = `<div class="sit">${sits.map(t => `<div><b>${itens.filter(x => x.sit === t).length}</b>${t}</div>`).join('')}</div>
          <div class="urg">${itens.filter(x => x.sit === 'Falta' || x.sit === 'Atenção').slice(0, 5).map(x => `<div><span>${esc(x.nome)}</span><small>${N(x.cob ?? 0)} mês(es) de cobertura</small></div>`).join('')}</div>`;
        tQ.sub = 'mês com pedido já nas planilhas usa o programado; os demais, a média'; tC.sub = '* mês com valores já programados nas planilhas'; tI.sub = 'cobertura = estoque ÷ média mensal dos últimos 3 meses';
        return { kpis, chartHtml, secoes: [tI, tQ, tC],
          paineis: [painel('Gasto previsto por mês', chartHtml, `próximos ${hTxt}`, 'w8'), painel('Situação do estoque', sitHtml, 'cobertura dos itens', 'w4')] };
      }

      /* ================= AUDITORIA ================= */
      function auditoria() {
        const al = [], passados = reqs.filter(r => key(r) <= cur), lim = add(cur, -11);
        const dup = new Map();
        passados.forEach(r => r.itens.forEach(i => {
          const kk = [r.contrato, r.sol, key(r), CFO.norm(i.item), CFO.norm(i.tam)].join('|'), x = dup.get(kk) || { r, i, ids: new Set() }; x.ids.add(r.id); dup.set(kk, x);
        }));
        dup.forEach(x => { if (x.ids.size > 1) al.push({ tipo: 'Duplicidade', c: x.r.contrato, k: key(x.r), d: `${x.i.item}${x.i.tam ? ' (' + x.i.tam + ')' : ''} · ${x.r.sol || '(sem nome)'} em ${x.ids.size} requisições: ${[...x.ids].join(', ')}` }); });
        passados.forEach(r => r.itens.forEach(i => { if (i.qs > 0 && i.qa > i.qs) al.push({ tipo: 'Aprovado > solicitado', c: r.contrato, k: key(r), d: `Req. ${r.id}: ${i.item} - solicitado ${N(i.qs)}, aprovado ${N(i.qa)}` }); }));
        stats.forEach(s => {
          const kq = [...s.c.q.keys()].filter(k => k <= cur).sort((a, b) => a - b);
          kq.forEach((k, idx) => {
            const ant = kq.slice(Math.max(0, idx - 6), idx);
            if (ant.length >= 2 && k >= lim) {
              const md = ant.reduce((a, x) => a + s.c.q.get(x), 0) / ant.length, q = s.c.q.get(k);
              if (md > 0 && q > md * 1.5) al.push({ tipo: 'Fora do padrão', c: s.c.num, k, d: `${N(q)} itens, ${pct(q / md - 1)} acima da média dos meses anteriores (${N(md)})${s.trab ? ` · ${N(q / s.trab)} por trabalhador` : ''}` });
            }
          });
          if (s.teto) s.c.v.forEach((v, k) => { if (k <= cur && k >= lim && v > s.teto) al.push({ tipo: 'Acima do teto', c: s.c.num, k, d: `${R$(v)} para teto de ${R$(s.teto)} (${pct(v / s.teto)})` }); });
        });
        const ORD = ['Acima do teto', 'Fora do padrão', 'Duplicidade', 'Aprovado > solicitado'];
        al.sort((a, b) => ORD.indexOf(a.tipo) - ORD.indexOf(b.tipo) || b.k - a.k || numCmp(a.c, b.c));
        const pend = passados.filter(r => !comp[r.id]).length, qtdTipo = t => al.filter(x => x.tipo === t).length;
        const kpis = [{ t: 'Alertas', v: al.length, s: 'últimos 12 meses' }, { t: 'Duplicidades', v: qtdTipo('Duplicidade') }, { t: 'Consumo fora do padrão', v: qtdTipo('Fora do padrão'), s: 'acima de 150% da média' },
          { t: 'Acima do teto', v: qtdTipo('Acima do teto') }, { t: 'Recibos pendentes', v: pend, s: `de ${passados.length} requisições` }];
        const tA = { nome: 'Alertas', scroll: true, cab: [['Alerta', 't'], ['Contrato', 't'], ['Mês', 't'], ['Detalhe', 't']], linhas: al.map(x => [x.tipo, x.c, lbl(x.k), x.d]) };
        const tT = { nome: 'Consumo por trabalhador', scroll: true, cab: [['Contrato', 't'], ['Trabalhadores', 'n'], ['Itens no mês atual', 'n'], ['Itens/trabalhador', 'n'], ['Média 3 meses', 'n'], ['Valor/trabalhador', '$']],
          linhas: stats.map(s => [nomeC(s.c), s.trab || '', s.c.q.get(cur) || 0, s.trab ? (s.c.q.get(cur) || 0) / s.trab : '', s.trab ? media3(s.c.q) / s.trab : '', s.trab ? s.atual / s.trab : '']) };
        const lista = [...passados].sort((a, b) => key(b) - key(a) || numCmp(b.id, a.id)), mostra = lista.slice(0, 150);
        const tR = { nome: 'Recibos', scroll: true, cab: [['Requisição', 't'], ['Contrato', 't'], ['Solicitante', 't'], ['Mês', 't'], ['Valor', '$'], ['Recibo conferido', 'c']],
          linhas: mostra.map(r => [r.id, r.contrato, r.sol, lbl(key(r)), valor(r), { id: r.id, ok: !!comp[r.id] }]) };
        tA.sub = 'duplicidades, consumo fora do padrão, acima do teto e aprovado acima do solicitado'; tT.sub = 'informe o nº de trabalhadores em Financeiro > Parâmetros';
        tR.sub = (lista.length > 150 ? 'mostrando as 150 mais recentes · ' : '') + 'marque quando o recibo assinado bater com a requisição';
        const tipos = ['Acima do teto', 'Fora do padrão', 'Duplicidade', 'Aprovado > solicitado'], mx = Math.max(1, ...tipos.map(qtdTipo));
        const hb = (rot, txt, w) => `<div class="hb"><span class="hl">${esc(rot)}</span><span class="hv">${txt}</span><span class="ht"><i style="width:${w}%"></i></span></div>`;
        const alHtml = `<div class="hbars">${tipos.map(t => hb(t, qtdTipo(t), Math.max(2, 100 * qtdTipo(t) / mx))).join('')}</div>`;
        const okN = passados.length - pend, recHtml = `<div class="hbars">${hb('Recibos conferidos', `${okN} de ${passados.length}`, passados.length ? Math.max(2, 100 * okN / passados.length) : 0)}</div>`;
        return { kpis, chartHtml: '', secoes: [tA, tT, tR],
          paineis: [painel('Alertas por tipo', alHtml, 'últimos 12 meses', 'w6'), painel('Conferência de entrega', recHtml, 'ficha de EPI / recibo assinado', 'w6')] };
      }

      const r = aba === 'fin' ? financeiro() : aba === 'prev' ? previsao() : auditoria();
      if (!r.secoes.some(x => x.nome === det[aba])) det[aba] = r.secoes[0].nome;
      const sec = r.secoes.find(x => x.nome === det[aba]);
      $('#out').innerHTML = `<div class="cards kpis">${r.kpis.map(tile).join('')}</div><div class="dash">${r.paineis.join('')}
        <section class="pn w12"><header><h3>Detalhamento</h3><div class="subtabs">${r.secoes.map(x => `<button class="ghost ${x === sec ? 'on' : ''}" data-d="${esc(x.nome)}">${esc(x.nome)}</button>`).join('')}</div></header>
          ${sec.sub ? `<p class="log" style="margin:0 0 .6rem">${esc(sec.sub)}</p>` : ''}${sec.pre || ''}${sec.custom || tabHtml(sec)}</section></div>`
        + (semMes ? `<p class="log">${semMes} requisição(ões) sem mês reconhecido ficaram de fora.</p>` : '')
        + (!reqs.length ? `<p class="log">Nenhuma requisição do tipo "${esc(f.t || 'TODOS')}" encontrada. Importe as requisições ou troque o tipo no filtro.</p>` : '');
      ultimo = { aba, kpis: r.kpis, chartHtml: r.chartHtml, secoes: r.secoes };

      // eventos
      body.querySelectorAll('.subtabs button').forEach(b => b.onclick = () => keep(() => { det[aba] = b.dataset.d; render(); }));
      const fr = $('#fr'); if (fr) fr.onchange = e => keep(() => { f.m = +e.target.value; render(); });
      body.querySelectorAll('input[data-k]').forEach(el => el.onchange = () => {
        const c = CFO.store.get('mensal:cfg', {}); c[el.dataset.c] = { ...(c[el.dataset.c] || {}), [el.dataset.k]: +el.value || 0 }; CFO.store.set('mensal:cfg', c); keep(render);
      });
      body.querySelectorAll('input[data-r]').forEach(el => el.onchange = () => {
        const c = CFO.store.get('mensal:comprov', {}); if (el.checked) c[el.dataset.r] = true; else delete c[el.dataset.r]; CFO.store.set('mensal:comprov', c); keep(render);
      });
    }

    /* ---------- Exportar o que está na tela ---------- */
    const txtSel = id => { const e = $(id); return e && e.selectedOptions[0] ? e.selectedOptions[0].text : ''; };
    const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const titulo = () => 'Controle de mensal - ' + { fin: 'Financeiro', prev: 'Previsão', aud: 'Auditoria' }[ultimo.aba];
    const filtros = () => [['Contrato', txtSel('#fc')], ['Tipo', txtSel('#ft')], ['Previsão', txtSel('#fh')], ...(ultimo.aba === 'fin' ? [['Mês de referência', lbl(f.m || curKey())]] : [])];
    const cel = (v, t) => v === '' || v == null ? '' : t === '$' ? { t: 'n', v: +v, z: '"R$" #,##0.00' } : t === 'n' ? { t: 'n', v: +v, z: '#,##0.0' } : t === '%' ? { t: 'n', v: +v, z: '0.0%' } : t === 'c' ? (v.ok ? 'Sim' : 'Não') : String(v);
    const usados = new Set();
    const aba31 = nome => { let n = nome.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Planilha', i = 2; while (usados.has(n)) n = n.slice(0, 28) + ' ' + i++; usados.add(n); return n; };

    function exportarExcel() {
      if (!ultimo) return;
      if (typeof XLSX === 'undefined') { alert('A biblioteca de Excel não carregou (verifique a internet) e tente de novo.'); return; }
      usados.clear();
      const wb = XLSX.utils.book_new();
      const resumo = [[titulo()], ['Gerado em', agora()], [], ['Filtros aplicados'], ...filtros(), [], ['Indicador', 'Valor', 'Observação'], ...ultimo.kpis.map(k => [k.t, String(k.v), k.s || ''])];
      const ws = XLSX.utils.aoa_to_sheet(resumo); ws['!cols'] = [{ wch: 30 }, { wch: 28 }, { wch: 46 }];
      XLSX.utils.book_append_sheet(wb, ws, aba31('Resumo'));
      ultimo.secoes.filter(x => !x.tela).forEach(s => {
        const aoa = [s.cab.map(c => c[0]), ...s.linhas.map(l => l.map((v, i) => cel(v, s.cab[i][1])))];
        const sh = XLSX.utils.aoa_to_sheet(aoa);
        sh['!cols'] = s.cab.map((c, i) => ({ wch: Math.min(60, Math.max(10, c[0].length, ...s.linhas.map(l => String(typeof l[i] === 'number' ? '99.999,99' : l[i] ?? '').length)) + 2) }));
        XLSX.utils.book_append_sheet(wb, sh, aba31(s.sheet || s.nome));
      });
      XLSX.writeFile(wb, `controle-de-mensal-${{ fin: 'financeiro', prev: 'previsao', aud: 'auditoria' }[ultimo.aba]}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    function exportarPDF() {
      if (!ultimo) return;
      const limpa = h => h.replace(/var\(--line\)/g, '#cbd5e1').replace(/var\(--muted\)/g, '#475569').replace(/var\(--text\)/g, '#0f172a');
      CFO.print(`<style>@page{size:A4 landscape;margin:10mm}</style><div class="rel">
        <h1>${esc(titulo())}</h1>
        <p class="meta">${filtros().filter(x => x[1]).map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' &nbsp;·&nbsp; ')}</p><p class="meta">Gerado em ${esc(agora())}</p>
        <div class="cards">${ultimo.kpis.map(tile).join('')}</div>
        ${ultimo.chartHtml ? `<div class="pn w12">${limpa(ultimo.chartHtml)}</div>` : ''}
        ${ultimo.secoes.filter(x => !x.tela).map(s => `<div class="sub">${esc(s.sheet || s.nome)}</div>${tabHtml(s, true)}`).join('')}</div>`);
    }

    $('#xls').onclick = exportarExcel; $('#pdf').onclick = exportarPDF;
    $('#tfin').onclick = () => { aba = 'fin'; render(); }; $('#tprev').onclick = () => { aba = 'prev'; render(); }; $('#taud').onclick = () => { aba = 'aud'; render(); };
    $('#fc').onchange = e => { f.c = e.target.value; render(); };
    $('#ft').onchange = e => { f.t = e.target.value; render(); };
    $('#fh').onchange = e => { f.h = +e.target.value; render(); };
    opcoes(); render();
  };
})();
