/* ===== Ferramentas > Mapa livre =====
   Mapa de almoxarifado de desenho LIVRE (diferente do "Mapa almoxarifado", de fileiras fixas).
   - ⬚ Área: arraste sobre os quadradinhos. Dá para criar VÁRIAS áreas (separadas ou coladas); só se coloca coisa dentro de área.
   - ▨ Demarcar: pinta um pedaço do chão com cor e nome (ex.: Entrada, Expedição). Pode ficar embaixo de paletes e prateleiras.
   - ▮ Parede: retas de 1 quadradinho. Paredes que se encontram (cantos, T, lado a lado) se ligam, sem divisória.
   - 📦 Palete: quadrado ou retângulo; camadas (1 a 10) e caixas por camada (1 a 10) digitadas à mão.
   - ▬ / ▰ Prateleira: 1 ou 2 quadradinhos de grossura, do comprimento que quiser.
   - 👆 Selecionar: mover (arrastando), girar, mudar tamanho, nome, cor, etc.
   Vista "Plano" (de cima, onde se edita) e "3D" (gira com o dedo/mouse, zoom por pinça/roda, 2 dedos ou Shift move).
   Dados 'mapalivre' = { m, areas:[{id,x,y,w,h,nome}], zonas:[{id,x,y,w,h,nome,cor}], objs:[{id,t:'p'|'s'|'w',x,y,w,h,nome,conteudo,camadas,cpc,andares,alt}] }
   Permissão: só perfis de "Outros setores" e o perfil principal (veja CFO.pode em login.js). */
(() => {
  const K = 'mapalivre', FW = 100, FH = 70, esc = CFO.esc;
  const HA = .9, BASE = .16;                                   // altura de cada andar da prateleira (m) e do estrado do palete (quadradinhos)
  const CORES = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899', '#eab308'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const int = (v, a, b, d = a) => clamp(Math.round(+v) || d, a, b);

  if (!document.getElementById('ml-css')) {
    const st = document.createElement('style'); st.id = 'ml-css';
    st.textContent = `.ml{display:flex;flex-direction:column;gap:.6rem}
      .ml-tb{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
      .ml-tb button{padding:.45rem .7rem;font-size:13.5px}
      .ml-tb button.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
      .ml-tb button:not(.on){background:transparent;color:var(--text);border-color:var(--line)}
      .ml-tb .sep{width:1px;height:22px;background:var(--line);margin:0 .15rem}
      .ml-busca{align-items:center}
      .ml-busca input[type=search]{flex:1;min-width:160px;padding:.45rem .7rem;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--text);font-size:13.5px}
      #ml-gear.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
      .ml-cv{overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel2);height:58vh;min-height:300px;overscroll-behavior:contain}
      .ml-cv canvas{display:block}
      .ml-info{font-size:13px;color:var(--muted);margin:0}.ml-info b{color:var(--text)}
      .ml-pn{border:1px solid var(--line);border-radius:12px;padding:.7rem .8rem;background:var(--panel);display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.5rem .7rem}
      .ml-pn h4{grid-column:1/-1;margin:0;font-size:14px}
      .ml-pn label{font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:.2rem}
      .ml-pn .full{grid-column:1/-1}
      .ml-pn .acts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.4rem}
      .ml-pn .cores{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
      .ml-pn .cores button{width:30px;height:30px;padding:0;border-radius:50%;border:2px solid var(--line)}
      .ml-pn .cores button.on{border-color:var(--text)}
      .ml-pn .cores input[type=color]{width:40px;height:32px;padding:0;border-radius:8px}
      .ml-pn button.danger{background:transparent;color:#dc2626;border-color:#dc2626}`;
    document.head.append(st);
  }

  CFO.modules.mapalivre = body => {
    let D = CFO.store.get(K, null);
    if (!D || !Array.isArray(D.objs)) D = { m: 1, areas: [], zonas: [], objs: [] };
    if (!Array.isArray(D.areas)) D.areas = D.area ? [{ id: uid(), ...D.area, nome: '' }] : [];   // migra o formato antigo (uma área só)
    delete D.area; if (!Array.isArray(D.zonas)) D.zonas = [];
    D.objs.forEach(o => { if (o.t === 'p' && !o.cpc) o.cpc = [1, 2, 4, 6][(o.cx || 3) - 1] || 4; });
    const podeE = () => CFO.pode('editar', 'mapalivre'), podeA = () => CFO.pode('apagar', 'mapalivre');
    const hist = [];
    const salvar = () => CFO.store.set(K, D);
    const push = () => { const s = JSON.stringify(D); if (hist[hist.length - 1] !== s) { hist.push(s); if (hist.length > 40) hist.shift(); } };
    let tool = podeE() ? (D.areas.length ? 'palete' : 'area') : 'nav', vista = 'plano', cs = 28, selId = null, drag = null, ghost = null;
    let editando = podeE() && !D.areas.length;      // layout (criar/editar) só aparece atrás da engrenagem; mapa novo já abre nele
    const itensPlanilha = () => CFO.store.get('epi', []).map(r => r.item).filter(Boolean);
    const novoZ = { nome: '', cor: CORES[0] };
    const cam = { yaw: -.55, pitch: .75, dist: 40, tx: 0, ty: 0, tz: 0 }; let camOk = false, pend = 0;

    body.innerHTML = `<div class="ml"><div class="ml-tb ml-busca"><input id="ml-q" type="search" list="ml-bl" placeholder="🔎 Pesquisar e ir até o item/local" autocomplete="off"><datalist id="ml-bl"></datalist>${podeE() ? '<button id="ml-gear" class="ghost" aria-label="Editar layout">⚙ Editar layout</button>' : ''}</div>
      <div class="ml-tb" id="ml-tools"></div><p class="ml-info" id="ml-info"></p>
      <div class="ml-cv" id="ml-cv"><canvas id="ml-c"></canvas></div><div id="ml-pn"></div><datalist id="ml-itens"></datalist></div>`;
    const $ = s => body.querySelector(s), cv = $('#ml-c'), ctx = cv.getContext('2d'), wrap = $('#ml-cv');

    /* ---------- pesquisar item e ir até o local ---------- */
    const dlItens = $('#ml-itens'), dlBusca = $('#ml-bl'), qi = $('#ml-q');
    dlItens.innerHTML = itensPlanilha().map(n => `<option value="${esc(n)}">`).join('');
    const buscaveis = () => {
      const r = [];
      D.objs.forEach(o => { if (o.t === 'w') return; const rot = o.t === 'p' ? 'Palete' : 'Prateleira'; const nome = o.nome || rot; r.push({ id: o.id, label: `${nome}${o.conteudo ? ' — ' + o.conteudo : ''}`, busca: nome + ' ' + (o.conteudo || ''), x: o.x + o.w / 2, y: o.y + o.h / 2, w: o.w, h: o.h }); });
      D.zonas.forEach(z => { if (z.nome) r.push({ id: z.id, label: `▨ ${z.nome}`, busca: z.nome, x: z.x + z.w / 2, y: z.y + z.h / 2, w: z.w, h: z.h }); });
      return r;
    };
    const irPara = it => {
      selId = it.id; editando = false;
      if (vista === 'plano') { const px = (it.x) * cs, py = (it.y) * cs; wrap.scrollLeft = Math.max(0, px - wrap.clientWidth / 2); wrap.scrollTop = Math.max(0, py - wrap.clientHeight / 2); }
      else { cam.tx = it.x; cam.tz = it.y; cam.dist = clamp(Math.max(it.w, it.h) * 5, 8, 400); camOk = true; B = basis(); pedir(); }
      tool = 'sel'; barra(); painel(); draw();
    };
    const buscar = () => {
      const q = CFO.norm(qi.value.trim()); if (!q) return;
      const lista = buscaveis(); const exato = lista.find(it => it.label === qi.value.trim());
      const achado = exato || lista.find(it => CFO.norm(it.busca).includes(q));
      if (achado) irPara(achado); else alert('Não achei nada com esse nome no mapa.');
    };
    qi.addEventListener('input', () => { dlBusca.innerHTML = buscaveis().filter(it => !qi.value.trim() || CFO.norm(it.busca).includes(CFO.norm(qi.value.trim()))).slice(0, 25).map(it => `<option value="${esc(it.label)}">`).join(''); });
    qi.addEventListener('change', buscar);
    qi.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
    const gear = $('#ml-gear'); if (gear) gear.onclick = () => { editando = !editando; if (!editando) { tool = 'nav'; } else if (!['nav','sel'].includes(tool)) tool = D.areas.length ? 'palete' : 'area'; barra(); painel(); draw(); };

    /* ---------- regras ---------- */
    const listaDe = { o: () => D.objs, z: () => D.zonas, a: () => D.areas };
    const achar = id => { for (const k of ['o', 'z', 'a']) { const it = listaDe[k]().find(x => x.id === id); if (it) return { k, it }; } return null; };
    const emArea = (x, y) => D.areas.some(a => x >= a.x && y >= a.y && x < a.x + a.w && y < a.y + a.h);
    const cobre = r => { for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) if (!emArea(i, j)) return false; return r.w > 0 && r.h > 0; };
    const cruza = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    // Paredes podem encostar/cruzar em outras paredes (é assim que se fecha um cômodo); o resto não pode se sobrepor
    const livre = (r, ignora, t) => cobre(r) && !D.objs.some(o => o.id !== ignora && cruza(r, o) && !(t === 'w' && o.t === 'w'));
    const topo = (cx, cy) => {
      const o = [...D.objs].reverse().find(o => cx >= o.x && cx < o.x + o.w && cy >= o.y && cy < o.y + o.h); if (o) return { k: 'o', it: o };
      const z = [...D.zonas].reverse().find(z => cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h); if (z) return { k: 'z', it: z };
      const a = D.areas.filter(a => cx >= a.x && cy >= a.y && cx < a.x + a.w && cy < a.y + a.h).sort((p, q) => p.w * p.h - q.w * q.h)[0]; return a ? { k: 'a', it: a } : null;
    };
    const nCx = o => int(o.cpc || 4, 1, 10);
    // Caixas do palete: grade mais "quadrada" possível dentro do retângulo; cada caixa é quase um cubo
    const pal = o => {
      const n = nCx(o), g = .05; let b = null;
      for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c), s = Math.abs(Math.log(((o.w - g * 2) / c) / ((o.h - g * 2) / r))) + (c * r - n) * .12; if (!b || s < b.s) b = { c, r, s }; }
      const MINC = .22;                                                        // tamanho mínimo de uma "caixa" (m): evita caixa fina tipo folha
      const bw = Math.max((o.w - g * 2) / b.c, MINC), bd = Math.max((o.h - g * 2) / b.r, MINC), bh = clamp(Math.min(bw, bd) * .85, .35, 1.1);
      return { n, c: b.c, r: b.r, bw, bd, bh, g, H: BASE + bh * int(o.camadas, 1, 10) };
    };
    const altC = o => o.t === 'w' ? (o.alt || 3) / (D.m || 1) : o.t === 'p' ? pal(o).H : HA * int(o.andares, 1, 6) / (D.m || 1);   // altura em quadradinhos

    /* ---------- barra de ferramentas ---------- */
    const FERR_VER = [['nav', '✋ Navegar'], ['sel', '👆 Selecionar']];
    const FERR_CRIAR = [['area', '⬚ Área'], ['zona', '▨ Demarcar'], ['parede', '▮ Parede'], ['palete', '📦 Palete'], ['p1', '▬ Prateleira fina (1)'], ['p2', '▰ Prateleira grossa (2)']];
    const FERR = [...FERR_VER, ...FERR_CRIAR];
    const barra = () => {
      const edit = podeE() && editando, t = $('#ml-tools'), gear = $('#ml-gear');
      if (gear) { gear.classList.toggle('on', editando); gear.textContent = editando ? '⚙ Editando layout (toque p/ sair)' : '⚙ Editar layout'; }
      if (!editando && tool !== 'nav' && tool !== 'sel') tool = 'nav';
      const lista = podeE() ? (editando ? FERR : FERR_VER) : [];
      t.innerHTML = (lista.length ? lista.map(([k, n]) => `<button data-t="${k}" class="${tool === k && vista === 'plano' ? 'on' : ''}">${n}</button>`).join('') +
        (edit && podeA() ? `<button data-t="del" class="${tool === 'del' && vista === 'plano' ? 'on' : ''}">🗑 Apagar</button>` : '') + (edit ? '<span class="sep"></span><button data-a="undo">↶ Desfazer</button>' : '') : '') +
        `<span class="sep"></span><button data-v="plano" class="${vista === 'plano' ? 'on' : ''}">Plano</button><button data-v="iso" class="${vista === 'iso' ? 'on' : ''}">3D</button>` +
        (vista === 'iso' ? '<button data-a="rot">⟳ Girar</button><button data-a="reset">⌖ Centralizar</button>' : '<button data-a="mais">＋</button><button data-a="menos">－</button>') +
        '<button data-a="png">⬇ Imagem</button>' + (edit && podeA() ? '<button data-a="limpar" style="color:#dc2626;border-color:#dc2626">Limpar mapa</button>' : '');
      t.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tool = b.dataset.t; vista = 'plano'; if (tool !== 'sel') selId = null; tudo(); });
      t.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { vista = b.dataset.v; selId = vista === 'iso' ? null : selId; tudo(); });
      t.querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(b.dataset.a));
    };
    const acao = a => {
      if (a === 'undo') { const atual = JSON.stringify(D); while (hist.length && hist[hist.length - 1] === atual) hist.pop(); const s = hist.pop(); if (!s) return; D = JSON.parse(s); if (selId && !achar(selId)) selId = null; salvar(); tudo(); }
      else if (a === 'rot') { cam.yaw += Math.PI / 2; draw(); }
      else if (a === 'reset') { camOk = false; draw(); }
      else if (a === 'mais') { cs = Math.min(cs + 4, 40); draw(); }
      else if (a === 'menos') { cs = Math.max(cs - 4, 8); draw(); }
      else if (a === 'png') cv.toBlob(b => b && CFO.baixar(b, 'mapa-livre.png'));
      else if (a === 'limpar') { if (!confirm('Apagar TODO o mapa livre (áreas, demarcações, paletes, prateleiras e paredes)?')) return; push(); D = { m: D.m || 1, areas: [], zonas: [], objs: [] }; selId = null; tool = 'area'; camOk = false; salvar(); tudo(); }
    };

    /* ---------- informações e painel ---------- */
    const info = () => {
      const m = D.m || 1, ps = D.objs.filter(o => o.t === 'p'), ss = D.objs.filter(o => o.t === 's'), ws = D.objs.filter(o => o.t === 'w');
      const caixas = ps.reduce((n, o) => n + int(o.camadas, 1, 10) * nCx(o), 0);
      $('#ml-info').innerHTML = !D.areas.length ? 'Comece pela ferramenta <b>⬚ Área</b>: arraste sobre os quadradinhos para escolher o tamanho do espaço. Pode criar mais de uma.'
        : `<b>${D.areas.length}</b> área(s) · <b>${ps.length}</b> palete(s) com ${caixas} caixas · <b>${ss.length}</b> prateleira(s)${ws.length ? ` · <b>${ws.length}</b> parede(s)` : ''}${D.zonas.length ? ` · <b>${D.zonas.length}</b> demarcação(ões)` : ''} · cada quadradinho = ${String(m).replace('.', ',')} m` +
          (vista === 'iso' ? ' · 3D: arraste para girar, pinça/roda para aproximar, 2 dedos ou Shift para mover' : tool === 'nav' ? ' · navegar: role/arraste para andar pelo mapa' : '');
    };
    const campo = (id, rot, val, ex = '', dis = '') => `<label>${rot}<input id="${id}" ${ex} value="${esc(val)}"${dis}></label>`;
    const painel = () => {
      const el = $('#ml-pn'), f = vista === 'plano' ? achar(selId) : null, edit = podeE() && editando, dis = edit ? '' : ' disabled';
      if (!f) {
        if (!(edit && vista === 'plano')) { el.innerHTML = ''; return; }
        if (tool === 'area') { const m = D.m || 1; el.innerHTML = `<div class="ml-pn"><h4>Áreas</h4><label>Cada quadradinho vale (metros)<select id="ml-m">${[.5, 1, 1.2, 2].map(v => `<option value="${v}"${v === m ? ' selected' : ''}>${String(v).replace('.', ',')} m</option>`).join('')}</select></label><p class="ml-info full">Arraste para criar uma área. Você pode criar quantas quiser, separadas ou coladas. Para mudar o tamanho de uma, use 👆 Selecionar e toque nela.</p></div>`; const s = el.querySelector('#ml-m'); s.onchange = () => { push(); D.m = +s.value; salvar(); info(); draw(); }; }
        else if (tool === 'zona') {
          el.innerHTML = `<div class="ml-pn"><h4>Nova demarcação no chão</h4>${campo('z-n', 'Nome (aparece no chão)', novoZ.nome, 'placeholder="Ex.: Entrada"')}<div class="cores" id="z-cores">${CORES.map(c => `<button data-c="${c}" style="background:${c}" class="${c === novoZ.cor ? 'on' : ''}" aria-label="Cor ${c}"></button>`).join('')}<input type="color" id="z-c" value="${novoZ.cor}" aria-label="Outra cor"></div><p class="ml-info full">Arraste dentro de uma área para pintar o chão. Para recolorir ou renomear depois, use 👆 Selecionar.</p></div>`;
          el.querySelector('#z-n').oninput = e => { novoZ.nome = e.target.value; };
          el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { novoZ.cor = b.dataset.c; painel(); }); el.querySelector('#z-c').oninput = e => { novoZ.cor = e.target.value; };
        } else el.innerHTML = '';
        return;
      }
      const { k, it: o } = f;
      const ap = (fn, redesenha) => { push(); fn(); salvar(); draw(); info(); if (redesenha) painel(); };
      const tenta = r => { const ok = k === 'a' ? true : k === 'z' ? cobre(r) : livre(r, o.id, o.t); if (k === 'a') { const rest = D.areas.filter(a => a !== o).concat([{ ...o, ...r }]), ve = it => { for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) if (!rest.some(a => i >= a.x && j >= a.y && i < a.x + a.w && j < a.y + a.h)) return false; return true; }; if (![...D.objs, ...D.zonas].every(ve)) { alert('Há paletes, prateleiras, paredes ou demarcações que ficariam fora da área.'); painel(); return; } } else if (!ok) { alert('Não cabe aí: precisa ficar dentro de uma área' + (k === 'o' ? ' e sem encostar em outro objeto.' : '.')); painel(); return; } ap(() => Object.assign(o, r), true); };
      const tit = k === 'a' ? '⬚ Área' : k === 'z' ? '▨ Demarcação' : o.t === 'p' ? '📦 Palete' : o.t === 'w' ? '▮ Parede' : '▬ Prateleira';
      const ph = k === 'a' ? 'Ex.: Setor de caixas' : k === 'z' ? 'Ex.: Entrada' : o.t === 'p' ? 'Ex.: Palete A1' : o.t === 'w' ? 'Ex.: Parede norte' : 'Ex.: Prateleira 1';
      el.innerHTML = `<div class="ml-pn"><h4>${tit} selecionado(a)</h4>${campo('p-n', 'Nome', o.nome || '', `placeholder="${ph}"`, dis)}
        ${k === 'a' ? campo('p-x', 'Posição X', o.x, 'type="number" min="0"', dis) + campo('p-y', 'Posição Y', o.y, 'type="number" min="0"', dis) : ''}
        ${campo('p-w', 'Largura (quadradinhos)', o.w, `type="number" min="1" max="${FW}"`, dis)}${campo('p-h', 'Comprimento (quadradinhos)', o.h, `type="number" min="1" max="${FH}"`, dis)}
        ${k === 'o' && o.t === 'p' ? campo('p-c', 'Camadas (1 a 10)', int(o.camadas, 1, 10), 'type="number" min="1" max="10"', dis) + campo('p-q', 'Caixas por camada (1 a 10)', nCx(o), 'type="number" min="1" max="10"', dis) : ''}
        ${k === 'o' && o.t === 's' ? campo('p-a', 'Andares (1 a 6)', int(o.andares, 1, 6, 4), 'type="number" min="1" max="6"', dis) : ''}
        ${k === 'o' && o.t === 'w' ? campo('p-alt', 'Altura (metros)', o.alt || 3, 'type="number" min="1" max="12" step="0.5"', dis) : ''}
        ${k === 'z' ? `<div class="cores">${CORES.map(c => `<button data-c="${c}" style="background:${c}" class="${c === o.cor ? 'on' : ''}"${dis} aria-label="Cor ${c}"></button>`).join('')}<input type="color" id="p-cor" value="${o.cor}"${dis} aria-label="Outra cor"></div>` : ''}
        ${k === 'o' ? campo('p-o', 'Conteúdo / item (puxa da planilha)', o.conteudo || '', 'placeholder="O que fica aqui" list="ml-itens"', dis).replace('<label>', '<label class="full">') : ''}
        ${edit ? `<div class="acts">${k !== 'a' ? '<button id="p-r" class="ghost">⟳ Girar 90°</button>' : ''}${podeA() ? '<button id="p-d" class="danger">🗑 Apagar</button>' : ''}</div>` : ''}</div>`;
      if (!edit) return;
      el.querySelector('#p-n').onchange = e => ap(() => { o.nome = e.target.value.trim(); });
      const num = (id, fn) => { const i = el.querySelector(id); if (i) i.onchange = e => fn(+e.target.value); };
      num('#p-w', v => tenta({ x: o.x, y: o.y, w: int(v, 1, FW, o.w), h: o.h })); num('#p-h', v => tenta({ x: o.x, y: o.y, w: o.w, h: int(v, 1, FH, o.h) }));
      num('#p-x', v => tenta({ x: int(v, 0, FW - o.w, o.x), y: o.y, w: o.w, h: o.h })); num('#p-y', v => tenta({ x: o.x, y: int(v, 0, FH - o.h, o.y), w: o.w, h: o.h }));
      num('#p-c', v => ap(() => { o.camadas = int(v, 1, 10, 1); }, true)); num('#p-q', v => ap(() => { o.cpc = int(v, 1, 10, 4); }, true));
      num('#p-a', v => ap(() => { o.andares = int(v, 1, 6, 4); }, true)); num('#p-alt', v => ap(() => { o.alt = clamp(v || 3, 1, 12); }, true));
      const po = el.querySelector('#p-o'); if (po) po.onchange = e => ap(() => { o.conteudo = e.target.value.trim(); });
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => ap(() => { o.cor = b.dataset.c; }, true)); const pc = el.querySelector('#p-cor'); if (pc) pc.onchange = e => ap(() => { o.cor = e.target.value; }, true);
      const r = el.querySelector('#p-r'); if (r) r.onclick = () => tenta({ x: o.x, y: o.y, w: o.h, h: o.w });
      const d = el.querySelector('#p-d'); if (d) d.onclick = () => apagar(o.id);
    };
    const apagar = id => {
      const f = achar(id); if (!f || !podeA()) return; const { k, it: o } = f;
      if (k === 'a') {
        const rest = D.areas.filter(a => a !== o), ve = it => { for (let j = it.y; j < it.y + it.h; j++) for (let i = it.x; i < it.x + it.w; i++) if (!rest.some(a => i >= a.x && j >= a.y && i < a.x + a.w && j < a.y + a.h)) return false; return true; };
        if (![...D.objs, ...D.zonas].every(ve)) return alert('Esta área ainda tem paletes, prateleiras, paredes ou demarcações. Apague ou mova esses itens primeiro.');
      }
      const nome = k === 'a' ? 'a área' : k === 'z' ? 'a demarcação' : o.t === 'p' ? 'o palete' : o.t === 'w' ? 'a parede' : 'a prateleira';
      if (!confirm(`Apagar ${nome}${o.nome ? ' "' + o.nome + '"' : ''}?`)) return;
      push(); D[k === 'a' ? 'areas' : k === 'z' ? 'zonas' : 'objs'] = listaDe[k]().filter(x => x.id !== id); if (selId === id) selId = null; salvar(); tudo();
    };

    /* ---------- desenho ---------- */
    const cor = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
    const fit = (w, h) => { let d = Math.min(devicePixelRatio || 1, 2); while (d > 1 && w * h * d * d > 12e6) d = Math.max(1, d - .25); cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + 'px'; cv.style.height = h + 'px'; ctx.setTransform(d, 0, 0, d, 0, 0); };
    const sh = (rgb, k) => `rgb(${rgb.map(v => Math.round(v * k)).join(',')})`;
    const MAD = [226, 176, 62], CAIXA = [[190, 146, 96], [205, 161, 110], [176, 134, 86]], AZUL = [31, 78, 140], LARANJA = [232, 115, 26], DECK = [180, 188, 195], PAREDE = [158, 164, 172];
    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
    const rotulo = (t, x, y, F, cor2 = '#fff') => { ctx.font = `700 ${F}px system-ui,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(t, x, y); ctx.fillStyle = cor2; ctx.fillText(t, x, y); };

    // ----- Plano (vista de cima)
    const zonaPlano = (z, ok = true) => {
      const x = z.x * cs, y = z.y * cs, w = z.w * cs, h = z.h * cs;
      ctx.fillStyle = z.cor; ctx.globalAlpha = .4; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; ctx.strokeStyle = z.cor; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      if (z.nome) { ctx.save(); ctx.translate(x + w / 2, y + h / 2); if (h > w * 1.6) ctx.rotate(-Math.PI / 2); rotulo(z.nome, 0, 0, clamp(Math.min(Math.max(w, h) / (z.nome.length * .62), cs * .8), 9, 22)); ctx.restore(); }
      if (!ok) { ctx.fillStyle = 'rgba(220,38,38,.35)'; ctx.fillRect(x, y, w, h); }
    };
    const objPlano = (o, ok = true, fant = false) => {
      const x = o.x * cs, y = o.y * cs, w = o.w * cs, h = o.h * cs; ctx.globalAlpha = fant ? .75 : 1;
      if (o.t === 'p') {
        const P = pal(o); ctx.fillStyle = sh(MAD, .9); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        const cw = (w - 6) / P.c, ch = (h - 6) / P.r;
        for (let i = 0; i < P.n; i++) { const bx = x + 3 + (i % P.c) * cw, by = y + 3 + Math.floor(i / P.c) * ch; ctx.fillStyle = sh(CAIXA[i % 3], 1); ctx.fillRect(bx + 1, by + 1, cw - 2, ch - 2); ctx.fillStyle = 'rgba(236,202,155,.85)'; ctx.fillRect(bx + 1, by + ch / 2 - 2, cw - 2, 4); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(bx + 1.5, by + 1.5, cw - 3, ch - 3); }
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else if (o.t === 's') {
        const hz = o.w >= o.h; ctx.fillStyle = sh(DECK, .95); ctx.fillRect(x + 1, y + 1, w - 2, h - 2); ctx.fillStyle = sh(LARANJA, 1);
        if (hz) { ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); } else { ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h); }
        ctx.fillStyle = sh(AZUL, 1); const n = hz ? o.w : o.h;
        for (let i = 0; i <= n; i++) { const px = hz ? clamp(x + i * cs - 3, x, x + w - 6) : x, py = hz ? y : clamp(y + i * cs - 3, y, y + h - 6); ctx.fillRect(px, py, 6, 6); if (hz) ctx.fillRect(px, y + h - 6, 6, 6); else ctx.fillRect(x + w - 6, py, 6, 6); }
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else { ctx.fillStyle = '#555b63'; ctx.fillRect(x, y, w, h); }
      ctx.globalAlpha = 1;
      if (o.t !== 'w') { const nome = o.nome || (o.t === 'p' ? 'Palete' : 'Prateleira'), tag = o.t === 'p' ? `${nome} · ${int(o.camadas, 1, 10)}×` : `${nome} · ${int(o.andares, 1, 6, 4)}↕`; ctx.save(); ctx.translate(x + w / 2, y + h / 2); if (o.h > o.w * 1.6) ctx.rotate(-Math.PI / 2); rotulo(tag, 0, 0, clamp(Math.max(w, h) / (tag.length * .62), 8, 15)); ctx.restore(); }
      if (!ok) { ctx.fillStyle = 'rgba(220,38,38,.35)'; ctx.fillRect(x, y, w, h); }
    };
    const paredesPlano = (extra) => {                      // paredes juntas: preenche as células e só contorna as bordas de fora (sem divisória)
      const ws = D.objs.filter(o => o.t === 'w' && !(extra && drag && drag.mode === 'move' && drag.id === o.id && ghost)); if (extra) ws.push(extra);
      const S = new Set(); ws.forEach(o => { for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) S.add(i + ',' + j); });
      ctx.fillStyle = '#555b63'; S.forEach(k => { const [i, j] = k.split(',').map(Number); ctx.fillRect(i * cs, j * cs, cs + .5, cs + .5); });
      ctx.strokeStyle = '#25282c'; ctx.lineWidth = 2; ctx.beginPath();
      S.forEach(k => { const [i, j] = k.split(',').map(Number), x = i * cs, y = j * cs;
        if (!S.has(i + ',' + (j - 1))) { ctx.moveTo(x, y); ctx.lineTo(x + cs, y); } if (!S.has(i + ',' + (j + 1))) { ctx.moveTo(x, y + cs); ctx.lineTo(x + cs, y + cs); }
        if (!S.has((i - 1) + ',' + j)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cs); } if (!S.has((i + 1) + ',' + j)) { ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs); } });
      ctx.stroke();
    };
    const drawPlano = () => {
      wrap.style.overflow = 'auto'; fit(FW * cs, FH * cs);
      ctx.fillStyle = cor('--bg'); ctx.fillRect(0, 0, FW * cs, FH * cs);
      ctx.fillStyle = cor('--panel'); D.areas.forEach(a => ctx.fillRect(a.x * cs, a.y * cs, a.w * cs, a.h * cs));
      ctx.strokeStyle = cor('--line'); ctx.lineWidth = 1; ctx.globalAlpha = D.areas.length ? .55 : .9; ctx.beginPath();
      for (let i = 0; i <= FW; i++) { ctx.moveTo(i * cs + .5, 0); ctx.lineTo(i * cs + .5, FH * cs); } for (let j = 0; j <= FH; j++) { ctx.moveTo(0, j * cs + .5); ctx.lineTo(FW * cs, j * cs + .5); }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (D.areas.length) {                                                                   // escurece o que está fora das áreas
        const dim = document.createElement('canvas'); dim.width = FW; dim.height = FH; const g = dim.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, FW, FH); g.globalCompositeOperation = 'destination-out'; D.areas.forEach(a => g.fillRect(a.x, a.y, a.w, a.h));
        ctx.imageSmoothingEnabled = false; ctx.drawImage(dim, 0, 0, FW * cs, FH * cs);
      }
      D.areas.forEach(a => { ctx.strokeStyle = a.id === selId ? '#22d3ee' : cor('--accent'); ctx.lineWidth = a.id === selId ? 4 : 3; ctx.strokeRect(a.x * cs, a.y * cs, a.w * cs, a.h * cs); if (a.nome) { ctx.textAlign = 'left'; ctx.font = '700 12px system-ui,Arial,sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(a.nome, a.x * cs + 5, a.y * cs + 4); ctx.fillStyle = '#fff'; ctx.fillText(a.nome, a.x * cs + 5, a.y * cs + 4); } });
      D.zonas.forEach(z => { if (!(drag && drag.mode === 'move' && drag.id === z.id && ghost)) zonaPlano(z); });
      D.objs.forEach(o => { if (o.t !== 'w' && !(drag && drag.mode === 'move' && drag.id === o.id && ghost)) objPlano(o); });
      paredesPlano(ghost && ghost.r.t === 'w' ? ghost.r : null);
      D.objs.filter(o => o.t === 'w' && o.nome).forEach(o => { ctx.save(); ctx.translate((o.x + o.w / 2) * cs, (o.y + o.h / 2) * cs); if (o.h > o.w) ctx.rotate(-Math.PI / 2); rotulo(o.nome, 0, 0, 11); ctx.restore(); });
      if (ghost) { if (tool === 'area') { const r = ghost.r; ctx.fillStyle = 'rgba(34,211,238,.25)'; ctx.fillRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3; ctx.strokeRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs); rotulo(`${r.w} × ${r.h}`, (r.x + r.w / 2) * cs, (r.y + r.h / 2) * cs, 15); }
        else if (ghost.r.t === 'z') zonaPlano(ghost.r, ghost.ok); else if (ghost.r.t !== 'w') objPlano(ghost.r, ghost.ok, true); else if (!ghost.ok) { const r = ghost.r; ctx.fillStyle = 'rgba(220,38,38,.4)'; ctx.fillRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs); } }
      const s = achar(selId); if (s) { const o = s.it; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.strokeRect(o.x * cs - 2, o.y * cs - 2, o.w * cs + 4, o.h * cs + 4); ctx.setLineDash([]); }
      const nav = tool === 'nav'; cv.style.touchAction = 'none'; cv.style.cursor = nav ? (pan2d ? 'grabbing' : 'grab') : 'crosshair';
    };

    // ----- 3D com câmera que gira (perspectiva desenhada no <canvas>, sem biblioteca)
    const TF = Math.tan(25 * Math.PI / 180); let W = 320, Hh = 320, B = null;
    const basis = () => {
      const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), c = [cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.ty + cam.dist * sp, cam.tz + cam.dist * cp * Math.cos(cam.yaw)];
      let f = [cam.tx - c[0], cam.ty - c[1], cam.tz - c[2]]; const n = Math.hypot(...f); f = f.map(v => v / n);
      let r = [-f[2], 0, f[0]]; const mm = Math.hypot(...r) || 1; r = r.map(v => v / mm);
      return { c, f, r, u: [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] };
    };
    const fpx = () => Math.min(W, Hh) / 2 / TF;
    const toCam = p => { const rel = [p[0] - B.c[0], p[1] - B.c[1], p[2] - B.c[2]]; return [rel[0] * B.r[0] + rel[1] * B.r[1] + rel[2] * B.r[2], rel[0] * B.u[0] + rel[1] * B.u[1] + rel[2] * B.u[2], rel[0] * B.f[0] + rel[1] * B.f[1] + rel[2] * B.f[2]]; };
    const proj = p => { const q = toCam(p); return q[2] < .3 ? null : { x: W / 2 + q[0] / q[2] * fpx(), y: Hh / 2 - q[1] / q[2] * fpx() }; };
    const projPoly = pts => {
      const c = pts.map(toCam), out = [];
      for (let i = 0; i < c.length; i++) { const a = c[i], b = c[(i + 1) % c.length], ia = a[2] >= .3, ib = b[2] >= .3; if (ia) out.push(a); if (ia !== ib) { const t = (.3 - a[2]) / (b[2] - a[2]); out.push(a.map((v, k) => v + (b[k] - v) * t)); } }
      return out.length < 3 ? null : out.map(q => ({ x: W / 2 + q[0] / q[2] * fpx(), y: Hh / 2 - q[1] / q[2] * fpx() }));
    };
    const poly = (pts, fill, alpha = 1, stroke) => { ctx.globalAlpha = alpha; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } ctx.globalAlpha = 1; };
    const FACES = [[[0, 0, -1], [0, 1, 3, 2]], [[0, 0, 1], [4, 5, 7, 6]], [[-1, 0, 0], [0, 2, 6, 4]], [[1, 0, 0], [1, 3, 7, 5]], [[0, 1, 0], [2, 3, 7, 6]]];
    // caixa (x,altura,z): faces voltadas para a câmera entram na lista L para pintar de trás para frente
    const addBox = (L, x0, y0, z0, x1, y1, z1, rgb, stroke = 'rgba(0,0,0,.35)', skip) => {
      const c = []; for (let i = 0; i < 8; i++) c.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
      FACES.forEach(([n, ix]) => {
        if (skip && skip(n)) return;
        const mid = [(x0 + x1) / 2 + n[0] * (x1 - x0) / 2, (y0 + y1) / 2 + n[1] * (y1 - y0) / 2, (z0 + z1) / 2 + n[2] * (z1 - z0) / 2];
        if (n[0] * (B.c[0] - mid[0]) + n[1] * (B.c[1] - mid[1]) + n[2] * (B.c[2] - mid[2]) <= 0) return;
        const pts = projPoly(ix.map(i => c[i])); if (!pts || pts.every(q => q.x < -40) || pts.every(q => q.x > W + 40) || pts.every(q => q.y < -40) || pts.every(q => q.y > Hh + 40)) return;
        L.push({ pts, d: (mid[0] - B.c[0]) ** 2 + (mid[1] - B.c[1]) ** 2 + (mid[2] - B.c[2]) ** 2, fill: sh(rgb, n[1] > 0 ? 1 : n[2] ? .82 : .6), stroke });
      });
    };
    const textoChao = (t, cx, cz, compr, altMax, cor2) => {                // texto pintado no chão (gira junto com o mapa; tamanho travado na tela p/ não "esticar" perto da câmera)
      const o = proj([cx, .03, cz]), a = proj([cx + 1, .03, cz]), b = proj([cx, .03, cz + 1]); if (!o || !a || !b) return;
      let ax = a.x - o.x, ay = a.y - o.y, bx = b.x - o.x, by = b.y - o.y; if (Math.abs(ax * by - ay * bx) < .5) return; if (ax < 0) { ax = -ax; ay = -ay; bx = -bx; by = -by; }
      const F = 100; ctx.font = `700 ${F}px system-ui,Arial,sans-serif`; const wt = ctx.measureText(t).width / F; let k = Math.min(altMax, compr / Math.max(wt, .01)) / F;
      const lenA = Math.hypot(ax, ay), capPx = Math.min(W, Hh) * .22, pxH = F * k * lenA;              // tamanho máximo na tela (não cresce mais que isso mesmo bem perto/de raspão)
      if (pxH > capPx) k *= capPx / pxH;
      ctx.save(); ctx.transform(ax * k, ay * k, bx * k, by * k, o.x, o.y); ctx.font = `700 ${F}px system-ui,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = F * .1; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(t, 0, 0); ctx.fillStyle = cor2; ctx.fillText(t, 0, 0); ctx.restore();
    };
    const centraliza = () => {
      if (!D.areas.length) { Object.assign(cam, { tx: 0, tz: 0, dist: 20 }); } else {
        const x0 = Math.min(...D.areas.map(a => a.x)), z0 = Math.min(...D.areas.map(a => a.y)), x1 = Math.max(...D.areas.map(a => a.x + a.w)), z1 = Math.max(...D.areas.map(a => a.y + a.h));
        Object.assign(cam, { tx: (x0 + x1) / 2, tz: (z0 + z1) / 2, ty: 0, dist: Math.max(10, Math.hypot(x1 - x0, z1 - z0) * 1.45) });
      } cam.pitch = .75; camOk = true;
    };
    const draw3d = () => {
      pend = 0; wrap.style.overflow = 'hidden'; W = wrap.clientWidth || 320; Hh = wrap.clientHeight || 400; fit(W, Hh);
      ctx.fillStyle = cor('--bg'); ctx.fillRect(0, 0, W, Hh);
      if (!D.areas.length) { rotulo('Crie uma área no modo Plano para ver o 3D.', W / 2, Hh / 2, 14, cor('--muted')); return; }
      if (!camOk) centraliza(); B = basis();
      // chão: áreas, grade e demarcações coloridas
      D.areas.forEach(a => { const p = projPoly([[a.x, 0, a.y], [a.x + a.w, 0, a.y], [a.x + a.w, 0, a.y + a.h], [a.x, 0, a.y + a.h]]); if (p) poly(p, cor('--panel'), 1, cor('--accent')); });
      ctx.strokeStyle = cor('--line'); ctx.lineWidth = 1; ctx.beginPath();
      D.areas.forEach(a => { for (let i = 1; i < a.w; i++) { const p = proj([a.x + i, .005, a.y]), q = proj([a.x + i, .005, a.y + a.h]); if (p && q) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); } } for (let j = 1; j < a.h; j++) { const p = proj([a.x, .005, a.y + j]), q = proj([a.x + a.w, .005, a.y + j]); if (p && q) { ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); } } });
      ctx.stroke();
      D.zonas.forEach(z => { const p = projPoly([[z.x, .01, z.y], [z.x + z.w, .01, z.y], [z.x + z.w, .01, z.y + z.h], [z.x, .01, z.y + z.h]]); if (p) poly(p, z.cor, .5, z.cor); });
      D.zonas.forEach(z => { if (z.nome) textoChao(z.nome, z.x + z.w / 2, z.y + z.h / 2, Math.max(z.w, z.h) * .85, Math.min(z.w, z.h) * .55 + .2, '#fff'); });
      D.areas.forEach(a => { if (a.nome) textoChao(a.nome, a.x + Math.min(a.w, a.nome.length * .55 + 1) / 2, a.y + .45, Math.min(a.w, a.nome.length * .55 + 1), .6, '#e5e7eb'); });
      // objetos
      const L = [], m = D.m || 1;
      const paredes = new Map(); D.objs.filter(o => o.t === 'w').forEach(o => { for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) paredes.set(i + ',' + j, Math.max(paredes.get(i + ',' + j) || 0, altC(o))); });
      paredes.forEach((alt, k) => { const [i, j] = k.split(',').map(Number); addBox(L, i, 0, j, i + 1, alt, j + 1, PAREDE, null, n => (n[0] || n[2]) && paredes.has((i + n[0]) + ',' + (j + n[2]))); });   // paredes ligadas: sem face nem linha entre elas
      D.objs.forEach(o => {
        if (o.t === 'p') {
          const P = pal(o), x0 = o.x + P.g, z0 = o.y + P.g;
          addBox(L, o.x + .03, 0, o.y + .03, o.x + o.w - .03, BASE, o.y + o.h - .03, MAD);
          for (let l = 0; l < int(o.camadas, 1, 10); l++) for (let i = 0; i < P.n; i++) { const cx = i % P.c, cz = Math.floor(i / P.c); addBox(L, x0 + cx * P.bw + .02, BASE + l * P.bh, z0 + cz * P.bd + .02, x0 + (cx + 1) * P.bw - .02, BASE + (l + 1) * P.bh - .01, z0 + (cz + 1) * P.bd - .02, CAIXA[(i + l) % 3]); }
        } else if (o.t === 's') {
          const an = int(o.andares, 1, 6, 4), hz = o.w >= o.h, h1 = HA / m, tk = .1, pt = .1;
          const cel = (fn) => { for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) fn(o.x + i, o.y + j); };
          for (let l = 0; l < an; l++) { const z = l * h1 + .06 / m; cel((x, y) => { addBox(L, x, z, y, x + 1, z + .05 / m, y + 1, DECK, 'rgba(0,0,0,.2)'); if (hz) { addBox(L, x, z + .05 / m, y, x + 1, z + .11 / m, y + tk, LARANJA, null); addBox(L, x, z + .05 / m, y + o.h - tk, x + 1, z + .11 / m, y + o.h, LARANJA, null); } else { addBox(L, x, z + .05 / m, y, x + tk, z + .11 / m, y + 1, LARANJA, null); addBox(L, x + o.w - tk, z + .05 / m, y, x + o.w, z + .11 / m, y + 1, LARANJA, null); } }); }
          const n = hz ? o.w : o.h;
          for (let i = 0; i <= n; i++) [0, 1].forEach(s => { const px = hz ? o.x + i : s ? o.x + o.w - pt : o.x, pz = hz ? (s ? o.y + o.h - pt : o.y) : o.y + i, qx = clamp(px, o.x, o.x + o.w - pt), qz = clamp(pz, o.y, o.y + o.h - pt); addBox(L, qx, 0, qz, qx + pt, an * h1, qz + pt, AZUL, 'rgba(0,0,0,.3)'); });
        }
      });
      L.sort((p, q) => q.d - p.d).forEach(f => poly(f.pts, f.fill, 1, f.stroke));
      D.objs.filter(o => o.nome && o.t !== 'w').forEach(o => { const p = proj([o.x + o.w / 2, altC(o) + .4, o.y + o.h / 2]); if (p) rotulo(o.nome, p.x, p.y, 12); });
      cv.style.cursor = 'grab'; cv.style.touchAction = 'none';
    };
    const draw = () => { if (vista === 'plano') drawPlano(); else draw3d(); };
    const pedir = () => { if (!pend) pend = requestAnimationFrame(draw3d); };
    const tudo = () => { barra(); info(); painel(); draw(); };

    /* ---------- toque / mouse ---------- */
    const cel = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / cs), Math.floor((e.clientY - r.top) / cs)]; };
    const rectDe = d => {
      const dx = d.ex - d.sx, dy = d.ey - d.sy;
      if (tool === 'area' || tool === 'palete' || tool === 'zona') return { x: Math.min(d.sx, d.ex), y: Math.min(d.sy, d.ey), w: Math.abs(dx) + 1, h: Math.abs(dy) + 1 };
      const T = tool === 'p2' ? 2 : 1;                                       // parede e prateleira fina: 1 de grossura
      return Math.abs(dx) >= Math.abs(dy) ? { x: Math.min(d.sx, d.ex), y: d.sy, w: Math.abs(dx) + 1, h: T } : { x: d.sx, y: Math.min(d.sy, d.ey), w: T, h: Math.abs(dy) + 1 };
    };
    const moveGhost = () => {
      if (!drag) return;
      if (drag.mode === 'move') { const f = achar(drag.id), o = f.it, r = { x: drag.nx ?? o.x, y: drag.ny ?? o.y, w: o.w, h: o.h }; ghost = drag.moveu ? { r: { ...o, ...r }, ok: f.k === 'z' ? cobre(r) : livre(r, o.id, o.t) } : null; return; }
      let r = rectDe(drag); r = { x: r.x, y: r.y, w: Math.min(r.w, FW - r.x), h: Math.min(r.h, FH - r.y) };
      if (tool === 'area') ghost = { r, ok: true }; else if (tool === 'zona') ghost = { r: { t: 'z', cor: novoZ.cor, nome: novoZ.nome, ...r }, ok: cobre(r) };
      else { const t = tool === 'palete' ? 'p' : tool === 'parede' ? 'w' : 's'; ghost = { r: { t, camadas: 3, cpc: 4, andares: 4, alt: 3, ...r }, ok: livre(r, null, t) }; }
    };
    const ptrs = new Map(); let pin = 0; let pan2d = null;
    cv.onpointerdown = e => {
      if (vista === 'iso') { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); pin = 0; return; }
      if (tool === 'nav') { cv.setPointerCapture(e.pointerId); pan2d = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, moveu: false }; cv.style.cursor = 'grabbing'; return; }
      const [cx, cy] = cel(e); if (cx < 0 || cy < 0 || cx >= FW || cy >= FH) return; cv.setPointerCapture(e.pointerId);
      if (tool === 'sel') {
        const h = topo(cx, cy); selId = h ? h.it.id : null;
        if (h && h.k !== 'a' && podeE()) drag = { mode: 'move', id: h.it.id, dx: cx - h.it.x, dy: cy - h.it.y, moveu: false };
        painel(); draw(); return;
      }
      if (tool === 'del') { const h = topo(cx, cy); if (h) apagar(h.it.id); return; }
      if (!podeE()) return;
      if (tool !== 'area' && !D.areas.length) { alert('Primeiro crie uma área com a ferramenta ⬚ Área.'); return; }
      drag = { mode: 'draw', sx: cx, sy: cy, ex: cx, ey: cy }; ghost = null; moveGhost(); draw();
    };
    cv.onpointermove = e => {
      if (pan2d) { const dx = e.clientX - pan2d.x, dy = e.clientY - pan2d.y; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) pan2d.moveu = true; wrap.scrollLeft = pan2d.sl - dx; wrap.scrollTop = pan2d.st - dy; return; }
      if (vista === 'iso') {
        const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        const pan = (ax, ay) => { const s = cam.dist * .0016, fg = Math.hypot(B.f[0], B.f[2]) || 1; cam.tx += -B.r[0] * ax * s + (B.f[0] / fg) * ay * s; cam.tz += -B.r[2] * ax * s + (B.f[2] / fg) * ay * s; };
        if (ptrs.size === 1) { if (e.shiftKey || e.buttons === 2) pan(dx, dy); else { cam.yaw -= dx * .008; cam.pitch = clamp(cam.pitch + dy * .008, .12, 1.5); } }
        else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pin) cam.dist = clamp(cam.dist * pin / d, 3, 400); pin = d; pan(dx / 2, dy / 2); }
        B = basis(); pedir(); return;
      }
      if (!drag) return; const [cx, cy] = cel(e);
      if (drag.mode === 'move') { const o = achar(drag.id).it; drag.nx = clamp(cx - drag.dx, 0, FW - o.w); drag.ny = clamp(cy - drag.dy, 0, FH - o.h); drag.moveu = drag.nx !== o.x || drag.ny !== o.y; }
      else { drag.ex = clamp(cx, 0, FW - 1); drag.ey = clamp(cy, 0, FH - 1); }
      moveGhost(); draw();
    };
    const solta = e => {
      if (pan2d) { pan2d = null; cv.style.cursor = 'grab'; return; }
      if (vista === 'iso') { ptrs.delete(e.pointerId); pin = 0; return; }
      if (!drag) return; const d = drag, g = ghost; drag = null; ghost = null;
      if (d.mode === 'move') { const f = achar(d.id); if (d.moveu && podeE() && f) { const o = f.it, r = { x: d.nx, y: d.ny, w: o.w, h: o.h }; if (f.k === 'z' ? cobre(r) : livre(r, o.id, o.t)) { push(); o.x = r.x; o.y = r.y; salvar(); } } painel(); info(); draw(); return; }
      if (g && g.ok) {
        push(); const r = g.r, id = uid();
        if (tool === 'area') { D.areas.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, nome: '' }); if (D.areas.length === 1) camOk = false; selId = id; }
        else if (tool === 'zona') { D.zonas.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, nome: novoZ.nome.trim(), cor: novoZ.cor }); selId = id; }
        else { const o = { id, t: r.t, x: r.x, y: r.y, w: r.w, h: r.h, nome: '', conteudo: '' }; if (o.t === 'p') { o.camadas = 3; o.cpc = 4; } else if (o.t === 'w') o.alt = 3; else o.andares = 4; D.objs.push(o); selId = id; }
        salvar(); tudo();
      } else { if (g && !g.ok) alert(tool === 'zona' ? 'A demarcação precisa ficar dentro de uma área.' : 'Não cabe aí: precisa ficar dentro de uma área e sem encostar em outro objeto (paredes podem encostar em paredes).'); draw(); }
    };
    cv.onpointerup = solta; cv.onpointercancel = e => { ptrs.delete(e.pointerId); pan2d = null; drag = null; ghost = null; draw(); };
    cv.oncontextmenu = e => { if (vista === 'iso') e.preventDefault(); };
    cv.addEventListener('wheel', e => { if (vista !== 'iso') return; e.preventDefault(); cam.dist = clamp(cam.dist * (1 + e.deltaY * .001), 3, 400); B = basis(); pedir(); }, { passive: false });
    new ResizeObserver(() => { if (body.isConnected && vista === 'iso') pedir(); }).observe(wrap);
    document.addEventListener('keydown', function ev(e) {
      if (!body.isConnected) return document.removeEventListener('keydown', ev);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && vista === 'plano' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) apagar(selId);
    });

    document.addEventListener('cfo-sync', function ev() { if (!body.isConnected) return document.removeEventListener('cfo-sync', ev); dlItens.innerHTML = itensPlanilha().map(n => `<option value="${esc(n)}">`).join(''); });

    tudo();
    if (D.areas.length) requestAnimationFrame(() => { wrap.scrollLeft = Math.max(0, (Math.min(...D.areas.map(a => a.x)) - 1) * cs); wrap.scrollTop = Math.max(0, (Math.min(...D.areas.map(a => a.y)) - 1) * cs); });
  };
})();
