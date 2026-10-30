/* ===== Ferramentas > Mapa livre =====
   Mapa de almoxarifado de desenho LIVRE (diferente do "Mapa almoxarifado", de fileiras fixas).
   - ⬚ Área: arraste sobre os quadradinhos. Dá para criar VÁRIAS áreas (separadas ou coladas); só se coloca coisa dentro de área.
   - ▨ Demarcar: pinta um pedaço do chão com cor e nome (ex.: Entrada, Expedição). Pode ficar embaixo de paletes e prateleiras.
   - ▮ Parede: retas de 1 quadradinho. Paredes que se encontram (cantos, T, lado a lado) se ligam, sem divisória.
   - 📦 Palete (modelo do arquivo 'palete-componentes'): base de madeira 15 cm + caixas de papelão CÚBICAS; camadas (1 a 10) e caixas por lado (1 a 10).
   - ▬ / ▰ Prateleira: 1 ou 2 quadradinhos de grossura, do comprimento que quiser.
   - 👆 Selecionar: mover (arrastando), girar, mudar tamanho, nome, cor, etc.
   Vista "Plano" (de cima, onde se edita) e "3D" (gira com o dedo/mouse, zoom por pinça/roda, 2 dedos ou Shift move).
   Zoom no Plano: pinça (2 dedos) ou roda do mouse. 👆 Selecionar liga/desliga (desligado = navegar). Objeto ▾ = palete e prateleira tipo 1/2; Ambiente ▾ = área, demarcar e parede.
   No 3D o nome/conteúdo é escrito no próprio palete ou prateleira (na face mais voltada para a câmera).
   Dados 'mapalivre' = { m, areas:[{id,x,y,w,h,nome}], zonas:[{id,x,y,w,h,nome,cor}], objs:[{id,t:'p'|'s'|'w',x,y,w,h,nome,conteudo,camadas,cpl,andares,alt}] }
   Busca (🔎 no topo): nome/código de item da planilha do setor, ou nome/conteúdo de palete, prateleira e demarcação. Destaca em amarelo no Plano e no 3D (resto apagado, alfinete em cima),
   leva a câmera até lá e, se o item estiver em mais de um lugar, ◀ ▶ alternam entre os locais. Um item "está" num palete/prateleira quando o campo Conteúdo dele cita o nome do item.
   Permissão: só perfis de "Outros setores" e o perfil principal (veja CFO.pode em login.js). */
(() => {
  const K = 'mapalivre', FW = 100, FH = 70, esc = CFO.esc;
  const HA = .9, PALH = .15;                                   // altura de cada andar da prateleira (m) e do palete (m): 15 cm, como no modelo
  // Texturas do papelão (idênticas às do modelo 'palete-componentes'): liso, com fita no topo e com etiqueta + símbolo "este lado para cima"
  const TEX = (() => {
    let sd = 20261030; const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const cnv = () => { const c = document.createElement('canvas'); c.width = c.height = 256; return c; };
    const base = g => {
      g.fillStyle = '#d2a06a'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(120,80,40,' + (0.04 + rnd() * 0.05) + ')'; g.beginPath(); const y = rnd() * 256; g.moveTo(0, y); g.lineTo(256, y + (rnd() * 6 - 3)); g.stroke(); }
      g.strokeStyle = 'rgba(90,55,25,0.35)'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 252);
    };
    const plain = cnv(); base(plain.getContext('2d'));
    const top = cnv(); { const g = top.getContext('2d'); base(g);
      g.fillStyle = '#ecca9b'; g.fillRect(0, 100, 256, 56); g.strokeStyle = 'rgba(120,80,40,0.35)'; g.lineWidth = 2; g.strokeRect(0, 100, 256, 56);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 106, 256, 10); }
    const label = cnv(); { const g = label.getContext('2d'); base(g);
      g.fillStyle = '#f4f4f1'; g.fillRect(150, 34, 84, 52);
      g.fillStyle = '#9aa0a6'; [48, 58, 68, 78].forEach((y, i) => g.fillRect(156, y, i % 2 ? 50 : 68, 4));
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 5; const x = 34, y = 150;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 40, y); g.lineTo(x + 20, y + 30); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(x + 20, y + 30); g.lineTo(x + 20, y + 54); g.moveTo(x + 6, y + 54); g.lineTo(x + 34, y + 54); g.stroke();
      g.beginPath(); g.moveTo(x + 84, y + 54); g.lineTo(x + 84, y + 6); g.stroke();
      g.beginPath(); g.moveTo(x + 68, y + 22); g.lineTo(x + 84, y + 4); g.lineTo(x + 100, y + 22); g.stroke(); }
    return { plain, top, label };
  })();
  const MADEIRA = [[228, 181, 62], [217, 166, 47], [234, 189, 74]], PAPELAO = [210, 160, 106];     // madeira (3 tons) e cor do papelão (#d2a06a)
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
      .ml-pn button.danger{background:transparent;color:#dc2626;border-color:#dc2626}
      .ml-dd{position:relative;display:inline-block}
      .ml-ddl{position:absolute;top:calc(100% + 4px);left:0;z-index:30;min-width:210px;padding:.3rem;border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:.2rem}
      .ml-tb .ml-ddl button{width:100%;text-align:left}`;
    document.head.append(st);
  }

  CFO.modules.mapalivre = body => {
    let D = CFO.store.get(K, null);
    if (!D || !Array.isArray(D.objs)) D = { m: 1, areas: [], zonas: [], objs: [] };
    if (!Array.isArray(D.areas)) D.areas = D.area ? [{ id: uid(), ...D.area, nome: '' }] : [];   // migra o formato antigo (uma área só)
    delete D.area; if (!Array.isArray(D.zonas)) D.zonas = [];
    D.objs.forEach(o => { if (o.t === 'p' && !o.cpl) o.cpl = clamp(Math.round(Math.sqrt(o.cpc || [1, 2, 4, 6][(o.cx || 3) - 1] || 4)), 1, 10); });   // palete antigo: caixas por camada -> por lado
    const podeE = () => CFO.pode('editar', 'mapalivre'), podeA = () => CFO.pode('apagar', 'mapalivre');
    const hist = [];
    const salvar = () => CFO.store.set(K, D);
    const push = () => { const s = JSON.stringify(D); if (hist[hist.length - 1] !== s) { hist.push(s); if (hist.length > 40) hist.shift(); } };
    let tool = podeE() ? (D.areas.length ? 'palete' : 'area') : 'nav', vista = 'plano', cs = 28, selId = null, drag = null, ghost = null;
    let editando = podeE() && !D.areas.length;      // layout (criar/editar) só aparece atrás da engrenagem; mapa novo já abre nele
    const itensPlanilha = () => CFO.store.get('epi', []).map(r => r.item).filter(Boolean);
    const novoZ = { nome: '', cor: CORES[0] };
    const cam = { yaw: -.55, pitch: .75, dist: 40, tx: 0, ty: 0, tz: 0 }; let camOk = false, pend = 0;

    body.innerHTML = `<div class="ml"><div class="ml-tb ml-busca"><input id="ml-q" type="search" placeholder="🔎 Pesquisar item, código ou local" autocomplete="off">${podeE() ? '<button id="ml-gear" class="ghost" aria-label="Editar layout">⚙ Editar layout</button>' : ''}<button id="ml-img" class="ghost" aria-label="Salvar imagem do mapa">⬇ Imagem</button></div>
      <div id="ml-res"></div><div class="ml-tb" id="ml-tools"></div><p class="ml-info" id="ml-info"></p>
      <div class="ml-cv" id="ml-cv"><canvas id="ml-c"></canvas></div><div id="ml-pn"></div><datalist id="ml-itens"></datalist></div>`;
    const $ = s => body.querySelector(s), cv = $('#ml-c'), ctx = cv.getContext('2d'), wrap = $('#ml-cv');

    /* ---------- pesquisar item e ir até o local (mesma ideia da busca do Mapa almoxarifado de EPIs) ----------
       Digite nome/código do item da planilha do setor (ou o nome/conteúdo de um palete, prateleira ou demarcação).
       O mapa destaca em AMARELO o que foi achado (no Plano e no 3D), escurece o resto, põe um alfinete em cima e
       leva a câmera até lá. Item guardado em mais de um lugar: ◀ ▶ alternam entre os locais.
       Um item "está" num palete/prateleira quando o campo Conteúdo dele cita o nome do item. */
    const dlItens = $('#ml-itens'), qi = $('#ml-q'), res = $('#ml-res');
    dlItens.innerHTML = itensPlanilha().map(n => `<option value="${esc(n)}">`).join('');
    let foco = null;                                                   // { titulo, sub, ids: [objetos/demarcações achados], i }
    const nrm = s => CFO.norm(String(s ?? ''));
    const nomeObj = o => o.nome || (o.t === 'p' ? 'Palete' : 'Prateleira');
    const areaDe = it => { const a = D.areas.find(a => it.x + it.w / 2 >= a.x && it.y + it.h / 2 >= a.y && it.x + it.w / 2 < a.x + a.w && it.y + it.h / 2 < a.y + a.h); return a && a.nome ? a.nome : ''; };
    const localTxt = id => { const f = achar(id); if (!f) return 'local removido'; const it = f.it, ar = areaDe(it); return f.k === 'z' ? `▨ ${it.nome}` : `${nomeObj(it)}${ar ? ' · ' + ar : ''}`; };
    const tem = (conteudo, item) => { const c = nrm(conteudo), i = nrm(item); return !!c && !!i && (c.includes(i) || (c.length >= 4 && i.includes(c))); };
    const resultadosBusca = () => {
      const palavras = nrm(qi.value).split(/\s+/).filter(Boolean); if (!palavras.length) return [];
      const todas = t => palavras.every(w => nrm(t).includes(w)), out = [], cobertos = new Set();
      CFO.store.get('epi', []).filter(r => todas(r.item + ' ' + (r.codigo || ''))).slice(0, 30).forEach(r => {
        const ids = D.objs.filter(o => o.t !== 'w' && tem(o.conteudo, r.item)).map(o => o.id); ids.forEach(i => cobertos.add(i));
        out.push({ titulo: r.item, sub: `${r.codigo ? r.codigo + ' · ' : ''}estoque ${r.qtd ?? '-'}`, ids, exato: nrm(r.item) === nrm(qi.value) });
      });
      D.objs.filter(o => o.t !== 'w' && !cobertos.has(o.id) && todas((o.nome || '') + ' ' + (o.conteudo || ''))).slice(0, 20)
        .forEach(o => out.push({ titulo: nomeObj(o), sub: o.conteudo || '', ids: [o.id], exato: !!o.nome && nrm(o.nome) === nrm(qi.value) }));
      D.zonas.filter(z => z.nome && todas(z.nome)).slice(0, 10).forEach(z => out.push({ titulo: '▨ ' + z.nome, sub: 'demarcação', ids: [z.id], exato: nrm(z.nome) === nrm(qi.value) }));
      return out;
    };
    const vivos = () => foco ? foco.ids.filter(id => achar(id)) : [];
    const irPara = it => {
      selId = it.id; editando = false;
      if (vista === 'plano') { const px = (it.x) * cs, py = (it.y) * cs; wrap.scrollLeft = Math.max(0, px - wrap.clientWidth / 2); wrap.scrollTop = Math.max(0, py - wrap.clientHeight / 2); }
      else { cam.tx = it.x; cam.tz = it.y; cam.dist = clamp(Math.max(it.w, it.h) * 5, 8, 400); camOk = true; B = basis(); pedir(); }
      tool = 'sel'; barra(); painel(); draw();
    };
    const ir = () => { const id = vivos()[foco.i]; const f = id && achar(id); if (f) { const it = f.it; irPara({ id, x: it.x + it.w / 2, y: it.y + it.h / 2, w: it.w, h: it.h }); } else draw(); };
    const escolher = (e, i = 0) => { foco = { ...e, i }; res.innerHTML = statusBusca(); ir(); };
    const statusBusca = () => {
      const ids = vivos(); if (!foco) return '';
      const i = Math.min(foco.i, Math.max(ids.length - 1, 0));
      return `<div class="mp-st"><div class="mp-t"><b>${esc(foco.titulo)}</b><small>${esc(foco.sub || '')}</small></div>
        <div class="mp-nav">${ids.length > 1 ? `<button class="ghost" data-nav="-1" aria-label="Local anterior">◀</button><span>${i + 1}/${ids.length}</span><button class="ghost" data-nav="1" aria-label="Próximo local">▶</button>` : ''}
        <span>${ids.length ? '📍 ' + esc(localTxt(ids[i])) : 'ainda sem local no mapa (escreva o nome do item em Conteúdo, ao editar o palete ou a prateleira)'}</span><button class="ghost" data-x aria-label="Limpar busca">✕</button></div></div>`;
    };
    const listaBusca = lista => !qi.value.trim() ? '' : !lista.length ? '<p class="empty">Nada encontrado no mapa nem na planilha deste setor.</p>'
      : `<div class="mp-res">${lista.map((e, n) => `<div class="mp-it" data-e="${n}"><div class="mp-t"><b>${esc(e.titulo)}</b><small>${esc(e.sub || '')}</small></div>
          <div class="mp-ls">${e.ids.map((id, k) => `<button class="mp-loc" data-e="${n}" data-k="${k}">📍 ${esc(localTxt(id))}</button>`).join('') || '<small class="mut">sem local no mapa</small>'}</div></div>`).join('')}</div>`;
    let ultima = [];
    qi.addEventListener('input', () => {
      foco = null; ultima = resultadosBusca();
      const um = ultima.length === 1 ? ultima[0] : ultima.find(e => e.exato);       // nome completo (ou único resultado): vai direto, sem lista
      if (um) return escolher(um);
      res.innerHTML = listaBusca(ultima); draw();
    });
    qi.addEventListener('keydown', e => { if (e.key === 'Enter') { ultima = resultadosBusca(); if (ultima[0]) escolher(ultima[0]); else if (qi.value.trim()) res.innerHTML = listaBusca(ultima); } });
    res.addEventListener('click', e => {
      const t = e.target.closest('button,.mp-it'); if (!t) return;
      if ('x' in t.dataset) { foco = null; qi.value = ''; res.innerHTML = ''; return draw(); }
      if (t.dataset.nav) { const n = vivos().length; foco.i = (foco.i + +t.dataset.nav + n) % n; res.innerHTML = statusBusca(); return ir(); }
      const en = ultima[+t.dataset.e]; if (en) escolher(en, +t.dataset.k || 0);
    });
    $('#ml-img').onclick = () => png();
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
    // Palete no modelo do arquivo 'palete-componentes': base 15 cm + caixas CÚBICAS de lado = (menor lado do palete) / (caixas por lado)
    const nCam = o => int(o.camadas, 1, 10, 3), nLado = o => int(o.cpl, 1, 10, 2);
    const pal = o => {
      const m = D.m || 1, P = nLado(o), s = Math.min(o.w, o.h) / P, L = nCam(o), ph = PALH / m;     // medidas em quadradinhos
      const nx = Math.max(1, Math.floor(o.w / s + .001)), nz = Math.max(1, Math.floor(o.h / s + .001));
      return { P, s, L, ph, nx, nz, n: nx * nz, ox: (o.w - nx * s) / 2, oz: (o.h - nz * s) / 2, H: ph + s * L, m };
    };
    const altC = o => o.t === 'w' ? (o.alt || 3) / (D.m || 1) : o.t === 'p' ? pal(o).H : HA * int(o.andares, 1, 6) / (D.m || 1);   // altura em quadradinhos

    /* ---------- barra de ferramentas ---------- */
    const GRUPOS = { obj: ['📦 Objeto', [['palete', '📦 Palete'], ['p1', '▬ Prateleira tipo 1'], ['p2', '▰ Prateleira tipo 2']]], amb: ['🏗 Ambiente', [['area', '⬚ Área'], ['zona', '▨ Demarcar'], ['parede', '▮ Parede']]] };
    let menu = null;                                              // listinha aberta (obj | amb)
    const barra = () => {
      const edit = podeE() && editando, t = $('#ml-tools'), gear = $('#ml-gear');
      if (gear) { gear.classList.toggle('on', editando); gear.textContent = editando ? '⚙ Editando layout (toque p/ sair)' : '⚙ Editar layout'; }
      if (!editando && tool !== 'nav' && tool !== 'sel') tool = 'nav';
      if (!edit) menu = null;
      const ativo = k => tool === k && vista === 'plano', bt = (k, n) => `<button data-t="${k}" class="${ativo(k) ? 'on' : ''}">${n}</button>`;
      const dd = g => { const [rot, its] = GRUPOS[g], cur = its.find(([k]) => ativo(k));
        return `<span class="ml-dd"><button data-m="${g}" class="${cur ? 'on' : ''}" aria-haspopup="menu" aria-expanded="${menu === g}">${cur ? cur[1] : rot} ▾</button>${menu === g ? `<div class="ml-ddl" role="menu">${its.map(([k, n]) => `<button role="menuitem" data-t="${k}" class="${ativo(k) ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}</span>`; };
      t.innerHTML = (podeE() ? bt('sel', '👆 Selecionar') : '') + (edit ? dd('obj') + dd('amb') + (podeA() ? bt('del', '🗑 Apagar') : '') + '<button data-a="undo">↶ Desfazer</button>' : '') +
        `<span class="sep"></span><button data-v="plano" class="${vista === 'plano' ? 'on' : ''}">Plano</button><button data-v="iso" class="${vista === 'iso' ? 'on' : ''}">3D</button>` +
        (vista === 'iso' ? '<button data-a="rot">⟳ Girar</button><button data-a="reset">⌖ Centralizar</button>' : '') +
        (edit && podeA() ? '<button data-a="limpar" style="color:#dc2626;border-color:#dc2626">Limpar mapa</button>' : '');
      // apertar a ferramenta que já está ligada desliga (volta a navegar)
      t.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const k = b.dataset.t; if (ativo(k)) { tool = 'nav'; selId = null; } else { tool = k; vista = 'plano'; if (k !== 'sel') selId = null; } menu = null; tudo(); });
      t.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { menu = menu === b.dataset.m ? null : b.dataset.m; barra(); });
      t.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { vista = b.dataset.v; selId = vista === 'iso' ? null : selId; menu = null; tudo(); });
      t.querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(b.dataset.a));
    };
    document.addEventListener('click', function ev(e) { if (!body.isConnected) return document.removeEventListener('click', ev); if (menu && !e.target.closest('.ml-dd')) { menu = null; barra(); } });
    // Imagem do mapa: no Plano recorta só a parte com as áreas (com uma folga); no 3D salva a vista atual
    const png = () => {
      let sx = 0, sy = 0, sw = cv.width, sh2 = cv.height;
      if (vista === 'plano' && D.areas.length) {
        const k = cv.width / (FW * cs), x0 = Math.max(0, Math.min(...D.areas.map(a => a.x)) - 1), y0 = Math.max(0, Math.min(...D.areas.map(a => a.y)) - 1), x1 = Math.min(FW, Math.max(...D.areas.map(a => a.x + a.w)) + 1), y1 = Math.min(FH, Math.max(...D.areas.map(a => a.y + a.h)) + 1);
        sx = x0 * cs * k; sy = y0 * cs * k; sw = (x1 - x0) * cs * k; sh2 = (y1 - y0) * cs * k;
      }
      const c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(sw)); c2.height = Math.max(1, Math.round(sh2));
      c2.getContext('2d').drawImage(cv, sx, sy, sw, sh2, 0, 0, c2.width, c2.height);
      c2.toBlob(b => b && CFO.baixar(b, 'mapa-livre.png'));
    };
    const acao = a => {
      if (a === 'undo') { const atual = JSON.stringify(D); while (hist.length && hist[hist.length - 1] === atual) hist.pop(); const s = hist.pop(); if (!s) return; D = JSON.parse(s); if (selId && !achar(selId)) selId = null; salvar(); tudo(); }
      else if (a === 'rot') { cam.yaw += Math.PI / 2; draw(); }
      else if (a === 'reset') { camOk = false; draw(); }
      else if (a === 'limpar') { if (!confirm('Apagar TODO o mapa livre (áreas, demarcações, paletes, prateleiras e paredes)?')) return; push(); D = { m: D.m || 1, areas: [], zonas: [], objs: [] }; selId = null; tool = 'area'; camOk = false; salvar(); tudo(); }
    };

    /* ---------- informações e painel ---------- */
    const info = () => {
      const m = D.m || 1, ps = D.objs.filter(o => o.t === 'p'), ss = D.objs.filter(o => o.t === 's'), ws = D.objs.filter(o => o.t === 'w');
      const caixas = ps.reduce((n, o) => { const P = pal(o); return n + P.L * P.n; }, 0);
      $('#ml-info').innerHTML = !D.areas.length ? 'Comece pela ferramenta <b>⬚ Área</b>: arraste sobre os quadradinhos para escolher o tamanho do espaço. Pode criar mais de uma.'
        : `<b>${D.areas.length}</b> área(s) · <b>${ps.length}</b> palete(s) com ${caixas} caixas · <b>${ss.length}</b> prateleira(s)${ws.length ? ` · <b>${ws.length}</b> parede(s)` : ''}${D.zonas.length ? ` · <b>${D.zonas.length}</b> demarcação(ões)` : ''} · cada quadradinho = ${String(m).replace('.', ',')} m` +
          (vista === 'iso' ? ' · 3D: arraste para girar, pinça/roda para aproximar, 2 dedos ou Shift para mover' : tool === 'nav' ? ' · arraste para andar pelo mapa · pinça (2 dedos) ou roda do mouse = zoom' : ' · pinça (2 dedos) ou roda do mouse = zoom');
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
        ${k === 'o' && o.t === 'p' ? campo('p-c', 'Camadas (1 a 10)', nCam(o), 'type="number" min="1" max="10"', dis) + campo('p-q', 'Caixas por lado (1 a 10)', nLado(o), 'type="number" min="1" max="10"', dis) : ''}
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
      num('#p-c', v => ap(() => { o.camadas = int(v, 1, 10, 1); }, true)); num('#p-q', v => ap(() => { o.cpl = int(v, 1, 10, 2); }, true));
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
    const MAD = [226, 176, 62], CAIXA = [[190, 146, 96], [205, 161, 110], [176, 134, 86]], AZUL = [128, 137, 146], LARANJA = [98, 107, 115], DECK = [185, 193, 200], PAREDE = [158, 164, 172];
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
        const P = pal(o); ctx.fillStyle = sh(MADEIRA[1], 1); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);              // base de madeira
        const sz = P.s * cs;
        for (let iz = 0; iz < P.nz; iz++) for (let ix = 0; ix < P.nx; ix++) {                                           // topo das caixas: papelão + fita no meio
          const bx = x + (P.ox + ix * P.s) * cs + .5, by = y + (P.oz + iz * P.s) * cs + .5, q = sz - 1;
          ctx.fillStyle = sh(PAPELAO, 1); ctx.fillRect(bx, by, q, q); ctx.fillStyle = '#ecca9b'; ctx.fillRect(bx, by + q * .39, q, q * .22);
          ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(bx, by + q * .42, q, q * .04); ctx.strokeStyle = 'rgba(90,55,25,.55)'; ctx.strokeRect(bx + .5, by + .5, q - 1, q - 1);
        }
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else if (o.t === 's') {
        const hz = o.w >= o.h; ctx.fillStyle = sh(DECK, .95); ctx.fillRect(x + 1, y + 1, w - 2, h - 2); ctx.fillStyle = sh(LARANJA, 1);
        if (hz) { ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); } else { ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h); }
        ctx.fillStyle = sh(AZUL, 1); const n = hz ? o.w : o.h;
        for (let i = 0; i <= n; i++) { const px = hz ? clamp(x + i * cs - 3, x, x + w - 6) : x, py = hz ? y : clamp(y + i * cs - 3, y, y + h - 6); ctx.fillRect(px, py, 6, 6); if (hz) ctx.fillRect(px, y + h - 6, 6, 6); else ctx.fillRect(x + w - 6, py, 6, 6); }
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else { ctx.fillStyle = '#555b63'; ctx.fillRect(x, y, w, h); }
      ctx.globalAlpha = 1;
      if (o.t !== 'w') { const nome = o.nome || (o.t === 'p' ? 'Palete' : 'Prateleira'), tag = o.t === 'p' ? `${nome} · ${nCam(o)}×` : `${nome} · ${int(o.andares, 1, 6, 4)}↕`; ctx.save(); ctx.translate(x + w / 2, y + h / 2); if (o.h > o.w * 1.6) ctx.rotate(-Math.PI / 2); rotulo(tag, 0, 0, clamp(Math.max(w, h) / (tag.length * .62), 8, 15)); ctx.restore(); }
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
      vivos().forEach(id => { const f = achar(id); if (!f) return; const o = f.it; ctx.fillStyle = 'rgba(250,190,40,.35)'; ctx.fillRect(o.x * cs, o.y * cs, o.w * cs, o.h * cs); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4; ctx.strokeRect(o.x * cs - 2, o.y * cs - 2, o.w * cs + 4, o.h * cs + 4); });
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
    let hitNow = false, dimNow = false; const HIT = [250, 190, 40];       // busca: objeto achado (amarelo) / os outros ficam apagados
    const addBox = (L, x0, y0, z0, x1, y1, z1, rgb, stroke = 'rgba(0,0,0,.35)', skip, tx) => {
      if (hitNow) { rgb = HIT; stroke = '#fff'; }
      const bxo = { x0, x1, y0, y1, z0, z1, f: [], lat: tx !== undefined }; L.boxes.push(bxo);      // a ordem de pintura é decidida por caixa (veja ordena)
      const c = []; for (let i = 0; i < 8; i++) c.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
      FACES.forEach(([n, ix]) => {
        if (skip && skip(n)) return;
        const mid = [(x0 + x1) / 2 + n[0] * (x1 - x0) / 2, (y0 + y1) / 2 + n[1] * (y1 - y0) / 2, (z0 + z1) / 2 + n[2] * (z1 - z0) / 2];
        if (n[0] * (B.c[0] - mid[0]) + n[1] * (B.c[1] - mid[1]) + n[2] * (B.c[2] - mid[2]) <= 0) return;
        const pts = projPoly(ix.map(i => c[i])); if (!pts || pts.every(q => q.x < -40) || pts.every(q => q.x > W + 40) || pts.every(q => q.y < -40) || pts.every(q => q.y > Hh + 40)) return;
        let t = null;                                                         // textura do papelão (só nas caixas do palete; busca/apagado ficam em cor lisa)
        if (tx !== undefined && !hitNow && !dimNow) {
          const side = tx % 2 ? TEX.label : TEX.plain;                       // como no modelo: +x e -z "lado" (com etiqueta nas caixas ímpares), +z sempre com etiqueta, -x liso, topo com fita
          t = n[1] > 0 ? { img: TEX.top, tl: [x0, y1, z0], tr: [x1, y1, z0], bl: [x0, y1, z1], k: 1 }
            : n[2] > 0 ? { img: TEX.label, tl: [x0, y1, z1], tr: [x1, y1, z1], bl: [x0, y0, z1], k: .82 }
            : n[2] < 0 ? { img: side, tl: [x1, y1, z0], tr: [x0, y1, z0], bl: [x1, y0, z0], k: .82 }
            : n[0] > 0 ? { img: side, tl: [x1, y1, z1], tr: [x1, y1, z0], bl: [x1, y0, z1], k: .6 }
            : { img: TEX.plain, tl: [x0, y1, z0], tr: [x0, y1, z1], bl: [x0, y0, z0], k: .6 };
        }
        bxo.f.push({ pts, d: (mid[0] - B.c[0]) ** 2 + (mid[1] - B.c[1]) ** 2 + (mid[2] - B.c[2]) ** 2, fill: sh(rgb, n[1] > 0 ? 1 : n[2] ? .82 : .6), stroke, a: dimNow ? .28 : 1, t });
      });
    };
    // Estica a textura (256×256) sobre a face da caixa em perspectiva e aplica o sombreado da face; caixa pequena na tela fica só na cor
    const texFace = f => {
      const t = f.t, A = proj(t.tl), Bp = proj(t.tr), C = proj(t.bl); if (!A || !Bp || !C) return;
      if (Math.hypot(Bp.x - A.x, Bp.y - A.y) < 10 && Math.hypot(C.x - A.x, C.y - A.y) < 10) return;
      ctx.save(); ctx.beginPath(); f.pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath(); ctx.clip();
      ctx.transform((Bp.x - A.x) / 256, (Bp.y - A.y) / 256, (C.x - A.x) / 256, (C.y - A.y) / 256, A.x, A.y);
      ctx.drawImage(t.img, 0, 0); if (t.k < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - t.k})`; ctx.fillRect(0, 0, 256, 256); } ctx.restore();
    };
    /* Ordem de pintura SEM faces sumindo: em vez de ordenar faces pela distância do centro (errado para peças grandes ao lado de pequenas),
       ordena CAIXAS pelo plano que as separa: se existe um plano entre A e B com a câmera do lado de A, A nunca fica atrás de B.
       Monta as precedências e pinta do mais longe ao mais perto (ordenação topológica; sem plano decisivo, cai na distância). */
    const ordena = bs => {
      const n = bs.length, c = B.c, dist = bs.map(b => ((b.x0 + b.x1) / 2 - c[0]) ** 2 + ((b.y0 + b.y1) / 2 - c[1]) ** 2 + ((b.z0 + b.z1) / 2 - c[2]) ** 2);
      const prim = [...Array(n).keys()].sort((i, j) => dist[j] - dist[i]);
      if (n < 2) return prim;
      const ind = new Int32Array(n), out = Array.from({ length: n }, () => []);
      const AX = [['x0', 'x1', 0], ['y0', 'y1', 1], ['z0', 'z1', 2]];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = bs[i], b = bs[j];
        for (const [lo, hi, k] of AX) {
          let first = -1;
          if (a[hi] <= b[lo]) { if (c[k] <= a[hi]) first = j; else if (c[k] >= b[lo]) first = i; }
          else if (b[hi] <= a[lo]) { if (c[k] <= b[hi]) first = i; else if (c[k] >= a[lo]) first = j; }
          else continue;
          if (first >= 0) { const o2 = first === i ? j : i; out[first].push(o2); ind[o2]++; break; }
        }
      }
      const feito = new Uint8Array(n), res = []; let ini = 0;
      for (let r = 0; r < n; r++) {
        while (feito[prim[ini]]) ini++;
        let u = -1; for (let q = ini; q < n; q++) { const v = prim[q]; if (!feito[v] && ind[v] === 0) { u = v; break; } }
        if (u < 0) u = prim[ini];                                   // ciclo raro: segue pela distância
        feito[u] = 1; res.push(u); out[u].forEach(v => { ind[v]--; });
      }
      return res;
    };
    const pintaFace = f => { poly(f.pts, f.fill, f.a ?? 1, f.stroke); if (f.t) texFace(f); };
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
      const L = [], m = D.m || 1, G = [], pins = []; L.boxes = [];
      const paredes = new Map(); D.objs.filter(o => o.t === 'w').forEach(o => { for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) paredes.set(i + ',' + j, Math.max(paredes.get(i + ',' + j) || 0, altC(o))); });
      paredes.forEach((alt, k) => { const [i, j] = k.split(',').map(Number); const b0 = L.boxes.length; G.push({ b0, b1: b0 + 1, tx: [] }); addBox(L, i, 0, j, i + 1, alt, j + 1, PAREDE, null, n => (n[0] || n[2]) && paredes.has((i + n[0]) + ',' + (j + n[2]))); });   // paredes ligadas: sem face nem linha entre elas
      // Nome e conteúdo ficam ESCRITOS no próprio palete/prateleira: na face mais voltada para a câmera (topo ou lateral), em perspectiva
      const DN = [0, -1, 0], add = (c, v, k = 1) => [c[0] + v[0] * k, c[1] + v[1] * k, c[2] + v[2] * k];
      const escreve = (lines, g) => {
        const p0 = proj(g.c), pa = proj(add(g.c, g.U)), pb = proj(add(g.c, g.V)); if (!p0 || !pa || !pb) return;
        let ax = pa.x - p0.x, ay = pa.y - p0.y, bx = pb.x - p0.x, by = pb.y - p0.y; const inv = ax < 0; if (inv) { ax = -ax; ay = -ay; bx = -bx; by = -by; }
        const F = 100, nl = lines.length, lh = g.h / nl, cap = Math.min(W, Hh) * .2;
        lines.forEach((tx, i) => {
          ctx.font = `700 ${F}px system-ui,Arial,sans-serif`;
          let size = Math.min(lh * .85, g.w / Math.max(ctx.measureText(tx).width / F, .01)); if (i) size *= .8;
          let k = size / F; const pxH = size * Math.max(Math.hypot(ax, ay), Math.hypot(bx, by)); if (pxH > cap) k *= cap / pxH;      // não cresce demais na tela
          const q = proj(add(g.c, g.V, ((i + .5) / nl - .5) * g.h * (inv ? -1 : 1))); if (!q) return;
          ctx.save(); ctx.transform(ax * k, ay * k, bx * k, by * k, q.x, q.y); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
          ctx.lineWidth = F * .1; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(tx, 0, 0); ctx.fillStyle = i ? '#e5e7eb' : '#fff'; ctx.fillText(tx, 0, 0); ctx.restore();
        });
      };
      const texto3d = (lines, cands, gr) => {
        lines = lines.filter(Boolean); if (!lines.length || L.boxes.length === gr.b0) return;
        let best = null;
        cands.forEach(g => {
          if (g.n[0] * (B.c[0] - g.c[0]) + g.n[1] * (B.c[1] - g.c[1]) + g.n[2] * (B.c[2] - g.c[2]) <= .05) return;      // face de trás
          const p0 = proj(g.c), pa = proj(add(g.c, g.U)), pb = proj(add(g.c, g.V)); if (!p0 || !pa || !pb) return;
          const det = Math.abs((pa.x - p0.x) * (pb.y - p0.y) - (pa.y - p0.y) * (pb.x - p0.x)); if (det < .5) return;     // visto de lado: não dá para ler
          const area = det * g.w * g.h; if (!best || area > best.area) best = { ...g, area };
        });
        if (best) gr.tx.push(() => escreve(lines, best));                                                                  // desenhada logo depois das caixas do próprio objeto
      };
      const hit = new Set(vivos());
      D.objs.forEach(o => {
        hitNow = hit.has(o.id); dimNow = hit.size > 0 && !hitNow;
        const gr = { b0: L.boxes.length, b1: 0, tx: [] }; let cands = [];
        const cx = o.x + o.w / 2, cz = o.y + o.h / 2, hz = o.w >= o.h;
        const topo = (y) => ({ c: [cx, y, cz], n: [0, 1, 0], U: hz ? [1, 0, 0] : [0, 0, -1], V: hz ? [0, 0, 1] : [1, 0, 0], w: (hz ? o.w : o.h) * .9, h: (hz ? o.h : o.w) * .9 });
        const lados = (y, hh, ins) => [{ c: [cx, y, o.y + o.h - ins], n: [0, 0, 1], U: [1, 0, 0], V: DN, w: o.w * .9, h: hh }, { c: [cx, y, o.y + ins], n: [0, 0, -1], U: [-1, 0, 0], V: DN, w: o.w * .9, h: hh },
          { c: [o.x + o.w - ins, y, cz], n: [1, 0, 0], U: [0, 0, -1], V: DN, w: o.h * .9, h: hh }, { c: [o.x + ins, y, cz], n: [-1, 0, 0], U: [0, 0, 1], V: DN, w: o.h * .9, h: hh }];
        if (o.t === 'p') {
          const P = pal(o), m2 = P.m, W = o.w, Dp = o.h, X = o.x + W / 2, Z = o.y + Dp / 2, ph = P.ph, E = .022 / m2, W5 = 'rgba(0,0,0,.18)';
          // Base (medidas do modelo, em fração do palete de 1,00 × 1,00 × 0,15 m): 5 tábuas em cima, 9 blocos, 3 tábuas embaixo
          for (let i = 0; i < 5; i++) { const cx3 = X + (-.4 + i * .2) * W; addBox(L, cx3 - .085 * W, ph - E, o.y, cx3 + .085 * W, ph, o.y + Dp, MADEIRA[i % 3], W5); }
          for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) { const cx3 = X + (-.45 + ix * .45) * W, cz3 = Z + (-.45 + iz * .45) * Dp; addBox(L, cx3 - .05 * W, .022 / m2, cz3 - .05 * Dp, cx3 + .05 * W, .108 / m2, cz3 + .05 * Dp, MADEIRA[(ix + iz) % 3], W5); }
          [-.45, 0, .45].forEach((fx, i) => { const cx3 = X + fx * W; addBox(L, cx3 - .05 * W, 0, o.y, cx3 + .05 * W, E, o.y + Dp, MADEIRA[(i + 1) % 3], W5); });
          // Caixas cúbicas (papelão com fita e etiqueta): lado = s, com folga de 1 cm entre elas, como no modelo
          const gx = .01 / m2, gy = .004 / m2; let k = 0;
          for (let l = 0; l < P.L; l++) for (let ix = 0; ix < P.nx; ix++) for (let iz = 0; iz < P.nz; iz++) {
            const bx0 = o.x + P.ox + ix * P.s, bz0 = o.y + P.oz + iz * P.s, by0 = ph + l * P.s;
            addBox(L, bx0 + gx / 2, by0 + gy / 2, bz0 + gx / 2, bx0 + P.s - gx / 2, by0 + P.s - gy / 2, bz0 + P.s - gx / 2, PAPELAO, 'rgba(60,35,15,.3)', undefined, k++);
          }
          cands = [topo(P.H + .005), ...lados((ph + P.H) / 2, (P.H - ph) * .85, .07)];
        } else if (o.t === 's') {
          // Prateleira de aço simples (como a "robusta"): divisórias em chapa, prateleiras lisas com aba na frente, tampo e rodapé
          const an = int(o.andares, 1, 6, 4), h1 = HA / m, e = .05 / m, fl = .09 / m, pt = .07, b0 = .1 / m, x1 = o.x + o.w, z1 = o.y + o.h, Ht = b0 + an * h1 + e, n = hz ? o.w : o.h, step = Math.max(1, Math.round(2.4 / m));
          addBox(L, o.x, 0, o.y, x1, b0, z1, LARANJA, 'rgba(0,0,0,.3)');                                                    // rodapé
          for (let l = 0; l < an; l++) {
            const y = b0 + l * h1;
            addBox(L, o.x + .02, y, o.y + .02, x1 - .02, y + e, z1 - .02, DECK, 'rgba(0,0,0,.25)');                           // prateleira
            if (hz) { addBox(L, o.x, y, o.y, x1, y + fl, o.y + .05, LARANJA, null); addBox(L, o.x, y, z1 - .05, x1, y + fl, z1, LARANJA, null); }   // abas
            else { addBox(L, o.x, y, o.y, o.x + .05, y + fl, z1, LARANJA, null); addBox(L, x1 - .05, y, o.y, x1, y + fl, z1, LARANJA, null); }
          }
          addBox(L, o.x, b0 + an * h1, o.y, x1, Ht, z1, DECK, 'rgba(0,0,0,.25)');                                           // tampo
          const pos = []; for (let i = 0; i < n; i += step) pos.push(i); pos.push(n);
          pos.forEach(i => { if (hz) { const qx = clamp(o.x + i, o.x, x1 - pt); addBox(L, qx, 0, o.y, qx + pt, Ht, z1, AZUL, 'rgba(0,0,0,.3)'); } else { const qz = clamp(o.y + i, o.y, z1 - pt); addBox(L, o.x, 0, qz, x1, Ht, qz + pt, AZUL, 'rgba(0,0,0,.3)'); } });   // divisórias em chapa
          cands = [topo(Ht + .005), ...lados(b0 + (an - .5) * h1, h1 * .7, -.01).filter(g => hz ? g.n[2] : g.n[0])];
        }
        if (o.t !== 'w') texto3d([o.nome || '', o.conteudo || ''], cands, gr);
        gr.b1 = L.boxes.length; if (gr.b1 > gr.b0) G.push(gr);
        hitNow = dimNow = false;
      });
      // alfinete em cima do que a busca achou (fica por cima de tudo)
      hit.forEach(id => { const f = achar(id); if (!f) return; const it = f.it, y = f.k === 'o' ? altC(it) + .9 : 1.2, pt = proj([it.x + it.w / 2, y, it.y + it.h / 2]); if (!pt) return;
        pins.push(() => { ctx.save(); ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - 9, pt.y - 20); ctx.arc(pt.x, pt.y - 28, 11, Math.PI * .85, Math.PI * .15, false); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pt.x, pt.y - 28, 4, 0, 7); ctx.fill(); ctx.restore(); }); });
      // objetos do mais longe ao mais perto; dentro de cada um: base/estrutura (pelo plano separador) e depois as caixas do palete (grade igual: pela distância é exato)
      ordena(G.map(g => { const bs = L.boxes.slice(g.b0, g.b1); return { x0: Math.min(...bs.map(b => b.x0)), x1: Math.max(...bs.map(b => b.x1)), y0: Math.min(...bs.map(b => b.y0)), y1: Math.max(...bs.map(b => b.y1)), z0: Math.min(...bs.map(b => b.z0)), z1: Math.max(...bs.map(b => b.z1)) }; })).forEach(gi => {
        const g = G[gi], bs = L.boxes.slice(g.b0, g.b1), rig = bs.filter(b => !b.lat), cx = bs.filter(b => b.lat);
        ordena(rig).forEach(i => rig[i].f.forEach(pintaFace));
        cx.map(b => ({ b, d: ((b.x0 + b.x1) / 2 - B.c[0]) ** 2 + ((b.y0 + b.y1) / 2 - B.c[1]) ** 2 + ((b.z0 + b.z1) / 2 - B.c[2]) ** 2 })).sort((p, q) => q.d - p.d).forEach(e => e.b.f.forEach(pintaFace));
        g.tx.forEach(fn => fn());
      });
      pins.forEach(fn => fn());
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
      else { const t = tool === 'palete' ? 'p' : tool === 'parede' ? 'w' : 's'; ghost = { r: { t, camadas: 3, cpl: 2, andares: 4, alt: 3, ...r }, ok: livre(r, null, t) }; }
    };
    const ptrs = new Map(); let pin = 0; let pan2d = null, gesto = false, pinM = null, zp = null;
    // Zoom do Plano: o ponto sob os dedos/mouse fica parado (cx, cy = coordenadas da tela). Agrupa os eventos em um quadro só.
    const zoom = (f, cx, cy) => {
      const nc = clamp(cs * f, 6, 48); if (Math.abs(nc - cs) < .01) return;
      const wr = wrap.getBoundingClientRect(), px = cx - wr.left, py = cy - wr.top, gx = (wrap.scrollLeft + px) / cs, gy = (wrap.scrollTop + py) / cs;
      cs = nc; drawPlano(); wrap.scrollLeft = gx * cs - px; wrap.scrollTop = gy * cs - py;
    };
    const zoomQ = (f, cx, cy) => { if (zp) { zp.f *= f; zp.cx = cx; zp.cy = cy; return; } zp = { f, cx, cy }; requestAnimationFrame(() => { const z = zp; zp = null; if (vista === 'plano') zoom(z.f, z.cx, z.cy); }); };
    cv.onpointerdown = e => {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId);
      if (vista === 'iso') { pin = 0; return; }
      if (ptrs.size >= 2) { gesto = true; drag = null; ghost = null; pan2d = null; pin = 0; pinM = null; draw(); return; }   // 2 dedos = pinça (cancela o que estava sendo desenhado)
      gesto = false;
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
      if (vista === 'plano' && ptrs.has(e.pointerId) && ptrs.size >= 2) {                 // pinça: aproxima/afasta e acompanha o movimento dos dedos
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pin) { if (pinM) { wrap.scrollLeft -= m[0] - pinM[0]; wrap.scrollTop -= m[1] - pinM[1]; } zoomQ(d / pin, m[0], m[1]); }
        pin = d; pinM = m; return;
      }
      if (gesto) return;                                                                  // dedo que sobrou depois da pinça: ignora até soltar tudo
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
      ptrs.delete(e.pointerId); if (ptrs.size < 2) { pin = 0; pinM = null; } const fimGesto = gesto; if (!ptrs.size) gesto = false;
      if (vista === 'iso' || fimGesto) return;
      if (pan2d) { pan2d = null; cv.style.cursor = 'grab'; return; }
      if (!drag) return; const d = drag, g = ghost; drag = null; ghost = null;
      if (d.mode === 'move') { const f = achar(d.id); if (d.moveu && podeE() && f) { const o = f.it, r = { x: d.nx, y: d.ny, w: o.w, h: o.h }; if (f.k === 'z' ? cobre(r) : livre(r, o.id, o.t)) { push(); o.x = r.x; o.y = r.y; salvar(); } } painel(); info(); draw(); return; }
      if (g && g.ok) {
        push(); const r = g.r, id = uid();
        if (tool === 'area') { D.areas.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, nome: '' }); if (D.areas.length === 1) camOk = false; selId = id; }
        else if (tool === 'zona') { D.zonas.push({ id, x: r.x, y: r.y, w: r.w, h: r.h, nome: novoZ.nome.trim(), cor: novoZ.cor }); selId = id; }
        else { const o = { id, t: r.t, x: r.x, y: r.y, w: r.w, h: r.h, nome: '', conteudo: '' }; if (o.t === 'p') { o.camadas = 3; o.cpl = 2; } else if (o.t === 'w') o.alt = 3; else o.andares = 4; D.objs.push(o); selId = id; }
        salvar(); tudo();
      } else { if (g && !g.ok) alert(tool === 'zona' ? 'A demarcação precisa ficar dentro de uma área.' : 'Não cabe aí: precisa ficar dentro de uma área e sem encostar em outro objeto (paredes podem encostar em paredes).'); draw(); }
    };
    cv.onpointerup = solta; cv.onpointercancel = e => { ptrs.delete(e.pointerId); if (!ptrs.size) gesto = false; pin = 0; pinM = null; pan2d = null; drag = null; ghost = null; draw(); };
    cv.oncontextmenu = e => { if (vista === 'iso') e.preventDefault(); };
    wrap.addEventListener('wheel', e => {                                                 // roda do mouse = zoom (Plano e 3D)
      e.preventDefault();
      if (vista === 'iso') { cam.dist = clamp(cam.dist * (1 + e.deltaY * .001), 3, 400); B = basis(); pedir(); }
      else zoomQ(clamp(Math.exp(-e.deltaY * .0015), .8, 1.25), e.clientX, e.clientY);
    }, { passive: false });
    new ResizeObserver(() => { if (body.isConnected && vista === 'iso') pedir(); }).observe(wrap);
    document.addEventListener('keydown', function ev(e) {
      if (!body.isConnected) return document.removeEventListener('keydown', ev);
      if (e.key === 'Escape' && menu) { menu = null; barra(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && vista === 'plano' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) apagar(selId);
    });

    document.addEventListener('cfo-sync', function ev() { if (!body.isConnected) return document.removeEventListener('cfo-sync', ev); dlItens.innerHTML = itensPlanilha().map(n => `<option value="${esc(n)}">`).join(''); });

    tudo();
    if (D.areas.length) requestAnimationFrame(() => { wrap.scrollLeft = Math.max(0, (Math.min(...D.areas.map(a => a.x)) - 1) * cs); wrap.scrollTop = Math.max(0, (Math.min(...D.areas.map(a => a.y)) - 1) * cs); });
  };
})();
