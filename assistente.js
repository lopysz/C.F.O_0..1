/* ===== Assistente (botão flutuante) =====
   Chat SEM inteligência artificial: lê as palavras da pergunta, descobre o que a pessoa quer (onde está um item, estoque crítico,
   giro, previsão de gastos, requisições, contratos...) e responde só com os dados que o sistema já tem: Planilha EPI, Requisições,
   Mapa, Contratos, Movimentações e Contagens. Respeita as permissões do perfil. O botão some sozinho nas telas de mapa.
   Para ensinar uma pergunta nova: acrescente uma linha em INTENCOES (palavras) e uma função em H (resposta).
   Cérebro (v2): corrige erro de digitação em palavras de comando (nunca em números/códigos), lembra o assunto por 10 min
   ("e o mês passado?", "quanto dura dele?", "e do contrato 125?"), pergunta o que falta (item/contrato), confirma quando a frase é vaga,
   mostra a fonte dos dados em cada resposta e guarda (só neste aparelho, sem números) as frases que não entendeu.
   IA (Gemini, opcional): só entra quando as regras NÃO entendem a frase. A IA apenas REESCREVE a pergunta num modelo que as regras entendem; quem consulta
   e calcula é este arquivo (a IA não vê quantidades, preços nem requisições). Passa por uma Edge Function do Supabase (assistente-ia) que guarda a chave.
   Se a função não existir/falhar, tudo continua como antes. Desligar: CFO_SUPABASE.assistenteIA = false em supabase-config.js.
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
    'mostra mostrar mostre ver veja listar liste lista item itens produto produtos epi epis material materiais tamanho tam pelo pela voce vc preciso quero queria saber sobre ao aos meu minha nosso mesmo mesma').split(' '));
  const KW = new Set(('local localizacao localizar prateleira corredor fileira andar palete estoque saldo critico criticos baixo baixos acabando acabar zerado zerados falta faltando repor reposicao minimo giro rotatividade ' +
    'saem sai saiu saida saidas gasto gastos gastou gastar custo custos custou valor previsao prever projecao proximo mes meses contrato contratos requisicao requisicoes movimentacao movimentacoes entrada entradas ' +
    'ultima ultimas ultimo ultimos resumo ajuda mais menos maior menor top ranking consumo consumido pedido pedidos hoje dele dela desse dessa esse essa isso dura durar durara quando quanto tempo guardado guardados ' +
    'disponivel disponiveis parado parados encalhado encalhados sem contagem contagens historico situacao geral reais total').split(' '));
  const MESES_T = new Set(MES);
  ['passado', 'anterior', 'atual', 'corrente', 'acumulado', 'ano', 'inteiro', 'entrou', 'chegou', 'deu', 'deram', 'lugar', 'posicao', 'endereco', 'cade', 'aonde', 'unidades', 'restam', 'sobrando',
   'vence', 'vencem', 'vencendo', 'vencimento', 'vencimentos', 'venceu', 'termina', 'prazo', 'despesas', 'orcamento', 'duracao', 'faco', 'fazer', 'registro', 'registrar'].forEach(w => KW.add(w));

  /* ---------- Tolerância a erro de digitação: só palavras de comando são corrigidas sozinhas; nome de item vira sugestão; número/código nunca muda ---------- */
  const VOCI = ['estoque', 'critico', 'criticos', 'previsao', 'contrato', 'contratos', 'requisicao', 'requisicoes', 'movimentacao', 'movimentacoes', 'historico', 'resumo', 'giro', 'parado', 'parados',
    'localizacao', 'localizar', 'saldo', 'prateleira', 'corredor', 'gasto', 'gastos', 'gastou', 'entradas', 'saidas', 'contagem', 'acabando', 'zerado', 'zerados', 'reposicao', 'rotatividade', 'disponivel', 'vencimento', 'quantos', 'quantas'];
  const lev = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let p = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) { const c = [i]; let min = i; for (let j = 1; j <= b.length; j++) { c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (c[j] < min) min = c[j]; } if (min > max) return max + 1; p = c; }
    return p[b.length];
  };
  const tolCmd = (w, v) => w.length >= 8 ? 2 : w.length >= 6 ? (w[0] === v[0] ? 2 : 1) : w.length >= 5 ? 1 : 0;      // erros aceitos por tamanho da palavra (2 em palavra média só se a 1ª letra bate)
  const vocab = D => { const v = new Set(); D.rows.forEach(r => T(r.item).split(' ').forEach(w => w.length >= 3 && v.add(w))); return v; };
  // Abreviações que o pessoal usa no dia a dia (acrescente as que aparecerem no log de frases não entendidas)
  const ABREV = { qto: 'quanto', qtos: 'quantos', qtas: 'quantas', qtd: 'quantos', qts: 'quantas', req: 'requisicao', reqs: 'requisicoes', requi: 'requisicao', estq: 'estoque', est: 'estoque', hist: 'historico', mov: 'movimentacao', prev: 'previsao', ctr: 'contrato', vlr: 'valor', pq: 'porque', vc: 'voce' };
  const corrigir = (t, vocItem) => t.split(' ').map(w => {
    if (ABREV[w] && !vocItem.has(w)) return ABREV[w];
    if (w.length < 5 || /\d/.test(w) || STOP.has(w) || KW.has(w) || MESES_T.has(w) || vocItem.has(w)) return w;
    let best = null, bd = 9; VOCI.forEach(v => { const d = lev(w, v, tolCmd(w, v)); if (d <= tolCmd(w, v) && d < bd) { bd = d; best = v; } });
    return best || w;
  }).join(' ');
  // Período citado na frase, em forma normalizada (para repetir em "e o mês passado?")
  const perTxt = t => {
    if (/mes passado/.test(t)) return 'mes passado';
    if (/(este|esse|neste|nesse) mes|mes atual|mes corrente/.test(t)) return 'este mes';
    if (/\b(acumulad\w*|desde o inicio)\b/.test(t)) return 'acumulado';
    const mi = MES.findIndex(n => new RegExp('\\b' + n + '\\b').test(t)), ym = t.match(/\b(20\d\d)\b/);
    if (mi >= 0) return MES[mi] + (ym ? ' ' + ym[1] : '');
    return ym ? ym[1] : '';
  };
  // Frases que o assistente não entendeu: guardadas só neste aparelho (localStorage direto, não sincroniza), sem números
  const LOGK = 'cfo-assist-log';
  const logar = (texto, motivo, id) => { try { const L = JSON.parse(localStorage.getItem(LOGK) || '[]'); L.push({ ts: Date.now(), t: T(texto).replace(/\d+/g, '#').slice(0, 80), m: motivo, id: id || '' }); localStorage.setItem(LOGK, JSON.stringify(L.slice(-100))); } catch { /* sem armazenamento: ignora */ } };

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
    const ex = pool.filter(x => norm(x.r.item) === todo); if (ex.length === 1) return { toks, hits: [ex[0].r], sug: [] };   // nome completo = um item só
    const hits = pool.filter(x => alvos.every(a => ok(x.s, a))).sort(rank).map(x => x.r);
    if (hits.length) return { toks, hits, sug: [] };
    const sc = pool.map(x => ({ r: x.r, n: alvos.filter(a => ok(x.s, a)).length })).filter(x => x.n >= (toks.length > 1 ? 2 : 1)).sort((a, b) => b.n - a.n);
    const voc = D.voc || (D.voc = vocab(D));                          // erro de digitação no nome: só SUGERE (nunca troca sozinho), e nunca mexe em números
    const fix = toks.map(w => { if (/\d/.test(w) || pool.some(x => x.s.includes(w))) return w; const tl = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0; let b = w, bd = 9; voc.forEach(v => { const d = lev(w, v, tl); if (d < bd && d <= tl) { bd = d; b = v; } }); return b; });
    const fz = fix.join(' ') !== toks.join(' ') ? pool.filter(x => fix.every(w => x.s.includes(w))).slice(0, 5).map(x => x.r) : [];
    return { toks, hits: [], sug: fz.length ? fz : sc.slice(0, 5).map(x => x.r) };
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
    if (/\b(acumulad\w*|desde o inicio)\b/.test(t)) return { f: () => true, rot: 'acumulado (todos os meses)' };
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
    ['ajuda', /\b(ajuda|help|comandos|o que (voce|vc) (faz|sabe|consegue)|como (te )?uso|como funciona)\b/],
    ['logassist', /\b(nao entendi|frases? que nao entend\w+|perguntas? que (voce )?nao (entend\w+|soub\w+)|falhas do assistente)\b/],
    ['semlocal', /\b(sem (local|localizacao|lugar)|nao (tem|possui) (local|localizacao)|nao (esta )?(mapead|cadastrad)\w*)\b/],
    ['local', /\b(onde|aonde|cade|local|localizacao|localizar|fica|ficam|guardad\w+|prateleira|corredor|fileira|andar|palete|achar|encontr\w+|posicao|endereco|em que lugar)\b/],
    ['tutorial', /\bcomo (eu )?(faco|fazer|fazemos|registro|registrar|lanco|lancar|cadastro|cadastrar|acesso|acessar|abro|abrir|importo|importar|exporto|exportar|conto|contar)\b/],
    ['mov', /\b(quando|ultima|ultimo) (entrou|chegou|deu entrada|deram entrada|saiu|deu saida|deram saida)\b|\bquem (deu|deram|retirou|pegou|lancou) (saida|entrada)\b|\bultima (entrada|saida)\b/],
    ['parado', /\b(parad\w+|sem giro|sem saida|encalhad\w+|nao (sai|saiu|saem)|menos (sai|saem|giro|rotatividade|consumid\w+|pedid\w+)|menor (giro|rotatividade|consumo|saida))\b/],
    ['giro', /\b(giro|rotatividade|rotativ\w+|mais (sai|saem|saiu|consumid\w+|pedid\w+|usad\w+)|maior (giro|rotatividade|consumo|saida)|ranking|top)\b/],
    ['previsao', /\b(quando (acaba|vai acabar|vai faltar|falta|termina)|quanto (tempo )?(dura|durar|vai durar|durara)|dura quanto)\b/],
    ['criticos', /\b(critic\w*|acabando|quase acabando|zerad\w*|em falta|faltando|falta|vai faltar|repor|reposicao|baixo|baixos|abaixo do minimo|estoque minimo|minimo|precisa comprar|comprar)\b/],
    ['previsao', /\b(previs\w+|prever|projecao|projetar|estimativa|estimar|vou gastar|vai gastar|vai custar|proximo mes|mes que vem|dura|durar|durara|quando (acaba|vai acabar|falta)|acabar)\b/],
    ['gasto', /\b(gast\w+|custo|custos|custou|valor|quanto (custa|foi)|reais|despesas?|orcamento)\b/],
    ['contrato', /\b(contratos?|vencimentos?|vence|vencem|vencendo|venceu)\b/],
    ['requisicao', /\b(requisic\w+|rq|aguardando|pendentes?|retirad\w+|negad\w+|pedidos?)\b/],
    ['mov', /\b(movimentac\w+|movimento|entradas?|saidas?|historico|lancamentos?)\b/],
    ['contagem', /\b(contagem|contagens|contei|inventario|divergenc\w+)\b/],
    ['resumo', /\b(resumo|painel|visao geral|geral|situacao|panorama|status|como (esta|anda|vai) (o |a )?(almoxarifado|setor|sistema))\b/],
    ['estoque', /\b(estoque|saldo|quanto (tem|tenho|temos|ha|sobrou|resta)|quantos|quantas|disponivel|disponiveis|unidades|restam|sobrando|sobraram)\b/]
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
  H.oi = () => ({ html: 'Olá! Respondo com os dados do sistema (a IA só ajuda a entender frases diferentes). Posso dizer onde está um item, o que está crítico, o que mais sai, previsão de gastos e mais.', chips: [ch('Itens críticos', 'o que está crítico?'), ch('Maior giro', 'quais itens mais saem?'), ch('Previsão de gastos', 'previsão de gastos'), ch('Resumo', 'resumo')] });
  H.ajuda = () => ({ html: `Exemplos do que eu entendo:<ul><li><b>Onde fica</b> a luva nitrílica?</li><li><b>Quanto tem</b> de bota PVC (42)?</li><li>O que está <b>crítico</b> / abaixo do mínimo?</li><li>Quais itens <b>mais saem</b>? E os <b>parados</b>?</li><li><b>Previsão de gastos</b> do próximo mês (ou do contrato 123)</li><li><b>Quanto dura</b> o estoque de capacete?</li><li><b>Gasto</b> de outubro por contrato</li><li>Requisições <b>aguardando retirada</b> · requisição RQ-3370</li><li>Últimas <b>saídas</b> · última <b>contagem</b> · itens <b>sem local</b> no mapa</li><li>Quando <b>vence</b> o contrato 123? · quando <b>entrou</b> a última luva?</li><li><b>Como faço</b> a contagem? · como registro uma <b>entrada</b>?</li></ul><small>Depois de uma pergunta, é só continuar: “e o mês passado?”, “e do contrato 125?”, “quanto dura dele?”, “não, o outro”, “voltar”.</small><small>Dica: escreva o nome do item como na Planilha EPI. Posso responder só com o que está cadastrado.</small>` });

  const GUIA = [
    [/entrada|saida|movimenta|lancar|lanco/, 'epi', 'Entradas e saídas', 'Almoxarifado Operacional › Planilha EPI: em cada item use o botão ⇅ para lançar entrada ou saída. Tudo aparece em Almoxarifado Operacional › Histórico de movimentação (verde = entrada, vermelho = saída, amarelo = ajuste de contagem).'],
    [/contagem|contar|inventario/, 'contagem', 'Contagem de estoque', 'Ferramentas › Contagem de estoque. Os ajustes feitos por ela ficam registrados no Histórico de movimentação (amarelo).'],
    [/historico/, 'historico', 'Histórico de movimentação', 'Almoxarifado Operacional › Histórico de movimentação: entradas (verde), saídas (vermelho) e ajustes de contagem (amarelo).'],
    [/mapa livre/, 'mapalivre', 'Mapa livre', 'Ferramentas › Mapa livre.'],
    [/mapa|prateleira|corredor/, 'mapa', 'Mapa almoxarifado', 'Ferramentas › Mapa almoxarifado: busque o item para ver corredor, fileira e andar. “Itens sem local” ajuda a definir o que ainda não está no mapa.'],
    [/requisic/, 'requisicoes', 'Requisição', 'Almoxarifado Operacional › Requisição.'],
    [/contrato/, 'contratos', 'Contratos', 'Almoxarifado Operacional › Contratos.'],
    [/gasto|financeiro|despesa/, 'controle_gastos', 'Gastos em EPIs', 'Jurídico Operacional › Gastos em EPIs.'],
    [/mensal/, 'controle_mensal', 'Controle mensal', 'Jurídico Operacional › Controle mensal.'],
    [/foto|separacao/, 'fotos', 'Foto de Separação', 'Ferramentas › Foto de Separação.'],
    [/etiqueta|identificacao/, 'etiquetas', 'Gerador de Identificação', 'Ferramentas › Gerador de Identificação.'],
    [/\bnf\b|nota fiscal|automacao/, 'autonf', 'Automação de NF', 'Ferramentas › Automação de NF.'],
    [/planilha|epi|estoque|item|importar|exportar/, 'epi', 'Planilha EPI', 'Almoxarifado Operacional › Planilha EPI.']
  ];
  H.tutorial = t => {
    const g = GUIA.find(x => x[0].test(t)); if (!g) return H.ajuda();
    const [, m, nome, txt] = g, ok = CFO.pode('abrir', m);
    return { html: `<b>${esc(nome)}</b><br>${esc(txt)}` + (ok ? `<div class="as-row"><button class="ghost as-go" data-ir="${m}">Abrir ${esc(nome)}</button></div>` : '<br><small>Seu perfil não tem acesso a essa tela.</small>') };
  };
  H.logassist = () => {
    let L = []; try { L = JSON.parse(localStorage.getItem(LOGK) || '[]'); } catch { L = []; }
    L = L.filter(x => x && x.m).slice(-10).reverse();
    return L.length ? { html: `<b>Últimas frases que não consegui responder</b>${lis(L.map(x => `“${esc(x.t)}” <small>${esc(x.m)}</small>`), 10)}<small>Sem números, guardadas só neste aparelho. Use para ensinar palavras novas em INTENCOES.</small>` } : sem('Nenhuma frase sem resposta registrada neste aparelho.');
  };

  // Ficha de itens (modo: local | estoque | ficha)
  H.itens = (D, hits, modo, t) => {
    const veMapa = CFO.pode('abrir', 'mapa'), pre = modo === 'local' ? 'onde fica ' : modo === 'estoque' ? 'quanto tem de ' : '';
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
    return { html: `Achei <b>${hits.length}</b> itens${modo !== 'local' ? ` (estoque somado: <b>${N(tot)}</b>)` : ''}:` + lis(hits.map(linhaItem), 8) + '<small>Escreva o tamanho ou o nome completo, ou toque em um botão para ver só um.</small>', alts: hits, chips: hits.slice(0, 6).map(r => ch(r.item, pre + r.item)) };
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
    const sd = semDados(D); if (sd) return sd;
    const pode$ = CFO.pode('abrir', 'controle_gastos'), base = `${rotK(D.K3[JANELA - 1])} a ${rotK(D.ult)}`, alvoMes = rotK(addM(D.ult, 1));
    const meses = rs => { const ids = new Set(rs.map(r => r.id)); return new Set(D.linhas.filter(l => ids.has(l.rid) && D.K3.includes(l.k)).map(l => l.k)).size; };
    const conf = n => n >= 3 ? 'boa' : n === 2 ? 'média' : n === 1 ? 'baixa' : 'sem base';
    const NOTA = 'Inclui: quantidade aprovada × preço das requisições. Não inclui: despesas fora do C.F.O., pedidos ainda não cadastrados nem mudança de preço.';
    if (hits.length > 3) {                                          // muitos tamanhos do mesmo produto: soma tudo
      const q = hits.reduce((a, r) => a + (+r.qtd || 0), 0), med = hits.reduce((a, r) => a + (D.med.get(r.id) || 0), 0), v = hits.reduce((a, r) => a + (D.med.get(r.id) || 0) * (D.preco.get(r.id) || 0), 0), dias = med > 0 ? Math.round(q / med * 30) : null, n = meses(hits);
      return { html: `<b>${hits.length} itens parecidos com “${esc(CFO.baseEpi(hits[0].item))}”</b> (todos os tamanhos somados)<br>Estoque: ${N(q)} un · saída média ${N(med)}/mês` + (med > 0 ? `<br>${alvoMes}: <b>~${N(Math.ceil(med))} un</b>${pode$ && v ? ` · ${R$(v)}` : ''}<br>Estoque ${duracao(dias)}<br>Confiabilidade: <b>${conf(n)}</b> (${n} de ${JANELA} meses com saída)` : '<br>Sem saídas nesse período: não dá para estimar.') + `<small>Escreva o tamanho para ver só um. Base: média de ${base}. ${NOTA}</small>`, chips: [ch('Itens críticos', 'o que está crítico?')] };
    }
    if (hits.length) {
      return { ctx: hits.length === 1 ? hits[0] : null, html: hits.map(r => { const s = situacao(D, r), pre = D.preco.get(r.id) || 0, fim = s.dias != null && s.q > 0 ? new Date(Date.now() + s.dias * 864e5).toLocaleDateString('pt-BR') : '', n = meses([r]);
        return `<b>${esc(r.item)}</b><br>Estoque: ${N(s.q)} un · saída média ${N(s.med)}/mês (${base})`
          + (s.med > 0 ? `<br>${alvoMes}: <b>~${N(Math.ceil(s.med))} un</b>${pode$ && pre ? ` · ${R$(s.med * pre)}` : ''}<br>${s.q > 0 ? `Estoque ${duracao(s.dias)}${fim ? ` (por volta de ${fim})` : ''}` : '⛔ Estoque zerado'}<br>Confiabilidade: <b>${conf(n)}</b> (${n} de ${JANELA} meses com saída)` : '<br>Sem saídas nesse período: não dá para prever.'); }).join('<hr>') + `<small>Base: média de ${base}. ${NOTA}</small>` };
    }
    if (!pode$) return { html: 'Seu perfil não tem acesso a valores em reais. Posso prever a quantidade de um item específico: pergunte “quanto dura o estoque de …”.', semFonte: true };
    const ks = Array.from({ length: 6 }, (_, i) => addM(D.ult, -5 + i)), flt = l => !cn || l.contrato === cn;
    const mensal = f => ks.map(k => D.linhas.filter(l => l.k === k && f(l)).reduce((a, l) => a + l.valor, 0));
    const prev = v => { const [a, b, c] = [v[5], v[4], v[3]]; return { p: (3 * a + 2 * b + c) / 6, lo: Math.min(a, b, c), hi: Math.max(a, b, c), media: (a + b + c) / 3 }; };
    const v = mensal(flt), nm = [v[3], v[4], v[5]].filter(x => x > 0).length;
    if (!nm) return sem(`Não há requisições aprovadas${filtroTxt(cn, '')} em ${esc(base)}, então não consigo estimar.`);
    const p = prev(v), tend = p.media ? (v[5] - p.media) / p.media * 100 : 0, max = Math.max(...v, 1);
    const porC = new Map(); D.linhas.forEach(l => { if (D.K3.includes(l.k) && flt(l)) porC.set(l.contrato, (porC.get(l.contrato) || 0) + l.valor / JANELA); });
    const peso = somaPor(D, l => D.K3.includes(l.k) && flt(l)).map(x => ({ r: { item: x.item }, v: x.valor / JANELA })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5);
    return { html: `<b>Estimativa de gasto em EPIs${filtroTxt(cn, nomeContrato(D, cn))} · ${alvoMes}</b><br><b style="font-size:1.15em">~${R$(p.p)}</b><br><small>faixa provável ${R$(p.lo)} a ${R$(p.hi)} · ${tend >= 0 ? '▲' : '▼'} ${N(Math.abs(tend))}% do último mês vs. média<br>Confiabilidade: ${conf(nm)} (${nm} de ${JANELA} meses com requisições)</small>`
      + `<div class="as-t">Histórico</div>${lis(ks.map((k, i) => `${rotK(k)} · ${R$(v[i])}<br>${bar(v[i], max)}`), 6)}`
      + (!cn && porC.size ? `<div class="as-t">Por contrato (média mensal)</div>${lis([...porC].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, x]) => `${esc(c)}${nomeContrato(D, c) ? ' - ' + esc(nomeContrato(D, c)) : ''} · ${R$(x)}`), 5)}` : '')
      + (peso.length ? `<div class="as-t">Itens que mais pesam</div>${lis(peso.map(x => `${esc(x.r.item)} · ${R$(x.v)}/mês`), 5)}` : '')
      + `<small>Estimativa baseada no histórico de requisições aprovadas: média ponderada de ${base} (o mês mais recente pesa mais). ${NOTA}</small>`, chips: [ch('Gasto do mês', 'gasto do último mês'), ch('Itens críticos', 'o que está crítico?')] };
  };

  H.gasto = (D, t, hits, cn) => {
    const sd = semDados(D); if (sd) return sd; const pe = periodo(D, t), f = pe ? pe.f : (k => k === D.ult), rot = pe ? pe.rot : rotK(D.ult) + ' (último mês com requisições)';
    const flt = l => f(l.k) && (!cn || l.contrato === cn) && (!hits.length || hits.some(r => r.id === l.rid)), L = D.linhas.filter(flt);
    const tot = L.reduce((a, l) => a + l.valor, 0), un = L.reduce((a, l) => a + l.qa, 0), nreq = new Set(L.map(l => l.q.id)).size;
    const prevK = pe ? null : addM(D.ult, -1), ant = prevK ? D.linhas.filter(l => l.k === prevK && (!cn || l.contrato === cn) && (!hits.length || hits.some(r => r.id === l.rid))).reduce((a, l) => a + l.valor, 0) : 0;
    if (!L.length) return sem(`Não achei gasto em ${esc(rot)}${filtroTxt(cn, '')}${hits.length ? ' para esse item' : ''}.`);
    const agr = (kf, nf) => { const m = new Map(); L.forEach(l => { const k = kf(l); m.set(k, (m.get(k) || 0) + l.valor); }); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${nf(k)} · ${R$(v)}`); };
    return { ctx: hits.length === 1 ? hits[0] : null, html: `<b>Gasto em EPIs · ${esc(rot)}${filtroTxt(cn, nomeContrato(D, cn))}</b>${hits.length === 1 ? `<br>${esc(hits[0].item)}` : ''}<br><b style="font-size:1.15em">${R$(tot)}</b><br><small>${nreq} requisição(ões) · ${N(un)} unidades${ant ? ` · mês anterior ${R$(ant)} (${tot >= ant ? '▲' : '▼'} ${N(Math.abs((tot - ant) / ant * 100))}%)` : ''}</small>`
      + (!cn ? `<div class="as-t">Por contrato</div>${lis(agr(l => l.contrato, c => esc(c) + (nomeContrato(D, c) ? ' - ' + esc(nomeContrato(D, c)) : '')), 5)}` : '')
      + (!hits.length ? `<div class="as-t">Itens mais caros</div>${lis(agr(l => l.item, esc), 5)}` : ''), chips: [ch('Previsão de gastos', 'previsão de gastos' + (cn ? ' do contrato ' + cn : '')), ch('Maior giro', 'quais itens mais saem?')] };
  };

  H.contrato = (D, t, hits, cn) => {
    if (/venc|termin|prazo|expir/.test(t)) return H.vence(D, cn);
    if (!cn) { if (!D.contratos.length) return sem('Não há contratos cadastrados. Diga o número, por exemplo: “contrato 123”.'); const at = D.contratos.filter(c => c.status === 'Ativo');
      return { html: `<b>${D.contratos.length}</b> contratos cadastrados (${at.length} ativos).<br>Pergunte por um: “gasto do contrato 123”.${lis((at.length ? at : D.contratos).slice(0, 8).map(c => `${esc(c.num)} - ${esc(c.nome)}${c.fim ? ` · termina ${esc(c.fim)}` : ''}`), 8)}` }; }
    const c = D.contratos.find(x => String(x.num) === cn), L = D.linhas.filter(l => l.contrato === cn), nreq = new Set(L.map(l => l.q.id)).size, tot = L.reduce((a, l) => a + l.valor, 0), top = somaPor(D, l => l.contrato === cn).sort((a, b) => b.qa - a.qa).slice(0, 5);
    return { html: `<b>Contrato ${esc(cn)}${nomeContrato(D, cn) ? ' - ' + esc(nomeContrato(D, cn)) : ''}</b>` + (c ? `<br>${esc(c.status || '')}${c.ini ? ` · ${esc(c.ini)}` : ''}${c.fim ? ` a ${esc(c.fim)}` : ''}${c.valor ? ` · valor ${R$(c.valor)}` : ''}` : '<br><small>Não está na planilha de contratos.</small>')
      + (L.length ? `<br>${nreq} requisição(ões) · ${N(L.reduce((a, l) => a + l.qa, 0))} un${CFO.pode('abrir', 'controle_gastos') ? ` · gasto total ${R$(tot)}` : ''}<div class="as-t">Mais pedidos</div>${lis(top.map(x => `${esc(x.item)} · ${N(x.qa)} un`), 5)}` : '<br>Nenhuma requisição aprovada para este contrato.'),
      chips: CFO.pode('abrir', 'controle_gastos') ? [ch('Previsão de gastos', 'previsão de gastos do contrato ' + cn), ch('Gasto do mês', 'gasto do contrato ' + cn)] : [] };
  };

  const dtFim = s => { const x = String(s ?? ''); let m = x.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], m[2] - 1, +m[3]); m = x.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };
  H.vence = (D, cn) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const txtDias = n => n < 0 ? `⛔ venceu há ${-n} dia(s)` : n === 0 ? '⚠️ vence hoje' : n <= 30 ? `⚠️ vence em ${n} dia(s)` : `vence em ${n} dias`;
    const L = (cn ? D.contratos.filter(c => String(c.num) === cn) : D.contratos.filter(c => !c.status || c.status === 'Ativo'))
      .map(c => { const d = dtFim(c.fim); return d ? { c, dias: Math.round((d - hoje) / 864e5) } : null; }).filter(Boolean).sort((a, b) => a.dias - b.dias);
    if (!L.length) return sem(cn ? 'Não achei a data de término desse contrato na planilha de contratos.' : 'Nenhum contrato ativo com data de término cadastrada.');
    return { html: `<b>${cn ? 'Vencimento do contrato' : 'Vencimentos dos contratos ativos'}</b>${lis(L.map(x => `${esc(x.c.num)} - ${esc(x.c.nome || '')} · termina ${esc(x.c.fim)} · ${txtDias(x.dias)}`), 8)}` };
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
    const ids = new Set(hits.map(r => norm(r.item))), tp = /\b(saida|saidas|saiu)\b|deu saida|deram saida/.test(t) ? 'Saída' : /\b(entrada|entradas|entrou|chegou)\b|deu entrada|deram entrada/.test(t) ? 'Entrada' : null, um = /\bultim[ao]\b/.test(t);
    const L = D.movs.filter(m => (!hits.length || ids.has(norm(m.item))) && (!tp || m.tipo === tp)).sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, um ? 1 : 8);
    if (!L.length) return sem('Nenhuma ' + (tp ? (tp === 'Saída' ? 'saída' : 'entrada') : 'movimentação') + ' registrada' + (hits.length ? ' para esse item.' : '.'));
    const dt = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('pt-BR'); };
    return { html: `<b>${um ? 'Último lançamento' : tp === 'Saída' ? 'Últimas saídas' : tp === 'Entrada' ? 'Últimas entradas' : 'Últimas movimentações'}</b>${lis(L.map(m => `${dt(m.data)} · ${{ 'Entrada': '🟢 entrou', 'Saída': '🔴 saiu', 'Contagem': '🟡 contagem' }[m.tipo] || esc(m.tipo)} ${N(m.qtd)} · ${esc(m.item)}${m.resp ? ` <small>(${esc(m.resp)})</small>` : ''}`), 8)}` };
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
  const FRESCO = 10 * 60 * 1000;                                      // depois de 10 min sem conversar, o assunto anterior é esquecido
  const estado = { item: null, alts: [], pend: null, ult: null, conf: null, hist: [], ts: 0, pedeIA: false };
  const fresco = () => estado.ts && Date.now() - estado.ts < FRESCO;
  const zera = () => { estado.item = null; estado.alts = []; estado.pend = null; estado.ult = null; estado.conf = null; };
  const SEGUE = new Set(['gasto', 'previsao', 'giro', 'mov', 'contrato', 'estoque', 'local', 'ficha']);   // intenções que aceitam "e o mês passado?", "e do contrato 125?"
  // Palavra solta e vaga: não adivinha, pergunta qual das opções a pessoa quer
  const FRACAS = {
    valor: [['Gasto do mês', 'gasto do último mês'], ['Previsão de gastos', 'previsão de gastos'], ['Gasto por contrato', 'gasto por contrato']],
    pedido: [['Aguardando retirada', 'requisições aguardando retirada'], ['Últimas requisições', 'últimas requisições']],
    pedidos: [['Aguardando retirada', 'requisições aguardando retirada'], ['Últimas requisições', 'últimas requisições']],
    historico: [['Últimas movimentações', 'últimas movimentações'], ['Última contagem', 'última contagem']],
    top: [['Maior giro', 'quais itens mais saem?'], ['Itens críticos', 'o que está crítico?']]
  };
  const FONTE = { local: 'Planilha EPI + Mapa', semlocal: 'Planilha EPI + Mapa', estoque: 'Planilha EPI', ficha: 'Planilha EPI + Mapa + Requisições', criticos: 'Planilha EPI + Requisições aprovadas',
    giro: 'Requisições aprovadas (negadas não contam)', parado: 'Planilha EPI + Requisições aprovadas', previsao: 'Requisições aprovadas (qtd aprovada × preço)', gasto: 'Requisições aprovadas (qtd aprovada × preço)',
    contrato: 'Contratos + Requisições', requisicao: 'Requisições', mov: 'Histórico de movimentação', contagem: 'Contagens de estoque', resumo: 'Planilha EPI + Requisições' };

  // Fecha a resposta: guarda o contexto da conversa, junta botões e mostra de onde vieram os dados
  const fecha = (r, id, x = {}) => {
    estado.ts = Date.now();
    if (r.ctx) { estado.item = r.ctx; estado.alts = []; }
    if (r.alts) { estado.alts = r.alts; estado.item = null; }                // vários resultados: "dele" não aponta para ninguém até a pessoa escolher
    if (SEGUE.has(id)) estado.ult = { id, cn: x.cn || '', per: x.per || '', item: r.ctx || (x.alvo && x.alvo.length === 1 ? x.alvo[0] : null) };
    if (r.html2) r.html += '<div class="as-row">' + r.html2 + '</div>';
    if (FONTE[id] && !r.semFonte) {
      r.html += `<small class="as-src">Fonte: ${FONTE[id]} · consulta às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>`;
      if (!x.semHist && x.texto) { estado.hist.push(x.texto); if (estado.hist.length > 10) estado.hist.shift(); }
    }
    return r;
  };

  const responder = (texto, semHist) => {
    const t0 = T(texto); if (!t0) return sem('Escreva sua pergunta.');
    const expirou = !!estado.ts && !fresco(); if (expirou) { zera(); estado.ts = 0; }

    // 1) Palavras que controlam a conversa (não consultam dados)
    if (/^(obrigad\w*|valeu|vlw|brigad\w*)( \w+)?$/.test(t0)) return sem('De nada! Se precisar de mais alguma coisa, é só perguntar.');
    if (/^(cancelar|cancela|deixa|deixa pra la|esquece|esquece isso|recomecar|comecar de novo|comecar do zero|reiniciar)$/.test(t0)) { zera(); estado.hist = []; return { html: 'Tudo bem, limpei o assunto. O que você quer ver agora?', chips: H.oi().chips }; }
    if (/^(nao|nao obrigad\w*|nada|so isso|era so isso)$/.test(t0)) { const c = estado.conf; estado.conf = null; estado.pend = null; return c ? { html: 'Tudo bem. Escreva o nome completo (ou o código) do item, ou escolha um atalho.', chips: H.oi().chips } : sem('Certo. Qualquer coisa é só chamar.'); }
    if (/^(sim|isso|isso mesmo|exato|claro|pode|pode ser|quero)$/.test(t0)) { if (estado.conf) { const q = estado.conf; estado.conf = null; return responder(q, true); } return { html: 'Certo! O que você quer ver?', chips: H.oi().chips }; }
    if (/^(voltar|volta|anterior|pergunta anterior)$/.test(t0)) { const h = estado.hist; if (h.length < 2) return sem('Ainda não há pergunta anterior.'); h.pop(); return responder(h[h.length - 1], true); }
    if (/^(mais detalhes|detalhes|detalhar|me conta mais|ver mais|mais informacoes)$/.test(t0)) {
      if (!estado.item) { estado.pend = { id: 'ficha', falta: 'item' }; return sem('Detalhes de qual item? Escreva o nome (ou parte dele).'); }
      return fecha(H.itens(carrega(), [estado.item], 'ficha', t0), 'ficha', { alvo: [estado.item] });
    }
    if (/\b(nao (e|era) (esse|essa|ele|ela)|o outro|a outra|outro item|outra opcao)\b/.test(t0)) {
      if (estado.alts.length) return { html: 'Tudo bem. Qual destes você quer?', chips: estado.alts.slice(0, 6).map(r => ch(r.item, r.item)) };
      estado.pend = { id: 'ficha', falta: 'item' }; return sem('Me diga o nome completo (ou o código) do item que você procura.');
    }

    // 2) Entender a frase: corrige palavras de comando, acha item/contrato/requisição e a intenção
    const D = carrega(), t = corrigir(t0, D.voc || (D.voc = vocab(D))), req = acharReq(D, t), pend = estado.pend, U = estado.ult;
    let cn = acharContrato(D, t);
    if (!cn && pend && pend.falta === 'contrato') { const m = t.match(/^(?:contrato\s*)?(?:n|no|numero)?\s*(\d+)$/); if (m) cn = m[1]; }
    const soNum = !!(pend && pend.falta === 'contrato' && cn && /^(contrato\s*)?(n|no|numero)?\s*\d+$/.test(t));
    const { hits, sug, toks } = soNum ? { hits: [], sug: [], toks: [] } : acharItens(D, t);
    const casou = []; for (const [k, re] of INTENCOES) { const m = t.match(re); if (m) casou.push([k, m[0]]); }
    let id = req ? 'requisicao' : casou.length ? casou[0][0] : null;
    if (!req && hits.length && casou[0] && casou[0][0] === 'local' && casou.some(c => c[0] === 'estoque')) id = 'ficha';   // "onde fica e quanto tem": mostra os dois

    // 3) Contexto: pergunta pendente, "e o mês passado?", "ele/esse"
    if (pend && pend.falta === 'item' && hits.length && !id) id = pend.id;
    if (pend && pend.falta === 'contrato' && cn && (!id || id === 'contrato')) id = pend.id;
    let seg = false;
    if (!id && U && !hits.length && (perTxt(t) || cn || /^e\b/.test(t))) { id = U.id; seg = true; }
    else if (!id && U && hits.length && /^e\b/.test(t) && ['local', 'estoque', 'previsao', 'gasto', 'mov', 'ficha'].includes(U.id)) { id = U.id; seg = true; }
    else if (id === 'contrato' && U && cn && /^e\b/.test(t) && ['gasto', 'previsao'].includes(U.id)) { id = U.id; seg = true; }   // "e do contrato 130?" depois de um gasto
    const pron = /\b(dele|dela|desse|dessa|esse|essa|ele|ela|o mesmo|a mesma)\b/.test(t);
    if (pron && !hits.length && !estado.item && expirou) return sem('Faz um tempo desde a última pergunta e perdi o assunto. Qual item você quer? Escreva o nome.');
    cn = cn || (seg && U && U.cn) || null;
    const alvo = hits.length ? hits : (pron || seg || (/^e\b/.test(t) && PRECISA_ITEM.has(id))) ? [(seg && U && U.item) || estado.item].filter(Boolean) : [];
    const tt = seg ? (perTxt(t) || (U && U.per) || '') : t;          // período que os cálculos vão ler
    if (pron && !hits.length && !alvo.length && id && id !== 'requisicao' && id !== 'contrato') {
      estado.pend = { id, falta: 'item' };
      return estado.alts.length ? { html: 'Qual destes você quer dizer?', chips: estado.alts.slice(0, 6).map(r => ch(r.item, r.item)) } : sem('De qual item você está falando? Escreva o nome (ou parte dele).');
    }

    // 4) Frase vaga: não adivinha, confirma
    if (!req && !seg && casou.length && !hits.length && !cn) { const f = FRACAS[casou[0][1]]; if (f && t.split(' ').length <= 2) { logar(texto, 'frase vaga (pediu escolha)', id); return { html: 'Você quer ver qual destes?', chips: f.map(([a, b]) => ch(a, b)) }; } }

    if (!id) id = hits.length ? 'ficha' : (toks.length ? 'naoachei' : 'ajuda');
    estado.pend = null;

    // 5) Faltou dado: pergunta
    if (id === 'naoachei' || (!hits.length && toks.length && (PRECISA_ITEM.has(id) || id === 'ficha'))) {
      logar(texto, id === 'naoachei' ? 'sem intenção e sem item' : 'item não encontrado', id);
      estado.pedeIA = !sug.length;                                  // sem sugestão para mostrar: vale pedir ajuda à IA (se estiver ligada)
      const s = sug.length ? `<br>Você quis dizer:${lis(sug.map(r => `<a href="#" class="as-q" data-q="${esc(r.item)}">${esc(r.item)}</a>`), 5)}` : '';
      if (sug.length === 1) estado.conf = (id === 'local' ? 'onde fica ' : id === 'estoque' ? 'quanto tem de ' : id === 'previsao' ? 'previsão de gasto de ' : '') + sug[0].item;
      estado.pend = { id: id === 'naoachei' ? 'ficha' : id, falta: 'item' };
      return { html: `Não encontrei “${esc(toks.join(' '))}” na Planilha EPI.${s}` + (sug.length ? '' : '<br><small>Posso ajudar, mas preciso identificar o material: escreva o nome como está na Planilha EPI ou o código do item.</small>'), chips: sug.length ? [] : [ch('Exemplos', 'ajuda'), ch('Itens críticos', 'o que está crítico?')] };
    }
    if (PRECISA_ITEM.has(id) && !alvo.length) { estado.pend = { id, falta: 'item' }; return sem(id === 'local' ? 'De qual item? Escreva o nome (ou parte dele).' : 'Estoque de qual item? Escreva o nome (ou parte dele).'); }
    if ((id === 'gasto' || id === 'previsao') && /\bcontrato\b/.test(t) && !cn && !hits.length) {
      const top = new Map(); D.linhas.forEach(l => { if (D.K3.includes(l.k) && l.contrato) top.set(l.contrato, (top.get(l.contrato) || 0) + l.valor); });
      estado.pend = { id, falta: 'contrato' };
      return { html: 'De qual contrato? Diga o número (ou toque em um).', chips: [...top].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => ch(c + (nomeContrato(D, c) ? ' - ' + nomeContrato(D, c) : ''), 'contrato ' + c)) };
    }
    if (AREA[id] && !CFO.pode('abrir', AREA[id])) return sem('Seu perfil não tem acesso a essa informação.');

    // 6) Consultar e responder
    let r;
    if (id === 'local' || id === 'estoque' || id === 'ficha') r = H.itens(D, alvo, id, tt);
    else if (id === 'previsao' || id === 'gasto') r = H[id](D, tt, alvo, cn);
    else if (id === 'contrato') r = H.contrato(D, tt, alvo, cn);
    else if (id === 'requisicao') r = H.requisicao(D, t, req);
    else if (id === 'mov') r = H.mov(D, tt, alvo);
    else if (id === 'tutorial') r = H.tutorial(t);
    else r = (H[id] || H.ajuda)(D, tt);
    return fecha(r, id, { cn, per: perTxt(tt), alvo, texto, semHist });
  };
  CFO.assistente = { responder, carrega, T, estado, log: () => { try { return JSON.parse(localStorage.getItem(LOGK) || '[]'); } catch { return []; } } };

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
  .as-m small.as-src{opacity:.7;font-size:.72rem;margin-top:.45rem}
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
  const inicio = () => { ms.innerHTML = ''; zera(); estado.hist = []; const r = H.oi(); bolha('bot', r.html); mostraChips(r.chips); };
  /* ---------- IA (Gemini) via Edge Function do Supabase: só reescreve a frase que as regras não entenderam ---------- */
  const IA = (() => {
    const cfg = () => window.CFO_SUPABASE || {};
    let off = false, marcas = [], ultimo = ''; const cache = new Map();
    const pode = () => { const c = cfg(); return !off && !!c.url && !!c.anonKey && c.assistenteIA !== false; };
    const entender = async txt => {
      const k = T(txt); ultimo = ''; if (cache.has(k)) return cache.get(k);
      const agora = Date.now(); marcas = marcas.filter(x => agora - x < 60000); if (marcas.length >= 8) { ultimo = 'limite de 8 pedidos por minuto'; return null; }   // no máx. 8 pedidos por minuto neste aparelho
      marcas.push(agora);
      const c = cfg(), D = carrega(), ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
      try {
        const body = { frase: String(txt).slice(0, 300), anterior: estado.hist[estado.hist.length - 1] || '',
          itens: D.rows.slice(0, 500).map(r => String(r.item).slice(0, 60)),
          contratos: D.contratos.slice(0, 60).map(x => ({ num: String(x.num ?? ''), nome: String(x.nome || '').slice(0, 40) })) };
        const r = await fetch(String(c.url).replace(/\/+$/, '') + '/functions/v1/assistente-ia', { method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', apikey: c.anonKey }, body: JSON.stringify(body) });
        if (r.status === 404) { off = true; ultimo = 'função assistente-ia não encontrada (404)'; return null; }          // função ainda não publicada: não tenta de novo nesta sessão
        if (!r.ok) { let g = ''; try { g = (await r.json()).status || ''; } catch { /* sem detalhe */ } ultimo = 'erro ' + r.status + (r.status === 401 ? ' (Verify JWT ligado)' : g ? ' (Google respondeu ' + g + ')' : ''); return null; }
        const j = await r.json(); if (j && (j.frase || j.resposta)) cache.set(k, j); return j;
      } catch (e) { ultimo = 'sem conexão ou demorou demais'; return null; } finally { clearTimeout(to); }
    };
    return { pode, entender, erro: () => ultimo };
  })();

  const enviar = txt => {
    txt = String(txt || '').trim(); if (!txt) return; bolha('eu', esc(txt)); inp.value = '';
    estado.pedeIA = false;
    let r; try { r = responder(txt); } catch (e) { console.warn('assistente', e); r = sem('Tive um problema ao ler os dados. Tente de novo ou reformule a pergunta.'); }
    const pede = estado.pedeIA && IA.pode(); estado.pedeIA = false;
    if (!pede) { bolha('bot', r.html); mostraChips(r.chips); return; }
    const espera = bolha('bot', '💭 Entendendo sua pergunta…'); mostraChips([]);
    IA.entender(txt).then(j => {
      let out = r, nota = '';
      try {
        if (j && j.frase && T(j.frase) !== T(txt)) {
          estado.pend = null; estado.conf = null; estado.pedeIA = false;
          const r2 = responder(j.frase), falhou = estado.pedeIA; estado.pedeIA = false;
          if (!falhou) { out = r2; nota = `<small class="as-src">🤖 IA: entendi como “${esc(j.frase)}”</small>`; }
          else nota = `<small class="as-src">🤖 A IA sugeriu “${esc(j.frase)}”, mas o sistema também não achou.</small>`;
        } else if (j && j.resposta && !j.frase) { out = sem(esc(j.resposta)); nota = '<small class="as-src">🤖 resposta da IA (não consultou os dados)</small>'; }
        else if (!j) nota = `<small class="as-src">⚠️ A IA não respondeu: ${esc(IA.erro() || 'motivo desconhecido')}.</small>`;
        else if (!j.resposta) nota = '<small class="as-src">🤖 A IA respondeu, mas não achou nenhum item parecido na planilha.</small>';
      } catch (e) { console.warn('assistente IA', e); out = r; nota = ''; }
      espera.innerHTML = out.html + nota; mostraChips(out.chips); ms.scrollTop = ms.scrollHeight;
    });
  };
  const abrirTela = m => {
    try { const d = DRAWERS.find(x => x.subs.some(s => s.m === m)), s = d && d.subs.find(x => x.m === m); if (!s) return false; pan.hidden = true; ir(d, s); return true; }
    catch (e) { console.warn('assistente: abrir tela', e); return false; }
  };
  const abrirMapa = nome => {
    if (!abrirTela('mapa')) return;
    try { const q = document.querySelector('#screens .screen:last-child #mq'); if (q) { q.value = nome; q.dispatchEvent(new Event('input', { bubbles: true })); } } catch (e) { console.warn('assistente: abrir mapa', e); }
  };
  fab.onclick = () => { pan.hidden = !pan.hidden; if (!pan.hidden) { if (!ms.children.length) inicio(); setTimeout(() => inp.focus(), 50); } };
  pan.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'), q = e.target.closest('[data-q]'), m = e.target.closest('[data-mapa]'), g = e.target.closest('[data-ir]');
    if (a) { if (a.dataset.a === 'fechar') pan.hidden = true; else inicio(); }
    else if (q) { e.preventDefault(); enviar(q.dataset.q); } else if (m) abrirMapa(m.dataset.mapa); else if (g) abrirTela(g.dataset.ir);
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
