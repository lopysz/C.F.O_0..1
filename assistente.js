/* ===== Assistente (botão flutuante) =====
   Chat SEM inteligência artificial: lê as palavras da pergunta, descobre o que a pessoa quer (onde está um item, estoque crítico,
   giro, previsão de gastos, requisições, contratos...) e responde só com os dados que o sistema já tem: Planilha EPI, Requisições,
   Mapa, Contratos, Movimentações e Contagens. Respeita as permissões do perfil. O botão some sozinho nas telas de mapa.
   Para ensinar uma pergunta nova: acrescente uma linha em INTENCOES (palavras) e uma função em H (resposta).
   Remover = apagar este arquivo e a linha <script> do index.html. */
(() => {
  const esc = CFO.esc, norm = CFO.norm, P = CFO.periodo;
  const N = v => (+v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Texto "limpo": sem acento, minúsculo, sem pontos (E.V.A. = eva) e sem símbolos
  const T = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, '').replace(/[^a-z0-9$ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const MES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MES3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const rotK = k => `${MES3[(k % 100) - 1] || '?'}/${Math.floor(k / 100)}`;
  const addM = (k, n) => { let y = Math.floor(k / 100), m = (k % 100) + n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y * 100 + m; };
  const JANELA = 3;                                                   // meses usados para média de consumo e previsão (mesmo critério do estoque mínimo automático)

  /* ---------- Palavras que NÃO fazem parte do nome de um item ---------- */
  const STOP = new Set(('o a os as um uma uns umas de do da dos das em no na nos nas por para pra pro com e ou que qual quais quanto quantos quantas onde esta estao ta fica ficam ha tem tenho temos me diga fala fale ' +
    'mostra mostrar mostre ver veja listar liste lista item itens produto produtos epi epis material materiais tamanho tam pelo pela voce vc preciso quero queria saber sobre ao aos meu minha nosso').split(' '));
  const KW = new Set(('local localizacao localizar prateleira corredor fileira andar palete estoque saldo critico criticos baixo baixos acabando acabar zerado zerados falta faltando repor reposicao minimo giro rotatividade ' +
    'saem sai saiu saida saidas gasto gastos gastou gastar custo custos custou valor previsao prever projecao proximo mes meses contrato contratos requisicao requisicoes movimentacao movimentacoes entrada entradas ' +
    'ultima ultimas ultimo ultimos resumo ajuda mais menos maior menor top ranking consumo consumido pedido pedidos hoje dele dela desse dessa esse essa isso dura durar durara quando quanto tempo guardado guardados ' +
    'disponivel disponiveis parado parados encalhado encalhados sem contagem contagens historico situacao geral reais total').split(' '));
  const MESES_T = new Set(MES);

  /* ---------- Leitura dos dados (a cada pergunta, para estar sempre atualizado) ---------- */
  const carrega = () => {
    const get = (k, d) => CFO.store.get(k, d);
    const rows = get('epi', []).filter(r => r && r.item), neg = get('req_negadas', {}), ret = get('req_retiradas', {});
    const todas = get('requisicoes', []).filter(r => r && Array.isArray(r.itens)), reqs = todas.filter(r => !neg[r.id]);
    const achar = CFO.casarEpi(rows), memo = new Map();
    const ach = nome => { if (!memo.has(nome)) memo.set(nome, achar(nome) || null); return memo.get(nome); };
    const linhas = [];                                                // uma linha por item aprovado de cada requisição (negadas ficam de fora)
    reqs.forEach(q => { const k = P.key(q.mes); if (!k) return; q.itens.forEach(i => {
      const qa = +i.qa || 0; if (qa <= 0) return; const r = ach(i.item), preco = +i.preco || 0;
      linhas.push({ k, q, rid: r ? r.id : null, item: r ? r.item : String(i.item), qa, preco, valor: qa * preco, contrato: String(q.contrato ?? '') }); }); });
    const ult = linhas.reduce((a, l) => Math.max(a, l.k), 0), K3 = ult ? Array.from({ length: JANELA }, (_, i) => addM(ult, -i)) : [];
    const med = new Map(), preco = new Map(), pk = new Map();         // média mensal de saída e último preço de cada item
    linhas.forEach(l => { if (!l.rid) return; if (K3.includes(l.k)) med.set(l.rid, (med.get(l.rid) || 0) + l.qa / JANELA); if (l.preco > 0 && l.k >= (pk.get(l.rid) || 0)) { pk.set(l.rid, l.k); preco.set(l.rid, l.preco); } });
    return { rows, byId: new Map(rows.map(r => [r.id, r])), neg, ret, todas, reqs, linhas, ult, K3, med, preco,
      mins: rows.length ? CFO.estoqueMin(rows) : new Map(), movs: get('epi:mov', []).filter(m => m && m.data), contratos: get('contratos', []),
      mapa: get('mapa', null), livre: get('mapalivre', null), contagens: get('contagens', []) };
  };
  const chave = l => l.rid || 'x:' + norm(l.item);
  const somaPor = (D, f) => { const m = new Map(); D.linhas.forEach(l => { if (!f(l)) return; const x = m.get(chave(l)) || { rid: l.rid, item: l.item, qa: 0, valor: 0 }; x.qa += l.qa; x.valor += l.valor; m.set(chave(l), x); }); return [...m.values()]; };
  const situacao = (D, r) => {
    const m = D.mins.get(r.id) || {}, min = m.min || 0, q = +r.qtd || 0, med = D.med.get(r.id) || 0;
    const tipo = q <= 0 && (min || med > 0) ? 'zerado' : min && q <= min ? 'baixo' : min ? 'ok' : 'sem';
    return { min, origem: m.origem, q, med, tipo, dias: med > 0 ? Math.round(q / med * 30) : null };
  };
  const ICO = { zerado: '⛔', baixo: '⚠️', ok: '✅', sem: '' };
  const duracao = d => d == null ? '' : d < 1 ? 'acaba já' : d < 60 ? `dura ~${d} dias` : `dura ~${N(d / 30)} meses`;

  /* ---------- Onde o item está (Mapa almoxarifado e Mapa livre) ---------- */
  const locais = (D, r) => {
    const out = [], m = D.mapa;
    if (m && Array.isArray(m.layout) && Array.isArray(m.locais)) {
      const L = m.layout.filter(x => !x.av), corr = id => { const i = L.findIndex(x => x.id === id); if (i < 0) return null; for (let d = 1; d < L.length; d++) for (const j of [i - d, i + d]) if (L[j] && L[j].t === 'c') return L[j]; return null; };
      m.locais.forEach(l => { if (l.rid !== r.id) return; const f = m.layout.find(x => x.id === l.f && x.t === 'f'); if (!f) return; const c = corr(f.id); out.push(`${c ? c.nome + ' · ' : ''}${f.nome} · Prateleira ${l.p} · Andar ${l.a}`); });
    }
    const lv = D.livre;
    if (lv && Array.isArray(lv.objs)) { const n = norm(r.item); lv.objs.forEach(o => { if (o.t !== 'w' && o.conteudo && norm(o.conteudo).includes(n)) {
      const ar = (lv.areas || []).find(a => o.x >= a.x && o.x < a.x + a.w && o.y >= a.y && o.y < a.y + a.h);
      out.push(`${o.t === 'p' ? 'Palete' : 'Prateleira'} “${o.nome || 'sem nome'}”${ar && ar.nome ? ' · ' + ar.nome : ''}`); } }); }
    return out;
  };

  /* ---------- Achar itens, contratos, requisições e períodos no texto ---------- */
  const acharItens = (D, texto) => {
    const toks = T(texto).replace(/contrato\s*(?:n|no|numero)?\s*\d+/g, ' ').replace(/\brq\s*\d+/g, ' ').replace(/requisicao\s*(?:n|no|numero)?\s*\d+/g, ' ').split(' ').filter(w => w && !STOP.has(w) && !KW.has(w) && !MESES_T.has(w) && !/^20\d\d$/.test(w) && !/^rq\d*$/.test(w));
    if (!toks.length || !D.rows.length) return { toks, hits: [], sug: [] };
    const alvos = toks.map(w => [w, w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : null]), todo = toks.join('');
    const pool = D.rows.map(r => ({ r, s: norm(r.item + ' ' + (r.codigo || '')) }));
    const ok = (s, [a, b]) => s.includes(a) || (b && s.includes(b));
    const rank = (a, b) => (norm(b.r.item) === todo) - (norm(a.r.item) === todo) || a.r.item.length - b.r.item.length;
    const hits = pool.filter(x => alvos.every(a => ok(x.s, a))).sort(rank).map(x => x.r);
    if (hits.length) return { toks, hits, sug: [] };
    const sc = pool.map(x => ({ r: x.r, n: alvos.filter(a => ok(x.s, a)).length })).filter(x => x.n >= (toks.length > 1 ? 2 : 1)).sort((a, b) => b.n - a.n);
    return { toks, hits: [], sug: sc.slice(0, 5).map(x => x.r) };
  };
  const acharContrato = (D, t) => {
    const m = t.match(/contrato\s*(?:n|no|numero)?\s*(\d+)/); if (m) return String(m[1]);
    const lista = [...D.todas.map(q => ({ num: String(q.contrato ?? ''), nome: q.contratoNome })), ...D.contratos.map(c => ({ num: String(c.num ?? ''), nome: c.nome }))], tt = norm(t);
    const c = lista.find(c => c.num && c.nome && norm(c.nome).length >= 4 && tt.includes(norm(c.nome))); return c ? c.num : null;
  };
  const nomeContrato = (D, num) => { const c = D.contratos.find(c => String(c.num) === num) || D.todas.find(q => String(q.contrato) === num && q.contratoNome); return c ? (c.nome || c.contratoNome || '') : ''; };
  const acharReq = (D, t) => { const m = t.match(/\brq\s*(\d+)/) || t.match(/requisicao\s*(?:n|no|numero)?\s*(\d+)/); if (!m) return null; return D.todas.find(r => (String(r.id).match(/\d+/) || [])[0] === m[1]) || { falta: m[1] }; };
  const periodo = (D, t) => {
    const now = new Date(), kNow = now.getFullYear() * 100 + now.getMonth() + 1;
    if (/mes passado/.test(t)) { const k = addM(kNow, -1); return { f: x => x === k, rot: rotK(k) }; }
    if (/(este|esse|neste|nesse) mes|mes atual|mes corrente/.test(t)) return { f: x => x === kNow, rot: rotK(kNow) };
    const m = MES.findIndex(n => new RegExp('\\b' + n + '\\b').test(t)) + 1, ym = t.match(/\b(20\d\d)\b/), y = ym ? +ym[1] : 0;
    if (m) { const uy = D.ult ? Math.floor(D.ult / 100) : now.getFullYear(), yy = y || (D.ult && m > D.ult % 100 ? uy - 1 : uy), k = yy * 100 + m; return { f: x => x === k, rot: rotK(k) }; }
    if (y) return { f: x => Math.floor(x / 100) === y, rot: String(y) };
    return null;
  };

  /* ---------- Intenções: a primeira que casar vence. Para ensinar algo novo, acrescente uma linha ---------- */
  const INTENCOES = [
    ['oi', /^(oi|ola|opa|eae|e ai|hey|bom dia|boa tarde|boa noite)\b/],
    ['ajuda', /\b(ajuda|help|comandos|o que (voce|vc) (faz|sabe)|como (te )?uso|como funciona)\b/],
    ['semlocal', /\b(sem (local|localizacao|lugar)|nao (tem|possui) (local|localizacao)|nao (esta )?(mapead|cadastrad)\w*)\b/],
    ['local', /\b(onde|local|localizacao|localizar|fica|ficam|guardad\w+|prateleira|corredor|fileira|andar|palete|achar|encontr\w+)\b/],
    ['parado', /\b(parad\w+|sem giro|sem saida|encalhad\w+|nao (sai|saiu|saem)|menos (sai|saem|giro|rotatividade|consumid\w+|pedid\w+)|menor (giro|rotatividade|consumo|saida))\b/],
    ['giro', /\b(giro|rotatividade|rotativ\w+|mais (sai|saem|saiu|consumid\w+|pedid\w+|usad\w+)|maior (giro|rotatividade|consumo|saida)|ranking|top)\b/],
    ['criticos', /\b(critic\w*|acabando|zerad\w*|em falta|faltando|falta|repor|reposicao|baixo|baixos|abaixo do minimo|estoque minimo|minimo|precisa comprar|comprar)\b/],
    ['previsao', /\b(previs\w+|prever|projecao|projetar|estimativa|estimar|vou gastar|vai gastar|vai custar|proximo mes|mes que vem|dura|durar|durara|quando (acaba|vai acabar|falta)|acabar)\b/],
    ['gasto', /\b(gast\w+|custo|custos|custou|valor|quanto (custa|foi)|reais|despesa)\b/],
    ['contrato', /\bcontratos?\b/],
    ['requisicao', /\b(requisic\w+|rq|aguardando|pendentes?|retirad\w+|negad\w+|pedidos?)\b/],
    ['mov', /\b(movimentac\w+|movimento|entradas?|saidas?|historico|lancamentos?)\b/],
    ['contagem', /\b(contagem|contagens|contei|inventario|divergenc\w+)\b/],
    ['resumo', /\b(resumo|painel|visao geral|geral|situacao|panorama|status)\b/],
    ['estoque', /\b(estoque|saldo|quanto (tem|tenho|temos|ha|sobrou|resta)|quantos|quantas|disponivel|disponiveis)\b/]
  ];
  const AREA = { local: 'mapa', semlocal: 'mapa', estoque: 'epi', ficha: 'epi', criticos: 'epi', giro: 'epi', parado: 'epi', gasto: 'controle_gastos', contrato: 'contratos', requisicao: 'requisicoes', mov: 'historico', contagem: 'contagem' };
  const PRECISA_ITEM = new Set(['local', 'estoque']);

  /* ---------- Montagem de respostas ---------- */
  const lis = (arr, max = 10) => arr.length ? `<ul>${arr.slice(0, max).map(x => `<li>${x}</li>`).join('')}</ul>${arr.length > max ? `<small>+ ${arr.length - max} não mostrados</small>` : ''}` : '';
  const bar = (v, max) => `<span class="as-bar"><i style="width:${max > 0 ? Math.max(3, Math.round(v / max * 100)) : 0}%"></i></span>`;
  const ch = (t, q) => ({ t, q });
  const sem = msg => ({ html: msg });
  const botaoMapa = nome => CFO.pode('abrir', 'mapa') ? `<button class="ghost as-go" data-mapa="${esc(nome)}">🗺️ Abrir no mapa</button>` : '';
  const semDados = D => !D.ult ? sem('Ainda não há requisições importadas com mês válido, então não consigo calcular isso. Importe as requisições e pergunte de novo.') : null;
  const filtroTxt = (cn, nm) => (cn ? ` · contrato ${esc(cn)}${nm ? ' - ' + esc(nm) : ''}` : '');

  const H = {};
  H.oi = () => ({ html: 'Olá! Pergunto aos dados do sistema, sem inteligência artificial. Posso dizer onde está um item, o que está crítico, o que mais sai, previsão de gastos e mais.', chips: [ch('Itens críticos', 'o que está crítico?'), ch('Maior giro', 'quais itens mais saem?'), ch('Previsão de gastos', 'previsão de gastos'), ch('Resumo', 'resumo')] });
  H.ajuda = () => ({ html: `Exemplos do que eu entendo:<ul><li><b>Onde fica</b> a luva nitrílica?</li><li><b>Quanto tem</b> de bota PVC (42)?</li><li>O que está <b>crítico</b> / abaixo do mínimo?</li><li>Quais itens <b>mais saem</b>? E os <b>parados</b>?</li><li><b>Previsão de gastos</b> do próximo mês (ou do contrato 123)</li><li><b>Quanto dura</b> o estoque de capacete?</li><li><b>Gasto</b> de outubro por contrato</li><li>Requisições <b>aguardando retirada</b> · requisição RQ-3370</li><li>Últimas <b>saídas</b> · última <b>contagem</b> · itens <b>sem local</b> no mapa</li></ul><small>Dica: escreva o nome do item como na Planilha EPI. Posso responder só com o que está cadastrado.</small>` });

  // Ficha de itens (modo: local | estoque | ficha)
  H.itens = (D, hits, modo, t) => {
    const veMapa = CFO.pode('abrir', 'mapa');
    const linhaItem = r => { const s = situacao(D, r), ls = locais(D, r);
      return `<b>${esc(r.item)}</b>${r.codigo ? ` <small>cód. ${esc(r.codigo)}</small>` : ''}`
        + (modo !== 'local' ? `<br>Estoque: <b>${N(r.qtd)}</b>${s.min ? ` · mínimo ${N(s.min)}${s.origem === 'auto' ? ' (auto)' : ''}` : ''} ${ICO[s.tipo]}` : '')
        + (modo !== 'estoque' && veMapa ? `<br>📍 ${ls.length ? ls.map(esc).join('<br>📍 ') : '<i>sem local definido no mapa</i>'}` : '')
        + (modo === 'ficha' && s.med > 0 ? `<br>Sai ~${N(s.med)}/mês · ${duracao(s.dias)}` : ''); };
    if (hits.length === 1) {
      const r = hits[0], pre = D.preco.get(r.id), pode$ = CFO.pode('abrir', 'controle_gastos');
      return { html: linhaItem(r) + (modo === 'ficha' && pode$ && pre && D.med.get(r.id) ? `<br>Gasto previsto no mês: ${R$(D.med.get(r.id) * pre)}` : ''), ctx: r,
        html2: botaoMapa(r.item), chips: [ch('Quanto dura?', 'quanto dura o estoque de ' + r.item), ch('Previsão de gasto', 'previsão de gasto de ' + r.item), ch('Últimas saídas', 'últimas movimentações de ' + r.item)] };
    }
    const tot = hits.reduce((a, r) => a + (+r.qtd || 0), 0);
    return { html: `Achei <b>${hits.length}</b> itens${modo !== 'local' ? ` (estoque somado: <b>${N(tot)}</b>)` : ''}:` + lis(hits.map(linhaItem), 8) + '<small>Escreva o tamanho ou o nome completo para ver só um.</small>', ctx: hits[0] };
  };

  H.criticos = D => {
    if (!D.rows.length) return sem('A Planilha EPI está vazia.');
    const L = D.rows.map(r => ({ r, s: situacao(D, r) }));
    const z = L.filter(x => x.s.tipo === 'zerado'), b = L.filter(x => x.s.tipo === 'baixo').sort((x, y) => x.s.q / x.s.min - y.s.q / y.s.min);
    const acaba = L.filter(x => x.s.med > 0 && x.s.q > 0 && x.s.dias < 30 && x.s.tipo !== 'baixo');
    const li = x => `<b>${esc(x.r.item)}</b> · ${N(x.s.q)} un${x.s.min ? ` / mín. ${N(x.s.min)}` : ''}${x.s.med > 0 ? ` · sai ~${N(x.s.med)}/mês` : ''}${x.s.med > 0 ? ` · para 2 meses: +${N(Math.max(0, Math.ceil(x.s.med * 2 - x.s.q)))}` : ''}`;
    if (!z.length && !b.length && !acaba.length) return sem('✅ Nenhum item crítico agora: nada zerado, abaixo do mínimo nem acabando em menos de 30 dias.' + (D.ult ? '' : '<br><small>Sem requisições importadas o sistema não calcula o mínimo automático.</small>'));
    return { html: `<b>${z.length + b.length + acaba.length}</b> item(ns) pedem atenção.` + (z.length ? `<div class="as-t">⛔ Zerados (${z.length})</div>${lis(z.map(li), 8)}` : '') + (b.length ? `<div class="as-t">⚠️ Abaixo do mínimo (${b.length})</div>${lis(b.map(li), 8)}` : '') + (acaba.length ? `<div class="as-t">⏳ Acabam em menos de 30 dias (${acaba.length})</div>${lis(acaba.map(li), 6)}` : '')
      + `<small>Mínimo: o manual da Planilha EPI ou, se não houver, o automático pelas saídas. “Para 2 meses” = quanto falta para cobrir 2 meses no ritmo atual.</small>`, chips: [ch('Itens parados', 'itens parados'), ch('Maior giro', 'quais itens mais saem?')] };
  };

  H.giro = (D, t) => {
    const sd = semDados(D); if (sd) return sd; const pe = periodo(D, t), f = pe ? pe.f : (k => D.K3.includes(k)), rot = pe ? pe.rot : `${rotK(D.K3[JANELA - 1])} a ${rotK(D.ult)}`;
    const top = somaPor(D, l => f(l.k)).sort((a, b) => b.qa - a.qa), max = top[0] ? top[0].qa : 0;
    if (!top.length) return sem(`Não há saídas em ${esc(rot)}.`);
    return { html: `<b>Maior saída</b> · ${esc(rot)}${lis(top.slice(0, 10).map(x => `${esc(x.item)} · <b>${N(x.qa)}</b> un${CFO.pode('abrir', 'controle_gastos') ? ' · ' + R$(x.valor) : ''}<br>${bar(x.qa, max)}`), 10)}<small>Base: itens aprovados nas requisições (negadas não contam).</small>`, chips: [ch('Itens parados', 'itens parados'), ch('Itens críticos', 'o que está crítico?')] };
  };
  H.parado = D => {
    const sd = semDados(D); if (sd) return sd;
    const L = D.rows.filter(r => (+r.qtd || 0) > 0 && !D.med.get(r.id)).sort((a, b) => b.qtd - a.qtd);
    if (!L.length) return sem('Todos os itens com estoque tiveram saída nos últimos 3 meses.');
    return { html: `<b>${L.length}</b> item(ns) com estoque e <b>nenhuma saída</b> em ${rotK(D.K3[JANELA - 1])} a ${rotK(D.ult)}:${lis(L.map(r => `${esc(r.item)} · ${N(r.qtd)} un`), 12)}`, chips: [ch('Maior giro', 'quais itens mais saem?')] };
  };

  H.previsao = (D, t, hits, cn) => {
    const sd = semDados(D); if (sd) return sd; const pode$ = CFO.pode('abrir', 'controle_gastos');
    if (hits.length > 3) {                                          // muitos tamanhos do mesmo produto: soma tudo
      const q = hits.reduce((a, r) => a + (+r.qtd || 0), 0), med = hits.reduce((a, r) => a + (D.med.get(r.id) || 0), 0), v = hits.reduce((a, r) => a + (D.med.get(r.id) || 0) * (D.preco.get(r.id) || 0), 0), dias = med > 0 ? Math.round(q / med * 30) : null;
      return { ctx: hits[0], html: `<b>${hits.length} itens parecidos com “${esc(CFO.baseEpi(hits[0].item))}”</b> (todos os tamanhos somados)<br>Estoque: ${N(q)} un · saída média ${N(med)}/mês` + (med > 0 ? `<br>Próximo mês: <b>~${N(Math.ceil(med))} un</b>${pode$ && v ? ` · ${R$(v)}` : ''}<br>Estoque ${duracao(dias)}` : '<br>Sem saídas nesse período.') + '<br><small>Escreva o tamanho para ver só um. Estimativa pela média dos últimos 3 meses.</small>' };
    }
    if (hits.length && hits.length <= 3) {
      return { ctx: hits[0], html: hits.map(r => { const s = situacao(D, r), pre = D.preco.get(r.id) || 0, fim = s.dias != null && s.q > 0 ? new Date(Date.now() + s.dias * 864e5).toLocaleDateString('pt-BR') : '';
        return `<b>${esc(r.item)}</b><br>Estoque: ${N(s.q)} un · saída média ${N(s.med)}/mês (${rotK(D.K3[JANELA - 1])} a ${rotK(D.ult)})`
          + (s.med > 0 ? `<br>Previsão do próximo mês: <b>~${N(Math.ceil(s.med))} un</b>${pode$ && pre ? ` · ${R$(s.med * pre)}` : ''}<br>${s.q > 0 ? `Estoque ${duracao(s.dias)}${fim ? ` (por volta de ${fim})` : ''}` : '⛔ Estoque zerado'}` : '<br>Sem saídas nesse período: não dá para prever.'); }).join('<hr>') + '<br><small>Estimativa pela média dos últimos 3 meses, sem inteligência artificial.</small>' };
    }
    if (!pode$) return sem('Seu perfil não tem acesso a valores em reais. Posso prever a quantidade de um item específico: pergunte “quanto dura o estoque de …”.');
    const ks = Array.from({ length: 6 }, (_, i) => addM(D.ult, -5 + i)), flt = l => !cn || l.contrato === cn;
    const mensal = f => ks.map(k => D.linhas.filter(l => l.k === k && f(l)).reduce((a, l) => a + l.valor, 0));
    const prev = v => { const [a, b, c] = [v[5], v[4], v[3]]; return { p: (3 * a + 2 * b + c) / 6, lo: Math.min(a, b, c), hi: Math.max(a, b, c), media: (a + b + c) / 3 }; };
    const v = mensal(flt), p = prev(v), tend = p.media ? (v[5] - p.media) / p.media * 100 : 0, max = Math.max(...v, 1);
    const porC = new Map(); D.linhas.forEach(l => { if (D.K3.includes(l.k) && flt(l)) porC.set(l.contrato, (porC.get(l.contrato) || 0) + l.valor / JANELA); });
    const peso = somaPor(D, l => D.K3.includes(l.k) && flt(l)).map(x => ({ r: { item: x.item }, v: x.valor / JANELA })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
    return { html: `<b>Previsão de gasto em EPIs${filtroTxt(cn, nomeContrato(D, cn))}</b><br>Próximo mês: <b>~${R$(p.p)}</b><br><small>faixa provável ${R$(p.lo)} a ${R$(p.hi)} · ${tend >= 0 ? '▲' : '▼'} ${N(Math.abs(tend))}% do último mês vs. média</small>`
      + `<div class="as-t">Histórico</div>${lis(ks.map((k, i) => `${rotK(k)} · ${R$(v[i])}<br>${bar(v[i], max)}`), 6)}`
      + (!cn && porC.size ? `<div class="as-t">Por contrato (média mensal)</div>${lis([...porC].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, x]) => `${esc(c)}${nomeContrato(D, c) ? ' - ' + esc(nomeContrato(D, c)) : ''} · ${R$(x)}`), 5)}` : '')
      + (peso.length ? `<div class="as-t">Itens que mais pesam</div>${lis(peso.map(x => `${esc(x.r.item)} · ${R$(x.v)}/mês`), 5)}` : '')
      + `<small>Estimativa: média ponderada dos 3 últimos meses (o mais recente pesa mais). Não considera mudança de preço nem obras novas.</small>`, chips: [ch('Gasto do mês', 'gasto do último mês'), ch('Itens críticos', 'o que está crítico?')] };
  };

  H.gasto = (D, t, hits, cn) => {
    const sd = semDados(D); if (sd) return sd; const pe = periodo(D, t), f = pe ? pe.f : (k => k === D.ult), rot = pe ? pe.rot : rotK(D.ult) + ' (último mês com requisições)';
    const flt = l => f(l.k) && (!cn || l.contrato === cn) && (!hits.length || hits.some(r => r.id === l.rid)), L = D.linhas.filter(flt);
    const tot = L.reduce((a, l) => a + l.valor, 0), un = L.reduce((a, l) => a + l.qa, 0), nreq = new Set(L.map(l => l.q.id)).size;
    const prevK = pe ? null : addM(D.ult, -1), ant = prevK ? D.linhas.filter(l => l.k === prevK && (!cn || l.contrato === cn) && (!hits.length || hits.some(r => r.id === l.rid))).reduce((a, l) => a + l.valor, 0) : 0;
    if (!L.length) return sem(`Não achei gasto em ${esc(rot)}${filtroTxt(cn, '')}${hits.length ? ' para esse item' : ''}.`);
    const agr = (kf, nf) => { const m = new Map(); L.forEach(l => { const k = kf(l); m.set(k, (m.get(k) || 0) + l.valor); }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${nf(k)} · ${R$(v)}`); };
    return { ctx: hits[0], html: `<b>Gasto em EPIs · ${esc(rot)}${filtroTxt(cn, nomeContrato(D, cn))}</b>${hits.length === 1 ? `<br>${esc(hits[0].item)}` : ''}<br><b style="font-size:1.15em">${R$(tot)}</b><br><small>${nreq} requisição(ões) · ${N(un)} unidades${ant ? ` · mês anterior ${R$(ant)} (${tot >= ant ? '▲' : '▼'} ${N(Math.abs((tot - ant) / ant * 100))}%)` : ''}</small>`
      + (!cn ? `<div class="as-t">Por contrato</div>${lis(agr(l => l.contrato, c => esc(c) + (nomeContrato(D, c) ? ' - ' + esc(nomeContrato(D, c)) : '')), 5)}` : '')
      + (!hits.length ? `<div class="as-t">Itens mais caros</div>${lis(agr(l => l.item, esc), 5)}` : ''), chips: [ch('Previsão de gastos', 'previsão de gastos' + (cn ? ' do contrato ' + cn : '')), ch('Maior giro', 'quais itens mais saem?')] };
  };

  H.contrato = (D, t, hits, cn) => {
    if (!cn) { if (!D.contratos.length) return sem('Não há contratos cadastrados. Diga o número, por exemplo: “contrato 123”.'); const at = D.contratos.filter(c => c.status === 'Ativo');
      return { html: `<b>${D.contratos.length}</b> contratos cadastrados (${at.length} ativos).<br>Pergunte por um: “gasto do contrato 123”.${lis((at.length ? at : D.contratos).slice(0, 8).map(c => `${esc(c.num)} - ${esc(c.nome)}${c.fim ? ` · termina ${esc(c.fim)}` : ''}`), 8)}` }; }
    const c = D.contratos.find(x => String(x.num) === cn), L = D.linhas.filter(l => l.contrato === cn), nreq = new Set(L.map(l => l.q.id)).size, tot = L.reduce((a, l) => a + l.valor, 0), top = somaPor(D, l => l.contrato === cn).sort((a, b) => b.qa - a.qa).slice(0, 5);
    return { html: `<b>Contrato ${esc(cn)}${nomeContrato(D, cn) ? ' - ' + esc(nomeContrato(D, cn)) : ''}</b>` + (c ? `<br>${esc(c.status || '')}${c.ini ? ` · ${esc(c.ini)}` : ''}${c.fim ? ` a ${esc(c.fim)}` : ''}${c.valor ? ` · valor ${R$(c.valor)}` : ''}` : '<br><small>Não está na planilha de contratos.</small>')
      + (L.length ? `<br>${nreq} requisição(ões) · ${N(L.reduce((a, l) => a + l.qa, 0))} un${CFO.pode('abrir', 'controle_gastos') ? ` · gasto total ${R$(tot)}` : ''}<div class="as-t">Mais pedidos</div>${lis(top.map(x => `${esc(x.item)} · ${N(x.qa)} un`), 5)}` : '<br>Nenhuma requisição aprovada para este contrato.'),
      chips: CFO.pode('abrir', 'controle_gastos') ? [ch('Previsão de gastos', 'previsão de gastos do contrato ' + cn), ch('Gasto do mês', 'gasto do contrato ' + cn)] : [] };
  };

  H.requisicao = (D, t, req) => {
    const st = r => D.neg[r.id] ? '🚫 negada' : D.ret[r.id] ? '✅ retirada' : '⏳ aguardando retirada';
    if (req) { if (req.falta) return sem(`Não encontrei a requisição ${esc(req.falta)}.`); const q = req, itens = q.itens.filter(i => +i.qa > 0), tot = itens.reduce((a, i) => a + i.qa * i.preco, 0);
      return { html: `<b>${esc(q.id)}</b> · ${st(q)}<br>Contrato ${esc(q.contrato)}${q.contratoNome ? ' - ' + esc(q.contratoNome) : ''}<br>${esc(q.sol || '')} · ${esc(q.mes || '')}${q.motivo ? ` · ${esc(q.motivo)}` : ''}${lis(itens.map(i => `${esc(i.item)}${i.tam ? ' (' + esc(i.tam) + ')' : ''} · ${N(i.qa)} un`), 12)}${CFO.pode('abrir', 'controle_gastos') ? `Total ${R$(tot)}` : ''}` }; }
    const num = (a, b) => String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }), ordem = (a, b) => P.key(b.mes) - P.key(a.mes) || num(a, b);
    const li = q => `<b>${esc(q.id)}</b> · ${esc(q.sol || '')} · contrato ${esc(q.contrato)} · ${esc(q.mes || '')}`;
    if (/negad/.test(t)) { const L = D.todas.filter(r => D.neg[r.id]).sort(ordem); return sem(L.length ? `<b>${L.length}</b> requisição(ões) negada(s):${lis(L.map(li), 8)}` : 'Nenhuma requisição negada.'); }
    if (/aguardando|pendente|retirar|separar|nao retirad/.test(t) || /retirad/.test(t)) { const L = D.todas.filter(r => !D.neg[r.id] && !D.ret[r.id] && r.itens.some(i => +i.qa > 0)).sort(ordem);
      return sem(L.length ? `<b>${L.length}</b> requisição(ões) aprovada(s) <b>aguardando retirada</b>:${lis(L.map(li), 10)}` : 'Nenhuma requisição aguardando retirada.'); }
    const L = D.todas.slice().sort(ordem); return sem(L.length ? `Últimas requisições:${lis(L.map(q => `${li(q)} · ${st(q)}`), 6)}<small>Diga o número para ver os itens: “requisição RQ-123”.</small>` : 'Não há requisições importadas.');
  };

  H.mov = (D, t, hits) => {
    const ids = new Set(hits.map(r => norm(r.item))), L = D.movs.filter(m => !hits.length || ids.has(norm(m.item))).sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 8);
    if (!L.length) return sem('Nenhuma movimentação registrada' + (hits.length ? ' para esse item.' : '.'));
    const dt = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); };
    return { html: `<b>Últimas movimentações</b>${lis(L.map(m => `${dt(m.data)} · ${{ 'Entrada': '🟢 entrou', 'Saída': '🔴 saiu', 'Contagem': '🟡 contagem' }[m.tipo] || esc(m.tipo)} ${N(m.qtd)} · ${esc(m.item)}${m.resp ? ` <small>(${esc(m.resp)})</small>` : ''}`), 8)}` };
  };
  H.contagem = D => {
    const L = D.contagens.slice().sort((a, b) => String(b.ts || b.dia).localeCompare(String(a.ts || a.dia))), c = L[0];
    if (!c) return sem('Ainda não há contagem de estoque salva.');
    const itens = c.itens || [], dif = itens.filter(x => x.sis !== undefined && x.sis !== x.qtd).sort((a, b) => Math.abs(b.qtd - b.sis) - Math.abs(a.qtd - a.sis));
    return { html: `<b>Última contagem: ${esc(String(c.dia || '').split('-').reverse().join('/'))}</b><br>${itens.length} item(ns) contados · <b>${dif.length}</b> com diferença${lis(dif.map(x => `${esc(x.item)} · sistema ${N(x.sis)} → contado ${N(x.qtd)} (${x.qtd - x.sis > 0 ? '+' : ''}${N(x.qtd - x.sis)})`), 6)}<small>${L.length} contagem(ns) no histórico.</small>` };
  };
  H.semlocal = D => {
    if (!D.mapa && !D.livre) return sem('O mapa ainda não foi configurado, então nenhum item tem local.');
    const L = D.rows.filter(r => !locais(D, r).length);
    return { html: L.length ? `<b>${L.length}</b> de ${D.rows.length} itens estão <b>sem local</b> no mapa:${lis(L.map(r => esc(r.item)), 12)}<small>No Mapa almoxarifado, use “Itens sem local” para definir.</small>` : '✅ Todos os itens têm local no mapa.' };
  };
  H.resumo = D => {
    const L = D.rows.map(r => situacao(D, r)), z = L.filter(s => s.tipo === 'zerado').length, b = L.filter(s => s.tipo === 'baixo').length, ag = D.todas.filter(r => !D.neg[r.id] && !D.ret[r.id] && r.itens.some(i => +i.qa > 0)).length;
    const top = D.ult ? somaPor(D, l => D.K3.includes(l.k)).sort((a, b) => b.qa - a.qa)[0] : null, g = D.ult && CFO.pode('abrir', 'controle_gastos') ? D.linhas.filter(l => l.k === D.ult).reduce((a, l) => a + l.valor, 0) : null;
    return { html: `<b>Resumo</b>${lis([`📦 ${D.rows.length} itens cadastrados`, `⛔ ${z} zerado(s) · ⚠️ ${b} abaixo do mínimo`, `⏳ ${ag} requisição(ões) aguardando retirada`, top ? `🔥 Mais sai: ${esc(top.item)} (${N(top.qa)} un em 3 meses)` : '', g != null ? `💰 Gasto em ${rotK(D.ult)}: ${R$(g)}` : ''].filter(Boolean), 6)}`, chips: [ch('Itens críticos', 'o que está crítico?'), ch('Previsão de gastos', 'previsão de gastos'), ch('A retirar', 'requisições aguardando retirada')] };
  };

  /* ---------- Cérebro: texto -> resposta ---------- */
  const estado = { item: null, pend: null };
  const responder = texto => {
    const t = T(texto); if (!t) return sem('Escreva sua pergunta.');
    const D = carrega(), req = acharReq(D, t), cn = acharContrato(D, t), { hits, sug, toks } = acharItens(D, texto);
    let id = req ? 'requisicao' : null; if (!id) for (const [k, re] of INTENCOES) if (re.test(t)) { id = k; break; }
    const pron = /\b(dele|dela|desse|dessa|esse|essa|ele|ela)\b/.test(t) && estado.item;
    let alvo = hits.length ? hits : (pron ? [estado.item] : []);
    if (!id && estado.pend && hits.length) id = estado.pend;
    if (!id) id = hits.length ? 'ficha' : (toks.length ? 'naoachei' : 'ajuda');
    estado.pend = null;
    if (id === 'naoachei' || (!hits.length && toks.length && (PRECISA_ITEM.has(id) || id === 'ficha'))) {
      const s = sug.length ? `<br>Você quis dizer:${lis(sug.map(r => `<a href="#" class="as-q" data-q="${esc(r.item)}">${esc(r.item)}</a>`), 5)}` : '';
      return sem(`Não encontrei “${esc(toks.join(' '))}” na Planilha EPI.${s}`);
    }
    if (PRECISA_ITEM.has(id) && !alvo.length) { estado.pend = id; return sem(id === 'local' ? 'De qual item? Escreva o nome (ou parte dele).' : 'Estoque de qual item? Escreva o nome (ou parte dele).'); }
    if (AREA[id] && !CFO.pode('abrir', AREA[id])) return sem('Seu perfil não tem acesso a essa informação.');
    let r;
    if (id === 'local' || id === 'estoque' || id === 'ficha') r = H.itens(D, alvo, id, t);
    else if (id === 'previsao' || id === 'gasto') r = H[id](D, t, hits.length ? hits : (pron ? [estado.item] : []), cn);
    else if (id === 'contrato') r = H.contrato(D, t, hits, cn);
    else if (id === 'requisicao') r = H.requisicao(D, t, req);
    else if (id === 'mov') r = H.mov(D, t, hits.length ? hits : (pron ? [estado.item] : []));
    else r = (H[id] || H.ajuda)(D, t);
    if (r.ctx) estado.item = r.ctx;
    if (r.html2) r.html += '<div class="as-row">' + r.html2 + '</div>';
    return r;
  };
  CFO.assistente = { responder, carrega, T };

  /* ---------- Tela: botão flutuante + painel de conversa ---------- */
  if (typeof document === 'undefined' || !document.body) return;
  const css = document.createElement('style');
  css.textContent = `
  .as-fab{position:fixed;right:18px;bottom:calc(var(--tab-h,0px) + 18px + env(safe-area-inset-bottom,0px));z-index:40;width:56px;height:56px;border-radius:50%;padding:0;display:grid;place-items:center;box-shadow:var(--shadow)}
  .as-fab svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .as-pan{position:fixed;right:18px;bottom:calc(var(--tab-h,0px) + 86px + env(safe-area-inset-bottom,0px));z-index:41;width:min(410px,calc(100vw - 24px));height:min(580px,calc(100vh - var(--tab-h,0px) - var(--bar-h,0px) - 110px));display:flex;flex-direction:column;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
  .as-pan[hidden],.as-fab[hidden]{display:none!important}
  .as-h{display:flex;align-items:center;gap:.5rem;padding:.65rem .8rem;border-bottom:1px solid var(--line)}.as-h b{flex:1;font-size:1rem}
  .as-h button{padding:.25rem .55rem;font-size:.85rem}
  .as-ms{flex:1;overflow:auto;padding:.7rem;display:flex;flex-direction:column;gap:.55rem}
  .as-m{max-width:92%;padding:.55rem .75rem;border-radius:14px;line-height:1.45;font-size:.92rem;overflow-wrap:anywhere}
  .as-m.eu{align-self:flex-end;background:var(--accent);color:var(--on-accent);border-bottom-right-radius:4px}
  .as-m.bot{align-self:flex-start;background:var(--panel2);border-bottom-left-radius:4px}
  .as-m ul{margin:.35rem 0;padding-left:1.1rem}.as-m li{margin:.25rem 0}.as-m small{color:var(--muted);display:block;margin-top:.3rem}.as-m hr{border:0;border-top:1px solid var(--line);margin:.5rem 0}
  .as-m a{color:var(--accent)}.as-t{font-weight:700;margin:.55rem 0 .1rem}
  .as-bar{display:block;height:6px;border-radius:3px;background:var(--line);margin-top:.15rem}.as-bar i{display:block;height:100%;border-radius:3px;background:var(--accent)}
  .as-row,.as-ch{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.5rem}
  .as-pan .as-go,.as-pan .as-ch button{padding:.3rem .6rem;font-size:.82rem;border-radius:999px}
  .as-ch{padding:0 .7rem .5rem;margin:0}
  .as-f{display:flex;gap:.5rem;padding:.6rem;border-top:1px solid var(--line)}.as-f input{flex:1;min-width:0}.as-f button{flex:none}
  @media (max-width:700px){.as-pan{right:12px;left:12px;width:auto}}
  @media print{.as-fab,.as-pan{display:none!important}}`;
  document.head.append(css);

  const fab = document.createElement('button'); fab.className = 'as-fab'; fab.hidden = true; fab.setAttribute('aria-label', 'Assistente'); fab.title = 'Assistente';
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10h7M8.5 13h4"/></svg>';
  const pan = document.createElement('section'); pan.className = 'as-pan'; pan.hidden = true; pan.setAttribute('aria-label', 'Assistente');
  pan.innerHTML = `<div class="as-h"><b>🤖 Assistente</b><button class="ghost" data-a="limpar" title="Limpar conversa">Limpar</button><button class="ghost" data-a="fechar" aria-label="Fechar">✕</button></div>
    <div class="as-ms" aria-live="polite"></div><div class="as-ch"></div>
    <form class="as-f"><input type="text" placeholder="Pergunte algo…" autocomplete="off" aria-label="Sua pergunta"><button type="submit">Enviar</button></form>`;
  document.body.append(fab, pan);
  const ms = pan.querySelector('.as-ms'), chips = pan.querySelector('.as-ch'), inp = pan.querySelector('input');

  const bolha = (cls, html) => { const d = document.createElement('div'); d.className = 'as-m ' + cls; d.innerHTML = html; ms.append(d); ms.scrollTop = ms.scrollHeight; return d; };
  const mostraChips = L => { chips.innerHTML = (L || []).map(c => `<button class="ghost" data-q="${esc(c.q)}">${esc(c.t)}</button>`).join(''); };
  const inicio = () => { ms.innerHTML = ''; estado.item = estado.pend = null; const r = H.oi(); bolha('bot', r.html); mostraChips(r.chips); };
  const enviar = txt => {
    txt = String(txt || '').trim(); if (!txt) return; bolha('eu', esc(txt)); inp.value = '';
    let r; try { r = responder(txt); } catch (e) { console.warn('assistente', e); r = sem('Tive um problema ao ler os dados. Tente de novo ou reformule a pergunta.'); }
    bolha('bot', r.html); mostraChips(r.chips);
  };
  const abrirMapa = nome => {
    try { const d = DRAWERS.find(x => x.subs.some(s => s.m === 'mapa')), s = d && d.subs.find(x => x.m === 'mapa'); if (!s) return; pan.hidden = true; ir(d, s);
      const q = document.querySelector('#screens .screen:last-child #mq'); if (q) { q.value = nome; q.dispatchEvent(new Event('input', { bubbles: true })); } } catch (e) { console.warn('assistente: abrir mapa', e); }
  };
  fab.onclick = () => { pan.hidden = !pan.hidden; if (!pan.hidden) { if (!ms.children.length) inicio(); setTimeout(() => inp.focus(), 50); } };
  pan.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'), q = e.target.closest('[data-q]'), m = e.target.closest('[data-mapa]');
    if (a) { if (a.dataset.a === 'fechar') pan.hidden = true; else inicio(); }
    else if (q) { e.preventDefault(); enviar(q.dataset.q); } else if (m) abrirMapa(m.dataset.mapa);
  });
  pan.querySelector('form').onsubmit = e => { e.preventDefault(); enviar(inp.value); };
  pan.addEventListener('keydown', e => { if (e.key === 'Escape') { pan.hidden = true; fab.focus(); } });

  // Aparece só com alguém logado e some nas telas de mapa (Mapa almoxarifado e Mapa livre), para não atrapalhar
  const noMapa = () => [...document.querySelectorAll('#screens .screen')].some(s => /^mapa/i.test(s.dataset.title || '') || s.querySelector('#mq, #ml-q'));
  const atualiza = () => {
    let ver = false; try { ver = !!CFO.usuario() && CFO.pode('abrir', 'assistente') && !noMapa(); } catch { ver = false; }
    fab.hidden = !ver; if (!ver) pan.hidden = true;
  };
  const alvoTelas = document.getElementById('screens'); if (alvoTelas) new MutationObserver(atualiza).observe(alvoTelas, { childList: true });
  window.addEventListener('cfo-user', () => { inicio(); atualiza(); });
  atualiza(); setTimeout(atualiza, 600);
})();
