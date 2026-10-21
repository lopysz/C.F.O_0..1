/* ===== Almoxarifado Operacional > Contratos ativos ===== */
// Planilha de contratos (modelo: N° Contrato | CONTRATOS)
CFO.modules.contratos = CFO.sheet({
  key: 'contratos', title: 'Contratos ativos', hints: ['contrato'], nameKey: 'nome', dedupe: ['num', 'nome'],
  columns: [
    { k: 'num', label: 'N° Contrato', alias: ['numero', 'n contrato', 'contrato n'] },
    { k: 'nome', label: 'Contrato', alias: ['contratos', 'descricao', 'nome', 'cliente'] },
    { k: 'ini', label: 'Início', type: 'date', alias: ['inicio', 'data inicio'] },
    { k: 'fim', label: 'Término', type: 'date', alias: ['termino', 'vencimento', 'data fim'] },
    { k: 'valor', label: 'Valor (R$)', type: 'number', alias: ['valor'] },
    { k: 'status', label: 'Status', options: ['Ativo', 'Suspenso', 'Encerrado'], alias: ['situacao'] }
  ],
  // Quanto cada contrato gastou em EPIs (requisições aprovadas) no mês/ano escolhido
  calc: ({ reqs, rows }) => {
    const gasto = new Map(), qtd = new Map(), val = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0);
    reqs.forEach(r => { const k = String(r.contrato); gasto.set(k, (gasto.get(k) || 0) + val(r)); qtd.set(k, (qtd.get(k) || 0) + 1); });
    const R$ = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const doCad = rows.reduce((a, r) => a + (gasto.get(String(r.num)) || 0), 0);
    return {
      cols: [{ label: 'Requisições', get: r => qtd.get(String(r.num)) || 0 }, { label: 'Gasto em EPIs', get: r => R$(gasto.get(String(r.num)) || 0) }],
      cards: [['Gasto em EPIs no período', R$(doCad)]]
    };
  },
  dash: rows => {
    const at = rows.filter(r => r.status === 'Ativo');
    return [['Contratos ativos', at.length],
            ['Vencem em 30 dias', at.filter(r => r.fim >= hoje() && r.fim <= dias(30)).length, 'warn'],
            ['Vencidos', at.filter(r => r.fim && r.fim < hoje()).length, 'warn'],
            ['Valor ativo', 'R$ ' + at.reduce((a, r) => a + r.valor, 0).toLocaleString('pt-BR')]];
  }
});
