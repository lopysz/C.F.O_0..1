/* ===== Almoxarifado Operacional > Contratos ativos ===== */
// Planilha de contratos (modelo: N° Contrato | CONTRATOS)
CFO.modules.contratos = CFO.sheet({
  key: 'contratos', title: 'Contratos ativos', hints: ['contrato'], nameKey: 'nome', dedupe: ['num', 'nome'],
  columns: [
    { k: 'num', label: 'N° Contrato', alias: ['numero', 'n contrato', 'nº', 'contrato n'] },
    { k: 'nome', label: 'Contrato', alias: ['contratos', 'descricao', 'nome', 'cliente'] },
    { k: 'ini', label: 'Início', type: 'date', alias: ['inicio', 'data inicio'] },
    { k: 'fim', label: 'Término', type: 'date', alias: ['termino', 'vencimento', 'data fim'] },
    { k: 'valor', label: 'Valor (R$)', type: 'number', alias: ['valor'] },
    { k: 'status', label: 'Status', options: ['Ativo', 'Suspenso', 'Encerrado'], alias: ['situacao'] }
  ],
  dash: rows => {
    const at = rows.filter(r => r.status === 'Ativo');
    return [['Contratos ativos', at.length],
            ['Vencem em 30 dias', at.filter(r => r.fim >= hoje() && r.fim <= dias(30)).length, 'warn'],
            ['Vencidos', at.filter(r => r.fim && r.fim < hoje()).length, 'warn'],
            ['Valor ativo', 'R$ ' + at.reduce((a, r) => a + r.valor, 0).toLocaleString('pt-BR')]];
  }
});
