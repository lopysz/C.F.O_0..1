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

/* ----- Códigos da NF -----
   A planilha tem dois códigos por item: Código SG (o do WL / segurança do trabalho) e Código NF (o do sistema de NF da empresa).
   Esta função lê uma planilha com os códigos da NF e preenche a coluna "Código NF" das linhas que combinarem:
   - se a planilha tiver o Código SG, liga por ele; senão liga pelo nome do item (sem tamanho = vale para todos os tamanhos daquele EPI);
   - se vier só "Código" + "Descrição", o código é tratado como o da NF.
   Mostra o que vai mudar e só grava depois de confirmar. */
// Linhas da Planilha EPI que combinam com um nome (de outro sistema). tipo: 'exato' (mesmo nome), 'base' (nome sem tamanho = todos os tamanhos do EPI) ou 'parecido' (aproximado: conferir).
CFO.linhasPorNome = (rows, nome) => {
  const norm = CFO.norm, ls = rows.filter(r => r && r.item), base = r => norm(CFO.baseEpi(r.item));
  const ex = ls.find(r => norm(r.item) === norm(nome)); if (ex) return { rows: [ex], tipo: 'exato' };
  if (!CFO.tamEpi(nome)) { const b = ls.filter(r => base(r) === norm(CFO.baseEpi(nome))); if (b.length) return { rows: b, tipo: 'base' }; }
  const a = CFO.casarEpi(ls)(nome); return a ? { rows: [a], tipo: 'parecido' } : { rows: [], tipo: '' };
};
CFO.importarCodigosNf = async file => {
  const norm = CFO.norm, cols = [
    { k: 'codigoNf', label: 'Código NF', alias: ['codigo nf', 'cod nf', 'codigo da nf', 'codigo na nf', 'codigo nota', 'codigo nota fiscal', 'codigo fiscal'] },
    { k: 'codigo', label: 'Código SG', alias: ['codigo', 'cod', 'codigo item', 'codigo sg', 'codigo wl'] },
    { k: 'item', label: 'Item / Descrição', alias: ['item', 'descricao', 'produto', 'epi'] }];
  let achou = null;
  for (const l of await CFO.readBook(file)) { const f = CFO.findHeader(l.data, cols, 2); if (f.hi >= 0 && (f.m.codigoNf !== undefined || f.m.codigo !== undefined) && (f.m.item !== undefined || f.m.codigoNf !== undefined && f.m.codigo !== undefined)) { achou = { data: l.data, f }; break; } }
  if (!achou) return alert('Não achei as colunas. A planilha precisa ter o código da NF e a descrição do item (ou o Código SG). Ex.: "Código NF | Descrição".');
  const { data, f } = achou, m = f.m;
  const nfCol = m.codigoNf !== undefined ? m.codigoNf : m.codigo, sgCol = m.codigoNf !== undefined ? m.codigo : undefined, itCol = m.item;
  const rows = CFO.store.get('epi', []);
  const mud = new Map(), sem = [];                      // linha(id) -> { r, nf, de }
  data.slice(f.hi + 1).forEach(l => {
    const nf = String(l[nfCol] ?? '').trim(), sg = sgCol === undefined ? '' : String(l[sgCol] ?? '').trim(), nome = itCol === undefined ? '' : String(l[itCol] ?? '').trim();
    if (!nf) return;
    let alvo = [];
    if (sg) alvo = rows.filter(r => r && norm(r.codigo) === norm(sg));
    if (!alvo.length && nome) alvo = CFO.linhasPorNome(rows, nome).rows;      // sem tamanho no nome = todos os tamanhos do EPI
    if (!alvo.length) return sem.push((sg ? sg + ' ' : '') + (nome || nf));
    alvo.forEach(r => { if (String(r.codigoNf ?? '').trim() !== nf) mud.set(r.id, { r, nf, de: String(r.codigoNf ?? '').trim() }); });
  });
  if (!mud.size) return alert('Nenhuma linha mudou.' + (sem.length ? `\n\n${sem.length} da lista não combinaram com nenhum item da planilha.` : ''));
  const amostra = [...mud.values()].slice(0, 8).map(x => `• ${x.r.item}: ${x.de || '(vazio)'} → ${x.nf}`).join('\n');
  if (!confirm(`Vou preencher o Código NF de ${mud.size} linha(s).\n\n${amostra}${mud.size > 8 ? '\n…' : ''}\n\n${sem.length} da lista não combinaram com nenhum item.\nConfirmar?`)) return;
  mud.forEach(x => { x.r.codigoNf = x.nf; });
  CFO.store.set('epi', rows);
  alert(`${mud.size} linha(s) atualizada(s).` + (sem.length ? `\n\nNão combinaram (primeiros): ${sem.slice(0, 8).join(', ')}` : ''));
};

// Planilha de EPIs (modelo: CÓDIGO SG | CÓDIGO NF | ITEM / DESCRIÇÃO | VALOR | QUANTIDADE EM ESTOQUE | MÍNIMO)
CFO.modules.epi = CFO.sheet({
  key: 'epi', title: 'Planilha EPI', editAll: true, codigosNf: f => CFO.importarCodigosNf(f), ocrNf: () => CFO.ocrNf(), hints: ['epi', 'inventario', 'produto', 'item', 'estoque', 'material', 'almox'], moves: true, qty: 'qtd', nameKey: 'item', dedupe: ['codigo', 'item'],
  columns: [
    { k: 'codigo', label: 'Código SG', alias: ['codigo', 'cod', 'codigo item', 'codigo sg', 'codigo wl'] },
    { k: 'codigoNf', label: 'Código NF', alias: ['codigo nf', 'cod nf', 'codigo da nf', 'codigo na nf', 'codigo nota', 'codigo nota fiscal', 'codigo fiscal'], hint: 'Código do produto no sistema de NF da empresa. A automação da NF usa este; se estiver vazio, usa o Código SG.' },
    { k: 'item', label: 'Item / Descrição', alias: ['item', 'descricao', 'produto', 'epi'] },
    // Valor unitário do EPI (antes ficava na gaveta "Valores dos EPIs"). Só aparece para quem pode ver os gastos.
    { k: 'valor', label: 'Valor (R$)', type: 'number', ver: () => CFO.pode('abrir', 'controle_gastos'), alias: ['valor', 'valor unitario', 'valor do epi', 'valor dos epis', 'preco', 'preco unitario', 'preco do epi'],
      fmt: v => +v > 0 ? (+v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-' },
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
        { label: 'Situação', get: r => ({ zerado: 'Zerado', baixo: 'Estoque baixo', ok: 'OK' }[sit(r)] || '-') }],
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
