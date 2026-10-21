/* ===== Almoxarifado Operacional > Planilha EPI ===== */

// Planilha de EPIs (modelo: CÓDIGO | ITEM / DESCRIÇÃO | QUANTIDADE EM ESTOQUE)
CFO.modules.epi = CFO.sheet({
  key: 'epi', title: 'Planilha EPI', hints: ['epi', 'inventario'], moves: true, qty: 'qtd', nameKey: 'item', dedupe: ['codigo', 'item'],
  columns: [
    { k: 'codigo', label: 'Código', alias: ['cod', 'codigo item'] },
    { k: 'item', label: 'Item / Descrição', alias: ['item', 'descricao', 'produto', 'epi'] },
    { k: 'qtd', label: 'Estoque', type: 'number', alias: ['quantidade', 'qtd', 'quantidade em estoque'] },
    { k: 'min', label: 'Estoque mínimo', type: 'number', alias: ['minimo', 'qtd minima'] }
  ],
  dash: (rows, movs) => {
    const lim = dias(-30), rec = movs.filter(m => m.data.slice(0, 10) >= lim);
    const soma = t => rec.filter(m => m.tipo === t).reduce((a, m) => a + m.qtd, 0);
    return [['Itens cadastrados', rows.length], ['Estoque baixo', rows.filter(r => r.min > 0 && r.qtd <= r.min).length, 'warn'],
            ['Entradas (30 dias)', soma('Entrada')], ['Saídas (30 dias)', soma('Saída')]];
  }
});
