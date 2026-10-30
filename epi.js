/* ===== Almoxarifado Operacional > Planilha EPI ===== */

// Liga o nome de um item de requisição a uma linha da Planilha EPI: nome igual; senão o mais parecido (mín. 50% de semelhança)
CFO.casarEpi = rows => {
  const idx = rows.map(r => ({ r, n: CFO.norm(r.item) })).filter(x => x.n), exato = new Map(idx.map(x => [x.n, x.r]));
  return nome => {
    const n = CFO.norm(nome); if (exato.has(n)) return exato.get(n);
    let best = null, top = .5;
    const tn = CFO.tamEpi(nome);
    idx.forEach(x => { const tx = CFO.tamEpi(x.r.item); if (tn && tx && tn !== tx) return;   // tamanhos diferentes não são o mesmo item
      if (x.n.includes(n) || n.includes(x.n)) { const s = Math.min(x.n.length, n.length) / Math.max(x.n.length, n.length); if (s >= top) { top = s; best = x.r; } } });
    return best;
  };
};

/* ----- Estoque mínimo automático -----
   Calculado pelo que sai de cada item nas requisições (aprovado):
   mínimo = o maior entre (consumo médio mensal x COBERTURA_MESES) e (pedido típico x MULT_PEDIDO), arredondado para cima.
   Ex.: luva pedida de 20 em 20 -> mínimo 60; se o consumo for alto, sobe sozinho. Ajuste os 4 números abaixo se quiser mudar o critério. */
CFO.MIN_CFG = { JANELA_MESES: 3, COBERTURA_MESES: 0.5, MULT_PEDIDO: 3, MIN_PEDIDOS: 2 };
CFO.estoqueMin = rows => {
  const C = CFO.MIN_CFG, achar = CFO.casarEpi(rows), P = CFO.periodo;
  const reqs = CFO.store.get('requisicoes', []).filter(r => r && r.itens);
  const ult = Math.max(0, ...reqs.map(r => P.key(r.mes)));            // janela termina no último mês com requisição
  const ini = ult ? (() => { let y = Math.floor(ult / 100), m = ult % 100 - (C.JANELA_MESES - 1); while (m < 1) { m += 12; y--; } return y * 100 + m; })() : 0;
  const por = new Map();                                              // id da linha -> { pedidos: [], janela: total }
  reqs.forEach(q => { const k = P.key(q.mes); q.itens.forEach(i => {
    if (!(i.qa > 0)) return; const r = achar(i.item); if (!r) return;
    const x = por.get(r.id) || { pedidos: [], janela: 0 }; x.pedidos.push(i.qa); if (k >= ini) x.janela += i.qa; por.set(r.id, x); }); });
  const bonito = n => n <= 10 ? Math.ceil(n) : n <= 50 ? Math.ceil(n / 5) * 5 : n <= 200 ? Math.ceil(n / 10) * 10 : Math.ceil(n / 50) * 50;
  const med = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const res = new Map();
  rows.forEach(r => {
    const x = por.get(r.id), manual = +r.min || 0;
    const auto = x && x.pedidos.length >= C.MIN_PEDIDOS ? bonito(Math.max((x.janela / C.JANELA_MESES) * C.COBERTURA_MESES, med(x.pedidos) * C.MULT_PEDIDO)) : 0;
    res.set(r.id, { auto, manual, min: manual || auto, origem: manual ? 'manual' : auto ? 'auto' : '' });
  });
  return res;
};

// Planilha de EPIs (modelo: CÓDIGO | ITEM / DESCRIÇÃO | QUANTIDADE EM ESTOQUE)
CFO.modules.epi = CFO.sheet({
  key: 'epi', title: 'Planilha EPI', hints: ['epi', 'inventario', 'produto', 'item', 'estoque', 'material', 'almox'], moves: true, qty: 'qtd', nameKey: 'item', dedupe: ['codigo', 'item'],
  columns: [
    { k: 'codigo', label: 'Código', alias: ['cod', 'codigo item'] },
    { k: 'item', label: 'Item / Descrição', alias: ['item', 'descricao', 'produto', 'epi'] },
    { k: 'qtd', label: 'Estoque', type: 'number', alias: ['quantidade', 'qtd', 'quantidade em estoque'] },
    { k: 'min', label: 'Mínimo manual', type: 'number', hint: 'Deixe 0 para o sistema calcular sozinho pelas saídas', alias: ['minimo', 'estoque minimo'] }
  ],
  // Quanto saiu de cada EPI, conforme as requisições (aprovado) no mês/ano escolhido
  calc: ({ reqs, rows }) => {
    const achar = CFO.casarEpi(rows);
    const saiu = new Map(), sem = new Set();
    let total = 0;
    reqs.forEach(q => q.itens.forEach(i => {
      const r = achar(i.item);
      if (r) { saiu.set(r.id, (saiu.get(r.id) || 0) + i.qa); total += i.qa; } else sem.add(i.item);
    }));
    const mins = CFO.estoqueMin(rows);
    const sit = r => { const m = mins.get(r.id); if (!m || !m.min) return ''; return (+r.qtd || 0) <= 0 ? 'zerado' : (+r.qtd || 0) <= m.min ? 'baixo' : 'ok'; };
    const baixos = rows.filter(r => ['baixo', 'zerado'].includes(sit(r))).length;
    return {
      cols: [{ label: 'Saiu no período', get: r => saiu.get(r.id) || 0 },
        { label: 'Mínimo', get: r => { const m = mins.get(r.id); return m && m.min ? m.min + (m.origem === 'auto' ? ' (auto)' : ' (manual)') : '-'; } },
        { label: 'Situação', get: r => ({ zerado: '⛔ Zerado', baixo: '⚠ Estoque baixo', ok: 'OK' }[sit(r)] || '-') }],
      cards: [['Estoque baixo', baixos, baixos ? 'warn' : ''], ['Saiu no período', total], ['Itens sem cadastro', sem.size, 'warn']],
      filtro: { label: 'Só estoque baixo', test: r => ['baixo', 'zerado'].includes(sit(r)) }
    };
  },
  dash: (rows, movs) => {
    const lim = dias(-30), rec = movs.filter(m => m.data.slice(0, 10) >= lim);
    const soma = t => rec.filter(m => m.tipo === t).reduce((a, m) => a + m.qtd, 0);
    return [['Itens cadastrados', rows.length],
            ['Entradas (30 dias)', soma('Entrada')], ['Saídas (30 dias)', soma('Saída')]];
  }
});
