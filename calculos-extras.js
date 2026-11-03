/* ===== Jurídico Operacional > "Outros cálculos" (Controle mensal e Gastos em EPIs) =====
   Botão "Outros cálculos ▾": abre uma gavetinha, a pessoa escolhe o cálculo e ele aparece embaixo da tela.
   Controle mensal (planejamento do estoque):  Variação de demanda · Ponto de pedido · Estoque de segurança · Estoque máximo · Parâmetros
   Gastos em EPIs (capital e confiabilidade):  Giro · Obsolescência (30/60/90 dias) · Acuracidade do estoque
   Dados: Requisições (consumo e preço), Planilha EPI (estoque e mínimo), 'epi:mov' (datas das saídas) e 'contagens' (Contagem de estoque).
   Parâmetros (prazo de entrega por item, nível de serviço...): CFO.store 'calc:cfg', digitados em Controle mensal > Outros cálculos > Parâmetros.
   Cada tela chama CFO.extras.montar(body, { tela, onde, ctx }) e depois X.atualizar() a cada render. ctx() devolve { reqs, key, filtrado, m, y }. */
(() => {
  const esc = CFO.esc, P = CFO.periodo;
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const N2 = v => (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });

  /* ---------- Meses (chave AAAAMM) ---------- */
  const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const lbl = k => MES[k % 100 - 1] + '/' + Math.floor(k / 100);
  const nextKey = k => k % 100 === 12 ? k + 89 : k + 1, prevKey = k => k % 100 === 1 ? k - 89 : k - 1;
  const add = (k, n) => { for (; n > 0; n--) k = nextKey(k); for (; n < 0; n++) k = prevKey(k); return k; };
  const curKey = () => { const d = new Date(); return d.getFullYear() * 100 + d.getMonth() + 1; };

  /* ---------- Parâmetros ---------- */
  const Z = { 90: 1.28, 95: 1.65, 97.5: 1.96, 99: 2.33 };
  const cfg = () => ({ prazo: 15, nivel: 95, ciclo: 30, jan: 6, it: {}, ...(CFO.store.get('calc:cfg', {}) || {}) });
  const prazoDe = (c, row) => +(c.it[CFO.norm(row.item)] || {}).prazo || +c.prazo || 15;
  const fornDe = (c, row) => ((c.it[CFO.norm(row.item)] || {}).forn || '').trim();

  const med = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const dp = a => { if (a.length < 3) return null; const m = med(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };   // desvio padrão (precisa de 3+ meses)

  /* ---------- Dados comuns ---------- */
  const preparar = ctx => {
    const c = cfg(), rows = CFO.store.get('epi', []), achar0 = CFO.casarEpi(rows), cur = curKey(), memo = new Map();
    const achar = nome => { if (!memo.has(nome)) memo.set(nome, achar0(nome)); return memo.get(nome); };
    const q = new Map(); let sem = 0, ini = 0;
    (ctx.reqs || []).forEach(r => (r.itens || []).forEach(i => {
      if (!(i.qa > 0)) return; const row = achar(i.item); if (!row) { sem++; return; }
      const k = ctx.key(r); if (!k) return;
      const m = q.get(row.id) || new Map(); m.set(k, (m.get(k) || 0) + i.qa); q.set(row.id, m); ini = ini ? Math.min(ini, k) : k;
    }));
    const preco = new Map(), pk = new Map();                         // último preço de cada EPI, em todas as requisições (valores de estoque)
    CFO.store.get('requisicoes', []).forEach(r => { const k = P.key(r.mes) || 0; (r.itens || []).forEach(i => {
      const p = CFO.preco(i); if (!p) return; const row = achar(i.item); if (!row) return;
      if (k >= (pk.get(row.id) || 0)) { pk.set(row.id, k); preco.set(row.id, p); } }); });
    return { c, rows, achar, cur, q, sem, ini: ini || cur, preco, ctx };
  };
  // Consumo mensal dos últimos n meses fechados (a partir do primeiro mês com dados); sem mês fechado, usa o mês atual
  const serie = (d, id, n) => {
    const m = d.q.get(id) || new Map(), ks = [];
    for (let i = 1; i <= n; i++) { const k = add(d.cur, -i); if (k >= d.ini) ks.unshift(k); }
    if (!ks.length) return { ks: [d.cur], v: [m.get(d.cur) || 0] };
    return { ks, v: ks.map(k => m.get(k) || 0) };
  };
  // Estoque de segurança: Z × desvio mensal × √(prazo/30). Com menos de 3 meses de histórico: metade do consumo do prazo.
  const segur = (D, sd, lt, z) => D <= 0 ? 0 : sd == null ? Math.ceil(D * lt / 30 * .5) : Math.ceil(z * sd * Math.sqrt(lt / 30));
  // Uma linha por EPI com todos os números de planejamento
  const planejar = d => d.rows.map(r => {
    const s = serie(d, r.id, +d.c.jan || 6), D = med(s.v), sd = dp(s.v), lt = prazoDe(d.c, r), z = Z[d.c.nivel] || 1.65, est = +r.qtd || 0;
    const ss = segur(D, sd, lt, z), rop = D > 0 ? Math.ceil(D * lt / 30 + ss) : 0, max = D > 0 ? Math.ceil(ss + D * (lt + (+d.c.ciclo || 30)) / 30) : 0;
    return { r, nome: r.item, D, sd, lt, z, est, ss, rop, max, pr: d.preco.get(r.id) || 0, forn: fornDe(d.c, r), meses: s.v.length };
  }).filter(x => x.D > 0 || x.est > 0);

  /* ================= 1) VARIAÇÃO DE DEMANDA POR ITEM (Controle mensal) ================= */
  const variacao = ctx => {
    const d = preparar(ctx), ks = [3, 2, 1, 0].map(i => add(d.cur, -i)), [k3, k2, k1, k0] = ks;
    const linhas = d.rows.map(r => {
      const m = d.q.get(r.id) || new Map(), v = ks.map(k => m.get(k) || 0), ant = v[2], at = v[3], md = (v[0] + v[1] + v[2]) / 3;
      const dq = at - ant, dpc = ant ? dq / ant : '', vm = md ? at / md - 1 : '';
      const tend = !v.some(x => x) ? '' : !ant && at > 0 ? 'Novo' : !ant ? 'Sem saída' : dq / ant > .2 ? 'Alta' : dq / ant < -.2 ? 'Queda' : 'Estável';
      return { nome: r.item, v, dq, dpc, md, vm, tend, row: [r.item, ...v, dq, dpc, md, vm, tend] };
    }).filter(x => x.v.some(a => a > 0)).sort((a, b) => Math.abs(b.dq) - Math.abs(a.dq));
    const alta = linhas.filter(x => x.tend === 'Alta' || x.tend === 'Novo'), queda = linhas.filter(x => x.tend === 'Queda');
    const topA = [...linhas].sort((a, b) => b.dq - a.dq)[0], topQ = [...linhas].sort((a, b) => a.dq - b.dq)[0];
    return { titulo: 'Variação de demanda por item', sub: `quantidade que saiu em ${lbl(k0)} (mês atual) contra ${lbl(k1)} · alta/queda = mudança acima de 20%`,
      kpis: [{ t: 'Itens em alta', v: alta.length, s: 'saindo mais que no mês anterior' }, { t: 'Itens em queda', v: queda.length, s: 'saindo menos que no mês anterior' },
        { t: 'Maior alta', v: topA && topA.dq > 0 ? '+' + N(topA.dq) : '-', s: topA && topA.dq > 0 ? topA.nome : '' }, { t: 'Maior queda', v: topQ && topQ.dq < 0 ? N(topQ.dq) : '-', s: topQ && topQ.dq < 0 ? topQ.nome : '' }],
      secoes: [{ nome: 'Por item', scroll: true, sub: 'mês atual pode estar incompleto · a variação em % só existe quando o mês anterior teve saída',
        cab: [['EPI', 't'], [lbl(k3), 'n'], [lbl(k2), 'n'], [lbl(k1) + ' (anterior)', 'n'], [lbl(k0) + ' (atual)', 'n'], ['Var. qtd', 'v'], ['Var. %', 'vp'], ['Média 3 meses', 'n'], ['Atual × média', 'vp'], ['Tendência', 's']],
        linhas: linhas.map(x => x.row) }],
      nota: d.sem ? `${d.sem} linha(s) de requisição não casaram com a Planilha EPI e ficaram de fora.` : '' };
  };

  /* ================= 2) PONTO DE PEDIDO (Controle mensal) ================= */
  const pedido = ctx => {
    const d = preparar(ctx), PR = { 'Zerado': 0, 'Pedir agora': 1, 'Atenção': 2, 'Sem giro': 4, 'OK': 3 };
    const L = planejar(d).map(x => {
      const dia = x.D / 30, sit = x.D <= 0 ? 'Sem giro' : x.est <= 0 ? 'Zerado' : x.est <= x.rop ? 'Pedir agora' : x.est <= x.rop * 1.25 ? 'Atenção' : 'OK';
      const ate = x.D > 0 ? Math.max(0, Math.round((x.est - x.rop) / dia)) : '', sug = x.D > 0 && x.est <= x.rop ? Math.max(0, Math.ceil(x.max - x.est)) : '';
      return { ...x, sit, ate, sug, row: [x.nome, x.forn || '-', x.est, x.D, x.lt, x.ss, x.rop, ate, sit, sug, sug ? sug * x.pr : ''] };
    }).sort((a, b) => PR[a.sit] - PR[b.sit] || (a.ate === '' ? 1e9 : a.ate) - (b.ate === '' ? 1e9 : b.ate));
    const ped = L.filter(x => x.sit === 'Pedir agora' || x.sit === 'Zerado');
    return { titulo: 'Ponto de pedido', sub: 'ponto de pedido = consumo diário × prazo de entrega + estoque de segurança · pediu quando o estoque chega nele, a compra chega antes de faltar',
      kpis: [{ t: 'Pedir agora', v: ped.length, s: 'estoque no ponto de pedido ou abaixo' }, { t: 'Em atenção', v: L.filter(x => x.sit === 'Atenção').length, s: 'até 25% acima do ponto' },
        { t: 'Valor da compra sugerida', v: R$(ped.reduce((a, x) => a + (+x.sug || 0) * x.pr, 0)), s: 'até o estoque máximo, no último preço' }, { t: 'Prazo padrão', v: d.c.prazo + ' dias', s: 'ajuste por item em Parâmetros' }],
      secoes: [{ nome: 'Por item', scroll: true, sub: 'prazo e fornecedor vêm de Parâmetros; sem prazo próprio, vale o padrão',
        cab: [['EPI', 't'], ['Fornecedor', 't'], ['Estoque', 'n'], ['Consumo/mês', 'n'], ['Prazo (dias)', 'n'], ['Est. segurança', 'n'], ['Ponto de pedido', 'n'], ['Dias até o ponto', 'n'], ['Situação', 's'], ['Sugestão de compra', 'n'], ['Valor estimado', '$']],
        linhas: L.map(x => x.row) }],
      nota: d.sem ? `${d.sem} linha(s) de requisição não casaram com a Planilha EPI e ficaram de fora.` : '' };
  };

  /* ================= 3) ESTOQUE DE SEGURANÇA (Controle mensal) ================= */
  const seguranca = ctx => {
    const d = preparar(ctx), mins = CFO.estoqueMin(d.rows);
    const L = planejar(d).filter(x => x.D > 0).map(x => {
      const m = mins.get(x.r.id) || {}, min = m.min || 0, dif = x.ss - min, sit = !min ? 'Sem mínimo' : min < x.ss ? 'Mínimo baixo' : 'OK';
      return { ...x, min, dif, sit, row: [x.nome, x.D, x.sd == null ? '' : x.sd, x.lt, d.c.nivel / 100, x.ss, min || '', min ? dif : '', x.sd == null ? 'Estimado (poucos meses)' : 'Desvio padrão', sit] };
    }).sort((a, b) => b.dif - a.dif);
    return { titulo: 'Estoque de segurança', sub: `segurança = ${Z[d.c.nivel] || 1.65} (nível ${d.c.nivel}%) × desvio do consumo mensal × √(prazo ÷ 30) · com menos de 3 meses de histórico: metade do consumo no prazo`,
      kpis: [{ t: 'Itens com cálculo', v: L.length, s: `histórico de até ${d.c.jan} meses` }, { t: 'Mínimo abaixo da segurança', v: L.filter(x => x.sit === 'Mínimo baixo').length, s: 'o mínimo atual não cobre a variação' },
        { t: 'Segurança total', v: N(L.reduce((a, x) => a + x.ss, 0)) + ' un', s: 'soma de todos os itens' }, { t: 'Nível de serviço', v: d.c.nivel + '%', s: 'chance de não faltar no prazo' }],
      secoes: [{ nome: 'Por item', scroll: true, sub: 'o Mínimo atual é o da Planilha EPI (manual ou automático); a diferença mostra quanto ele fica abaixo ou acima da segurança calculada',
        cab: [['EPI', 't'], ['Consumo/mês', 'n'], ['Desvio (un/mês)', 'n'], ['Prazo (dias)', 'n'], ['Nível', '%'], ['Segurança', 'n'], ['Mínimo atual', 'n'], ['Segurança − mínimo', 'v'], ['Base', 't'], ['Situação', 's']],
        linhas: L.map(x => x.row) }],
      nota: d.sem ? `${d.sem} linha(s) de requisição não casaram com a Planilha EPI e ficaram de fora.` : '' };
  };

  /* ================= 4) ESTOQUE MÁXIMO POR ITEM (Controle mensal) ================= */
  const maximo = ctx => {
    const d = preparar(ctx);
    const L = planejar(d).map(x => {
      const exc = Math.max(0, x.est - x.max), sit = x.D <= 0 ? (x.est > 0 ? 'Sem giro' : '') : x.est > x.max ? 'Acima do máximo' : x.est <= x.rop ? 'Pedir agora' : 'Dentro';
      return { ...x, exc, sit, row: [x.nome, x.D, x.ss, x.rop, x.max, x.est, x.D > 0 ? x.est / x.D : '', sit, exc, exc * x.pr] };
    }).sort((a, b) => b.exc * (b.pr || 1) - a.exc * (a.pr || 1));
    const acima = L.filter(x => x.sit === 'Acima do máximo' || x.sit === 'Sem giro');
    return { titulo: 'Estoque máximo por item', sub: `máximo = estoque de segurança + consumo diário × (prazo de entrega + ciclo de compra de ${d.c.ciclo} dias) · acima disso, capital parado`,
      kpis: [{ t: 'Itens acima do máximo', v: acima.length, s: 'incluindo os sem giro' }, { t: 'Unidades em excesso', v: N(L.reduce((a, x) => a + x.exc, 0)) }, { t: 'Valor em excesso', v: R$(L.reduce((a, x) => a + x.exc * x.pr, 0)), s: 'no último preço' },
        { t: 'Dentro da faixa', v: L.filter(x => x.sit === 'Dentro').length, s: 'entre o ponto de pedido e o máximo' }],
      secoes: [{ nome: 'Por item', scroll: true, sub: 'cobertura = estoque ÷ consumo mensal · prazo e ciclo vêm de Parâmetros',
        cab: [['EPI', 't'], ['Consumo/mês', 'n'], ['Segurança', 'n'], ['Ponto de pedido', 'n'], ['Máximo', 'n'], ['Estoque', 'n'], ['Cobertura (meses)', 'n'], ['Situação', 's'], ['Excesso (un)', 'n'], ['Valor em excesso', '$']],
        linhas: L.map(x => x.row) }],
      nota: d.sem ? `${d.sem} linha(s) de requisição não casaram com a Planilha EPI e ficaram de fora.` : '' };
  };

  /* ================= 5) GIRO DO ESTOQUE (Gastos em EPIs) ================= */
  const giro = ctx => {
    const d = preparar(ctx);
    const L = d.rows.map(r => {
      const s = serie(d, r.id, 12), D = med(s.v), est = +r.qtd || 0, pr = d.preco.get(r.id) || 0;
      const gm = est > 0 ? D / est : '', ga = est > 0 ? D * 12 / est : '', cob = D > 0 ? est / D * 30 : '';
      const sit = D <= 0 ? (est > 0 ? 'Sem giro' : '') : est <= 0 ? 'Zerado' : cob <= 30 ? 'Alto giro' : cob <= 90 ? 'Normal' : 'Baixo giro';
      return { nome: r.item, D, est, pr, gm, ga, cob, sit, vEst: est * pr, vCons: D * 12 * pr, row: [r.item, est, D, gm, ga, cob, est * pr, sit] };
    }).filter(x => x.D > 0 || x.est > 0).sort((a, b) => (b.sit === 'Sem giro') - (a.sit === 'Sem giro') || b.vEst - a.vEst);
    const vEst = L.reduce((a, x) => a + x.vEst, 0), vCons = L.reduce((a, x) => a + x.vCons, 0), parado = L.filter(x => x.sit === 'Sem giro');
    return { titulo: 'Giro do estoque', sub: 'giro = consumo ÷ estoque atual (quantas vezes o estoque se renova) · consumo = média dos últimos 12 meses fechados · cobertura = estoque ÷ consumo diário',
      kpis: [{ t: 'Giro anual (em R$)', v: vEst ? N2(vCons / vEst) + '×' : '-', s: 'consumo anual ÷ valor em estoque' }, { t: 'Cobertura geral', v: vCons ? N(vEst / vCons * 365) + ' dias' : '-', s: 'quanto o estoque dura, em valor' },
        { t: 'Itens sem giro', v: parado.length, s: 'têm estoque e nenhuma saída' }, { t: 'Capital parado (sem giro)', v: R$(parado.reduce((a, x) => a + x.vEst, 0)), s: 'no último preço' }],
      secoes: [{ nome: 'Por item', scroll: true, sub: 'alto giro: dura até 30 dias · normal: até 90 · baixo giro: mais de 90 · itens sem preço não entram nos valores',
        cab: [['EPI', 't'], ['Estoque', 'n'], ['Consumo/mês', 'n'], ['Giro mensal', 'g'], ['Giro anual', 'g'], ['Cobertura (dias)', 'n'], ['Valor em estoque', '$'], ['Situação', 's']], linhas: L.map(x => x.row) }],
      nota: (ctx.filtrado ? 'Respeita os filtros de contrato e tipo da tela. ' : '') + (d.sem ? `${d.sem} linha(s) de requisição não casaram com a Planilha EPI.` : '') };
  };

  /* ================= 6) OBSOLESCÊNCIA 30/60/90 (Gastos em EPIs) ================= */
  const obsolescencia = ctx => {
    const d = preparar(ctx), hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ult = new Map(), poe = (id, dt) => { if (!(dt instanceof Date) || isNaN(dt)) return; if (dt > hoje) dt = hoje; if (!ult.has(id) || dt > ult.get(id)) ult.set(id, dt); };
    d.q.forEach((m, id) => m.forEach((qt, k) => { if (k <= d.cur && qt > 0) poe(id, new Date(Math.floor(k / 100), k % 100, 0)); }));      // requisição: só o mês é conhecido (vale o último dia do mês)
    if (!ctx.filtrado) CFO.store.get('epi:mov', []).forEach(m => { if (m.tipo === 'Saída') { const row = d.achar(m.item); if (row) poe(row.id, new Date(m.data)); } });   // movimentação: data exata
    const faixa = n => n == null ? 'Nunca saiu' : n <= 30 ? 'Até 30 dias' : n <= 60 ? '30–60 dias' : n <= 90 ? '60–90 dias' : 'Mais de 90 dias';
    const L = d.rows.filter(r => (+r.qtd || 0) > 0).map(r => {
      const dt = ult.get(r.id), n = dt ? Math.max(0, Math.round((hoje - dt) / 864e5)) : null, est = +r.qtd || 0, pr = d.preco.get(r.id) || 0;
      return { nome: r.item, dt, n, est, vEst: est * pr, f: faixa(n), row: [r.item, est, dt ? dt.toLocaleDateString('pt-BR') : '-', n == null ? '' : n, faixa(n), est * pr] };
    }).sort((a, b) => (b.n == null ? 1e9 : b.n) - (a.n == null ? 1e9 : a.n) || b.vEst - a.vEst);
    const FX = ['Até 30 dias', '30–60 dias', '60–90 dias', 'Mais de 90 dias', 'Nunca saiu'];
    const resumo = { nome: 'Resumo por faixa', cab: [['Faixa', 's'], ['Itens', 'n'], ['Unidades', 'n'], ['Valor parado', '$'], ['% do valor', '%']],
      linhas: FX.map(f => { const l = L.filter(x => x.f === f), v = l.reduce((a, x) => a + x.vEst, 0), tv = L.reduce((a, x) => a + x.vEst, 0); return [f, l.length, l.reduce((a, x) => a + x.est, 0), v, tv ? v / tv : 0]; }) };
    const parados = L.filter(x => x.n == null || x.n > 30), v90 = L.filter(x => x.n == null || x.n > 90);
    return { titulo: 'Obsolescência (30 / 60 / 90 dias)', sub: 'dias desde a última saída de cada item que ainda tem estoque · saída pela movimentação (data exata) ou pela requisição (vale o fim do mês)',
      kpis: [{ t: 'Parados há mais de 30 dias', v: parados.length, s: R$(parados.reduce((a, x) => a + x.vEst, 0)) }, { t: 'Parados há mais de 60 dias', v: L.filter(x => x.n == null || x.n > 60).length, s: R$(L.filter(x => x.n == null || x.n > 60).reduce((a, x) => a + x.vEst, 0)) },
        { t: 'Parados há mais de 90 dias', v: v90.length, s: R$(v90.reduce((a, x) => a + x.vEst, 0)) }, { t: 'Nunca saíram', v: L.filter(x => x.n == null).length, s: 'estoque sem nenhuma saída registrada' }],
      secoes: [resumo, { nome: 'Por item', scroll: true, sub: 'só itens com estoque, do mais parado ao menos parado',
        cab: [['EPI', 't'], ['Estoque', 'n'], ['Última saída', 't'], ['Dias parado', 'n'], ['Faixa', 's'], ['Valor parado', '$']], linhas: L.map(x => x.row) }],
      nota: ctx.filtrado ? 'Com filtro de contrato ou tipo, só as requisições contam (a movimentação da Planilha EPI não tem contrato).' : '' };
  };

  /* ================= 7) ACURACIDADE DO ESTOQUE (Gastos em EPIs) ================= */
  const acuracia = ctx => {
    const d = preparar(ctx), y = ctx.y || '', m = ctx.m || '';
    const cs = CFO.store.get('contagens', []).slice().sort((a, b) => (a.dia + a.ts).localeCompare(b.dia + b.ts)).filter(c => (!y || c.dia.slice(0, 4) === String(y)) && (!m || +c.dia.slice(5, 7) === +m));
    const dia = s => s.split('-').reverse().join('/'), preco = rid => d.preco.get(rid) || 0, tag = p => p >= .95 ? 'OK' : p >= .9 ? 'Atenção' : 'Abaixo';
    const porC = cs.map(c => {
      const L = c.itens.filter(x => x.sis != null), ac = L.filter(x => x.qtd === x.sis).length, a = L.reduce((s, x) => s + Math.max(0, x.qtd - x.sis), 0), f = L.reduce((s, x) => s + Math.max(0, x.sis - x.qtd), 0);
      const base = L.reduce((s, x) => s + x.sis, 0), val = L.reduce((s, x) => s + Math.abs(x.qtd - x.sis) * preco(x.rid), 0), p = L.length ? ac / L.length : null;
      return { c, n: L.length, ac, p, a, f, au: base ? Math.max(0, 1 - (a + f) / base) : null, val, row: [dia(c.dia), L.length, ac, L.length - ac, p == null ? '' : p, base ? Math.max(0, 1 - (a + f) / base) : '', a, f, val, p == null ? '' : tag(p)] };
    });
    const it = new Map();                                              // itens que mais divergem
    cs.forEach(c => c.itens.filter(x => x.sis != null).forEach(x => { const o = it.get(x.rid) || { nome: x.item, n: 0, div: 0, abs: 0, val: 0 }; o.n++; if (x.qtd !== x.sis) { o.div++; o.abs += Math.abs(x.qtd - x.sis); o.val += Math.abs(x.qtd - x.sis) * preco(x.rid); } it.set(x.rid, o); }));
    const tI = [...it.values()].filter(o => o.div).sort((a, b) => b.val - a.val || b.abs - a.abs);
    const ult = porC[porC.length - 1], validas = porC.filter(x => x.p != null);
    const geral = validas.length ? validas.reduce((a, x) => a + x.ac, 0) / validas.reduce((a, x) => a + x.n, 0) : null;
    return { titulo: 'Acuracidade do estoque', sub: '% de acerto = itens em que o contado foi igual ao do sistema ÷ itens contados · acuracidade em unidades = 1 − (unidades de diferença ÷ unidades do sistema) · meta: 95% ou mais',
      kpis: [{ t: 'Acerto da última contagem', v: ult && ult.p != null ? pct(ult.p) : '-', s: ult ? dia(ult.c.dia) : 'faça uma contagem' }, { t: 'Acerto geral', v: geral != null ? pct(geral) : '-', s: `${validas.length} contagem(ns)` },
        { t: 'Divergências (última)', v: ult ? ult.n - ult.ac : '-', s: ult ? `de ${ult.n} itens contados` : '' }, { t: 'Valor divergente (última)', v: ult ? R$(ult.val) : '-', s: 'diferença em módulo, no último preço' }],
      secoes: [{ nome: 'Por contagem', scroll: true, sub: 'itens novos (sem saldo no sistema) não entram · "a mais" e "a menos" = unidades contadas acima/abaixo do sistema',
        cab: [['Data', 't'], ['Itens', 'n'], ['Acertos', 'n'], ['Divergências', 'n'], ['% de acerto', '%'], ['Acuracidade (un.)', '%'], ['Unid. a mais', 'n'], ['Unid. a menos', 'n'], ['Valor divergente', '$'], ['Situação', 's']], linhas: porC.map(x => x.row).reverse() },
        { nome: 'Itens que mais divergem', scroll: true, sub: 'ordenado pelo valor da diferença',
          cab: [['EPI', 't'], ['Contagens', 'n'], ['Com divergência', 'n'], ['% de acerto do item', '%'], ['Unid. de diferença', 'n'], ['Valor divergente', '$']], linhas: tI.map(o => [o.nome, o.n, o.div, 1 - o.div / o.n, o.abs, o.val]) }],
      nota: cs.length ? '' : 'Nenhuma contagem no período. Use Ferramentas > Contagem de estoque para fazer uma.' };
  };

  /* ================= PARÂMETROS (Controle mensal) ================= */
  const parametros = ctx => {
    const d = preparar(ctx), c = d.c, rows = [...d.rows].sort((a, b) => numCmp(a.item, b.item));
    const sel = (k, ops, v) => `<select data-p="${k}">${ops.map(o => `<option value="${o[0]}" ${String(o[0]) === String(v) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
    const geral = `<div class="xpar"><label>Prazo de entrega padrão (dias)<input type="number" min="1" step="1" data-p="prazo" value="${+c.prazo || 15}"></label>
      <label>Nível de serviço${sel('nivel', [[90, '90%'], [95, '95%'], [97.5, '97,5%'], [99, '99%']], c.nivel)}</label>
      <label>Ciclo de compra (dias)<input type="number" min="1" step="1" data-p="ciclo" value="${+c.ciclo || 30}"></label>
      <label>Histórico usado${sel('jan', [[3, '3 meses'], [6, '6 meses'], [12, '12 meses']], c.jan)}</label></div>
      <p class="log">Prazo padrão vale para quem não tem prazo próprio na tabela abaixo. Ciclo de compra = de quanto em quanto tempo você costuma comprar (usado no estoque máximo). Nível de serviço = chance de não faltar durante o prazo.</p>`;
    const tab = `<div class="tw scroll"><table><thead><tr><th>EPI</th><th>Estoque</th><th>Fornecedor</th><th>Prazo de entrega (dias)</th></tr></thead><tbody>
      ${rows.map(r => { const k = CFO.norm(r.item), x = c.it[k] || {}; return `<tr><td>${esc(r.item)}</td><td>${N(+r.qtd || 0)}</td>
        <td><input type="text" data-i="${esc(k)}" data-k="forn" value="${esc(x.forn || '')}" placeholder="-"></td>
        <td><input type="number" min="0" step="1" data-i="${esc(k)}" data-k="prazo" value="${x.prazo || ''}" placeholder="${+c.prazo || 15} (padrão)"></td></tr>`; }).join('') || '<tr><td colspan="4" class="empty">Cadastre itens na Planilha EPI</td></tr>'}</tbody></table></div>`;
    return { titulo: 'Parâmetros dos cálculos', sub: 'prazo de entrega, fornecedor, nível de serviço e ciclo de compra usados no Ponto de pedido, Estoque de segurança e Estoque máximo', kpis: [],
      secoes: [{ nome: 'Parâmetros', tela: true, custom: geral + tab }], nota: '' };
  };

  /* ---------- Catálogo (o que aparece em cada gavetinha) ---------- */
  const CALC = {
    variacao: { nome: 'Variação de demanda', desc: 'quantidade por item: mês atual × anterior', fn: variacao },
    pedido: { nome: 'Ponto de pedido', desc: 'quando pedir, com prazo de entrega', fn: pedido },
    seguranca: { nome: 'Estoque de segurança', desc: 'cálculo próprio, além do mínimo', fn: seguranca },
    maximo: { nome: 'Estoque máximo', desc: 'limite por item, não só 6 meses', fn: maximo },
    param: { nome: 'Parâmetros', desc: 'prazo, fornecedor e nível de serviço', fn: parametros },
    giro: { nome: 'Giro do estoque', desc: 'quantas vezes o estoque se renova', fn: giro },
    obsol: { nome: 'Obsolescência 30/60/90', desc: 'dias parado e valor parado', fn: obsolescencia },
    acuracia: { nome: 'Acuracidade', desc: '% de acerto da contagem', fn: acuracia }
  };
  const TELAS = { mensal: ['variacao', 'pedido', 'seguranca', 'maximo', 'param'], gastos: ['giro', 'obsol', 'acuracia'] };

  /* ---------- Tabelas ---------- */
  const SC = { 'OK': 'ok', 'Dentro': 'ok', 'Estável': 'ok', 'Alto giro': 'ok', 'Normal': 'ok', 'Até 30 dias': 'ok',
    'Atenção': 'warn', 'Alta': 'warn', 'Queda': 'warn', 'Novo': 'warn', 'Sem giro': 'warn', 'Baixo giro': 'warn', 'Acima do máximo': 'warn', 'Mínimo baixo': 'warn', 'Sem mínimo': 'warn', '30–60 dias': 'warn', '60–90 dias': 'warn',
    'Zerado': 'bad', 'Pedir agora': 'bad', 'Abaixo': 'bad', 'Mais de 90 dias': 'bad', 'Nunca saiu': 'bad' };
  const celHtml = (v, t) => {
    if (v === '' || v == null) return '';
    if (t === '$') return R$(v); if (t === 'n') return N(v); if (t === '%') return pct(v); if (t === 'g') return N2(v) + '×';
    if (t === 'v') return `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${N(v)}</span>`;
    if (t === 'vp') return `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${pct(v)}</span>`;
    if (t === 's') return `<span class="tag ${SC[v] || ''}">${esc(v)}</span>`;
    return esc(v);
  };
  const tabHtml = s => `<div class="tw ${s.scroll ? 'scroll' : ''}"><table><thead><tr>${s.cab.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>
    ${s.linhas.map(l => `<tr>${l.map((v, i) => `<td>${celHtml(v, s.cab[i][1])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${s.cab.length}" class="empty">Sem dados</td></tr>`}</tbody></table></div>`;
  const tile = k => `<div class="card"><small>${esc(k.t)}</small><b>${esc(k.v)}</b>${k.s ? `<small>${esc(k.s)}</small>` : ''}</div>`;

  /* ---------- Exportar ---------- */
  const agora = () => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const cel = (v, t) => v === '' || v == null ? '' : t === '$' ? { t: 'n', v: +v, z: '"R$" #,##0.00' } : t === 'n' ? { t: 'n', v: +v, z: '#,##0.0' } : t === '%' || t === 'vp' ? { t: 'n', v: +v, z: t === 'vp' ? '+0.0%;-0.0%;0.0%' : '0.0%' }
    : t === 'g' ? { t: 'n', v: +v, z: '0.00"×"' } : t === 'v' ? { t: 'n', v: +v, z: '+#,##0.0;-#,##0.0;0' } : String(v);
  function exportar(r) {
    if (!r) return;
    const secs = r.secoes.filter(s => !s.tela);
    const itens = [{ id: 'kpi', nome: 'Indicadores (resumo)' }, ...secs.map((s, k) => ({ id: 's' + k, nome: s.nome }))];
    CFO.exportar({ titulo: 'Exportar - ' + r.titulo, itens, run: (fmt, sel, { logo }) => {
      if (fmt === 'xlsx') {
        const folhas = [];
        if (sel.has('kpi')) folhas.push({ nome: 'Resumo', cabRow: 4, cols: [30, 28, 46], aoa: [[r.titulo], ['Gerado em', agora()], [], ['Indicador', 'Valor', 'Observação'], ...r.kpis.map(k => [k.t, String(k.v), k.s || ''])] });
        secs.forEach((s, k) => { if (!sel.has('s' + k)) return;
          folhas.push({ nome: s.nome.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31), aoa: [s.cab.map(c => c[0]), ...s.linhas.map(l => l.map((v, i) => cel(v, s.cab[i][1])))], cabRow: 0,
            cols: s.cab.map((c, i) => Math.min(60, Math.max(10, c[0].length, ...s.linhas.map(l => String(typeof l[i] === 'number' ? '99.999,99' : l[i] ?? '').length)) + 2)) }); });
        CFO.xlsxSalvar(`${r.titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${new Date().toISOString().slice(0, 10)}.xlsx`, folhas, { logo });
      } else CFO.print(`<style>@page{size:A4 landscape;margin:10mm}</style><div class="rel">${CFO.cabecalhoPdf(r.titulo, logo)}<p class="meta">Gerado em ${esc(agora())}</p>
        ${sel.has('kpi') ? `<div class="cards">${r.kpis.map(tile).join('')}</div>` : ''}${secs.map((s, k) => sel.has('s' + k) ? `<div class="sub">${esc(s.nome)}</div>${tabHtml(s)}` : '').join('')}</div>`);
    } });
  }

  /* ---------- Botão "Outros cálculos" + gavetinha + resultado embaixo ---------- */
  CFO.extras = {
    _calc: CALC,
    montar(body, { tela, onde, ctx }) {
      const ids = TELAS[tela] || [];
      let sel = '', det = '', ultimo = null;
      const wrap = document.createElement('span'); wrap.className = 'xwrap';
      wrap.innerHTML = `<button type="button" class="ghost xbtn" aria-haspopup="menu" aria-expanded="false">Outros cálculos</button>
        <div class="xmenu" role="menu" hidden>${ids.map(id => `<button type="button" role="menuitem" data-x="${id}"><b>${esc(CALC[id].nome)}</b><small>${esc(CALC[id].desc)}</small></button>`).join('')}</div>`;
      onde.append(wrap);
      const out = document.createElement('div'); out.className = 'xout'; body.append(out);
      const btn = wrap.querySelector('.xbtn'), menu = wrap.querySelector('.xmenu');
      const abre = v => { menu.hidden = !v; btn.setAttribute('aria-expanded', String(v)); };
      const fora = e => { if (!body.isConnected) return document.removeEventListener('click', fora); if (!wrap.contains(e.target)) abre(false); };
      document.addEventListener('click', fora);
      btn.onclick = () => abre(menu.hidden);
      const keep = fn => { const sc = body.closest('.screen'), y = sc ? sc.scrollTop : 0; fn(); if (sc) sc.scrollTop = y; };

      function render(rolar) {
        if (!sel) { out.innerHTML = ''; ultimo = null; btn.textContent = 'Outros cálculos'; btn.classList.remove('on'); menu.querySelectorAll('[data-x]').forEach(b => b.classList.remove('on')); return; }
        btn.textContent = CALC[sel].nome; btn.classList.add('on');
        menu.querySelectorAll('[data-x]').forEach(b => b.classList.toggle('on', b.dataset.x === sel));
        const r = ultimo = CALC[sel].fn(ctx());
        if (!r.secoes.some(s => s.nome === det)) det = r.secoes[0].nome;
        const s = r.secoes.find(x => x.nome === det);
        out.innerHTML = `<section class="pn w12 xcalc"><header><h3>${esc(r.titulo)}</h3><span class="xacoes">${r.secoes.every(x => x.tela) ? '' : '<button type="button" class="ghost" data-a="exp">Exportar</button>'}<button type="button" class="ghost" data-a="x" aria-label="Fechar cálculo">✕</button></span></header>
          ${r.sub ? `<p class="log" style="margin:0 0 .7rem">${esc(r.sub)}</p>` : ''}${r.kpis.length ? `<div class="cards kpis">${r.kpis.map(tile).join('')}</div>` : ''}
          ${r.secoes.length > 1 ? `<div class="subtabs" style="margin:.8rem 0 .6rem">${r.secoes.map(x => `<button type="button" class="ghost ${x === s ? 'on' : ''}" data-d="${esc(x.nome)}">${esc(x.nome)}</button>`).join('')}</div>` : ''}
          ${s.sub ? `<p class="log" style="margin:.6rem 0">${esc(s.sub)}</p>` : ''}${s.custom || tabHtml(s)}${r.nota ? `<p class="log">${esc(r.nota)}</p>` : ''}</section>`;
        out.querySelector('[data-a="x"]').onclick = () => { sel = ''; render(); };
        const ex = out.querySelector('[data-a="exp"]'); if (ex) ex.onclick = () => exportar(ultimo);
        out.querySelectorAll('[data-d]').forEach(b => b.onclick = () => keep(() => { det = b.dataset.d; render(); }));
        out.querySelectorAll('[data-p]').forEach(el => el.onchange = () => { const c = CFO.store.get('calc:cfg', {}) || {}; c[el.dataset.p] = +el.value || 0; if (el.dataset.p === 'nivel') c.nivel = +el.value; CFO.store.set('calc:cfg', c); keep(() => render()); });
        out.querySelectorAll('[data-i]').forEach(el => el.onchange = () => { const c = CFO.store.get('calc:cfg', {}) || {}; c.it = c.it || {}; const o = c.it[el.dataset.i] = { ...(c.it[el.dataset.i] || {}) };
          if (el.dataset.k === 'forn') o.forn = el.value.trim(); else o.prazo = +el.value || 0; CFO.store.set('calc:cfg', c); keep(() => render()); });
        if (rolar) out.firstElementChild.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      menu.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { sel = b.dataset.x; det = ''; abre(false); render(true); });
      return { atualizar: () => { if (sel) render(); }, fechar: () => { sel = ''; render(); } };
    }
  };
})();
