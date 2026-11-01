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
  const VMIN = 3;                                                // versão mínima do agente (a que entende se/senão, perguntar, teclar...)
  const versao = () => fetch(URL + '/ping').then(r => r.json()).then(x => x.versao || 1).catch(() => 0);
  const ANTIGO = 'O agente que está aberto neste computador é ANTIGO e não entende os comandos novos.\n\nClique em "⬇️ Baixar agente", troque a pasta agente-windows e abra o iniciar.bat de novo.';
  const pedeToken = () => { const t = prompt('Cole o TOKEN que aparece na janela do agente:'); if (t) localStorage.setItem(TK, t.trim()); return !!token(); };
  const garante = async () => {
    if (!await ligado()) { alert('O agente não está ligado neste computador.\nAbra o "iniciar.bat" (pasta agente-windows) e tente de novo.'); return false; }
    if (await versao() < VMIN) { alert(ANTIGO); return false; }
    return token() || pedeToken();
  };

  // Requisição no formato do agente: itens aprovados somados por item+tamanho, com o código do EPI
  const montar = r => {
    const achar = CFO.casarEpi(CFO.store.get('epi', [])), mapa = new Map();
    r.itens.filter(i => i.qa > 0).forEach(i => {
      const k = CFO.norm(i.item) + '|' + CFO.norm(i.tam), x = mapa.get(k) || { item: i.item, tam: i.tam || '', qa: 0, preco: i.preco, codigo: (achar(i.item) || {}).codigo || '' };
      x.qa += i.qa; mapa.set(k, x);
    });
    return { id: r.id, contrato: r.contrato, contratoNome: r.contratoNome, sol: r.sol, mes: r.mes, motivo: r.motivo, itens: [...mapa.values()] };
  };
  async function rodar(r, simular, aoIniciar) {
    if (!await garante()) return;
    const q = montar(r);
    if (!q.itens.length) { alert('Esta requisição não tem itens aprovados.'); return; }
    if (!simular && !confirm(`Preencher a nota da ${r.id}?\n\nContrato ${r.contrato} · ${q.itens.length} produto(s).\nO agente vai controlar o mouse e o teclado.\nPara interromper: jogue o mouse no canto superior esquerdo da tela.`)) return;
    try { await chamar(simular ? '/testar' : '/executar', { requisicao: q }); aoIniciar ? aoIniciar() : tela(r); }
    catch (e) { alert(e.message); }
  }

  // Acompanha o andamento (log do agente)
  function acompanhar(el, parar) {
    const t = setInterval(async () => {
      if (!el.isConnected) return clearInterval(t);
      try { const s = await chamar('/estado'); el.textContent = s.log.join('\n'); el.scrollTop = el.scrollHeight; if (parar) parar.hidden = !s.rodando; } catch { clearInterval(t); }
    }, 700);
  }
  function tela(r) {
    CFO.open('Preenchendo ' + r.id, b => {
      b.innerHTML = '<div class="nf"><div class="nf-row" style="margin:0 0 .8rem"><button id="p" class="ghost danger">⏹ Parar</button></div><pre class="nf-log" id="l"></pre></div>';
      const p = b.querySelector('#p'); p.onclick = () => chamar('/parar', {}).catch(() => {}); acompanhar(b.querySelector('#l'), p);
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
  const COR = { 'Mouse': '#3b82f6', 'Escrever': '#22c55e', 'Itens da requisição': '#14b8a6', 'Teclas': '#f59e0b', 'Programas e esperas': '#a855f7', 'Produtos e decisões': '#ef4444', 'Mais': '#64748b' };
  const ICO = { 'Mouse': '🖱️', 'Escrever': '✍️', 'Itens da requisição': '📦', 'Teclas': '⌨️', 'Programas e esperas': '🪟', 'Produtos e decisões': '🔀', 'Mais': '⚙️' };
  const XY = [{ k: 'x', lab: 'X', tipo: 'num', def: '0' }, { k: 'y', lab: 'Y', tipo: 'num', def: '0' }];
  const OPS = [['vazio', 'está vazio'], ['nao vazio', 'não está vazio'], ['for', 'for igual a'], ['nao for', 'for diferente de'], ['contem', 'contém']];
  // Blocos "Lançar os itens": viram um "para cada produto" pronto (digita código ou nome, Enter, quantidade, Enter, e vai para o próximo item)
  const ITENS_F = (oq) => [
    { k: 'e1', lab: `Quantos Enter depois do ${oq} (até chegar na quantidade)`, tipo: 'num', def: '2', larg: 1 },
    { k: 'e2', lab: 'Quantos Enter depois da quantidade (até cadastrar o item)', tipo: 'num', def: '2', larg: 1 },
    { k: 'seg', lab: 'Esperar quantos segundos depois do 1º Enter (para o sistema da NF achar o item)', tipo: 'num', def: '1', larg: 1 }];
  const itensTexto = (modo, v) => {
    const cod = modo === 'cod', n = (x, d) => Math.max(0, Math.floor(Number(String(num(x, d)).replace(',', '.'))) || 0), e1 = n(v.e1, '2'), e2 = n(v.e2, '2'), seg = String(num(v.seg, '1')).replace(',', '.');
    const L = [`# [itens ${modo} ${e1} ${e2} ${seg}] lanca cada item da requisicao: ${cod ? 'codigo' : 'nome'} + quantidade`, 'para cada produto'], i = cod ? '    ' : '  ';
    const enter = q => q > 0 ? [i + (q === 1 ? 'tecla enter' : `tecla enter ${q} vezes`)] : [];
    if (cod) L.push('  se {codigo} nao vazio');
    L.push(i + `digitar ${cod ? '{codigo}' : '{produto}'}`);
    if (e1 > 0) { L.push(...enter(1)); if (Number(seg) > 0) L.push(i + `esperar ${seg}`); L.push(...enter(e1 - 1)); }
    L.push(i + 'digitar {quantidade}', ...enter(e2));
    if (cod) L.push('  senao', '    avisar "Item sem codigo: {produto} (quantidade {quantidade}). Lance este item na mao e clique OK."', '  fim se');
    L.push('fim');
    return L.join('\n');
  };
  const itensLer = (c, modo) => { const m = /^@@itens\s+(cod|nome)\s+(\d+)\s+(\d+)\s+([\d.,]+)$/.exec(c); return m && m[1] === modo ? { e1: m[2], e2: m[3], seg: m[4] } : null; };
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
    { id: 'itensNome', g: 'Itens da requisição', nome: 'Lançar os itens: NOME + quantidade (um item por vez)', prio: 1, multi: 1, f: ITENS_F('nome'), out: v => itensTexto('nome', v), ler: c => itensLer(c, 'nome') },

    { id: 'cada', g: 'Produtos e decisões', nome: 'Para cada produto (repete até o Fim)', abre: 1, f: [], out: () => 'para cada produto', ler: R(/^(?:repetir\s+)?para cada\s+(?:produto|item)$/i, () => ({})) },
    { id: 'repetir', g: 'Produtos e decisões', nome: 'Repetir (até o Fim)', abre: 1, f: [{ k: 'n', lab: 'Quantas vezes', tipo: 'num', def: '3' }], out: v => `repetir ${num(v.n, '1')} vezes`, ler: R(/^repetir\s+(\d+)(?:\s+vezes?)?$/i, m => ({ n: m[1] })) },
    { id: 'seCod', g: 'Produtos e decisões', nome: 'Se o produto tem / não tem código', abre: 1, f: [{ k: 'q', lab: 'O produto', tipo: 'sel', op: [['com', 'TEM código'], ['sem', 'NÃO tem código']], def: 'com', larg: 1 }], out: v => `se produto ${v.q || 'com'} codigo`, ler: R(/^se\s+(?:produto|item)\s+(sem|com)\s+c.digo$/i, m => ({ q: m[1].toLowerCase() })) },
    { id: 'seCampo', g: 'Produtos e decisões', nome: 'Se um dado da requisição...', abre: 1, f: [{ k: 'campo', lab: 'Dado', tipo: 'sel', op: SIS_REQ, def: 'requisicao', larg: 1 }, { k: 'op', lab: 'Condição', tipo: 'sel', op: OPS, def: 'vazio', larg: 1 }, { k: 'valor', lab: 'Valor (só para igual/diferente/contém)', tipo: 'txt', larg: 1 }], out: v => { const c = v.campo || 'requisicao', op = v.op || 'vazio'; return (op === 'vazio' || op === 'nao vazio') ? `se {${c}} ${op}` : `se {${c}} ${op} "${v.valor || ''}"`; }, ler: c => { const m = /^se\s+\{([^{}]+)\}\s+(.+)$/i.exec(c); if (!m) return null; const campo = m[1].trim().toLowerCase(), r = m[2].trim(); let x; if (/^(vazio|em branco)$/i.test(r)) return { campo, op: 'vazio', valor: '' }; if (/^(n[aã]o vazio|preenchido|tem valor)$/i.test(r)) return { campo, op: 'nao vazio', valor: '' }; if ((x = /^(?:n[aã]o for|diferente de)\s+"?(.*?)"?$/i.exec(r))) return { campo, op: 'nao for', valor: x[1] }; if ((x = /^(?:for|e|igual a|igual|=)\s+"?(.*?)"?$/i.exec(r))) return { campo, op: 'for', valor: x[1] }; if ((x = /^(?:cont[eé]m|tem)\s+"?(.*?)"?$/i.exec(r))) return { campo, op: 'contem', valor: x[1] }; return null; } },
    { id: 'senao', g: 'Produtos e decisões', nome: 'Senão (outro caminho do Se)', meio: 1, f: [], out: () => 'senao', ler: R(/^(?:sen.o|caso contr.rio)$/i, () => ({})) },
    { id: 'fim', g: 'Produtos e decisões', nome: 'Fim (fecha o bloco acima)', fecha: 1, f: [], out: () => 'fim', ler: R(/^fim(?:\s+(?:para cada|repetir|se))?$/i, () => ({})) },

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
    String(txt || '').replace(/^[ \t]*#[ \t]*\[itens (cod|nome) (\d+) (\d+) ([\d.,]+)\][^\n]*\n[\s\S]*?^[ \t]*fim[ \t]*\r?$/gm, '@@itens $1 $2 $3 $4').split(/\r?\n/).forEach(raw => {
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
    raiz.innerHTML = `<datalist id="bl-teclas">${TECLAS.map(t => `<option value="${t}">`).join('')}</datalist>
      <div class="nf-row" style="margin-top:0"><button class="bl-add">＋ Adicionar passo</button><button class="ghost danger bl-limpar">🗑 Limpar tudo</button></div>
      <div class="bl-pal" hidden>${Object.keys(COR).map(g => `<div class="bl-gt" style="color:${COR[g]}">${ICO[g]} ${g}</div><div class="bl-chips">${B.filter(d => d.g === g).map(d => `<button class="ghost" data-add="${d.id}" style="border-color:${COR[g]}">${E(d.nome)}</button>`).join('')}</div>`).join('')}</div>
      <div class="bl-aviso"></div>
      <div class="bl-lista"></div>
      <div class="nf-row"><button class="bl-add">＋ Adicionar passo</button></div>
      <details class="bl-prev"><summary>Ver o roteiro em texto</summary><pre class="nf-log"></pre></details>`;
    const $q = s => raiz.querySelector(s), lista = $q('.bl-lista'), pal = $q('.bl-pal'), avisoEl = $q('.bl-aviso'), prev = $q('.bl-prev pre');

    const campoHtml = (b, i, f) => {
      const val = b.v[f.k] == null ? (f.def == null ? '' : f.def) : b.v[f.k], at = `data-i="${i}" data-k="${f.k}"`; let el;
      if (f.tipo === 'sel') {
        const ops = f.op.map(o => Array.isArray(o) ? o : [o, o]);
        if (!ops.some(o => String(o[0]) === String(val))) ops.push([val, val]);
        el = `<select ${at}>${ops.map(o => `<option value="${E(o[0])}"${String(o[0]) === String(val) ? ' selected' : ''}>${E(o[1])}</option>`).join('')}</select>`;
      } else if (f.tipo === 'area') el = `<textarea ${at} rows="${Math.min(6, Math.max(2, String(val).split('\n').length))}" spellcheck="false">${E(val)}</textarea>`;
      else el = `<input type="text" ${at} value="${E(val)}"${f.tipo === 'lista' ? ' list="bl-teclas"' : ''}${f.tipo === 'num' ? ' inputmode="numeric"' : ''}${f.ph ? ` placeholder="${E(f.ph)}"` : ''} autocomplete="off" autocapitalize="off" spellcheck="false">`;
      return `<label${f.larg ? ' class="g"' : ''}><span>${E(f.lab)}</span>${el}</label>`;
    };
    const avisos = () => {
      let d = 0, neg = false, pend = 0;
      bl.forEach(b => { const df = DEF[b.t]; if (df.fecha) { d--; if (d < 0) { neg = true; d = 0; } } if (df.abre) d++; if (['clicar', 'duplo', 'direito', 'mover'].includes(b.t) && Number(num(b.v.x)) <= 2 && Number(num(b.v.y)) <= 2) pend++; });
      const m = [];
      if (pend) m.push(`⚠️ ${pend} passo(s) do mouse ainda em 0,0. Troque pelo X,Y.`);
      if (d > 0) m.push('⚠️ Falta um "Fim" para fechar um bloco.');
      if (neg) m.push('⚠️ Tem um "Fim" sobrando.');
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
    const novo = id => { const v = {}; DEF[id].f.forEach(f => { v[f.k] = f.def != null ? f.def : (f.op ? (Array.isArray(f.op[0]) ? f.op[0][0] : f.op[0]) : ''); }); return { t: id, v, nota: '' }; };
    const adiciona = id => {
      const pos = sel >= 0 && sel < bl.length ? sel + 1 : bl.length, novos = [novo(id)];
      if (DEF[id].abre) novos.push(novo('fim'));          // já fecha o bloco: os passos de dentro entram entre os dois
      bl.splice(pos, 0, ...novos); sel = pos; pal.hidden = true; desenha(pos);
    };

    raiz.querySelectorAll('.bl-add').forEach(b => b.onclick = () => { b.parentElement.after(pal); pal.hidden = !pal.hidden; });
    $q('.bl-limpar').onclick = () => { if (bl.length && !confirm('Apagar todos os passos da tela?')) return; bl = []; sel = -1; desenha(); };
    pal.addEventListener('click', e => { const a = e.target.closest('[data-add]'); if (a) adiciona(a.dataset.add); });
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

  // ---------- Tela da gaveta Ferramentas ----------
  CFO.modules.autonf = Object.assign(body => {
    const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const mesKey = s => { const m = CFO.norm(s).match(/^([a-z]+)(\d{4})$/), i = m ? MESES.indexOf(m[1]) : -1; return i >= 0 ? m[2] + String(i + 1).padStart(2, '0') : '000000'; };
    const reqs = () => CFO.store.get('requisicoes', []).slice().sort((a, b) => mesKey(b.mes).localeCompare(mesKey(a.mes)) || String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    let sel = null;
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
          <p><b>Outros:</b> <code>avisar "faça tal coisa e clique OK"</code> (pausa até você clicar OK) · <code>ignorar erros</code> · <code>parar</code></p></details>
        <textarea id="rt" spellcheck="false" placeholder="Ligue o agente para carregar o roteiro"></textarea>
        <div id="blw" hidden></div>
        <div class="nf-row"><button id="sv">💾 Salvar roteiro</button><button id="md" class="ghost">📚 Modelos</button><button id="nv" class="ghost">☁️ Salvar na nuvem</button><button id="pp" class="ghost">🧩 Passo a passo</button></div></div>
      <div class="nf-box"><h3>3) Preencher uma nota</h3>
        <input id="q" type="search" placeholder="Digite o número da requisição...">
        <div id="lst" style="margin-top:.5rem"></div>
        <div class="nf-row"><button id="go" disabled>🤖 Preencher NF</button><button id="ts" class="ghost" disabled>🧪 Testar (sem clicar)</button></div>
        <p style="margin-top:.8rem">Faça sempre o teste antes: ele mostra todos os passos com os dados da requisição, sem mexer no mouse.</p></div></div>`;
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
      if (await versao() < VMIN) return dizer('av', 'Agente ANTIGO aberto. Clique em "⬇️ Baixar agente", troque a pasta e abra o iniciar.bat de novo.');
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
      const d = document.createElement('dialog'); d.className = 'imp';
      const ls = modelos().slice().sort((x, y) => (y.criado || 0) - (x.criado || 0)), L = 'display:flex;gap:.4rem;align-items:center;padding:.45rem 0;border-bottom:1px solid #8883';
      d.innerHTML = `<form method="dialog"><h3>📚 Modelos</h3>
        <div style="${L}"><span style="flex:1"><b>📄 Modelo da NF (padrão)</b><br><small>já vem com o sistema</small></span><button type="button" data-u="padrao">Usar</button></div>
        ${ls.map(m => `<div style="${L}"><span style="flex:1"><b>${esc(m.nome)}</b><br><small>${m.criado ? new Date(m.criado).toLocaleDateString('pt-BR') : ''}</small></span><button type="button" data-u="${esc(m.id)}">Usar</button><button type="button" class="ghost danger" data-x="${esc(m.id)}" title="Apagar">🗑</button></div>`).join('')}
        ${ls.length ? '' : '<p>Você ainda não salvou nenhum modelo. Monte o roteiro e toque em <b>☁️ Salvar na nuvem</b>.</p>'}
        <button value="cancel" class="ghost" formnovalidate>Fechar</button></form>`;
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
      const nome = (prompt('Nome do modelo:', '') || '').trim(); if (!nome) return;
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
    const lista = () => {
      const t = CFO.norm($('#q').value.trim()), todas = reqs();
      let v = t ? todas.filter(r => CFO.norm([r.id, r.contrato, r.contratoNome, r.sol].join(' ')).includes(t)).sort((x, y) => (CFO.norm(String(y.id)) === t) - (CFO.norm(String(x.id)) === t)).slice(0, 30) : todas.slice(0, 3);
      if (!t && sel && !v.some(r => r.id === sel)) { const s0 = todas.find(r => r.id === sel); if (s0) v = [s0, ...v]; }   // a escolhida não some quando você limpa a busca
      $('#lst').innerHTML = v.map(r => `<label class="nf-req${sel === r.id ? ' on' : ''}"><input type="radio" name="rq" value="${esc(r.id)}"${sel === r.id ? ' checked' : ''}><span><b>${esc(r.id)}</b> · Contrato ${esc(r.contrato)}${r.contratoNome ? ' - ' + esc(r.contratoNome) : ''}<small>${esc(r.sol)} · ${esc(r.mes)}</small></span></label>`).join('') || '<p>Nenhuma requisição encontrada.</p>';
      if (!t && todas.length > 3) $('#lst').insertAdjacentHTML('beforeend', '<p style="margin:.4rem 0 0;font-size:.85em;opacity:.7">Mostrando só as 3 últimas. Para outra, digite o número dela na busca.</p>');
      $('#lst').querySelectorAll('input').forEach(i => i.onchange = () => { sel = i.value; $('#go').disabled = $('#ts').disabled = false; lista(); });
    };
    let tm = 0; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(lista, 200); };
    const atual = () => reqs().find(r => r.id === sel);
    $('#go').onclick = () => atual() && rodar(atual(), false); $('#ts').onclick = () => atual() && rodar(atual(), true);
    lista(); status();
  }, { cfg: { title: 'Automação de NF', hints: [] } });

  // ---------- Baixar o agente (pasta do agente em um .zip) ----------
  function baixarAgente() {
    const ir = () => CFO.baixarAgenteNF();
    if (CFO.baixarAgenteNF) return ir();
    const sc = document.createElement('script'); sc.src = 'automacao-nf-pacote.js?v=20261031c'; sc.onload = ir;
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
