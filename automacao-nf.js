/* ===== Ferramentas > Automação de NF (autoclick) =====
   Tela própria em Ferramentas: liga ao agente local (agente-windows/agente.ps1, em 127.0.0.1:8765), edita o roteiro
   e preenche a nota de uma requisição. Também põe os botões 🤖/🧪 dentro do detalhe da Requisição (atalho).
   Só para o Almoxarifado de EPIs (CFO.espaco vazio). Remover = apagar este arquivo, a linha <script> e a entrada em app.js. */
(() => {
  if (CFO.espaco) return;
  const esc = CFO.esc, URL = 'http://127.0.0.1:8765', TK = 'cfo:nf_token';     // token fica só neste navegador (não vai para a nuvem)
  const token = () => localStorage.getItem(TK) || '';
  const chamar = async (rota, corpo) => {
    const r = await fetch(URL + rota, { method: corpo ? 'POST' : 'GET', headers: { 'X-Token': token(), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { localStorage.removeItem(TK); throw new Error('Token inválido. Clique em "Colar token" e cole o que aparece na janela do agente.'); }
    if (!r.ok) throw new Error(j.erro || 'erro ' + r.status);
    return j;
  };
  const ligado = () => fetch(URL + '/ping').then(r => r.ok).catch(() => false);
  const VCAP = 6;                                            // versão do agente que entende "capturar lista" e "gerar documento"
  const VCONF = 7;                                               // versão do agente que entende "confirmar", "lembrar mouse" e "voltar mouse"
  const usaConf = t => /^\s*(confirmar|conferir|lembrar mouse|voltar mouse)\b/mi.test(t || '');
  const AVISO_CONF = 'Este roteiro tem o bloco que PERGUNTA "está correto?" a cada item, e o agente aberto é de uma versão anterior.\n\nClique em "Baixar agente", troque a pasta agente-windows e abra o iniciar.bat de novo.';
  const VMIN = 3;                                                // versão mínima do agente (a que entende se/senão, perguntar, teclar...)
  const versao = () => fetch(URL + '/ping').then(r => r.json()).then(x => x.versao || 1).catch(() => 0);
  const ANTIGO = 'O agente que está aberto neste computador é ANTIGO e não entende os comandos novos.\n\nClique em "Baixar agente", troque a pasta agente-windows e abra o iniciar.bat de novo.';
  const pedeToken = () => { const t = prompt('Cole o TOKEN que aparece na janela do agente:'); if (t) localStorage.setItem(TK, t.trim()); return !!token(); };
  const garante = async () => {
    if (!await ligado()) { alert('O agente não está ligado neste computador.\nAbra o "iniciar.bat" (pasta agente-windows) e tente de novo.'); return false; }
    if (await versao() < VMIN) { alert(ANTIGO); return false; }
    return token() || pedeToken();
  };

  // Requisição no formato do agente: itens aprovados somados por item+tamanho, com o código do EPI
  const montar = r => {
    const rows = CFO.store.get('epi', []), achar = CFO.casarEpi(rows), mapa = new Map(), porCod = new Map();
    rows.forEach(e => { const c = CFO.norm(e && e.codigo); if (c && !porCod.has(c)) porCod.set(c, e); });
    // Linha da Planilha EPI do item: pelo código do WL (quando a requisição trouxe) e, se não bater, pelo nome
    const linha = i => { let m = achar(i.item); if (i.cod && (!m || CFO.norm(m.codigo) !== CFO.norm(i.cod))) m = porCod.get(CFO.norm(i.cod)) || m; return m; };
    // Código lançado na NF = "Código NF" da planilha; se ainda não foi preenchido, usa o código normal (como era antes)
    // Na NF o código entra SEM os 2 zeros do início (0012 -> 12, 0105 -> 105); se o código tiver só zeros ou for curto, não mexe
    const semZeros = c => c.replace(/^00(?=.)/, '');
    const codNf = m => m ? semZeros(String(m.codigoNf || m.codigo || '').trim()) : '';
    r.itens.filter(i => i.qa > 0).forEach(i => {
      const k = CFO.norm(i.item) + '|' + CFO.norm(i.tam), x = mapa.get(k) || { item: i.item, tam: i.tam || '', qa: 0, preco: i.preco, codigo: codNf(linha(i)) };
      x.qa += i.qa; mapa.set(k, x);
    });
    return { id: r.id, contrato: r.contrato, contratoNome: r.contratoNome, sol: r.sol, mes: r.mes, motivo: r.motivo, itens: [...mapa.values()] };
  };
  // Várias requisições numa NF só: itens somados (o montar() soma item+tamanho), textos juntos. Com uma só, devolve a própria requisição (comportamento de sempre).
  const uniq = a => [...new Set(a.map(x => String(x == null ? '' : x).trim()).filter(Boolean))];
  // Coordenador do contrato (mesma regra do Controle mensal): o digitado em Parâmetros; senão, quem mais pede naquele contrato
  const coordDeContrato = ct => {
    const dig = (((CFO.store.get('mensal:cfg', {}) || {})[ct] || {}).coord || '').trim(); if (dig) return dig;
    const mp = new Map();
    CFO.store.get('requisicoes', []).filter(r => String(r.contrato) === String(ct)).forEach(r => { const k = CFO.norm(r.sol || ''); if (!k) return; const x = mp.get(k) || { n: 0, t: String(r.sol).trim() }; x.n++; mp.set(k, x); });
    const b = [...mp.values()].sort((x, y) => y.n - x.n)[0]; return b ? b.t : '';
  };
  // Solicitante da NF: se todas as requisições são do mesmo solicitante, usa ele; se forem de solicitantes diferentes, usa o coordenador do contrato
  const solDe = rs => {
    const ss = [...new Map(rs.map(r => [CFO.norm(r.sol || ''), String(r.sol || '').trim()]).filter(x => x[0])).values()];
    if (ss.length <= 1) return ss[0] || '';
    const cs = uniq(uniq(rs.map(r => r.contrato)).map(coordDeContrato));
    return cs.join(' / ') || ss.join(' / ');
  };
  const combinar = rs => rs.length === 1 ? rs[0] : {
    id: rs.map(r => r.id).join(','), juntas: rs.length, ids: rs.map(r => r.id),
    contrato: uniq(rs.map(r => r.contrato)).join(' + '), contratoNome: uniq(rs.map(r => r.contratoNome)).join(' + '),
    sol: solDe(rs), mes: uniq(rs.map(r => r.mes)).join(' / '), motivo: uniq(rs.map(r => r.motivo)).join(' / '),
    itens: rs.flatMap(r => r.itens || []) };
  const avisoJuntas = rs => rs.length < 2 ? '' : `\n\n${rs.length} requisições somadas numa NF só: ${rs.map(r => r.id).join(', ')}.` + (uniq(rs.map(r => r.contrato)).length > 1 ? `\n⚠️ ATENÇÃO: contratos diferentes (${uniq(rs.map(r => r.contrato)).join(', ')}). O roteiro vai usar todos no campo contrato.` : '');
  async function rodar(r, simular, aoIniciar) {
    if (!await garante()) return;
    const q = montar(r);
    if (!q.itens.length) { alert('Esta requisição não tem itens aprovados.'); return; }
    // Roteiro com captura/Word/PDF só roda no agente novo; roteiros antigos continuam funcionando no agente antigo
    const usaCap = await chamar('/roteiro').then(x => /^\s*(capturar lista|gerar documento)\b/mi.test(x.texto || '')).catch(() => false);
    const usaCf = await chamar('/roteiro').then(x => usaConf(x.texto)).catch(() => false);
    if (usaCf && await versao() < VCONF) { alert(AVISO_CONF); return; }
    if (usaCap && await versao() < VCAP) { alert('Este roteiro captura listas e gera Bloco de Notas/PDF, e o agente aberto é de uma versão anterior.\n\nClique em "Baixar agente", troque a pasta agente-windows e abra o iniciar.bat de novo.'); return; }
    if (!simular && !confirm(`Preencher a nota da ${r.id}?\n\nContrato ${r.contrato} · ${q.itens.length} produto(s).${r.juntas ? `\n(${r.juntas} requisições somadas numa NF só)` + (/ \+ /.test(r.contrato) ? '\n⚠️ ATENÇÃO: contratos diferentes.' : '') : ''}\nO agente vai controlar o mouse e o teclado.\nPara interromper: jogue o mouse no canto superior esquerdo da tela.\nPara pausar/continuar: aperte a tecla SHIFT (a mesma tecla pausa e continua) ou leve o mouse ao canto superior direito.`)) return;
    try { await chamar(simular ? '/testar' : '/executar', { requisicao: q }); aoIniciar ? aoIniciar() : tela(r); }
    catch (e) { alert(e.message); }
  }


  // ---------- Controle remoto: o celular manda, o PC executa ----------
  // Canal de "broadcast" do Realtime do Supabase (o mesmo serviço do online.js; nada é gravado em banco).
  // O nome do canal leva um código secreto de 12 letras/números, que aparece no PC e é digitado uma vez no celular.
  // O celular só manda o NÚMERO da requisição e o comando; os dados vêm do próprio PC. Só roda com o agente ligado e o token colado no PC.
  const CFGS = window.CFO_SUPABASE || {}, RK = 'cfo_nf_remoto';       // fica só neste aparelho (não vai para a nuvem)
  const remCfg = () => { try { return JSON.parse(localStorage.getItem(RK) || '{}') || {}; } catch { return {}; } };
  const setRem = o => { try { localStorage.setItem(RK, JSON.stringify({ ...remCfg(), ...o })); } catch {} };
  const novoCodigo = () => { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; return [...crypto.getRandomValues(new Uint8Array(12))].map(x => a[x % a.length]).join(''); };
  const nonce = () => Math.random().toString(36).slice(2, 10);
  function abreCanal(codigo, aoMsg, aoStatus) {
    const base = (/^https?:/.test(CFGS.url) ? CFGS.url : `https://${CFGS.url}.supabase.co`).replace(/\/+$/, '');
    const WS = base.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(CFGS.anonKey) + '&vsn=1.0.0', TOP = 'realtime:cfo-nf-' + codigo;
    let ws = null, beat = null, retry = null, tent = 0, ok = false, seq = 1, fechado = false;
    const env = (topic, event, payload = {}) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++seq), join_ref: '1' })); };
    const agenda = () => { if (fechado) return; clearTimeout(retry); retry = setTimeout(conecta, Math.min(1500 * ++tent, 15000)); };
    function conecta() {
      if (fechado || ws) return;
      try { ws = new WebSocket(WS); } catch { return agenda(); }
      const w = ws;
      w.onopen = () => {
        tent = 0;
        w.send(JSON.stringify({ topic: TOP, event: 'phx_join', ref: '1', join_ref: '1', payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false }, access_token: CFGS.anonKey } }));
        clearInterval(beat); beat = setInterval(() => env('phoenix', 'heartbeat'), 25000);
      };
      w.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.topic !== TOP) return;
        if (m.event === 'phx_reply' && m.ref === '1') { ok = !!(m.payload && m.payload.status === 'ok'); aoStatus(ok); }
        else if (m.event === 'broadcast' && m.payload && m.payload.payload) aoMsg(m.payload.event, m.payload.payload);
      };
      w.onclose = () => { if (ws !== w) return; clearInterval(beat); ws = null; ok = false; aoStatus(false); agenda(); };
      w.onerror = () => { try { w.close(); } catch {} };
    }
    conecta();
    return { enviar: (ev, p) => env(TOP, 'broadcast', { type: 'broadcast', event: ev, payload: p }), ligado: () => ok && !!ws && ws.readyState === 1,
      fechar: () => { fechado = true; clearTimeout(retry); clearInterval(beat); const w = ws; ws = null; ok = false; try { w && w.close(); } catch {} } };
  }

  // Lado do PC: recebe os comandos e fala com o agente local, sem janelas de aviso (ninguém precisa estar na frente do PC)
  let recep = null, timerPc = 0, vistos = new Set();
  async function rodaRemoto(idOuIds, simular) {
    if (!await ligado()) throw new Error('O agente não está ligado no PC. Abra o iniciar.bat.');
    if (!token()) throw new Error('Falta o token no PC. No PC, abra Automação de NF e use "Colar token".');
    const v = await versao(); if (v < VMIN) throw new Error('O agente do PC é antigo. No PC, use "Baixar agente" e troque a pasta.');
    const ids = [].concat(idOuIds).map(String), todas = CFO.store.get('requisicoes', []), rs = ids.map(i => todas.find(x => String(x.id) === i));
    const faltam = ids.filter((_, k) => !rs[k]);
    if (faltam.length) throw new Error('Não está no PC: ' + faltam.join(', ') + '. Confira se o sistema do PC sincronizou (botão ☁️).');
    const q = montar(combinar(rs)); if (!q.itens.length) throw new Error('Esta requisição não tem itens aprovados.');
    const rot = (await chamar('/roteiro')).texto || '';
    if (/^\s*(capturar lista|gerar documento)\b/mi.test(rot) && v < VCAP) throw new Error('O roteiro captura listas e gera Bloco de Notas/PDF, e o agente do PC é antigo. No PC, use "Baixar agente".');
    if (usaConf(rot) && v < VCONF) throw new Error('O roteiro tem o bloco que pergunta "está correto?" a cada item, e o agente do PC é antigo. No PC, use "Baixar agente".');
    await chamar(simular ? '/testar' : '/executar', { requisicao: q });
  }
  function ligaReceptor() {
    if (recep) { recep.fechar(); recep = null; } clearInterval(timerPc);
    const c = remCfg(); if (c.papel !== 'pc' || !c.codigoPc || !c.receptor || !CFGS.url || !CFGS.anonKey) return;
    const ret = (t, x) => recep && recep.enviar('nf-res', { t, ...x });
    recep = abreCanal(c.codigoPc, async (ev, p) => {
      if (ev !== 'nf-cmd' || !p || !p.t) return;
      if (p.t !== 'ping') { if (vistos.has(p.n)) return; vistos.add(p.n); if (vistos.size > 50) vistos = new Set([...vistos].slice(-20)); }   // o mesmo comando nunca roda duas vezes
      try {
        if (p.t === 'ping') return ret('pong', { n: p.n, agente: await ligado(), token: !!token(), versao: await versao() });
        if (p.t === 'play' || p.t === 'test') { await rodaRemoto(p.ids && p.ids.length ? p.ids : p.id, p.t === 'test'); return ret('ok', { n: p.n }); }
        if (!await ligado() || !token()) throw new Error('Agente desligado ou sem token no PC.');
        if (p.t === 'parar' || p.t === 'pausar' || p.t === 'continuar') { await chamar('/' + p.t, {}); return ret('ok', { n: p.n }); }
      } catch (e) { ret('erro', { n: p.n, msg: e.message || String(e) }); }
    }, () => {});
    let eraRod = false;
    timerPc = setInterval(async () => {                                // enquanto roda, manda o andamento para o celular
      if (!recep || !recep.ligado() || !token()) return;
      try { const s = await chamar('/estado'); if (s.rodando || eraRod) ret('estado', { rodando: !!s.rodando, pausado: !!s.pausado, log: (s.log || []).slice(-12) }); eraRod = !!s.rodando; } catch {}
    }, 2000);
  }
  ligaReceptor();                                                      // o PC escuta desde que a página abre (se o receptor estiver ligado)

  // Acompanha o andamento (log do agente)
  function acompanhar(el, parar, pausa) {
    const t = setInterval(async () => {
      if (!el.isConnected) return clearInterval(t);
      try { const s = await chamar('/estado'); el.textContent = s.log.join('\n'); el.scrollTop = el.scrollHeight; if (parar) parar.hidden = !s.rodando; if (pausa) { pausa.hidden = !s.rodando || s.pausado === undefined; pausa.dataset.p = s.pausado ? '1' : '0'; pausa.textContent = s.pausado ? '▶ Continuar' : '⏸ Pausar'; } } catch { clearInterval(t); }
    }, 700);
  }
  function tela(r) {
    CFO.open('Preenchendo ' + r.id, b => {
      b.innerHTML = '<div class="nf"><div class="nf-row" style="margin:0 0 .8rem"><button id="ps" class="ghost" hidden>⏸ Pausar</button><button id="p" class="ghost danger">⏹ Parar</button></div><p class="nf-dica" style="margin:0 0 .6rem;font-size:.85rem;opacity:.75">Aperte <b>SHIFT</b> no teclado para pausar. Aperte de novo para continuar de onde parou.</p><pre class="nf-log" id="l"></pre></div>';
      const p = b.querySelector('#p'); p.onclick = () => chamar('/parar', {}).catch(() => {});
      const ps = b.querySelector('#ps'); ps.onclick = () => chamar(ps.dataset.p === '1' ? '/continuar' : '/pausar', {}).catch(() => {});
      acompanhar(b.querySelector('#l'), p, ps);
    });
  }

  const MODELO_NF = "# ROTEIRO DA NOTA FISCAL (versao simples)\n#\n# Como ler: cada linha e uma acao. O que vem depois de # e so explicacao.\n# Onde estiver 0,0 -> troque pelo X,Y do botao/campo\n# (use o descobrir-posicao-do-mouse.bat). Se esquecer algum 0,0,\n# o teste mostra o aviso e o agente para sozinho.\n#\n# Mais comandos (fechar janela, voltar, perguntar, avisar, abrir site...):\n#   veja a lista \"Comandos que o roteiro entende\" na tela do sistema.\n# Se algum campo nao aceitar colar texto, troque \"digitar\" por \"teclar\".\n#\n# O sistema preenche sozinho estes campos:\n#   {data}  {hora}  {contrato}  {contrato_nome}  {nome} (solicitante)  {requisicao}\n#   e, dentro de \"para cada produto\": {codigo}  {produto}  {quantidade}  {tamanho}\n\nfocar janela \"TROQUE PELO TITULO DA JANELA DO EMISSOR\"\nesperar 1\n\n# ---------- ABA 1: data e destinatario ----------\nclicar em 0,0                 # campo Data\ndigitar {data}\nclicar em 0,0                 # campo Destinatario\ndigitar TROQUE PELO DESTINATARIO\n\n# ---------- ABA 2: precos ----------\nclicar em 0,0                 # aba Precos\nclicar em 0,0                 # campo que precisa preencher\ndigitar TROQUE PELO VALOR\n\n# ---------- ABA 3: produtos ----------\nclicar em 0,0                 # aba Produtos\nclicar em 0,0                 # campo NATOP\ndigitar TROQUE PELO NATOP\n\npara cada produto\n  se produto com codigo\n    # o emissor acha o produto pelo codigo\n    clicar em 0,0             # campo Codigo\n    digitar {codigo}\n    tecla enter\n    esperar 1\n    clicar em 0,0             # campo Quantidade\n    digitar {quantidade}\n    tecla enter\n  senao\n    # produto sem codigo: caminho do botao extra\n    clicar em 0,0             # botao extra\n    esperar 1\n    clicar em 0,0             # opcao que voce seleciona la\n    clicar em 0,0             # campo Nome do produto\n    digitar {produto}\n    clicar em 0,0             # campo Quantidade\n    digitar {quantidade}\n    tecla enter\n  fim se\nfim para cada\n\n# ---------- ABA 4: outras informacoes ----------\nclicar em 0,0                 # aba Outras informacoes\nclicar em 0,0                 # campo que precisa preencher\ndigitar TROQUE PELO TEXTO\n\n# ---------- ABA 5: texto padronizado ----------\nclicar em 0,0                 # aba do Texto\nclicar em 0,0                 # onde vai o numero do contrato\ndigitar {contrato} - {contrato_nome}\nclicar em 0,0                 # onde vai o solicitante\ndigitar {nome}\nclicar em 0,0                 # onde vai o numero da requisicao\ndigitar {requisicao}\n\n# Botao Finalizar: tire o # da linha de baixo SO depois de testar tudo\n# clicar em 0,0               # botao Finalizar NF\n";
  const MODELO = '# Roteiro vazio. Escreva aqui, uma instrução por linha.\n# Exemplo:\n#   focar janela "Nome da janela"\n#   clicar em 300,200\n#   digitar {contrato}\n#   para cada produto\n#     digitar {produto}\n#   fim\n';

  // ---------- Estilo próprio (o CSS do sistema deixa <b> grande e <input> largo dentro de .card; por isso não usamos .card aqui) ----------
  const css = document.createElement('style');
  css.textContent = `
  .nf{max-width:860px;margin:0 auto}
  .nf-box{background:var(--panel);border:1px solid var(--line);border-radius:var(--r,12px);padding:1rem 1.1rem;margin-bottom:1rem}
  .nf-box h3{margin:0 0 .5rem;font-size:1.05rem;font-weight:700}
  .nf-box p{margin:.3rem 0 .8rem;color:var(--muted);font-size:.9rem;line-height:1.55}
  .nf-box p b,.nf-box p i,.nf-box li b{display:inline;font-size:inherit;margin:0;font-style:normal}
  .nf-box code{background:rgba(128,128,128,.18);padding:.05rem .35rem;border-radius:5px;font-size:.85em}
  .nf-row{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.7rem}
  .nf-row button{flex:0 0 auto}
  .nf-box textarea{display:block;width:100%;min-height:42vh;font-family:ui-monospace,Consolas,monospace;font-size:13px;line-height:1.5;box-sizing:border-box}
  .nf-box input[type=search]{display:block;width:100%;box-sizing:border-box}
  .nf-st{display:flex;align-items:center;gap:.6rem;font-size:.95rem;line-height:1.4}
  .nf-st i{flex:none;width:11px;height:11px;border-radius:50%;background:#e5646b}.nf-st.ok i{background:#2ecc71}.nf-st.av i{background:#f0b429}
  .nf-req{display:flex;align-items:flex-start;gap:.75rem;padding:.7rem .8rem;margin:.45rem 0;border:1px solid var(--line);border-radius:10px;cursor:pointer}
  .nf-req.on{border-color:var(--accent);background:rgba(46,204,113,.08)}
  .nf-req input{flex:none;width:18px;height:18px;margin:.15rem 0 0;padding:0}
  .nf-req span{flex:1;min-width:0;line-height:1.45;font-size:.95rem}
  .nf-req b{display:inline;font-size:1rem;margin:0}.nf-req small{display:block;margin-top:.1rem;color:var(--muted)}
  .nf-log{margin:0;padding:1rem;background:var(--panel);border:1px solid var(--line);border-radius:10px;white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:.85rem;line-height:1.55;max-height:70vh;overflow:auto}
  .nf [hidden]{display:none!important}
  .bl-lista{display:flex;flex-direction:column;gap:.5rem;margin:.6rem 0}
  .bl-item{border:1px solid var(--line);border-radius:10px;padding:.5rem .65rem;background:var(--panel)}
  .bl-item.sel{outline:2px solid var(--accent)}
  .bl-cab{display:flex;align-items:center;gap:.3rem}
  .bl-nome{flex:1;min-width:0;font-weight:700;font-size:.9rem;line-height:1.3}
  .nf-box .bl-cab button{flex:none;width:2rem;height:2rem;min-width:0;padding:0;line-height:1;margin:0}
  .bl-campos{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.45rem}
  .nf-box .bl-campos label{display:flex;flex-direction:column;gap:.15rem;margin:0;font-size:.72rem;color:var(--muted)}
  .nf-box .bl-campos label.g{flex:1 1 11rem}
  .nf-box .bl-campos input,.nf-box .bl-campos select,.nf-box .bl-campos textarea{box-sizing:border-box;width:5.4rem;margin:0;font-size:.95rem;font-family:inherit}
  .nf-box .bl-campos label.g input,.nf-box .bl-campos label.g select,.nf-box .bl-campos label.g textarea{width:100%}
  .nf-box .bl-campos textarea{min-height:3rem}
  .bl-campos .nt{opacity:.75}
  .bl-pal{border:1px solid var(--line);border-radius:10px;padding:.2rem .7rem .7rem;margin:.6rem 0}
  .bl-gt{font-weight:700;font-size:.85rem;margin:.6rem 0 .3rem}
  .bl-chips{display:flex;flex-wrap:wrap;gap:.35rem}
  .nf-box .bl-chips button{flex:0 0 auto;margin:0;padding:.35rem .6rem;font-size:.82rem;text-align:left}
  .bl-aviso{font-size:.85rem;line-height:1.5;color:#e5a000;margin:.4rem 0}
  .bl-vazio{color:var(--muted)}
  .bl-prev summary{cursor:pointer;color:var(--muted);font-size:.9rem;margin:.4rem 0}`;
  document.head.append(css);

  // ---------- Passo a passo: editor do roteiro por blocos ----------
  // BLOCOS-PURO-INICIO
  const sa = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const num = (x, d = '0') => String(x == null ? '' : x).replace(/[^\d.,-]/g, '') || d;
  const R = (re, fn) => c => { const m = re.exec(c); return m ? fn(m) : null; };
  const SIS = [['data', 'data de hoje'], ['hora', 'hora de agora'], ['contrato', 'número do contrato'], ['contrato_nome', 'nome do contrato'], ['nome', 'solicitante'], ['requisicao', 'número da requisição'], ['mes', 'mês'], ['motivo', 'motivo'], ['produto', 'produto (dentro de "para cada produto")'], ['codigo', 'código do produto (idem)'], ['quantidade', 'quantidade (idem)'], ['tamanho', 'tamanho (idem)'], ['preco', 'preço (idem)']];
  // Dados da requisição (simples, funcionam em qualquer lugar do roteiro). Dados de produto ficam nos blocos "Itens da requisição".
  const SIS_REQ = [['data', 'Data de hoje'], ['hora', 'Hora de agora'], ['requisicao', 'Número da requisição'], ['contrato', 'Número do contrato'], ['contrato_nome', 'Nome do contrato'], ['nome', 'Nome do solicitante'], ['mes', 'Mês'], ['motivo', 'Motivo']];
  const TECLAS = ['enter', 'tab', 'esc', 'baixo', 'cima', 'esquerda', 'direita', 'espaco', 'delete', 'apagar', 'home', 'end', 'f2', 'f5'];
  const PRONTOS = ['fechar janela', 'fechar aba', 'nova aba', 'voltar', 'avancar', 'atualizar', 'selecionar tudo', 'copiar', 'colar', 'recortar', 'desfazer', 'salvar', 'imprimir'];
  const COR = { 'Mouse': '#3b82f6', 'Escrever': '#22c55e', 'Itens da requisição': '#14b8a6', 'Teclas': '#f59e0b', 'Programas e esperas': '#a855f7', 'Produtos e decisões': '#ef4444', 'Capturar para Bloco de Notas/PDF': '#0ea5e9', 'Roteiros prontos': '#ec4899', 'Mais': '#64748b' };
  const ICO = { 'Mouse': '🖱️', 'Escrever': '✍️', 'Itens da requisição': '📦', 'Teclas': '⌨️', 'Programas e esperas': '🪟', 'Produtos e decisões': '🔀', 'Capturar para Bloco de Notas/PDF': '📥', 'Roteiros prontos': '🧱', 'Mais': '⚙️' };
  const XY = [{ k: 'x', lab: 'X', tipo: 'num', def: '0' }, { k: 'y', lab: 'Y', tipo: 'num', def: '0' }];
  const OPS = [['vazio', 'está vazio'], ['nao vazio', 'não está vazio'], ['for', 'for igual a'], ['nao for', 'for diferente de'], ['contem', 'contém']];
  // Blocos "Lançar os itens": viram um "para cada produto" pronto (digita código ou nome, Enter, quantidade, Enter, e vai para o próximo item)
  const ITENS_F = (oq) => [
    { k: 'e1', lab: `Quantos Enter depois do ${oq} (até chegar na quantidade)`, tipo: 'num', def: '2', larg: 1 },
    { k: 'e2', lab: 'Quantos Enter depois da quantidade (até cadastrar o item)', tipo: 'num', def: '2', larg: 1 },
    { k: 'seg', lab: 'Esperar quantos segundos depois do 1º Enter (para o sistema da NF achar o item)', tipo: 'num', def: '1', larg: 1 }];
  const itensTexto = (modo, v) => {
    const cod = modo === 'cod' || modo === 'codl', letra = modo === 'codl', dig = letra ? 'teclar' : 'digitar', n = (x, d) => Math.max(0, Math.floor(Number(String(num(x, d)).replace(',', '.'))) || 0), e1 = n(v.e1, '2'), e2 = n(v.e2, '2'), seg = String(num(v.seg, '1')).replace(',', '.');
    const L = [`# [itens ${modo} ${e1} ${e2} ${seg}] lanca cada item da requisicao: ${cod ? 'codigo' : 'nome'} + quantidade${letra ? ' (letra por letra)' : ''}`, 'para cada produto'], i = cod ? '    ' : '  ';
    const enter = q => q > 0 ? [i + (q === 1 ? 'tecla enter' : `tecla enter ${q} vezes`)] : [];
    if (cod) L.push('  se {codigo} nao vazio');
    L.push(i + `${dig} ${cod ? '{codigo}' : '{produto}'}`);
    if (e1 > 0) { L.push(...enter(1)); if (Number(seg) > 0) L.push(i + `esperar ${seg}`); L.push(...enter(e1 - 1)); }
    L.push(i + `${dig} {quantidade}`, ...enter(e2));
    if (cod) L.push('  senao', '    avisar "Item sem codigo: {produto} (quantidade {quantidade}). Lance este item na mao e clique OK."', '  fim se');
    L.push('fim');
    return L.join('\n');
  };
  const itensLer = (c, modo) => { const m = /^@@itens\s+(codl|cod|nome)\s+(\d+)\s+(\d+)\s+([\d.,]+)$/.exec(c); return m && m[1] === modo ? { e1: m[2], e2: m[3], seg: m[4] } : null; };
  // Bloco "Lançar os itens + conferir": digita o código, 1º Enter (busca), PERGUNTA "está correto?" e só então dá os outros Enter e a quantidade.
  // Se a resposta for NÃO, o agente para, você corrige na mão e aperta a tecla escolhida: o item vale como concluído e ele segue para o próximo.
  const TECLAS_CONF = ['f8', 'f9', 'espaco', 'ctrl'];
  const itensConfTexto = v => {
    const n = (x, d) => Math.max(0, Math.floor(Number(String(num(x, d)).replace(',', '.'))) || 0), e1 = Math.max(1, n(v.e1, '2')), e2 = n(v.e2, '2'), seg = String(num(v.seg, '1')).replace(',', '.');
    const dig = v.como === 'digitar' ? 'digitar' : 'teclar', tk = TECLAS_CONF.includes(v.tecla) ? v.tecla : 'f8', cl = v.clicar === 'nao' ? 'nao' : 'sim';
    const enter = q => q > 0 ? [q === 1 ? '      tecla enter' : `      tecla enter ${q} vezes`] : [];
    const L = [`# [itens conf ${e1} ${e2} ${seg} ${dig} ${tk} ${cl}] lanca cada item: codigo, 1o Enter, PERGUNTA se esta correto e so entao segue (NAO = voce corrige na mao e aperta ${tk.toUpperCase()})`];
    if (cl === 'sim') L.push('lembrar mouse');
    L.push('para cada produto', '  se {codigo} nao vazio');
    if (cl === 'sim') L.push('    voltar mouse');
    L.push(`    ${dig} {codigo}`, '    tecla enter');
    if (Number(seg) > 0) L.push(`    esperar ${seg}`);
    L.push(`    confirmar "Item {produto} - codigo {codigo}. Esta correto?" em confere tecla ${tk}`, '    se {confere} for "sim"');
    L.push(...enter(e1 - 1), `      ${dig} {quantidade}`, ...enter(e2), '    fim se');
    L.push('  senao', '    avisar "Item sem codigo: {produto} (quantidade {quantidade}). Lance este item na mao e clique OK."', '  fim se', 'fim');
    return L.join('\n');
  };
  const itensConfLer = c => { const m = /^@@itens conf (\d+) (\d+) ([\d.,]+) (teclar|digitar) (\w+) (sim|nao)$/.exec(c); return m ? { e1: m[1], e2: m[2], seg: m[3], como: m[4], tecla: m[5], clicar: m[6] } : null; };
  // ----- Roteiro pronto = 1 bloco. Na hora de salvar vira texto comum (o agente não muda e não sabe de blocos): o texto do modelo é copiado entre duas linhas de marcação "# [roteiro ...]" / "# [/roteiro]", que o agente ignora (comentário). -----
  const modelosNf = () => { try { return CFO.store.get('modelos_nf', []) || []; } catch { return []; } };
  const acharModelo = id => id === 'padrao' ? { id: 'padrao', nome: 'Modelo da NF (padrão)', texto: MODELO_NF } : modelosNf().find(m => m.id === id);
  const opsDe = f => typeof f.op === 'function' ? f.op() : f.op;
  const RE_MARCA = /^[ \t]*# \[\/?roteiro[ \]][^\n]*\n?/gm;
  const achata = t => String(t || '').replace(RE_MARCA, '').replace(/\s+$/, '');          // roteiro dentro de roteiro: tira as marcações, sobra só o texto (sem aninhar)
  let _regs = [];
  const saldo = t => { let d = 0, neg = false; achata(t).split(/\r?\n/).forEach(l => { const c = l.split('#')[0].trim(); if (/^(?:repetir\s+)?para cada\b|^repetir\s+\d+|^se\s/i.test(c)) d++; else if (/^fim\b/i.test(c)) { d--; if (d < 0) { neg = true; d = 0; } } }); return { d, neg }; };
  const roteiroOut = v => {
    const m = acharModelo(v.modelo), nome = String(m ? m.nome : (v.nomeSalvo || 'roteiro')).replace(/[\r\n]+/g, ' ');
    const corpo = achata(m ? m.texto : v.corpo);
    return `# [roteiro ${String(v.modelo || 'x').replace(/[^\w-]/g, '')}] ${nome}\n${corpo}\n# [/roteiro]`;
  };
  const B = [
    { id: 'clicar', g: 'Mouse', nome: 'Clicar', f: XY, out: v => `clicar em ${num(v.x)},${num(v.y)}`, ler: R(/^clicar\s+(?:em|na|no)\s+(-?\d+)\s*[, ]\s*(-?\d+)$/i, m => ({ x: m[1], y: m[2] })) },
    { id: 'duplo', g: 'Mouse', nome: 'Duplo clique', f: XY, out: v => `duplo clique em ${num(v.x)},${num(v.y)}`, ler: R(/^(?:duplo clique|clique duplo)\s+(?:em|na|no)\s+(-?\d+)\s*[, ]\s*(-?\d+)$/i, m => ({ x: m[1], y: m[2] })) },
    { id: 'direito', g: 'Mouse', nome: 'Clique direito', f: XY, out: v => `clique direito em ${num(v.x)},${num(v.y)}`, ler: R(/^clique direito\s+(?:em|na|no)\s+(-?\d+)\s*[, ]\s*(-?\d+)$/i, m => ({ x: m[1], y: m[2] })) },
    { id: 'mover', g: 'Mouse', nome: 'Mover o mouse (sem clicar)', f: XY, out: v => `mover mouse para ${num(v.x)},${num(v.y)}`, ler: R(/^mover(?:\s+(?:o\s+)?mouse)?\s+(?:para|em)\s+(-?\d+)\s*[, ]\s*(-?\d+)$/i, m => ({ x: m[1], y: m[2] })) },
    { id: 'rolar', g: 'Mouse', nome: 'Rolar a tela', f: [{ k: 'n', lab: 'Quantas vezes', tipo: 'num', def: '3' }, { k: 'dir', lab: 'Para', tipo: 'sel', op: ['baixo', 'cima'], def: 'baixo' }], out: v => `rolar ${num(v.n, '1')} para ${v.dir || 'baixo'}`, ler: R(/^rolar\s+(\d+)(?:\s+vezes)?\s+(?:para\s+)?(baixo|cima)$/i, m => ({ n: m[1], dir: m[2].toLowerCase() })) },

    { id: 'campo', g: 'Escrever', nome: 'Escrever um dado da requisição (data, contrato, solicitante...)', prio: 1, f: [{ k: 'campo', lab: 'Qual dado', tipo: 'sel', op: SIS_REQ, def: 'data', larg: 1 }], out: v => `digitar {${v.campo || 'data'}}`, ler: R(/^digitar\s+\{([^{}]+)\}$/i, m => SIS.some(s => s[0] === m[1].trim().toLowerCase()) ? { campo: m[1].trim().toLowerCase() } : null) },
    { id: 'texto', g: 'Escrever', nome: 'Escrever um texto', f: [{ k: 'texto', lab: 'Texto (pode misturar {campos})', tipo: 'txt', larg: 1, ph: 'o que digitar' }], out: v => v.texto ? `digitar ${v.texto}` : 'digitar ""', ler: R(/^(?:digitar|escrever|colar)\s+(.*)$/i, m => ({ texto: m[1] === '""' ? '' : m[1] })) },
    { id: 'teclar', g: 'Escrever', nome: 'Escrever letra por letra', prio: 1, f: [{ k: 'texto', lab: 'Texto (campo que não aceita colar)', tipo: 'txt', larg: 1 }], out: v => `teclar ${v.texto || ''}`.trim(), ler: R(/^(?:teclar|digitar devagar|escrever devagar)\s+(.*)$/i, m => ({ texto: m[1] })) },

    { id: 'tecla', g: 'Teclas', nome: 'Apertar uma tecla', f: [{ k: 'tecla', lab: 'Tecla', tipo: 'lista', def: 'enter' }, { k: 'vezes', lab: 'Vezes', tipo: 'num', def: '1' }], out: v => `tecla ${v.tecla || 'enter'}` + (Number(num(v.vezes, '1')) > 1 ? ` ${num(v.vezes, '1')} vezes` : ''), ler: R(/^(?:tecla|apertar|pressionar)\s+(\S+)(?:\s+(\d+)\s*(?:vezes|x))?$/i, m => ({ tecla: m[1].toLowerCase(), vezes: m[2] || '1' })) },
    { id: 'atalho', g: 'Teclas', nome: 'Atalho (ctrl+...)', f: [{ k: 'atalho', lab: 'Atalho', tipo: 'txt', def: 'ctrl+s', larg: 1 }], out: v => `atalho ${v.atalho || 'ctrl+s'}`, ler: R(/^atalho\s+(.+)$/i, m => ({ atalho: m[1] })) },
    { id: 'pronto', g: 'Teclas', nome: 'Ação pronta (fechar, voltar, copiar...)', prio: 1, f: [{ k: 'acao', lab: 'Ação', tipo: 'sel', op: PRONTOS, def: 'voltar', larg: 1 }], out: v => v.acao || 'voltar', ler: c => PRONTOS.includes(sa(c)) ? { acao: sa(c) } : null },

    { id: 'abrir', g: 'Programas e esperas', nome: 'Abrir programa ou arquivo', f: [{ k: 'alvo', lab: 'Caminho', tipo: 'txt', larg: 1, ph: 'C:/pasta/programa.exe' }], out: v => `abrir "${v.alvo || ''}"`, ler: R(/^abrir(?:\s+(?:programa|pasta|arquivo))?\s+"(.+)"$/i, m => ({ alvo: m[1] })) },
    { id: 'site', g: 'Programas e esperas', nome: 'Abrir site', f: [{ k: 'url', lab: 'Endereço', tipo: 'txt', larg: 1, ph: 'https://...' }], out: v => `abrir site "${v.url || ''}"`, ler: R(/^abrir\s+(?:site|p.gina)\s+"(.+)"$/i, m => ({ url: m[1] })) },
    { id: 'focar', g: 'Programas e esperas', nome: 'Focar janela (trazer para frente)', f: [{ k: 'titulo', lab: 'Título da janela (ou parte dele)', tipo: 'txt', larg: 1 }], out: v => `focar janela "${v.titulo || ''}"`, ler: R(/^(?:focar|ativar)(?:\s+janela)?\s+"(.+)"$/i, m => ({ titulo: m[1] })) },
    { id: 'esperarJan', g: 'Programas e esperas', nome: 'Esperar uma janela aparecer', f: [{ k: 'titulo', lab: 'Título da janela (ou parte dele)', tipo: 'txt', larg: 1 }], out: v => `esperar janela "${v.titulo || ''}"`, ler: R(/^(?:esperar|aguardar)\s+janela\s+"(.+)"$/i, m => ({ titulo: m[1] })) },
    { id: 'esperar', g: 'Programas e esperas', nome: 'Esperar', f: [{ k: 'seg', lab: 'Segundos', tipo: 'num', def: '1' }], out: v => `esperar ${num(v.seg, '1')}`, ler: R(/^(?:esperar|aguardar)\s+([\d.,]+)(?:\s+segundos?)?$/i, m => ({ seg: m[1] })) },

    { id: 'itensCod', g: 'Itens da requisição', nome: 'Lançar os itens: CÓDIGO + quantidade (um item por vez)', prio: 1, multi: 1, f: ITENS_F('código'), out: v => itensTexto('cod', v), ler: c => itensLer(c, 'cod') },
    { id: 'itensCodLetra', g: 'Itens da requisição', nome: 'Lançar os itens: CÓDIGO + quantidade, LETRA POR LETRA (um item por vez)', prio: 1, multi: 1, f: ITENS_F('código'), out: v => itensTexto('codl', v), ler: c => itensLer(c, 'codl') },
    { id: 'itensCodConf', g: 'Itens da requisição', nome: 'Lançar os itens: CÓDIGO + conferir "está correto?" antes do 2º Enter', prio: 1, multi: 1, f: [
      { k: 'e1', lab: 'Quantos Enter depois do código (o 1º busca o item; o agente pergunta antes dos outros)', tipo: 'num', def: '2', larg: 1 },
      { k: 'e2', lab: 'Quantos Enter depois da quantidade (até cadastrar o item)', tipo: 'num', def: '2', larg: 1 },
      { k: 'seg', lab: 'Esperar quantos segundos depois do 1º Enter (para o sistema da NF achar o item)', tipo: 'num', def: '1', larg: 1 },
      { k: 'como', lab: 'Como escrever o código', tipo: 'sel', op: [['teclar', 'Número por número (tecla por tecla)'], ['digitar', 'Colar de uma vez']], def: 'teclar', larg: 1 },
      { k: 'tecla', lab: 'Tecla para continuar depois que você corrigir na mão (se responder NÃO)', tipo: 'sel', op: [['f8', 'F8 (recomendado)'], ['f9', 'F9'], ['espaco', 'Espaço (cuidado: pode digitar um espaço no campo)'], ['ctrl', 'Ctrl']], def: 'f8', larg: 1 },
      { k: 'clicar', lab: 'Antes de cada item, clicar onde o mouse estava no começo (o campo do código)', tipo: 'sel', op: [['sim', 'Sim (deixe o mouse em cima do campo do código ao iniciar)'], ['nao', 'Não clicar']], def: 'sim', larg: 1 }],
      out: v => itensConfTexto(v), ler: c => itensConfLer(c) },
    { id: 'itensNome', g: 'Itens da requisição', nome: 'Lançar os itens: NOME + quantidade (um item por vez)', prio: 1, multi: 1, f: ITENS_F('nome'), out: v => itensTexto('nome', v), ler: c => itensLer(c, 'nome') },

    { id: 'cada', g: 'Produtos e decisões', nome: 'Para cada produto (repete até o Fim)', abre: 1, f: [], out: () => 'para cada produto', ler: R(/^(?:repetir\s+)?para cada\s+(?:produto|item)$/i, () => ({})) },
    { id: 'repetir', g: 'Produtos e decisões', nome: 'Repetir (até o Fim)', abre: 1, f: [{ k: 'n', lab: 'Quantas vezes', tipo: 'num', def: '3' }], out: v => `repetir ${num(v.n, '1')} vezes`, ler: R(/^repetir\s+(\d+)(?:\s+vezes?)?$/i, m => ({ n: m[1] })) },
    { id: 'seCod', g: 'Produtos e decisões', nome: 'Se o produto tem / não tem código', abre: 1, f: [{ k: 'q', lab: 'O produto', tipo: 'sel', op: [['com', 'TEM código'], ['sem', 'NÃO tem código']], def: 'com', larg: 1 }], out: v => `se produto ${v.q || 'com'} codigo`, ler: R(/^se\s+(?:produto|item)\s+(sem|com)\s+c.digo$/i, m => ({ q: m[1].toLowerCase() })) },
    { id: 'seCampo', g: 'Produtos e decisões', nome: 'Se um dado da requisição...', abre: 1, f: [{ k: 'campo', lab: 'Dado', tipo: 'sel', op: SIS_REQ, def: 'requisicao', larg: 1 }, { k: 'op', lab: 'Condição', tipo: 'sel', op: OPS, def: 'vazio', larg: 1 }, { k: 'valor', lab: 'Valor (só para igual/diferente/contém)', tipo: 'txt', larg: 1 }], out: v => { const c = v.campo || 'requisicao', op = v.op || 'vazio'; return (op === 'vazio' || op === 'nao vazio') ? `se {${c}} ${op}` : `se {${c}} ${op} "${v.valor || ''}"`; }, ler: c => { const m = /^se\s+\{([^{}]+)\}\s+(.+)$/i.exec(c); if (!m) return null; const campo = m[1].trim().toLowerCase(), r = m[2].trim(); let x; if (/^(vazio|em branco)$/i.test(r)) return { campo, op: 'vazio', valor: '' }; if (/^(n[aã]o vazio|preenchido|tem valor)$/i.test(r)) return { campo, op: 'nao vazio', valor: '' }; if ((x = /^(?:n[aã]o for|diferente de)\s+"?(.*?)"?$/i.exec(r))) return { campo, op: 'nao for', valor: x[1] }; if ((x = /^(?:for|e|igual a|igual|=)\s+"?(.*?)"?$/i.exec(r))) return { campo, op: 'for', valor: x[1] }; if ((x = /^(?:cont[eé]m|tem)\s+"?(.*?)"?$/i.exec(r))) return { campo, op: 'contem', valor: x[1] }; return null; } },
    { id: 'senao', g: 'Produtos e decisões', nome: 'Senão (outro caminho do Se)', meio: 1, f: [], out: () => 'senao', ler: R(/^(?:sen.o|caso contr.rio)$/i, () => ({})) },
    { id: 'fim', g: 'Produtos e decisões', nome: 'Fim (fecha o bloco acima)', fecha: 1, f: [], out: () => 'fim', ler: R(/^fim(?:\s+(?:para cada|repetir|se))?$/i, () => ({})) },

    { id: 'capLista', g: 'Capturar para Bloco de Notas/PDF', nome: 'Capturar uma lista de outra tela (do início ao fim)', prio: 1, f: [
      { k: 'nome', lab: 'Nome da lista (vira o título dela no documento)', tipo: 'txt', larg: 1, ph: 'Itens da nota' },
      { k: 'x1', lab: 'Início X', tipo: 'num', def: '0' }, { k: 'y1', lab: 'Início Y', tipo: 'num', def: '0' },
      { k: 'x2', lab: 'Fim X', tipo: 'num', def: '0' }, { k: 'y2', lab: 'Fim Y', tipo: 'num', def: '0' },
      { k: 'rolar', lab: 'Rolar a tela antes do fim (vezes; para lista maior que a tela)', tipo: 'num', def: '0' },
      { k: 'modo', lab: 'Como selecionar', tipo: 'sel', op: [['clicar', 'Clicar no início e Shift+clique no fim'], ['arrastar', 'Arrastar do início ao fim (sem rolagem)']], def: 'clicar', larg: 1 }],
      out: v => 'capturar lista "' + String(v.nome || 'Lista').replace(/"/g, "'") + '" de ' + num(v.x1) + ',' + num(v.y1) + ' ate ' + num(v.x2) + ',' + num(v.y2) + (v.modo === 'arrastar' ? ' arrastar' : (Number(num(v.rolar)) > 0 ? ' rolar ' + num(v.rolar) : '')),
      ler: R(/^capturar\s+lista\s+"([^"]*)"\s+de\s+(-?\d+)\s*[, ]\s*(-?\d+)\s+at[eé]\s+(-?\d+)\s*[, ]\s*(-?\d+)(?:\s+(arrastar)|\s+rolar\s+(\d+))?$/i, m => ({ nome: m[1], x1: m[2], y1: m[3], x2: m[4], y2: m[5], rolar: m[7] || '0', modo: m[6] ? 'arrastar' : 'clicar' })) },
    { id: 'genDoc', g: 'Capturar para Bloco de Notas/PDF', nome: 'Gerar o documento (Bloco de Notas e/ou PDF) com as listas capturadas', prio: 1, f: [
      { k: 'titulo', lab: 'Título do documento', tipo: 'txt', larg: 1, ph: 'Relatório da requisição {requisicao}' },
      { k: 'arquivo', lab: 'Onde salvar (pasta e nome, sem extensão; vazio = pasta "documentos" do agente)', tipo: 'txt', larg: 1, ph: 'C:/Notas/{requisicao}' },
      { k: 'formato', lab: 'Arquivos gerados', tipo: 'sel', op: [['txt+pdf', 'Bloco de Notas (.txt) e PDF'], ['txt', 'Só Bloco de Notas (.txt)'], ['pdf', 'Só PDF']], def: 'txt+pdf', larg: 1 },
      { k: 'como', lab: 'Como mostrar a lista', tipo: 'sel', op: [['tabela', 'Colunas alinhadas'], ['texto', 'Texto (células separadas por |)']], def: 'tabela', larg: 1 }],
      out: v => 'gerar documento "' + String(v.titulo || 'Documento').replace(/"/g, "'") + '" em "' + String(v.arquivo || '').replace(/"/g, "'") + '" formato ' + (v.formato || 'txt+pdf') + ' como ' + (v.como || 'tabela'),
      ler: R(/^gerar\s+documento\s+"([^"]*)"\s+em\s+"([^"]*)"\s+formato\s+(txt\+pdf|txt|pdf)\s+como\s+(tabela|texto)$/i, m => ({ titulo: m[1], arquivo: m[2], formato: m[3].toLowerCase(), como: m[4].toLowerCase() })) },

    { id: 'roteiroPronto', g: 'Roteiros prontos', nome: 'Usar um roteiro salvo (vira um bloco só)', prio: 1, multi: 1, f: [{ k: 'modelo', lab: 'Qual roteiro', tipo: 'sel', op: () => [['padrao', '📄 Modelo da NF (padrão)'], ...modelosNf().map(m => [m.id, '🧱 ' + m.nome])], def: 'padrao', larg: 1 }],
      out: roteiroOut, ler: c => { const m = /^@@roteiro (\d+)$/.exec(c); const r = m && _regs[+m[1]]; return r ? { modelo: r.id, nomeSalvo: r.nome, corpo: r.corpo } : null; } },
    { id: 'definir', g: 'Mais', nome: 'Criar um dado meu', f: [{ k: 'nome', lab: 'Nome do dado', tipo: 'txt', ph: 'numero' }, { k: 'valor', lab: 'Valor', tipo: 'txt', larg: 1 }], out: v => `definir ${v.nome || 'dado'} = ${v.valor || ''}`.trim(), ler: R(/^definir\s+\{?([^\s={}]+)\}?\s*=\s*(.*)$/i, m => ({ nome: m[1], valor: m[2] })) },
    { id: 'perguntar', g: 'Mais', nome: 'Perguntar na hora (abre uma caixinha)', f: [{ k: 'pergunta', lab: 'Pergunta', tipo: 'txt', larg: 1, ph: 'Qual o número?' }, { k: 'nome', lab: 'Guardar em (nome)', tipo: 'txt', ph: 'numero' }], out: v => `perguntar "${v.pergunta || ''}" em ${v.nome || 'resposta'}`, ler: R(/^(?:perguntar|pedir)\s+"(.+)"\s+(?:em|como|para)\s+\{?([^\s{}]+)\}?$/i, m => ({ pergunta: m[1], nome: m[2] })) },
    { id: 'avisar', g: 'Mais', nome: 'Avisar e esperar você clicar OK', f: [{ k: 'msg', lab: 'Mensagem', tipo: 'txt', larg: 1 }], out: v => v.msg ? `avisar "${v.msg}"` : 'avisar', ler: R(/^(?:avisar|mensagem|pausar)(?:\s+"(.*)")?$/i, m => ({ msg: m[1] || '' })) },
    { id: 'ignorar', g: 'Mais', nome: 'Ignorar erros daqui para frente', f: [], out: () => 'ignorar erros', ler: R(/^(?:ignorar erros?|continuar se der erro)$/i, () => ({})) },
    { id: 'parar', g: 'Mais', nome: 'Parar o roteiro aqui', f: [], out: () => 'parar', ler: R(/^(?:parar|sair|terminar|encerrar)$/i, () => ({})) },
    { id: 'nota', g: 'Mais', nome: 'Anotação (só para você ler)', f: [{ k: 'texto', lab: 'Anotação', tipo: 'area', larg: 1 }], out: v => v.texto || '' },
    { id: 'livre', g: 'Mais', nome: 'Linha livre (qualquer comando)', f: [{ k: 'cmd', lab: 'Comando', tipo: 'txt', larg: 1 }], out: v => v.cmd || '' }
  ];
  const DEF = Object.fromEntries(B.map(d => [d.id, d]));
  const ORDEM = [...B.filter(d => d.prio && d.ler), ...B.filter(d => !d.prio && d.ler)];
  // nível de recuo de cada bloco (Para cada / Se / Repetir abrem; Senão e Fim voltam um nível)
  const profund = bl => { let d = 0; return bl.map(b => { const df = DEF[b.t]; if (df.fecha) d = Math.max(0, d - 1); const mostra = df.meio ? Math.max(0, d - 1) : d; if (df.abre) d++; return mostra; }); };
  const blocosParaTexto = bl => {
    const pf = profund(bl), out = [];
    bl.forEach((b, i) => {
      const ind = '  '.repeat(pf[i]);
      if (b.t === 'nota') { if (i > 0 && bl[i - 1].t !== 'nota' && pf[i] === 0) out.push(''); String(b.v.texto || '').split('\n').forEach(l => out.push((ind + '# ' + l).trimEnd())); }
      else if (DEF[b.t].multi) DEF[b.t].out(b.v).split('\n').forEach(l => out.push(ind + l));
      else out.push(ind + DEF[b.t].out(b.v) + (b.nota ? '   # ' + b.nota : ''));
    });
    return out.join('\n') + '\n';
  };
  const blocosDeTexto = txt => {
    const r = []; let nota = null;
    const fecha = () => { if (nota) { r.push({ t: 'nota', v: { texto: nota.join('\n') }, nota: '' }); nota = null; } };
    _regs = [];
    String(txt || '').replace(/^[ \t]*# \[roteiro ([\w-]+)\][ \t]*([^\n]*)\n([\s\S]*?)^[ \t]*# \[\/roteiro\][ \t]*\r?$/gm, (_, id, nome, corpo) => '@@roteiro ' + (_regs.push({ id, nome: nome.trim(), corpo: corpo.replace(/\s+$/, '') }) - 1)).replace(/^[ \t]*#[ \t]*\[itens (codl|cod|nome) (\d+) (\d+) ([\d.,]+)\][^\n]*\n[\s\S]*?^[ \t]*fim[ \t]*\r?$/gm, '@@itens $1 $2 $3 $4').replace(/^[ \t]*#[ \t]*\[itens conf (\d+) (\d+) ([\d.,]+) (teclar|digitar) (\w+) (sim|nao)\][^\n]*\n[\s\S]*?^[ \t]*fim[ \t]*\r?$/gm, '@@itens conf $1 $2 $3 $4 $5 $6').split(/\r?\n/).forEach(raw => {
      const s = raw.trim();
      if (!s) { fecha(); return; }
      if (s[0] === '#') { (nota = nota || []).push(s.replace(/^#\s?/, '')); return; }
      fecha();
      const ix = s.indexOf('#'), cod = (ix < 0 ? s : s.slice(0, ix)).trim(), nt = ix < 0 ? '' : s.slice(ix + 1).trim();
      let achou = null;
      for (const d of ORDEM) { const v = d.ler(cod); if (v) { achou = { t: d.id, v, nota: nt }; break; } }
      r.push(achou || { t: 'livre', v: { cmd: cod }, nota: nt });
    });
    fecha(); return r;
  };
  // BLOCOS-PURO-FIM


  // Editor na tela: lista de blocos (cada um com os campos para preencher), paleta para adicionar, aviso e prévia em texto
  function criaBlocos(raiz) {
    let bl = [], sel = -1;
    const E = x => esc(String(x == null ? '' : x));
    const paletaHtml = () => Object.keys(COR).map(g => {
      const chips = g === 'Roteiros prontos'
        ? [{ id: 'padrao', nome: 'Modelo da NF (padrão)' }, ...modelosNf()].map(m => `<button class="ghost" data-add="roteiroPronto" data-modelo="${E(m.id)}" style="border-color:${COR[g]}">${g === 'Roteiros prontos' ? '🧱 ' : ''}${E(m.nome)}</button>`).join('')
        : B.filter(d => d.g === g).map(d => `<button class="ghost" data-add="${d.id}" style="border-color:${COR[g]}">${E(d.nome)}</button>`).join('');
      return `<div class="bl-gt" style="color:${COR[g]}">${ICO[g]} ${g}</div><div class="bl-chips">${chips}</div>`;
    }).join('');
    raiz.innerHTML = `<datalist id="bl-teclas">${TECLAS.map(t => `<option value="${t}">`).join('')}</datalist>
      <div class="nf-row" style="margin-top:0"><button class="bl-add">＋ Adicionar passo</button><button class="ghost danger bl-limpar">🗑 Limpar tudo</button></div>
      <div class="bl-pal" hidden>${paletaHtml()}</div>
      <div class="bl-aviso"></div>
      <div class="bl-lista"></div>
      <div class="nf-row"><button class="bl-add">＋ Adicionar passo</button></div>
      <details class="bl-prev"><summary>Ver o roteiro em texto</summary><pre class="nf-log"></pre></details>`;
    const $q = s => raiz.querySelector(s), lista = $q('.bl-lista'), pal = $q('.bl-pal'), avisoEl = $q('.bl-aviso'), prev = $q('.bl-prev pre');

    const campoHtml = (b, i, f) => {
      const val = b.v[f.k] == null ? (f.def == null ? '' : f.def) : b.v[f.k], at = `data-i="${i}" data-k="${f.k}"`; let el;
      if (f.tipo === 'sel') {
        const ops = opsDe(f).map(o => Array.isArray(o) ? o : [o, o]);
        if (!ops.some(o => String(o[0]) === String(val))) ops.push([val, b.v.nomeSalvo ? '(apagado) ' + b.v.nomeSalvo : val]);
        el = `<select ${at}>${ops.map(o => `<option value="${E(o[0])}"${String(o[0]) === String(val) ? ' selected' : ''}>${E(o[1])}</option>`).join('')}</select>`;
      } else if (f.tipo === 'area') el = `<textarea ${at} rows="${Math.min(6, Math.max(2, String(val).split('\n').length))}" spellcheck="false">${E(val)}</textarea>`;
      else el = `<input type="text" ${at} value="${E(val)}"${f.tipo === 'lista' ? ' list="bl-teclas"' : ''}${f.tipo === 'num' ? ' inputmode="numeric"' : ''}${f.ph ? ` placeholder="${E(f.ph)}"` : ''} autocomplete="off" autocapitalize="off" spellcheck="false">`;
      return `<label${f.larg ? ' class="g"' : ''}><span>${E(f.lab)}</span>${el}</label>`;
    };
    const avisos = () => {
      let d = 0, neg = false, pend = 0;
      bl.forEach(b => { const df = DEF[b.t]; if (df.fecha) { d--; if (d < 0) { neg = true; d = 0; } } if (df.abre) d++; if (['clicar', 'duplo', 'direito', 'mover'].includes(b.t) && Number(num(b.v.x)) <= 2 && Number(num(b.v.y)) <= 2) pend++; if (b.t === 'capLista' && ((Number(num(b.v.x1)) <= 2 && Number(num(b.v.y1)) <= 2) || (Number(num(b.v.x2)) <= 2 && Number(num(b.v.y2)) <= 2))) pend++; });
      const m = [];
      if (pend) m.push(`⚠️ ${pend} passo(s) do mouse ainda em 0,0. Troque pelo X,Y.`);
      if (d > 0) m.push('⚠️ Falta um "Fim" para fechar um bloco.');
      if (neg) m.push('⚠️ Tem um "Fim" sobrando.');
      bl.filter(b => b.t === 'roteiroPronto').forEach(b => { const mo = acharModelo(b.v.modelo), sd = saldo(mo ? mo.texto : b.v.corpo); if (!mo) m.push(`⚠️ O roteiro salvo "${E(b.v.nomeSalvo || '')}" não existe mais: vale a cópia que já está no roteiro.`); if (sd.d > 0 || sd.neg) m.push(`⚠️ O roteiro "${E(mo ? mo.nome : b.v.nomeSalvo)}" ${sd.d > 0 ? 'deixa um bloco aberto (falta Fim)' : 'tem um Fim sobrando'}: confira antes de usar.`); });
      const iCap = bl.findIndex(b => b.t === 'capLista'), iDoc = bl.findIndex(b => b.t === 'genDoc');
      if (iDoc >= 0 && (iCap < 0 || iCap > iDoc)) m.push('⚠️ "Gerar o documento" precisa de pelo menos uma "Capturar uma lista" ANTES dele.');
      if (iCap >= 0 && iDoc < 0) m.push('⚠️ As listas capturadas só vão para o Bloco de Notas/PDF se o roteiro tiver o passo "Gerar o documento" no fim.');
      if (iCap >= 0 || iDoc >= 0) m.push('ℹ️ Capturar e gerar documento exigem o agente versão 6 (não precisa de Word) (use "Baixar agente" se precisar).');
      avisoEl.innerHTML = m.join('<br>');
    };
    const mudou = () => { avisos(); prev.textContent = blocosParaTexto(bl); };
    const desenha = foco => {
      const pf = profund(bl);
      lista.innerHTML = bl.map((b, i) => {
        const d = DEF[b.t];
        return `<div class="bl-item${i === sel ? ' sel' : ''}" data-i="${i}" style="margin-left:${pf[i] * 14}px;border-left:4px solid ${COR[d.g]}">
          <div class="bl-cab"><span class="bl-nome">${ICO[d.g]} ${E(d.nome)}</span>
            <button class="ghost" data-act="up" data-i="${i}" title="Subir">↑</button><button class="ghost" data-act="down" data-i="${i}" title="Descer">↓</button><button class="ghost" data-act="dup" data-i="${i}" title="Copiar">⧉</button><button class="ghost danger" data-act="del" data-i="${i}" title="Apagar">✕</button></div>
          ${(d.f.length || (b.t !== 'nota' && !d.fecha && !d.meio)) ? `<div class="bl-campos">${d.f.map(f => campoHtml(b, i, f)).join('')}${(b.t === 'nota' || d.fecha || d.meio) ? '' : `<label class="g nt"><span>anotação (opcional)</span><input type="text" data-i="${i}" data-k="__nota" value="${E(b.nota)}" autocomplete="off" spellcheck="false"></label>`}</div>` : ''}
        </div>`;
      }).join('') || '<p class="bl-vazio">Nenhum passo ainda. Toque em "＋ Adicionar passo" e escolha o que o robô deve fazer, na ordem.</p>';
      mudou();
      if (foco != null) { const it = lista.querySelector(`.bl-item[data-i="${foco}"]`); if (it) { it.scrollIntoView({ block: 'center', behavior: 'smooth' }); const inp = it.querySelector('input,select,textarea'); if (inp) { inp.focus({ preventScroll: true }); if (typeof inp.select === 'function' && inp.tagName === 'INPUT') inp.select(); } } }
    };
    const novo = id => { const v = {}; DEF[id].f.forEach(f => { v[f.k] = f.def != null ? f.def : (f.op ? (() => { const o = opsDe(f); return Array.isArray(o[0]) ? o[0][0] : o[0]; })() : ''); }); return { t: id, v, nota: '' }; };
    const adiciona = (id, modelo) => {
      const pos = sel >= 0 && sel < bl.length ? sel + 1 : bl.length, novos = [novo(id)];
      if (modelo) novos[0].v.modelo = modelo;
      if (DEF[id].abre) novos.push(novo('fim'));          // já fecha o bloco: os passos de dentro entram entre os dois
      bl.splice(pos, 0, ...novos); sel = pos; pal.hidden = true; desenha(pos);
    };

    raiz.querySelectorAll('.bl-add').forEach(b => b.onclick = () => { pal.innerHTML = paletaHtml(); b.parentElement.after(pal); pal.hidden = !pal.hidden; });
    $q('.bl-limpar').onclick = () => { if (bl.length && !confirm('Apagar todos os passos da tela?')) return; bl = []; sel = -1; desenha(); };
    pal.addEventListener('click', e => { const a = e.target.closest('[data-add]'); if (a) adiciona(a.dataset.add, a.dataset.modelo); });
    lista.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const i = +a.dataset.i, act = a.dataset.act;
      if (act === 'del') { bl.splice(i, 1); sel = Math.min(i, bl.length) - 1; desenha(); }
      else if (act === 'dup') { bl.splice(i + 1, 0, JSON.parse(JSON.stringify(bl[i]))); sel = i + 1; desenha(i + 1); }
      else { const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= bl.length) return; [bl[i], bl[j]] = [bl[j], bl[i]]; sel = j; desenha(); const it = lista.querySelector(`.bl-item[data-i="${j}"]`); if (it) it.scrollIntoView({ block: 'nearest' }); }
    });
    lista.addEventListener('input', e => { const t = e.target, k = t.dataset && t.dataset.k; if (k == null) return; const b = bl[+t.dataset.i]; if (!b) return; if (k === '__nota') b.nota = t.value; else b.v[k] = t.value; mudou(); });
    lista.addEventListener('focusin', e => { const it = e.target.closest('.bl-item'); if (!it) return; sel = +it.dataset.i; lista.querySelectorAll('.bl-item.sel').forEach(x => x.classList.remove('sel')); it.classList.add('sel'); });
    desenha();
    return { deTexto: t => { bl = blocosDeTexto(t); sel = -1; desenha(); }, paraTexto: () => blocosParaTexto(bl) };
  }

  let canalCel = null, timerRem = 0;                           // canal do celular (um só; fecha ao sair da tela)

  // ---------- Tela da gaveta Ferramentas ----------
  CFO.modules.autonf = Object.assign(body => {
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const mesKey = s => { const m = CFO.norm(s).match(/^([a-z]+)(\d{4})$/), i = m ? MESES.indexOf(m[1]) : -1; return i >= 0 ? m[2] + String(i + 1).padStart(2, '0') : '000000'; };
    const reqs = () => CFO.store.get('requisicoes', []).slice().sort((a, b) => mesKey(b.mes).localeCompare(mesKey(a.mes)) || String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    let selIds = [];                                          // requisições marcadas, na ordem em que foram marcadas
    body.innerHTML = `<div class="nf">
      <div class="nf-box"><h3>1) Agente no computador</h3>
        <div class="nf-st" id="st"><i></i><span>Verificando...</span></div>
        <div class="nf-row"><button id="ver" class="ghost">Verificar de novo</button><button id="tk" class="ghost">Colar token</button><button id="bx" class="ghost">⬇️ Baixar agente</button><button id="zr" class="ghost danger">🗑 Zerar</button></div></div>
      <div class="nf-box"><h3>2) Roteiro</h3>
        <p>Escreva uma instrução por linha. Para repetir por produto, use <b>para cada produto</b> ... <b>fim</b>.</p>
        <p>Campos: <code>{data}</code> <code>{hora}</code> <code>{contrato}</code> <code>{contrato_nome}</code> <code>{nome}</code> <code>{requisicao}</code> <code>{mes}</code> <code>{motivo}</code>. Os dados do produto (<code>{produto}</code> <code>{codigo}</code> <code>{quantidade}</code> <code>{tamanho}</code>) só existem dentro de <b>para cada produto</b> — no modo blocos, use <b>📦 Lançar os itens</b>, que já faz isso.</p>
        <details style="margin:.3rem 0 .8rem"><summary style="cursor:pointer;font-weight:600">📖 Comandos que o roteiro entende</summary>
          <p><b>Mouse:</b> <code>clicar em X,Y</code> <code>duplo clique em X,Y</code> <code>clique direito em X,Y</code> <code>mover mouse para X,Y</code> <code>rolar 3 para baixo</code></p>
          <p><b>Escrever:</b> <code>digitar qualquer texto e {campos}</code> (cola o texto) · <code>teclar texto</code> (letra por letra, para campo que não aceita colar)</p>
          <p><b>Teclas:</b> <code>tecla enter</code> <code>tecla tab 3 vezes</code> <code>atalho ctrl+s</code> · prontos: <code>fechar janela</code> <code>fechar aba</code> <code>nova aba</code> <code>voltar</code> <code>avancar</code> <code>atualizar</code> <code>selecionar tudo</code> <code>copiar</code> <code>colar</code> <code>salvar</code></p>
          <p><b>Programas e páginas:</b> <code>abrir "caminho do programa"</code> <code>abrir site "https://..."</code> <code>focar janela "Título"</code> <code>esperar janela "Título"</code> <code>esperar 2</code></p>
          <p><b>Seus próprios campos:</b> <code>definir numero = 123</code> · <code>perguntar "Qual o número?" em numero</code> (abre uma caixinha, você digita na hora, e depois usa <code>{numero}</code>)</p>
          <p><b>Decisões e repetições:</b> <code>se produto sem codigo</code> · <code>se {campo} vazio</code> · <code>se {campo} for "x"</code> · <code>se {campo} contem "x"</code> ... <code>senao</code> ... <code>fim se</code> · <code>para cada produto</code> ... <code>fim para cada</code> · <code>repetir 3 vezes</code> ... <code>fim</code></p>
          <p><b>Capturar para Bloco de Notas/PDF:</b> <code>capturar lista "Nome" de X1,Y1 ate X2,Y2</code> (clica no início, rola se pedir <code>rolar 3</code>, dá Shift+clique no fim e copia; ou <code>arrastar</code> em vez de rolar) · <code>gerar documento "Título" em "C:/pasta/arquivo" formato txt+pdf como tabela</code> (formato: <code>txt+pdf</code>, <code>txt</code> ou <code>pdf</code>; como: <code>tabela</code> ou <code>texto</code>; o .txt abre no Bloco de Notas). Pode usar <code>{requisicao}</code>, <code>{data}</code> etc. no título e no nome do arquivo. Não precisa de Word; precisa do agente versão 6.</p>
          <p><b>Roteiros prontos (blocos):</b> no 🧩 Passo a passo, o grupo <b>🧱 Roteiros prontos</b> traz o Modelo da NF e cada roteiro que você salvou (<b>🧱 Salvar como bloco</b>). Ele entra como <b>um bloco só</b>; ao salvar, o texto dele é copiado para o roteiro entre as linhas <code># [roteiro ...]</code> e <code># [/roteiro]</code> (comentários que o agente ignora). Use <code>definir</code>/<code>perguntar</code> antes dele para dar valores aos campos.</p>
          <p><b>Conferir cada item (agente versão 7):</b> <code>confirmar "Está correto?" em confere tecla f8</code> abre uma caixa Sim/Não. Sim: segue. Não: o agente para, você corrige na mão e aperta a tecla (f8, f9, espaco ou ctrl) e ele segue para o próximo item. A resposta fica em <code>{confere}</code> (sim/nao), para usar com <code>se {confere} for "sim"</code>. · <code>lembrar mouse</code> guarda onde o mouse está · <code>voltar mouse</code> clica de novo nesse lugar. No 🧩 Passo a passo, tudo isso já vem pronto no bloco <b>📦 Lançar os itens: CÓDIGO + conferir</b>.</p>
          <p><b>Outros:</b> <code>avisar "faça tal coisa e clique OK"</code> (pausa até você clicar OK) · <code>ignorar erros</code> · <code>parar</code></p></details>
        <textarea id="rt" spellcheck="false" placeholder="Ligue o agente para carregar o roteiro"></textarea>
        <div id="blw" hidden></div>
        <div class="nf-row"><button id="sv">💾 Salvar roteiro</button><button id="md" class="ghost">📚 Modelos</button><button id="nv" class="ghost">☁️ Salvar na nuvem</button><button id="sb" class="ghost">🧱 Salvar como bloco</button><button id="pp" class="ghost">🧩 Passo a passo</button></div></div>
      <div class="nf-box"><h3>3) Preencher uma nota</h3>
        <input id="q" type="search" placeholder="Digite o número da requisição...">
        <div id="sels" hidden style="margin:.5rem 0;font-size:.9rem;line-height:1.5"></div>
        <div id="lst" style="margin-top:.5rem"></div>
        <div class="nf-row"><button id="go" disabled>🤖 Preencher NF</button><button id="ts" class="ghost" disabled>🧪 Testar (sem clicar)</button><button id="gr" hidden disabled>📱 ▶ Iniciar no PC</button><button id="tr" class="ghost" hidden disabled>📱 🧪 Testar no PC</button></div>
        <p style="margin-top:.8rem">Faça sempre o teste antes: ele mostra todos os passos com os dados da requisição, sem mexer no mouse.</p></div>
      <div class="nf-box"><h3>4) Controle remoto (celular → PC)</h3>
        <p>Deixe o agente e esta tela abertos no <b>PC</b>. No <b>celular</b> você escolhe a requisição e toca em <b>Iniciar no PC</b>: quem executa é o PC.</p>
        <div class="nf-row" style="margin-top:0"><button id="rp" class="ghost">💻 Este aparelho é o PC</button><button id="rc" class="ghost">📱 Este aparelho é o celular</button></div>
        <div id="rem" style="margin-top:.7rem"></div></div></div>`;
    const $ = s => body.querySelector(s);
    // Passo a passo (blocos) <-> texto do roteiro. O que vale para salvar é sempre o texto gerado.
    let modoBl = false; const blk = criaBlocos($('#blw'));
    const textoAtual = () => { if (modoBl) $('#rt').value = blk.paraTexto(); return $('#rt').value; };
    const setTexto = t => { $('#rt').value = t; if (modoBl) blk.deTexto(t); };
    $('#pp').onclick = () => {
      if (!modoBl) { blk.deTexto($('#rt').value); modoBl = true; $('#rt').style.display = 'none'; $('#blw').hidden = false; $('#pp').textContent = '📝 Voltar ao texto'; }
      else { $('#rt').value = blk.paraTexto(); modoBl = false; $('#rt').style.display = ''; $('#blw').hidden = true; $('#pp').textContent = '🧩 Passo a passo'; }
    };
    const dizer = (cls, txt) => { const e = $('#st'); e.className = 'nf-st ' + cls; e.lastElementChild.textContent = txt; };
    async function status() {
      const on = await ligado();
      if (!on) return dizer('', 'Agente desligado. No computador da empresa, abra o iniciar.bat (use "Baixar agente" se ainda não tem).');
      if (await versao() < VMIN) return dizer('av', 'Agente ANTIGO aberto. Clique em "Baixar agente", troque a pasta e abra o iniciar.bat de novo.');
      if (!token()) return dizer('av', 'Agente ligado, mas falta o token. Clique em "Colar token".');
      try { setTexto((await chamar('/roteiro')).texto); dizer('ok', 'Agente ligado e pronto.'); } catch (e) { dizer('av', e.message); }
    }
    $('#ver').onclick = status; $('#tk').onclick = async () => { if (pedeToken()) status(); }; $('#bx').onclick = baixarAgente;
    // Zerar: apaga o roteiro aprendido (no agente) e esquece o token deste navegador
    $('#zr').onclick = async () => {
      if (!confirm('ZERAR a automação?\n\nIsso apaga o roteiro (passo a passo) e esquece o token deste navegador.\nDepois você terá que escrever o roteiro de novo e colar o token outra vez.')) return;
      let msg = 'Token esquecido neste navegador.', roteiroApagado = false;
      if (token() && await ligado()) { try { await chamar('/roteiro', { texto: MODELO }); roteiroApagado = true; } catch (e) { msg += '\nNão consegui apagar o roteiro: ' + e.message; } }
      else msg += '\nO agente está desligado, então o roteiro NÃO foi apagado. Ligue o iniciar.bat e use Zerar de novo, ou apague o arquivo roteiro.txt na pasta do agente.';
      localStorage.removeItem(TK); setTexto(roteiroApagado ? MODELO : '');
      dizer('av', 'Zerado. Cole o token para voltar a usar.'); alert((roteiroApagado ? 'Roteiro apagado. ' : '') + msg);
    };
    $('#sv').onclick = async () => { if (!await garante()) return; try { await chamar('/roteiro', { texto: textoAtual() }); alert('Roteiro salvo. Vale para todas as requisições.'); } catch (e) { alert('Não salvei: ' + e.message); } };
    // Modelos: o padrão da NF + os que você salvou (ficam no sistema e vão para a nuvem junto com os outros dados)
    const MOD = 'modelos_nf', modelos = () => CFO.store.get(MOD, []);
    const usar = (nome, texto) => { const at = textoAtual().trim(); if (at && at !== texto.trim() && at !== MODELO.trim() && !confirm(`Trocar o roteiro da tela pelo modelo "${nome}"?\n\n(Só vale depois de clicar em Salvar roteiro.)`)) return false; setTexto(texto); if (!modoBl) $('#rt').focus(); return true; };
    const abreModelos = () => {
      if (!document.getElementById('nfmod-css')) {
        const st = document.createElement('style'); st.id = 'nfmod-css';
        st.textContent = `dialog.nfmod{width:min(94vw,460px);max-height:85vh;overflow:auto}
dialog.nfmod h3{margin:0 0 .7rem}
dialog.nfmod .nfm-item{display:flex;flex-direction:column;gap:.5rem;padding:.7rem .8rem;margin-bottom:.55rem;border:1px solid #8885;border-radius:10px}
dialog.nfmod .nfm-nome{font-weight:600;line-height:1.3;overflow-wrap:anywhere}
dialog.nfmod .nfm-sub{display:block;margin-top:.2rem;font-size:.8rem;font-weight:400;opacity:.65}
dialog.nfmod .nfm-btns{display:flex;gap:.5rem}
dialog.nfmod .nfm-btns button{flex:1;width:auto;margin:0}
dialog.nfmod .nfm-btns button.nfm-x{flex:0 0 auto;padding-inline:1rem}
dialog.nfmod .nfm-vazio{margin:.2rem 0 .8rem;opacity:.8;line-height:1.4}
dialog.nfmod .nfm-fechar{width:100%;margin:.2rem 0 0}`;
        document.head.append(st);
      }
      const d = document.createElement('dialog'); d.className = 'nfmod';
      const ls = modelos().slice().sort((x, y) => (y.criado || 0) - (x.criado || 0));
      const passos = t => { const n = String(t || '').split(/\r?\n/).filter(l => l.trim() && l.trim()[0] !== '#').length; return n + (n === 1 ? ' linha' : ' linhas'); };
      const card = (nome, sub, u, x) => `<div class="nfm-item"><div class="nfm-nome">${nome}<span class="nfm-sub">${sub}</span></div><div class="nfm-btns"><button type="button" data-u="${u}">Usar</button>${x ? `<button type="button" class="ghost danger nfm-x" data-x="${x}" title="Apagar">🗑 Apagar</button>` : ''}</div></div>`;
      d.innerHTML = `<form method="dialog"><h3>📚 Modelos</h3>
        ${card('📄 Modelo da NF (padrão)', `já vem com o sistema · ${passos(MODELO_NF)}`, 'padrao', '')}
        ${ls.map(m => card(esc(m.nome), `${m.criado ? 'salvo em ' + new Date(m.criado).toLocaleDateString('pt-BR') + ' · ' : ''}${passos(m.texto)}`, esc(m.id), esc(m.id))).join('')}
        ${ls.length ? '' : '<p class="nfm-vazio">Você ainda não salvou nenhum modelo. Monte o roteiro e toque em <b>☁️ Salvar na nuvem</b>.</p>'}
        <button value="cancel" class="ghost nfm-fechar" formnovalidate>Fechar</button></form>`;
      d.onclose = () => d.remove();
      d.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { const m = b.dataset.u === 'padrao' ? { nome: 'Modelo da NF (padrão)', texto: MODELO_NF } : modelos().find(x => x.id === b.dataset.u); if (m && usar(m.nome, m.texto)) d.close(); });
      d.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { const m = modelos().find(x => x.id === b.dataset.x); if (!m || !confirm(`Apagar o modelo "${m.nome}"? Ele some da nuvem também.`)) return; CFO.store.set(MOD, modelos().filter(x => x.id !== m.id)); d.close(); abreModelos(); });
      document.body.append(d); d.showModal();
    };
    $('#md').onclick = abreModelos;
    // Salvar o roteiro da tela como modelo e mandar para a nuvem na hora
    $('#nv').onclick = async () => {
      const texto = textoAtual();
      if (!texto.trim()) return alert('Não há roteiro na tela para salvar.');
      const nome = (prompt('Nome do modelo (ele também vira um bloco em "Roteiros prontos" no Passo a passo):', '') || '').trim(); if (!nome) return;
      const ls = modelos(), i = ls.findIndex(m => CFO.norm(m.nome) === CFO.norm(nome));
      if (i >= 0 && !confirm(`Já existe o modelo "${ls[i].nome}". Substituir?`)) return;
      const m = { id: i >= 0 ? ls[i].id : 'm' + Date.now().toString(36), nome, texto, criado: Date.now() };
      if (i >= 0) ls[i] = m; else ls.push(m);
      CFO.store.set(MOD, ls);
      const bt = $('#nv'); bt.disabled = true; bt.textContent = '☁️ Enviando...';
      let ok = false; try { ok = CFO.nuvemAgora ? await CFO.nuvemAgora() : false; } catch (e) { ok = false; }
      bt.disabled = false; bt.textContent = '☁️ Salvar na nuvem';
      alert(ok ? `Modelo "${nome}" salvo e enviado para a nuvem.` : `Modelo "${nome}" salvo neste aparelho, mas não consegui confirmar o envio para a nuvem. Ele vai sozinho quando a conexão voltar (veja o botão ☁️ do topo).`);
    };
    $('#sb').onclick = () => $('#nv').click();
    const selecionadas = () => { const todas = reqs(); return selIds.map(id => todas.find(r => r.id === id)).filter(Boolean); };
    const habilita = () => { $('#go').disabled = $('#ts').disabled = $('#gr').disabled = $('#tr').disabled = !selIds.length; };
    const lista = () => {
      const t = CFO.norm($('#q').value.trim()), todas = reqs();
      let v = t ? todas.filter(r => CFO.norm([r.id, r.contrato, r.contratoNome, r.sol].join(' ')).includes(t)).sort((x, y) => (CFO.norm(String(y.id)) === t) - (CFO.norm(String(x.id)) === t)).slice(0, 30) : todas.slice(0, 3);
      if (!t) { const extras = selecionadas().filter(r => !v.some(x => x.id === r.id)); v = [...extras, ...v]; }   // as marcadas não somem quando você limpa a busca
      $('#lst').innerHTML = v.map(r => `<label class="nf-req${selIds.includes(r.id) ? ' on' : ''}"><input type="checkbox" value="${esc(r.id)}"${selIds.includes(r.id) ? ' checked' : ''}><span><b>${esc(r.id)}</b> · Contrato ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<small>${esc(r.sol)} · ${esc(r.mes)}</small></span></label>`).join('') || '<p>Nenhuma requisição encontrada.</p>';
      if (!t && todas.length > 3) $('#lst').insertAdjacentHTML('beforeend', '<p style="margin:.4rem 0 0;font-size:.85em;opacity:.7">Mostrando só as 3 últimas. Para outra, digite o número dela na busca. Pode marcar várias: os itens somam numa NF só.</p>');
      $('#lst').querySelectorAll('input').forEach(i => i.onchange = () => { selIds = i.checked ? [...selIds.filter(x => x !== i.value), i.value] : selIds.filter(x => x !== i.value); habilita(); lista(); });
      const sl = selecionadas(), el = $('#sels'); el.hidden = !sl.length;
      el.innerHTML = sl.length ? (sl.length > 1 ? `<b>${sl.length} requisições numa NF só:</b> ` : '<b>Marcada:</b> ') + esc(sl.map(r => r.id).join(', ')) + ` <button type="button" id="lmp" class="ghost" style="margin-left:.4rem;padding:.2rem .6rem;font-size:.8rem">Limpar</button>` : '';
      if (sl.length) $('#lmp').onclick = () => { selIds = []; habilita(); lista(); };
    };
    let tm = 0; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(lista, 200); };
    const juntada = () => { const rs = selecionadas(); return rs.length ? combinar(rs) : null; };
    $('#go').onclick = () => { const r = juntada(); if (r) rodar(r, false); }; $('#ts').onclick = () => { const r = juntada(); if (r) rodar(r, true); };
    lista(); status();

    // ----- Controle remoto (tela) -----
    const rem = $('#rem'), fmt = c => String(c || '').replace(/(.{4})(?=.)/g, '$1-').toUpperCase(), limpa = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let pongEm = 0, pcInfo = {}, ultEstado = {}; const pend = new Map();
    const fechaCel = () => { if (canalCel) { canalCel.fechar(); canalCel = null; } clearInterval(timerRem); };
    const pintaSt = () => {
      const e = $('#rst'); if (!e) return; const c = remCfg();
      let cls = '', t;
      if (c.papel === 'pc') { const l = recep && recep.ligado(); cls = c.receptor && l ? 'ok' : 'av'; t = !c.receptor ? 'Receptor DESLIGADO: o celular não consegue mandar comandos.' : l ? 'Receptor ligado, esperando o celular.' : 'Conectando à nuvem...'; }
      else if (!canalCel || !canalCel.ligado()) t = 'Sem conexão com a nuvem.';
      else if (Date.now() - pongEm > 11000) t = 'O PC não responde. Confira se a aba do sistema está aberta no PC com o receptor ligado.';
      else if (!pcInfo.agente) { cls = 'av'; t = 'PC online, mas o agente está desligado (iniciar.bat).'; }
      else if (!pcInfo.token) { cls = 'av'; t = 'PC online, mas falta colar o token no PC.'; }
      else { cls = 'ok'; t = 'PC online e pronto.'; }
      e.className = 'nf-st ' + cls; e.lastElementChild.textContent = t;
    };
    const pedir = (t, ids) => new Promise((res, rej) => {
      if (!canalCel || !canalCel.ligado()) return rej(new Error('Sem conexão com a nuvem. Tente de novo em instantes.'));
      const n = nonce(), to = setTimeout(() => { pend.delete(n); rej(new Error('O PC não respondeu. Confira se a aba do sistema está aberta no PC, com o receptor ligado.')); }, 8000);
      pend.set(n, { res: x => { clearTimeout(to); res(x); }, rej: e => { clearTimeout(to); rej(e); } });
      canalCel.enviar('nf-cmd', { t, id: ids && ids[0], ids, n });
    });
    const mostraEstado = p => {
      ultEstado = p; const lg = $('#rlog'), ps = $('#rps'), pa = $('#rpa'); if (!lg) return;
      lg.hidden = false; lg.textContent = (p.log || []).join('\n'); lg.scrollTop = lg.scrollHeight;
      pa.hidden = !p.rodando; ps.hidden = !p.rodando; ps.textContent = p.pausado ? '▶ Continuar' : '⏸ Pausar';
    };
    const desenhaRem = () => {
      const c = remCfg(); fechaCel();
      $('#rp').className = c.papel === 'pc' ? '' : 'ghost'; $('#rc').className = c.papel === 'cel' ? '' : 'ghost';
      $('#gr').hidden = $('#tr').hidden = !(c.papel === 'cel' && c.codigoCel);
      if (c.papel === 'pc') {
        rem.innerHTML = `<p>Este aparelho é o <b>PC</b>: ele executa o que o celular mandar. Mantenha esta aba aberta (sem fechar o navegador) e o <code>iniciar.bat</code> ligado.</p>
          <div class="nf-st" id="rst"><i></i><span></span></div>
          <p style="margin-top:.7rem">No celular, escolha “Este aparelho é o celular” e digite o código:</p>
          <p><b style="font-family:ui-monospace,Consolas,monospace;font-size:1.2rem;letter-spacing:.06em">${esc(fmt(c.codigoPc))}</b></p>
          <div class="nf-row"><button id="rlig" class="ghost">${c.receptor ? '⏹ Desligar receptor' : '▶ Ligar receptor'}</button><button id="rnov" class="ghost">🔑 Gerar novo código</button></div>`;
        $('#rlig').onclick = () => { setRem({ receptor: !remCfg().receptor }); ligaReceptor(); desenhaRem(); };
        $('#rnov').onclick = () => { if (!confirm('Gerar um novo código? Os celulares pareados terão que digitar o código novo.')) return; setRem({ codigoPc: novoCodigo() }); ligaReceptor(); desenhaRem(); };
        timerRem = setInterval(() => { if (!rem.isConnected) return fechaCel(); pintaSt(); }, 2000); pintaSt();
      } else if (c.papel === 'cel' && !c.codigoCel) {
        rem.innerHTML = `<p>Digite o código que aparece no PC (Automação de NF > “Este aparelho é o PC”).</p>
          <input id="rcod" type="search" placeholder="xxxx-xxxx-xxxx" autocomplete="off" autocapitalize="off" spellcheck="false">
          <div class="nf-row"><button id="rok">Conectar</button></div>`;
        $('#rok').onclick = () => { const v = limpa($('#rcod').value); if (v.length !== 12) return alert('O código tem 12 letras/números (ex.: abcd-efgh-jkmn).'); setRem({ codigoCel: v }); desenhaRem(); };
      } else if (c.papel === 'cel') {
        rem.innerHTML = `<div class="nf-st" id="rst"><i></i><span>Procurando o PC...</span></div>
          <div class="nf-row"><button id="rps" class="ghost" hidden>⏸ Pausar</button><button id="rpa" class="ghost danger" hidden>⏹ Parar</button><button id="rtc" class="ghost">🔑 Trocar código</button></div>
          <pre class="nf-log" id="rlog" hidden></pre>`;
        $('#rtc').onclick = () => { setRem({ codigoCel: '' }); desenhaRem(); };
        $('#rpa').onclick = () => pedir('parar').catch(e => alert(e.message));
        $('#rps').onclick = () => pedir(ultEstado.pausado ? 'continuar' : 'pausar').catch(e => alert(e.message));
        pongEm = 0; pcInfo = {};
        canalCel = abreCanal(c.codigoCel, (ev, p) => {
          if (ev !== 'nf-res' || !p) return;
          if (p.t === 'pong') { pongEm = Date.now(); pcInfo = p; } else if (p.t === 'estado') { pongEm = Date.now(); mostraEstado(p); }
          const f = p.n && pend.get(p.n); if (f) { pend.delete(p.n); if (p.t === 'erro') f.rej(new Error(p.msg)); else if (p.t === 'ok') f.res(p); }
        }, () => { setTimeout(() => canalCel && canalCel.enviar('nf-cmd', { t: 'ping', n: nonce() }), 600); });
        timerRem = setInterval(() => { if (!rem.isConnected) return fechaCel(); if (canalCel) canalCel.enviar('nf-cmd', { t: 'ping', n: nonce() }); pintaSt(); }, 4000); pintaSt();
      } else rem.innerHTML = '<p style="margin:0">Escolha acima qual é este aparelho.</p>';
    };
    $('#rp').onclick = () => { const c = remCfg(); setRem({ papel: 'pc', codigoPc: c.codigoPc || novoCodigo(), receptor: c.receptor === undefined ? true : c.receptor }); ligaReceptor(); desenhaRem(); };
    $('#rc').onclick = () => { setRem({ papel: 'cel' }); ligaReceptor(); desenhaRem(); };
    const remoto = async simular => {
      const rs = selecionadas(); if (!rs.length) return; const r = combinar(rs);
      if (!simular && !confirm(`Iniciar no PC a nota da ${r.id}?\n\nContrato ${r.contrato}.${avisoJuntas(rs)}\nO PC vai controlar o mouse e o teclado. Para interromper: botão ⏹ Parar aqui, ou mouse no canto superior esquerdo do PC.`)) return;
      try { await pedir(simular ? 'test' : 'play', rs.map(x => x.id)); alert(simular ? 'Teste iniciado no PC (não clica nem digita).' : 'Iniciado no PC. O andamento aparece aqui embaixo.'); }
      catch (e) { alert(e.message); }
    };
    $('#gr').onclick = () => remoto(false); $('#tr').onclick = () => remoto(true);
    desenhaRem();
  }, { cfg: { title: 'Automação de NF', hints: [] } });

  // ---------- Baixar o agente (pasta do agente em um .zip) ----------
  function baixarAgente() {
    const ir = () => CFO.baixarAgenteNF();
    if (CFO.baixarAgenteNF) return ir();
    const sc = document.createElement('script'); sc.src = 'automacao-nf-pacote.js?v=20261106a'; sc.onload = ir;
    sc.onerror = () => alert('Não achei o arquivo automacao-nf-pacote.js. Confira se ele foi enviado ao GitHub junto com os outros.');
    document.head.append(sc);
  }
  // Botão nos 3 pontos (menu do topo)
  { const m = document.querySelector('.topbtns'); if (m && !document.getElementById('nfdl')) { const x = document.createElement('button'); x.id = 'nfdl'; x.className = 'ghost'; x.textContent = '⬇️ Baixar agente NF'; x.onclick = baixarAgente; m.append(x); } }

  // Atalho dentro do detalhe da Requisição (sem editar requisicoes.js)
  const abrirOriginal = CFO.open;
  CFO.open = (title, render) => abrirOriginal(title, b => {
    render(b);
    try {
      const m = /^Requisição (.+)$/.exec(title), bar = b.querySelector('#prn') && b.querySelector('#prn').parentElement;
      if (!m || !bar || !CFO.pode('editar', 'requisicoes')) return;
      const r = CFO.store.get('requisicoes', []).find(x => x.id === m[1]); if (!r) return;
      const add = (txt, cls, fn) => { const x = document.createElement('button'); x.className = cls; x.textContent = txt; x.onclick = fn; bar.append(x); };
      add('🤖 Preencher NF', '', () => rodar(r, false)); add('🧪 Testar', 'ghost', () => rodar(r, true));
    } catch (e) { console.warn('automacao-nf', e); }
  });
})();
