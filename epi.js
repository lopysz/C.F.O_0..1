/* ===== Almoxarifado Operacional > Planilha EPI ===== */

// Liga o nome de um item de requisição a uma linha da Planilha EPI: nome igual; senão o mais parecido (mín. 50% de semelhança)
CFO.casarEpi = rows => {
  const idx = rows.map(r => ({ r, n: CFO.norm(r.item) })).filter(x => x.n), exato = new Map(idx.map(x => [x.n, x.r]));
  return nome => {
    const n = CFO.norm(nome); if (exato.has(n)) return exato.get(n);
    let best = null, top = .5;
    idx.forEach(x => { if (x.n.includes(n) || n.includes(x.n)) { const s = Math.min(x.n.length, n.length) / Math.max(x.n.length, n.length); if (s >= top) { top = s; best = x.r; } } });
    return best;
  };
};

// Planilha de EPIs (modelo: CÓDIGO | ITEM / DESCRIÇÃO | QUANTIDADE EM ESTOQUE)
CFO.modules.epi = CFO.sheet({
  key: 'epi', title: 'Planilha EPI', hints: ['epi', 'inventario'], moves: true, qty: 'qtd', nameKey: 'item', dedupe: ['codigo', 'item'],
  columns: [
    { k: 'codigo', label: 'Código', alias: ['cod', 'codigo item'] },
    { k: 'item', label: 'Item / Descrição', alias: ['item', 'descricao', 'produto', 'epi'] },
    { k: 'qtd', label: 'Estoque', type: 'number', alias: ['quantidade', 'qtd', 'quantidade em estoque'] }
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
    return {
      cols: [{ label: 'Saiu no período', get: r => saiu.get(r.id) || 0 }],
      cards: [['Saiu no período', total], ['Itens sem cadastro', sem.size, 'warn']]
    };
  },
  dash: (rows, movs) => {
    const lim = dias(-30), rec = movs.filter(m => m.data.slice(0, 10) >= lim);
    const soma = t => rec.filter(m => m.tipo === t).reduce((a, m) => a + m.qtd, 0);
    return [['Itens cadastrados', rows.length],
            ['Entradas (30 dias)', soma('Entrada')], ['Saídas (30 dias)', soma('Saída')]];
  }
});
