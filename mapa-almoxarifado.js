/* ===== Ferramentas > Mapa almoxarifado =====
   Mapa do almoxarifado: pesquise um item e veja em que corredor, fileira, prateleira e andar ele está.
   Engrenagem ⚙️ = modo configurar: toque numa prateleira e escolha os itens de cada andar (ou use "Definir local" no resultado da busca).
   O desenho do almoxarifado (fileiras, corredores, nº de prateleiras e andares) também se ajusta na engrenagem.
   Os itens vêm da Planilha EPI. Dados no localStorage, chave 'mapa': { layout: [...], locais: [...] }. */

/* ===== Mapa almoxarifado em 3D (sem biblioteca: projeção em perspectiva desenhada num <canvas>) =====
   Estantes = fileiras (comprimento = prateleiras, altura = andares). Arrastar gira · roda/pinça aproxima · Shift/botão direito/2 dedos move.
   api = { layout(), locais(), foco(), sel(), corredor(idFileira), onTap(f, p) } */
CFO.mapa3d = (canvas, api) => {
  const ctx = canvas.getContext('2d'), HA = .9, DF = 1.5, GAP = .5, DC = 2.2, TF = Math.tan(25 * Math.PI / 180);
  const cam = { yaw: 0, pitch: .6, dist: 30, tx: 0, ty: 1.5, tz: 0 };
  let W = 320, Hh = 320, pend = 0, anim = null;

  const geo = () => {
    let z = 0, maxP = 1; const rows = [];
    api.layout().forEach(r => { const d = r.t === 'f' ? DF + GAP : DC; rows.push({ r, z, d }); z += d; if (r.t === 'f') maxP = Math.max(maxP, r.p); });
    return { rows, maxP, zt: z };
  };
  const basis = () => {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const c = [cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.ty + cam.dist * sp, cam.tz + cam.dist * cp * Math.cos(cam.yaw)];
    let f = [cam.tx - c[0], cam.ty - c[1], cam.tz - c[2]]; const n = Math.hypot(...f); f = f.map(v => v / n);
    let r = [-f[2], 0, f[0]]; const m = Math.hypot(...r) || 1; r = r.map(v => v / m);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    return { c, f, r, u };
  };
  let B = basis();
  const fpx = () => Math.min(W, Hh) / 2 / TF;
  const proj = p => {
    const rel = [p[0] - B.c[0], p[1] - B.c[1], p[2] - B.c[2]], zc = rel[0] * B.f[0] + rel[1] * B.f[1] + rel[2] * B.f[2];
    if (zc < .3) return null;
    const xc = rel[0] * B.r[0] + rel[1] * B.r[1] + rel[2] * B.r[2], yc = rel[0] * B.u[0] + rel[1] * B.u[1] + rel[2] * B.u[2];
    return { x: W / 2 + xc / zc * fpx(), y: Hh / 2 - yc / zc * fpx(), z: zc };
  };
  const dist2 = p => (p[0] - B.c[0]) ** 2 + (p[1] - B.c[1]) ** 2 + (p[2] - B.c[2]) ** 2;

  const FACES = [[[0, 0, -1], [0, 1, 3, 2]], [[0, 0, 1], [4, 5, 7, 6]], [[-1, 0, 0], [0, 2, 6, 4]], [[1, 0, 0], [1, 3, 7, 5]], [[0, 1, 0], [2, 3, 7, 6]]];
  const shade = (rgb, n) => { const k = n[1] > 0 ? 1 : n[2] ? .82 : .6; return `rgb(${rgb.map(v => Math.round(v * k)).join(',')})`; };
  const addBox = (L, x0, y0, z0, x1, y1, z1, rgb, alpha, stroke) => {
    const c = []; for (let i = 0; i < 8; i++) c.push([i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0]);
    FACES.forEach(([n, ix]) => {
      const mid = [(x0 + x1) / 2 + n[0] * (x1 - x0) / 2, (y0 + y1) / 2 + n[1] * (y1 - y0) / 2, (z0 + z1) / 2 + n[2] * (z1 - z0) / 2];
      if (n[0] * (B.c[0] - mid[0]) + n[1] * (B.c[1] - mid[1]) + n[2] * (B.c[2] - mid[2]) <= 0) return;   // face de trás
      const pts = ix.map(i => proj(c[i])); if (pts.some(p => !p)) return;
      L.push({ pts, d: dist2(mid), fill: shade(rgb, n), alpha, stroke });
    });
  };
  const poly = (pts, fill, alpha = 1, stroke) => {
    ctx.globalAlpha = alpha; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } ctx.globalAlpha = 1;
  };
  const texto = (t, p, tam, cor = '#fff', alin = 'center', fundo) => {
    ctx.font = `700 ${tam}px system-ui,Arial,sans-serif`; ctx.textAlign = alin; ctx.textBaseline = 'middle';
    if (fundo) { const w = ctx.measureText(t).width + 14; ctx.fillStyle = fundo; ctx.fillRect(p.x - (alin === 'center' ? w / 2 : 0), p.y - tam * .9, w, tam * 1.8); }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; if (!fundo) ctx.strokeText(t, p.x, p.y); ctx.fillStyle = cor; ctx.fillText(t, p.x, p.y);
  };

  function draw() {
    pend = 0; B = basis();
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / Hh, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = '#23272d'; ctx.fillRect(0, 0, W, Hh);
    const G = geo(), L = [], foco = api.foco(), sel = api.sel();
    // chão e corredores
    const chao = [[-1.5, 0, -1.5], [G.maxP + 1.5, 0, -1.5], [G.maxP + 1.5, 0, G.zt + 1.5], [-1.5, 0, G.zt + 1.5]].map(proj);
    if (chao.every(Boolean)) poly(chao, '#2e3339');
    G.rows.filter(x => x.r.t === 'c').forEach(x => { const q = [[0, .01, x.z], [G.maxP, .01, x.z], [G.maxP, .01, x.z + x.d], [0, .01, x.z + x.d]].map(proj); if (q.every(Boolean)) poly(q, '#6b7076'); });
    // ocupação dos espaços (prateleira/andar)
    const ocup = new Map(), hit = new Set();
    api.locais().forEach(l => { const k = l.f + '|' + l.p + '|' + l.a; ocup.set(k, 1); if (foco && l.rid === foco) hit.add(k); });
    const ativas = hit.size ? new Set([...hit].map(k => k.split('|')[0])) : null;   // com item procurado, as outras fileiras ficam "fantasmas"
    G.rows.filter(x => x.r.t === 'f').forEach(x => {
      const { r, z } = x, alt = r.a * HA, g = ativas && !ativas.has(r.id) ? .1 : 1, aco = [150, 160, 172], pst = [100, 108, 120];
      const lat = [78, 86, 98];
      addBox(L, 0, 0, z, r.p, alt, z + .04, lat, .55 * g);                                                           // painel do fundo
      addBox(L, -.08, 0, z, 0, alt, z + DF, lat, .6 * g); addBox(L, r.p, 0, z, r.p + .08, alt, z + DF, lat, .6 * g);   // laterais
      for (let a = 0; a <= r.a; a++) {
        const y = a * HA;
        addBox(L, 0, y - .05, z, r.p, y + .05, z + DF, aco, .45 * g);                                               // tampo da prateleira (corpo inteiro)
        addBox(L, 0, y - .05, z, r.p, y + .05, z + .09, aco, g); addBox(L, 0, y - .05, z + DF - .09, r.p, y + .05, z + DF, aco, g);   // vigas frente e fundo
      }
      const px = []; for (let p = 0; p <= r.p; p += 5) px.push(p); if (r.p % 5) px.push(r.p);
      px.forEach(p => { addBox(L, p - .08, 0, z, p + .08, alt, z + .15, pst, g); addBox(L, p - .08, 0, z + DF - .15, p + .08, alt, z + DF, pst, g); });   // montantes mais grossos
      for (let p = 1; p <= r.p; p++) for (let a = 1; a <= r.a; a++) {
        const k = r.id + '|' + p + '|' + a, h = hit.has(k), o = ocup.has(k);
        if (h) addBox(L, p - .92, (a - 1) * HA + .05, z + .08, p - .08, a * HA - .05, z + DF - .06, [245, 158, 11], 1, '#fff');
        else if (o) addBox(L, p - .9, (a - 1) * HA + .05, z + .1, p - .1, a * HA - .08, z + DF - .08, [40, 168, 80], .92 * g);
        if (sel && sel.f === r.id && sel.p === p) addBox(L, p - 1, (a - 1) * HA, z, p, a * HA, z + DF, [255, 255, 255], .12, 'rgba(255,255,255,.85)');
      }
    });
    L.sort((a, b) => b.d - a.d).forEach(f => poly(f.pts, f.fill, f.alpha, f.stroke));
    // nomes: cada rótulo só é desenhado se não encobrir outro (se não couber, tenta acima/abaixo; senão some até aproximar o zoom)
    const usados = [];
    const rotulo = (t, p, tam, cor, alin, fundo, forcar) => {
      ctx.font = `700 ${tam}px system-ui,Arial,sans-serif`;
      const w = ctx.measureText(t).width + (fundo ? 14 : 6), h = tam * 1.5;
      for (const dy of [0, -h, h, -2 * h, 2 * h]) {
        const x0 = alin === 'center' ? p.x - w / 2 : alin === 'right' ? p.x - w : p.x, y0 = p.y + dy - h / 2;
        if (forcar || !usados.some(u => x0 < u[2] && x0 + w > u[0] && y0 < u[3] && y0 + h > u[1])) { usados.push([x0, y0, x0 + w, y0 + h]); texto(t, { x: p.x, y: p.y + dy }, tam, cor, alin, fundo); return true; }
      }
      return false;
    };
    // marcador do item procurado (sempre aparece)
    hit.forEach(k => {
      const [f, p, a] = k.split('|'), x = G.rows.find(q => q.r.id === f); if (!x) return;
      const top = proj([+p - .5, x.r.a * HA + 1.1, x.z + DF / 2]), base = proj([+p - .5, +a * HA - HA / 2, x.z + DF / 2]);
      if (top && base) { ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke(); rotulo(`Prat. ${p} · Andar ${a}`, { x: top.x, y: top.y - 10 }, 12, '#1a1200', 'center', '#f59e0b', true); }
    });
    // fileiras: nomes alternados nas duas pontas (esquerda/direita) para não ficarem colados; com item procurado só as fileiras dele
    let n = 0;
    G.rows.filter(x => x.r.t === 'f').forEach(x => {
      const esq = n++ % 2 === 0, forte = ativas && ativas.has(x.r.id); if (ativas && !forte) return;
      const p = proj([esq ? -.3 : x.r.p + .3, x.r.a * HA + .25, x.z + DF / 2]);
      if (p) rotulo(x.r.nome, p, Math.max(9, Math.min(13, fpx() * .34 / p.z)), '#fff', esq ? 'right' : 'left', null, forte);
    });
    G.rows.filter(x => x.r.t === 'c').forEach(x => { const p = proj([G.maxP / 2, .05, x.z + x.d / 2]); if (p) rotulo(x.r.nome.toUpperCase(), p, Math.max(9, Math.min(12, fpx() * .4 / p.z)), '#e5e8ec', 'center'); });
  }
  const pedir = () => { if (!pend) pend = requestAnimationFrame(passo); };
  function passo(now) {
    if (anim) {
      anim.t0 = anim.t0 || now; const k = Math.min(1, (now - anim.t0) / anim.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      let dy = ((anim.to.yaw - anim.from.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      cam.yaw = anim.from.yaw + dy * e;
      ['pitch', 'dist', 'tx', 'ty', 'tz'].forEach(p => cam[p] = anim.from[p] + (anim.to[p] - anim.from[p]) * e);
      if (k >= 1) anim = null;
    }
    draw(); if (anim) pend = requestAnimationFrame(passo);
  }
  const ir = (to, dur = 700) => { anim = { from: { ...cam }, to: { ...cam, ...to }, t0: 0, dur }; pedir(); };

  const api3 = {
    render: pedir,
    resize() {
      const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 320, h = canvas.clientHeight || 320;
      W = w; Hh = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); pedir();
    },
    geral(animar = true) { const G = geo(), asp = W / Hh, d = Math.max(G.maxP / (2 * TF * Math.min(asp, 2.2)), G.zt * .9 / (2 * TF)) * 1.35 + 5;
      const to = { yaw: 0, pitch: .95, dist: Math.max(12, d), tx: G.maxP / 2, ty: 1, tz: G.zt / 2 }; animar ? ir(to) : (Object.assign(cam, to), pedir()); },
    cima() { const G = geo(); ir({ yaw: 0, pitch: 1.5, dist: Math.max(12, Math.max(G.maxP / (2 * TF * Math.min(W / Hh, 2.2)), G.zt / (2 * TF)) * 1.2 + 4), tx: G.maxP / 2, ty: 0, tz: G.zt / 2 }); },
    focar(l) {
      const G = geo(), x = G.rows.find(q => q.r.id === l.f); if (!x) return;
      const c = api.corredor(l.f), cz = c ? (G.rows.find(q => q.r.id === c.id) || {}).z : null;
      ir({ yaw: cz != null && cz < x.z ? Math.PI : 0, pitch: .5, dist: 10, tx: l.p - .5, ty: (l.a - .5) * HA, tz: x.z + DF / 2 });
    },
    // espaço (prateleira) mais próximo do toque
    achar(px, py) {
      const G = geo(); let melhor = null;
      G.rows.filter(x => x.r.t === 'f').forEach(x => { for (let p = 1; p <= x.r.p; p++) for (let a = 1; a <= x.r.a; a++) {
        const c = proj([p - .5, (a - .5) * HA, x.z + DF / 2]), e = proj([p, (a - .5) * HA, x.z + DF / 2]); if (!c || !e) continue;
        const raio = Math.max(9, Math.abs(e.x - c.x) * .9);
        if (Math.hypot(c.x - px, c.y - py) <= raio && (!melhor || c.z < melhor.z)) melhor = { f: x.r.id, p, a, z: c.z };
      } });
      return melhor;
    }
  };

  /* ----- toque / mouse ----- */
  const ptr = new Map(); let mov = 0, t0 = 0, ult = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptr.size === 1) { mov = 0; t0 = Date.now(); } ult = null; anim = null; });
  canvas.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; mov += Math.abs(dx) + Math.abs(dy);
    if (ptr.size >= 2) {
      const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (ult) { cam.dist = Math.max(4, Math.min(140, cam.dist * ult.d / d)); pan(m.x - ult.m.x, m.y - ult.m.y); } ult = { d, m };
    } else if (e.buttons & 2 || e.shiftKey) pan(dx, dy);
    else { cam.yaw -= dx * .008; cam.pitch = Math.max(.08, Math.min(1.5, cam.pitch + dy * .006)); }
    pedir();
  });
  const pan = (dx, dy) => { const k = cam.dist / fpx(); B = basis(); const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw); cam.tx -= (B.r[0] * dx) * k + (-s) * dy * k; cam.tz -= (B.r[2] * dx) * k + (-c) * dy * k; };
  const solta = e => { const tap = ptr.size === 1 && mov < 6 && Date.now() - t0 < 500; ptr.delete(e.pointerId); ult = null;
    if (tap) { const r = canvas.getBoundingClientRect(), h = api3.achar(e.clientX - r.left, e.clientY - r.top); if (h) api.onTap(h.f, h.p); } };
  canvas.addEventListener('pointerup', solta); canvas.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); ult = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); anim = null; cam.dist = Math.max(4, Math.min(140, cam.dist * Math.exp(e.deltaY * .0012))); pedir(); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  if (window.ResizeObserver) new ResizeObserver(() => api3.resize()).observe(canvas);
  return api3;
};

CFO.modules.mapa = body => {
  const esc = CFO.esc, K = 'mapa';
  const nrm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Desenho padrão (planilha do almoxarifado): 7 fileiras de 25 prateleiras (5 em 5), 5 andares, 3 corredores
  const padrao = () => {
    let nf = 0, nc = 0;
    return { layout: ['f', 'c', 'f', 'f', 'c', 'f', 'f', 'c', 'f', 'f'].map(t => t === 'f' ? { id: 'f' + (++nf), t, nome: 'Fileira ' + nf, p: 25, a: 5 } : { id: 'c' + (++nc), t, nome: 'Corredor ' + nc }), locais: [] };
  };
  let D = CFO.store.get(K, null);
  if (!D || !Array.isArray(D.layout) || !D.layout.length) D = padrao();
  if (!Array.isArray(D.locais)) D.locais = [];
  const salvar = () => CFO.store.set(K, D);

  let q = '', semLocal = false, edit = false, foco = null, sel = null, v3 = false, mundo = null, sug = true;   // sug: lista de sugestões (sempre desligada ao entrar no 3D)
  const rows = () => CFO.store.get('epi', []);
  const rowOf = rid => rows().find(r => r.id === rid);
  const fil = id => D.layout.find(x => x.id === id && x.t === 'f');
  const nomeDe = l => { const r = rowOf(l.rid); return r ? r.item : (l.nome || '(item removido)'); };
  const at = (f, p) => D.locais.filter(l => l.f === f && l.p === p);
  const doItem = rid => D.locais.filter(l => l.rid === rid && fil(l.f));
  // Corredor que atende a fileira: o vizinho direto; se não houver, o mais próximo
  const corredorDe = id => {
    const L = D.layout, i = L.findIndex(x => x.id === id); if (i < 0) return null;
    for (let d = 1; d < L.length; d++) for (const j of [i - d, i + d]) if (L[j] && L[j].t === 'c') return L[j];
    return null;
  };
  const textoLocal = l => { const f = fil(l.f), c = f && corredorDe(f.id); return f ? `${c ? c.nome + ' · ' : ''}${f.nome} · Prateleira ${l.p} · Andar ${l.a}` : 'local removido'; };

  body.style.maxWidth = '1280px';
  body.innerHTML = `<details class="sobre"><summary>ℹ️ Para que serve esta tela</summary><p><b>Mapa almoxarifado</b> mostra onde cada item está guardado: digite o nome ou o código e o mapa destaca a prateleira, com o <b>corredor</b>, a <b>fileira</b>, a <b>prateleira</b> e o <b>andar</b>. Toque na <b>⚙️ engrenagem</b> para configurar: toque numa prateleira e escolha os itens de cada andar, ou use <b>Definir local</b> no resultado da busca. Em <b>Layout</b> você muda o desenho (fileiras, corredores, prateleiras e andares).</p></details>
    <div class="bar mp-bar"><input id="mq" type="search" placeholder="🔎 Pesquisar item" autocomplete="off"><button id="m3" class="ghost" aria-label="Ver em 3D" title="Alternar entre mapa 2D e 3D">🧊 3D</button><button id="mg" class="ghost" aria-label="Configurar" title="Configurar o mapa">⚙️</button></div>
    <div id="mp-info"></div><div id="mp-out"></div><div id="mp-pan"></div><div id="mp-2d"></div>
    <div id="mp-3d" class="mp-3d" hidden><canvas aria-label="Almoxarifado em 3D"></canvas><div class="mp-3dbar"><button class="ghost" id="m3g">Visão geral</button><button class="ghost" id="m3c">De cima</button><span>arraste = girar · roda ou pinça = zoom · Shift ou 2 dedos = mover · toque numa prateleira para abrir</span></div></div><div id="mp-pan3"></div><datalist id="mp-dl"></datalist>`;
  const $ = s => body.querySelector(s);

  /* ---------- Busca ---------- */
  const resultados = () => {
    const todos = rows(), palavras = nrm(q).split(/\s+/).filter(Boolean);
    if (semLocal) return todos.filter(r => !doItem(r.id).length).slice(0, 200);
    if (!palavras.length) return [];
    return todos.filter(r => { const t = nrm(r.item + ' ' + (r.codigo || '')); return palavras.every(w => t.includes(w)); }).slice(0, 40);
  };
  // Item que o texto digitado identifica sem precisar de lista: nome completo (ou o único resultado)
  const alvoBusca = () => {
    const t = nrm(q).trim(); if (!t) return null; const rs = resultados();
    return rs.find(r => nrm(r.item).trim() === t) || (rs.length === 1 ? rs[0] : null);
  };
  // No 3D sem sugestões: só uma linha com o item achado (e botões para alternar entre os locais dele)
  const statusHTML = () => {
    if (!nrm(q).trim()) return '';
    if (foco) {
      const r = rowOf(foco), ls = doItem(foco); if (!r) return '';
      const i = Math.max(0, ls.findIndex(l => sel && l.f === sel.f && l.p === sel.p));
      return `<div class="mp-st"><div class="mp-t"><b>${esc(r.item)}</b><small>${r.codigo ? esc(r.codigo) + ' · ' : ''}estoque ${r.qtd ?? '-'}</small></div>
        ${ls.length ? `<div class="mp-nav">${ls.length > 1 ? `<button class="ghost" data-nav="-1" aria-label="Local anterior">◀</button><span>${i + 1}/${ls.length}</span><button class="ghost" data-nav="1" aria-label="Próximo local">▶</button>` : ''}<span>📍 ${esc(textoLocal(ls[i]))}</span></div>`
          : `<div class="mp-nav"><span>sem local definido</span><button class="ghost mp-def" data-def="${esc(r.id)}">+ local</button></div>`}</div>`;
    }
    const n = resultados().length;
    return `<p class="empty">${n ? `${n === 1 ? '1 item parecido' : n + ' itens parecidos'}. Escreva o nome completo ou toque em "Mostrar sugestões".` : 'Nenhum item encontrado.'}</p>`;
  };
  const resHTML = () => {
    if (v3 && !sug && !semLocal) return statusHTML();
    const rs = resultados(), todos = rows();
    if (semLocal) { if (!rs.length) return '<p class="empty">Todos os itens da Planilha EPI já têm local.</p>'; }
    else if (!nrm(q).trim()) return todos.length ? '' : '<p class="empty">A Planilha EPI está vazia. Cadastre ou importe os itens em Almoxarifado Operacional > Planilha EPI.</p>';
    else if (!rs.length) return '<p class="empty">Nenhum item encontrado.</p>';
    return `<div class="mp-res">${rs.map(r => { const ls = doItem(r.id);
      return `<div class="mp-it${r.id === foco ? ' on' : ''}" data-rid="${esc(r.id)}"><div class="mp-t"><b>${esc(r.item)}</b><small>${r.codigo ? esc(r.codigo) + ' · ' : ''}estoque ${r.qtd ?? '-'}</small></div>
        <div class="mp-ls">${ls.map(l => `<button class="mp-loc" data-l="${l.id}">📍 ${esc(textoLocal(l))}</button>`).join('') || '<small class="mut">sem local definido</small>'}<button class="ghost mp-def" data-def="${esc(r.id)}">+ local</button></div></div>`; }).join('')}</div>`;
  };

  /* ---------- Mapa ---------- */
  const hitAndares = (f, p) => foco ? D.locais.filter(l => l.rid === foco && l.f === f && l.p === p).map(l => l.a) : [];
  const mapaHTML = () => `<div class="mp-map">${D.layout.map(r => r.t === 'c'
    ? `<div class="mp-cor">${esc(r.nome)}</div>`
    : `<div class="mp-fil"><div class="mp-grade"><span class="mp-nome" title="${esc(r.nome)}">${esc(r.nome)}</span>${Array.from({ length: r.p }, (_, i) => {
        const p = i + 1, n = at(r.id, p).length, h = hitAndares(r.id, p);
        return `<button class="mp-c${n ? ' has' : ''}${h.length ? ' hit' : ''}${sel && sel.f === r.id && sel.p === p ? ' sel' : ''}${p % 5 === 0 && p < r.p ? ' gap' : ''}" data-f="${r.id}" data-p="${p}" title="${esc(r.nome)} · prateleira ${p}${n ? ' · ' + n + ' item(ns)' : ''}">${p}${h.length ? `<i>A${h.join(',')}</i>` : ''}</button>`;
      }).join('')}</div></div>`).join('')}</div>
    <p class="mp-leg"><span class="lg c1"></span> prateleira vazia <span class="lg c2"></span> com itens <span class="lg c3"></span> item procurado <span class="lg c4"></span> corredor</p>`;

  /* ---------- Painel da prateleira (andares) ---------- */
  const painelHTML = () => {
    if (!sel) return ''; const f = fil(sel.f); if (!f) return '';
    const c = corredorDe(f.id);
    return `<section class="mp-pn"><header><b>${esc(c ? c.nome + ' · ' : '')}${esc(f.nome)} · Prateleira ${sel.p}</b><button class="ghost" data-x="1" aria-label="Fechar">✕</button></header>
      ${Array.from({ length: f.a }, (_, i) => f.a - i).map(a => { const its = D.locais.filter(l => l.f === f.id && l.p === sel.p && l.a === a);
        return `<div class="mp-and${its.some(l => l.rid === foco) ? ' hit' : ''}"><span class="mp-an">Andar ${a}</span>
          <div class="mp-its">${its.map(l => `<span class="mp-chip${l.rid === foco ? ' hit' : ''}">${esc(nomeDe(l))}${edit ? ` <button class="x" data-del="${l.id}" aria-label="Remover">✕</button>` : ''}</span>`).join('') || '<small class="mut">vazio</small>'}</div>
          ${edit ? `<div class="mp-add"><input list="mp-dl" data-in="${a}" placeholder="Adicionar item..."><button data-ad="${a}">+</button></div>` : ''}</div>`; }).join('')}
      ${edit ? '' : '<p class="log">Para trocar os itens desta prateleira, toque na ⚙️.</p>'}</section>`;
  };

  function desenhar() {
    $('#mg').classList.toggle('on', edit);
    const com = new Set(D.locais.filter(l => fil(l.f)).map(l => l.rid)), todos = rows();
    const sem = todos.filter(r => !com.has(r.id)).length;
    $('#mp-info').innerHTML = (edit ? `<div class="mp-edit"><span>⚙️ Modo configurar: toque numa prateleira para escolher os itens de cada andar.</span><button class="ghost" id="ml">Layout</button></div>` : '')
      + `<p class="mp-sum"><span>${com.size} item(ns) com local</span> · <button class="lnk${semLocal ? ' on' : ''}" id="ms">${sem} sem local${semLocal ? ' (mostrando)' : ''}</button>${v3 ? ` <button class="ghost mp-sg${sug ? ' on' : ''}" id="msg">💡 ${sug ? 'Sugestões ligadas' : 'Mostrar sugestões'}</button>` : ''}</p>`;
    const pn = painelHTML();
    $('#mp-out').innerHTML = resHTML(); $('#mp-pan').innerHTML = v3 ? '' : pn; $('#mp-pan3').innerHTML = v3 ? pn : '';   // no 3D o painel da prateleira fica embaixo do modelo
    $('#mp-2d').innerHTML = mapaHTML(); $('#mp-2d').hidden = v3; $('#mp-3d').hidden = !v3; $('#m3').classList.toggle('on', v3);
    if (v3 && mundo) mundo.render();
    $('#mp-dl').innerHTML = edit ? todos.map(r => `<option value="${esc(r.item)}">`).join('') : '';
    const ml = $('#ml'); if (ml) ml.onclick = layout;
    $('#ms').onclick = () => { semLocal = !semLocal; foco = null; desenhar(); };
    const sg = $('#msg'); if (sg) sg.onclick = () => { sug = !sug; if (!sug) { const a = alvoBusca(); if (a) foco = a.id; } desenhar(); };
  }

  const abrir = (l, rolar) => { foco = l.rid; sel = { f: l.f, p: l.p }; desenhar(); if (v3 && mundo) { mundo.focar(l); return; } if (rolar) { const c = body.querySelector(`.mp-c[data-f="${l.f}"][data-p="${l.p}"]`); c && c.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } };

  /* ---------- Escolher local de um item (busca) ---------- */
  function definirLocal(row) {
    const fs = D.layout.filter(x => x.t === 'f');
    CFO.dialog('Definir local - ' + row.item,
      `<label>Fileira<select name="f">${fs.map(f => `<option value="${f.id}">${esc((corredorDe(f.id) || { nome: '' }).nome ? corredorDe(f.id).nome + ' · ' : '')}${esc(f.nome)}</option>`).join('')}</select></label>
       <label>Prateleira<input name="p" type="number" min="1" value="1" required></label>
       <label>Andar<input name="a" type="number" min="1" value="1" required></label>`,
      d => {
        const f = fil(d.f), p = +d.p, a = +d.a;
        if (!f || !(p >= 1 && p <= f.p) || !(a >= 1 && a <= f.a)) return alert(f ? `${f.nome} tem prateleiras de 1 a ${f.p} e andares de 1 a ${f.a}.` : 'Fileira inválida.');
        const l = { id: uid(), rid: row.id, nome: row.item, f: f.id, p, a };
        if (!D.locais.some(x => x.rid === l.rid && x.f === l.f && x.p === l.p && x.a === l.a)) D.locais.push(l);
        salvar(); abrir(l, true);
      });
  }

  /* ---------- Editar o desenho (fileiras / corredores) ---------- */
  function layout() {
    const d = document.createElement('dialog'); d.className = 'mp-dlg';
    let L = JSON.parse(JSON.stringify(D.layout));
    const draw = () => {
      d.innerHTML = `<form method="dialog"><h3>Layout do almoxarifado</h3><p class="log" style="margin-top:0">De cima para baixo, como no mapa. Cada fileira tem um número de prateleiras e de andares.</p>
        <div class="mp-lay">${L.map((r, i) => `<div class="mp-lr" data-i="${i}"><span class="tag">${r.t === 'f' ? 'Fileira' : 'Corredor'}</span><input data-k="nome" value="${esc(r.nome)}" aria-label="Nome">
          ${r.t === 'f' ? `<label>Prat.<input type="number" min="1" max="60" data-k="p" value="${r.p}"></label><label>Andares<input type="number" min="1" max="12" data-k="a" value="${r.a}"></label>` : ''}
          <button type="button" class="ghost" data-mv="-1" aria-label="Subir">↑</button><button type="button" class="ghost" data-mv="1" aria-label="Descer">↓</button><button type="button" class="ghost" data-rm aria-label="Remover">✕</button></div>`).join('')}</div>
        <div class="row"><button type="button" class="ghost" data-add="f">+ Fileira</button><button type="button" class="ghost" data-add="c">+ Corredor</button></div>
        <div class="row"><button type="button" class="ghost" data-pad>Restaurar padrão</button><button value="cancel" class="ghost" formnovalidate>Cancelar</button><button value="ok">Salvar</button></div></form>`;
      d.querySelectorAll('.mp-lr').forEach(el => {
        const i = +el.dataset.i;
        el.querySelectorAll('input').forEach(inp => inp.oninput = () => { L[i][inp.dataset.k] = inp.dataset.k === 'nome' ? inp.value : Math.max(1, +inp.value || 1); });
        el.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const j = i + +b.dataset.mv; if (L[j]) { [L[i], L[j]] = [L[j], L[i]]; draw(); } });
        el.querySelector('[data-rm]').onclick = () => { L.splice(i, 1); draw(); };
      });
      d.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const t = b.dataset.add, n = L.filter(x => x.t === t).length + 1; L.push(t === 'f' ? { id: 'f' + uid(), t, nome: 'Fileira ' + n, p: 25, a: 5 } : { id: 'c' + uid(), t, nome: 'Corredor ' + n }); draw(); });
      d.querySelector('[data-pad]').onclick = () => { if (confirm('Voltar ao desenho padrão do almoxarifado?')) { L = padrao().layout.map((x, i) => ({ ...x, id: D.layout[i] && D.layout[i].t === x.t ? D.layout[i].id : x.id })); draw(); } };
    };
    draw();
    d.onclose = () => {
      if (d.returnValue === 'ok') {
        const ok = L.filter(x => x.t === 'c' || x.t === 'f');
        const fl = id => ok.find(x => x.id === id && x.t === 'f');
        const orfaos = D.locais.filter(l => { const f = fl(l.f); return !f || l.p > f.p || l.a > f.a; });
        if (!orfaos.length || confirm(`${orfaos.length} local(is) de item ficam fora do novo desenho e serão apagados. Continuar?`)) {
          D.layout = ok.map(x => ({ ...x, nome: String(x.nome || '').trim() || (x.t === 'f' ? 'Fileira' : 'Corredor') }));
          D.locais = D.locais.filter(l => !orfaos.includes(l)); if (sel && !fil(sel.f)) sel = null;
          salvar(); desenhar();
        }
      }
      d.remove();
    };
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });   // Enter não pode cancelar/salvar sem querer
    document.body.append(d); d.showModal();
  }

  /* ---------- Eventos ---------- */
  $('#mq').oninput = e => {
    q = e.target.value; if (q) semLocal = false; const antes = foco; foco = null;
    if (v3 && !sug) { const a = alvoBusca(); if (a) { foco = a.id; const ls = doItem(a.id); if (a.id !== antes && ls.length) return abrir(ls[0]); } }   // 3D: o nome completo já destaca o item no modelo
    desenhar();
  };
  $('#mg').onclick = () => { edit = !edit; desenhar(); };
  $('#m3').onclick = () => {
    v3 = !v3; sug = !v3;                                    // 3D sempre começa com as sugestões desligadas
    if (v3 && !mundo) mundo = CFO.mapa3d($('#mp-3d canvas'), {
      layout: () => D.layout, locais: () => D.locais.filter(l => fil(l.f)), foco: () => foco, sel: () => sel,
      corredor: id => corredorDe(id),
      onTap: (f, p) => { sel = { f, p }; if (!(v3 && !sug) && !at(f, p).some(l => l.rid === foco)) foco = null; desenhar(); }
    });
    if (v3) { const a = alvoBusca(); foco = a ? a.id : null; }
    const l = v3 && foco ? (sel && D.locais.find(x => x.rid === foco && x.f === sel.f && x.p === sel.p)) || doItem(foco)[0] : null;
    if (l) sel = { f: l.f, p: l.p };
    desenhar();
    if (v3) { mundo.resize(); l ? mundo.focar(l) : mundo.geral(false); }
  };
  $('#m3g').onclick = () => mundo && mundo.geral();
  $('#m3c').onclick = () => mundo && mundo.cima();
  body.addEventListener('click', e => {
    const t = e.target.closest('button, .mp-it'); if (!t || !body.contains(t)) return;
    if (t.dataset.l) return abrir(D.locais.find(l => l.id === t.dataset.l), true);
    if (t.dataset.def) return definirLocal(rowOf(t.dataset.def));
    if (t.dataset.nav) { const ls = doItem(foco), i = Math.max(0, ls.findIndex(l => sel && l.f === sel.f && l.p === sel.p)); return ls.length && abrir(ls[(i + +t.dataset.nav + ls.length) % ls.length]); }
    if (t.dataset.x) { sel = null; return desenhar(); }
    if (t.dataset.del) { D.locais = D.locais.filter(l => l.id !== t.dataset.del); salvar(); return desenhar(); }
    if (t.dataset.ad) {
      const inp = body.querySelector(`input[data-in="${t.dataset.ad}"]`), row = rows().find(r => nrm(r.item).trim() === nrm(inp.value).trim());
      if (!row) return alert('Escolha um item da lista (Planilha EPI): comece a digitar e toque na sugestão.');
      const l = { id: uid(), rid: row.id, nome: row.item, f: sel.f, p: sel.p, a: +t.dataset.ad };
      if (!D.locais.some(x => x.rid === l.rid && x.f === l.f && x.p === l.p && x.a === l.a)) D.locais.push(l);
      salvar(); return desenhar();
    }
    if (t.classList.contains('mp-c')) { sel = { f: t.dataset.f, p: +t.dataset.p }; const aqui = at(sel.f, sel.p); if (!aqui.some(l => l.rid === foco)) foco = null; return desenhar(); }
    if (t.classList.contains('mp-it')) { const ls = doItem(t.dataset.rid); foco = t.dataset.rid; if (ls.length) return abrir(ls[0], true); sel = null; return desenhar(); }
  });
  desenhar();
};
