/* ===== Ferramentas > Mapa livre =====
   Mapa de almoxarifado de desenho LIVRE (diferente do "Mapa almoxarifado", que tem fileiras fixas).
   1) O chão é um quadriculado de quadradinhos. Com a ferramenta "Área" você arrasta o dedo/mouse e escolhe quantos quadradinhos
      formam o espaço (ex.: 12 × 8). Tudo só pode ser colocado dentro dessa área.
   2) Paletes de caixas: quadrado ou retângulo, do tamanho que quiser (arraste sobre os quadradinhos).
   3) Prateleiras: retas de 1 ou 2 quadradinhos de grossura, do comprimento que quiser (arraste na direção desejada).
   3b) Paredes: retas de 1 quadradinho de grossura (altura ajustável, padrão 3 m).
   4) Selecionar: toque num objeto para mover (arrastando), girar, mudar tamanho, camadas/andares, nome e conteúdo.
   Vista "Plano" (de cima, onde se edita) e "3D" (isométrica, só visualização, com botão Girar).
   Dados: chave 'mapalivre' = { m: metros por quadradinho, area: {x,y,w,h}|null, objs: [{ id, t: 'p'|'s', x, y, w, h, nome, conteudo, camadas, cx, andares }] }
   Permissão: só perfis de "Outros setores" e o perfil principal (veja CFO.pode em login.js). */
(() => {
  const K = 'mapalivre', FW = 60, FH = 40, esc = CFO.esc;
  const LAY = [[1, 1], [2, 1], [2, 2], [3, 2]];          // caixas por camada (colunas × fileiras), igual ao modelo de palete
  const HA = .9, PH = .144, BH = .3;                      // altura de cada andar da prateleira, do palete e de cada caixa (metros)
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  if (!document.getElementById('ml-css')) {
    const st = document.createElement('style'); st.id = 'ml-css';
    st.textContent = `.ml{display:flex;flex-direction:column;gap:.6rem}
      .ml-tb{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}
      .ml-tb button{padding:.45rem .7rem;font-size:13.5px}
      .ml-tb button.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
      .ml-tb button:not(.on){background:transparent;color:var(--text);border-color:var(--line)}
      .ml-tb .sep{width:1px;height:22px;background:var(--line);margin:0 .15rem}
      .ml-cv{overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--panel2);height:56vh;min-height:300px;overscroll-behavior:contain}
      .ml-cv canvas{display:block}
      .ml-info{font-size:13px;color:var(--muted);margin:0}.ml-info b{color:var(--text)}
      .ml-pn{border:1px solid var(--line);border-radius:12px;padding:.7rem .8rem;background:var(--panel);display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.5rem .7rem}
      .ml-pn h4{grid-column:1/-1;margin:0;font-size:14px}
      .ml-pn label{font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:.2rem}
      .ml-pn .full{grid-column:1/-1}
      .ml-pn .acts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:.4rem}
      .ml-pn button.danger{background:transparent;color:#dc2626;border-color:#dc2626}`;
    document.head.append(st);
  }

  CFO.modules.mapalivre = body => {
    let D = CFO.store.get(K, null);
    if (!D || !Array.isArray(D.objs)) D = { m: 1, area: null, objs: [] };
    const podeE = () => CFO.pode('editar', 'mapalivre'), podeA = () => CFO.pode('apagar', 'mapalivre');
    const hist = [];
    const salvar = () => CFO.store.set(K, D);
    const push = () => { const s = JSON.stringify(D); if (hist[hist.length - 1] !== s) { hist.push(s); if (hist.length > 40) hist.shift(); } };
    let tool = podeE() ? (D.area ? 'palete' : 'area') : 'nav', vista = 'plano', rot = 0, cs = 28, selId = null, drag = null, ghost = null;

    body.innerHTML = `<div class="ml">
      <div class="ml-tb" id="ml-tools"></div>
      <p class="ml-info" id="ml-info"></p>
      <div class="ml-cv" id="ml-cv"><canvas id="ml-c"></canvas></div>
      <div id="ml-pn"></div></div>`;
    const $ = s => body.querySelector(s), cv = $('#ml-c'), ctx = cv.getContext('2d'), wrap = $('#ml-cv');

    /* ---------- regras ---------- */
    const obj = id => D.objs.find(o => o.id === id);
    const dentro = (r, a) => a && r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h;
    const cruza = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const livre = (r, ignora) => dentro(r, D.area) && !D.objs.some(o => o.id !== ignora && cruza(r, o));
    const objEm = (cx, cy) => D.objs.find(o => cx >= o.x && cx < o.x + o.w && cy >= o.y && cy < o.y + o.h);
    const caixasPorCamada = o => { const [c, r] = LAY[(o.cx || 3) - 1]; return c * r; };
    const altura = o => o.t === 'w' ? (o.alt || 3) : o.t === 'p' ? PH + BH * (o.camadas || 1) : HA * (o.andares || 1);   // metros

    /* ---------- barra de ferramentas ---------- */
    const FERR = [['nav', '✋ Navegar'], ['area', '⬚ Área'], ['parede', '▮ Parede'], ['palete', '📦 Palete'], ['p1', '▬ Prateleira fina (1)'], ['p2', '▰ Prateleira grossa (2)'], ['sel', '👆 Selecionar']];
    const barra = () => {
      const edit = podeE();
      $('#ml-tools').innerHTML =
        (edit ? FERR.map(([k, n]) => `<button data-t="${k}" class="${tool === k && vista === 'plano' ? 'on' : ''}">${n}</button>`).join('') +
          (podeA() ? `<button data-t="del" class="${tool === 'del' && vista === 'plano' ? 'on' : ''}">🗑 Apagar</button>` : '') + '<span class="sep"></span><button data-a="undo">↶ Desfazer</button>' : '') +
        `<span class="sep"></span><button data-v="plano" class="${vista === 'plano' ? 'on' : ''}">Plano</button><button data-v="iso" class="${vista === 'iso' ? 'on' : ''}">3D</button>` +
        (vista === 'iso' ? '<button data-a="rot">⟳ Girar</button>' : '') +
        '<span class="sep"></span><button data-a="mais">＋</button><button data-a="menos">－</button><button data-a="png">⬇ Imagem</button>' +
        (edit && podeA() ? '<button data-a="limpar" style="color:#dc2626;border-color:#dc2626">Limpar mapa</button>' : '');
      $('#ml-tools').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tool = b.dataset.t; vista = 'plano'; if (tool !== 'sel') selId = null; tudo(); });
      $('#ml-tools').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { vista = b.dataset.v; tudo(); });
      $('#ml-tools').querySelectorAll('[data-a]').forEach(b => b.onclick = () => acao(b.dataset.a));
    };
    const acao = a => {
      if (a === 'undo') { const atual = JSON.stringify(D); while (hist.length && hist[hist.length - 1] === atual) hist.pop(); const s = hist.pop(); if (!s) return; D = JSON.parse(s); if (selId && !obj(selId)) selId = null; salvar(); tudo(); }
      else if (a === 'rot') { rot = (rot + 1) % 4; draw(); }
      else if (a === 'mais') { cs = Math.min(cs + 4, 56); draw(); }
      else if (a === 'menos') { cs = Math.max(cs - 4, 12); draw(); }
      else if (a === 'png') cv.toBlob(b => b && CFO.baixar(b, 'mapa-livre.png'));
      else if (a === 'limpar') { if (!confirm('Apagar TODO o mapa livre (área, paletes e prateleiras)?')) return; push(); D = { m: D.m || 1, area: null, objs: [] }; selId = null; tool = 'area'; salvar(); tudo(); }
    };

    /* ---------- informações e painel do objeto ---------- */
    const info = () => {
      const a = D.area, m = D.m || 1, ps = D.objs.filter(o => o.t === 'p'), ss = D.objs.filter(o => o.t === 's'), ws = D.objs.filter(o => o.t === 'w');
      const caixas = ps.reduce((n, o) => n + (o.camadas || 1) * caixasPorCamada(o), 0);
      $('#ml-info').innerHTML = !a
        ? 'Comece pela ferramenta <b>⬚ Área</b>: arraste sobre os quadradinhos para escolher o tamanho do espaço.'
        : `Área <b>${a.w} × ${a.h}</b> quadradinhos (${(a.w * m).toLocaleString('pt-BR')} × ${(a.h * m).toLocaleString('pt-BR')} m) · <b>${ps.length}</b> palete(s) com ${caixas} caixas · <b>${ss.length}</b> prateleira(s)${ws.length ? ` · <b>${ws.length}</b> parede(s)` : ''}` +
          (vista === 'iso' ? ' · vista 3D: só visualização' : tool === 'nav' ? ' · modo navegar: role/arraste para andar pelo mapa' : '');
    };
    const painel = () => {
      const el = $('#ml-pn'), o = vista === 'plano' && tool === 'sel' ? obj(selId) : null;
      if (!o) {
        const m = D.m || 1;
        el.innerHTML = podeE() && !selId && tool === 'area' ? `<div class="ml-pn"><h4>Tamanho do quadradinho</h4><label>Cada quadradinho vale (metros)<select id="ml-m">${[.5, 1, 1.2, 2].map(v => `<option value="${v}"${v === m ? ' selected' : ''}>${String(v).replace('.', ',')} m</option>`).join('')}</select></label></div>` : '';
        const s = el.querySelector('#ml-m'); if (s) s.onchange = () => { push(); D.m = +s.value; salvar(); info(); draw(); };
        return;
      }
      const edit = podeE(), dis = edit ? '' : ' disabled', pal = o.t === 'p';
      el.innerHTML = `<div class="ml-pn"><h4>${pal ? '📦 Palete' : o.t === 'w' ? '▮ Parede' : '▬ Prateleira'} selecionado</h4>
        <label>Nome<input id="p-n" value="${esc(o.nome || '')}" placeholder="${pal ? 'Ex.: Palete A1' : o.t === 'w' ? 'Ex.: Parede norte' : 'Ex.: Prateleira 1'}"${dis}></label>
        <label>Largura (quadradinhos)<input id="p-w" type="number" min="1" max="${FW}" value="${o.w}"${dis}></label>
        <label>Comprimento (quadradinhos)<input id="p-h" type="number" min="1" max="${FH}" value="${o.h}"${dis}></label>
        ${pal ? `<label>Camadas de caixas<input id="p-c" type="number" min="1" max="6" value="${o.camadas || 1}"${dis}></label>
        <label>Caixas por camada<select id="p-x"${dis}>${LAY.map(([c, r], i) => `<option value="${i + 1}"${(o.cx || 3) === i + 1 ? ' selected' : ''}>${c * r}</option>`).join('')}</select></label>`
          : o.t === 'w' ? `<label>Altura (metros)<input id="p-alt" type="number" min="1" max="12" step="0.5" value="${o.alt || 3}"${dis}></label>` : `<label>Andares<input id="p-a" type="number" min="1" max="6" value="${o.andares || 1}"${dis}></label>`}
        <label class="full">Conteúdo / observações<input id="p-o" value="${esc(o.conteudo || '')}" placeholder="O que fica aqui"${dis}></label>
        ${edit ? `<div class="acts"><button id="p-r" class="ghost">⟳ Girar 90°</button>${podeA() ? '<button id="p-d" class="danger">🗑 Apagar</button>' : ''}</div>` : ''}</div>`;
      if (!edit) return;
      const ap = (fn, redesenha) => { push(); fn(); salvar(); draw(); info(); if (redesenha) painel(); };
      const tenta = (nx, ny, nw, nh) => { const r = { x: nx, y: ny, w: nw, h: nh }; if (!livre(r, o.id)) { alert('Não cabe aí: precisa ficar dentro da área e sem encostar em outro objeto.'); painel(); return; } ap(() => Object.assign(o, r), true); };
      el.querySelector('#p-n').onchange = e => ap(() => { o.nome = e.target.value.trim(); });
      el.querySelector('#p-o').onchange = e => ap(() => { o.conteudo = e.target.value.trim(); });
      el.querySelector('#p-w').onchange = e => tenta(o.x, o.y, clamp(Math.round(+e.target.value) || 1, 1, FW), o.h);
      el.querySelector('#p-h').onchange = e => tenta(o.x, o.y, o.w, clamp(Math.round(+e.target.value) || 1, 1, FH));
      if (pal) {
        el.querySelector('#p-c').onchange = e => ap(() => { o.camadas = clamp(Math.round(+e.target.value) || 1, 1, 6); }, true);
        el.querySelector('#p-x').onchange = e => ap(() => { o.cx = +e.target.value; });
      } else if (o.t === 'w') el.querySelector('#p-alt').onchange = e => ap(() => { o.alt = clamp(+e.target.value || 3, 1, 12); }, true);
      else el.querySelector('#p-a').onchange = e => ap(() => { o.andares = clamp(Math.round(+e.target.value) || 1, 1, 6); }, true);
      el.querySelector('#p-r').onclick = () => tenta(o.x, o.y, o.h, o.w);
      const d = el.querySelector('#p-d'); if (d) d.onclick = () => apagar(o.id);
    };
    const apagar = id => {
      const o = obj(id); if (!o || !podeA()) return;
      if (!confirm(`Apagar ${o.t === 'p' ? 'o palete' : o.t === 'w' ? 'a parede' : 'a prateleira'}${o.nome ? ' "' + o.nome + '"' : ''}?`)) return;
      push(); D.objs = D.objs.filter(x => x.id !== id); if (selId === id) selId = null; salvar(); tudo();
    };

    /* ---------- desenho ---------- */
    const cor = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888';
    const fit = (w, h) => { const d = Math.min(devicePixelRatio || 1, 2); cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + 'px'; cv.style.height = h + 'px'; ctx.setTransform(d, 0, 0, d, 0, 0); };
    const sombra = (rgb, k) => `rgb(${rgb.map(v => Math.round(v * k)).join(',')})`;
    const MAD = [226, 176, 62], CAIXA = [[190, 146, 96], [205, 161, 110], [168, 130, 84]], AZUL = [31, 78, 140], LARANJA = [232, 115, 26], DECK = [180, 188, 195];

    // Plano (vista de cima)
    const retPlano = (o, ok = true, fantasma = false) => {
      const x = o.x * cs, y = o.y * cs, w = o.w * cs, h = o.h * cs;
      ctx.globalAlpha = fantasma ? .75 : 1;
      if (o.t === 'p') {
        ctx.fillStyle = sombra(MAD, .9); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        const [c, r] = LAY[(o.cx || 3) - 1], along = o.w >= o.h ? [c, r] : [r, c], cw = (w - 8) / along[0], ch = (h - 8) / along[1];
        for (let j = 0; j < along[1]; j++) for (let i = 0; i < along[0]; i++) {
          ctx.fillStyle = sombra(CAIXA[(i + j) % 3], 1); ctx.fillRect(x + 4 + i * cw + 1, y + 4 + j * ch + 1, cw - 2, ch - 2);
          ctx.fillStyle = 'rgba(236,202,155,.9)'; ctx.fillRect(x + 4 + i * cw + 1, y + 4 + j * ch + ch / 2 - 2, cw - 2, 4);
        }
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else if (o.t === 'w') {
        ctx.fillStyle = '#4b5057'; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
        ctx.strokeStyle = '#2a2d31'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      } else {
        const horiz = o.w >= o.h;
        ctx.fillStyle = sombra(DECK, .95); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = sombra(LARANJA, 1);                                  // longarinas (laranja) nos dois lados longos
        if (horiz) { ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); } else { ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h); }
        ctx.fillStyle = sombra(AZUL, 1);                                      // montantes (azul) a cada quadradinho
        const n = horiz ? o.w : o.h;
        for (let i = 0; i <= n; i++) { const px = horiz ? x + i * cs : x, py = horiz ? y : y + i * cs; ctx.fillRect(clamp(px - 3, x, x + w - 6), clamp(py - 3, y, y + h - 6), 6, 6); if (horiz && o.h > 1) ctx.fillRect(clamp(px - 3, x, x + w - 6), y + h - 6, 6, 6); if (!horiz && o.w > 1) ctx.fillRect(x + w - 6, clamp(py - 3, y, y + h - 6), 6, 6); }
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
      }
      ctx.globalAlpha = 1;
      const nome = o.nome || (o.t === 'p' ? 'Palete' : o.t === 'w' ? '' : 'Prateleira'), tag = o.t === 'w' ? nome : o.t === 'p' ? `${nome} · ${o.camadas || 1}×` : `${nome} · ${o.andares || 1}↕`;
      const F = clamp(Math.min(cs * .46, (Math.max(w, h)) / Math.max(tag.length * .6, 1)), 8, 15);
      ctx.save(); ctx.translate(x + w / 2, y + h / 2); if (o.h > o.w * 1.6 && o.t !== 'p') ctx.rotate(-Math.PI / 2);
      ctx.font = `700 ${F}px system-ui,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      if (tag) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(tag, 0, 0); ctx.fillStyle = '#fff'; ctx.fillText(tag, 0, 0); } ctx.restore();
      if (!ok) { ctx.fillStyle = 'rgba(220,38,38,.35)'; ctx.fillRect(x, y, w, h); }
      if (o.id === selId) { ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]); ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); ctx.setLineDash([]); }
    };
    const drawPlano = () => {
      fit(FW * cs, FH * cs);
      const a = D.area, linha = cor('--line'), fundo = cor('--bg'), area = cor('--panel');
      ctx.fillStyle = fundo; ctx.fillRect(0, 0, FW * cs, FH * cs);
      if (a) { ctx.fillStyle = area; ctx.fillRect(a.x * cs, a.y * cs, a.w * cs, a.h * cs); }
      ctx.strokeStyle = linha; ctx.lineWidth = 1; ctx.globalAlpha = a ? .5 : .9; ctx.beginPath();
      for (let i = 0; i <= FW; i++) { ctx.moveTo(i * cs + .5, 0); ctx.lineTo(i * cs + .5, FH * cs); }
      for (let j = 0; j <= FH; j++) { ctx.moveTo(0, j * cs + .5); ctx.lineTo(FW * cs, j * cs + .5); }
      ctx.stroke(); ctx.globalAlpha = 1;
      if (a) {
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, FW * cs, a.y * cs); ctx.fillRect(0, (a.y + a.h) * cs, FW * cs, (FH - a.y - a.h) * cs);
        ctx.fillRect(0, a.y * cs, a.x * cs, a.h * cs); ctx.fillRect((a.x + a.w) * cs, a.y * cs, (FW - a.x - a.w) * cs, a.h * cs);
        ctx.strokeStyle = cor('--accent'); ctx.lineWidth = 3; ctx.strokeRect(a.x * cs, a.y * cs, a.w * cs, a.h * cs);
      }
      D.objs.forEach(o => { if (!(drag && drag.mode === 'move' && drag.id === o.id && ghost)) retPlano(o); });
      if (ghost) retPlano(ghost.r, ghost.ok, true);
      if (drag && drag.mode === 'draw' && tool === 'area' && ghost) {                       // pré-visualização da área
        const r = ghost.r; ctx.fillStyle = ghost.ok ? 'rgba(34,211,238,.25)' : 'rgba(220,38,38,.3)'; ctx.fillRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs);
        ctx.strokeStyle = ghost.ok ? '#22d3ee' : '#dc2626'; ctx.lineWidth = 3; ctx.strokeRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs);
        const t = `${r.w} × ${r.h}`; ctx.font = '700 15px system-ui,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(t, (r.x + r.w / 2) * cs, (r.y + r.h / 2) * cs); ctx.fillStyle = '#fff'; ctx.fillText(t, (r.x + r.w / 2) * cs, (r.y + r.h / 2) * cs);
      }
      wrap.style.touchAction = tool === 'nav' ? 'auto' : 'none'; cv.style.touchAction = tool === 'nav' ? 'auto' : 'none'; cv.style.cursor = tool === 'nav' ? 'default' : 'crosshair';
    };

    // 3D isométrico (sem biblioteca): caixas pintadas de trás para frente
    const drawIso = () => {
      const a = D.area, m = D.m || 1;
      if (!a) { fit(wrap.clientWidth || 320, 200); ctx.fillStyle = cor('--bg'); ctx.fillRect(0, 0, 9999, 9999); ctx.fillStyle = cor('--muted'); ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Defina a área no modo Plano para ver o 3D.', (wrap.clientWidth || 320) / 2, 100); return; }
      const odd = rot % 2, dw = odd ? a.h : a.w, dh = odd ? a.w : a.h, k = cs * .7, zu = cs * .85 / m, pad = 30;
      const maxZ = Math.max(2.5, ...D.objs.map(altura)) * zu;
      const Wc = (dw + dh) * k + pad * 2, Hc = (dw + dh) * k / 2 + maxZ + pad * 2;
      fit(Math.max(Wc, wrap.clientWidth - 4), Hc);
      ctx.fillStyle = cor('--bg'); ctx.fillRect(0, 0, 9999, 9999);
      const ox = Math.max(Wc, wrap.clientWidth - 4) / 2 + (dh - dw) * k / 2, oy = pad + maxZ;
      const R = (x, y) => { let lx = x - a.x, ly = y - a.y, w = a.w, h = a.h; for (let i = 0; i < rot; i++) { [lx, ly] = [h - ly, lx]; [w, h] = [h, w]; } return [lx, ly]; };
      const P = (x, y, z) => [ox + (x - y) * k, oy + (x + y) * k / 2 - z * zu];
      const face = (pts, fill, stroke = 'rgba(0,0,0,.35)') => { ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); };
      const box = (x0, y0, z0, x1, y1, z1, rgb) => {
        face([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], sombra(rgb, 1));            // topo
        face([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], sombra(rgb, .8));            // lado de x máximo
        face([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], sombra(rgb, .62));           // lado de y máximo
      };
      face([P(0, 0, 0), P(dw, 0, 0), P(dw, dh, 0), P(0, dh, 0)], cor('--panel'), cor('--accent'));        // piso
      ctx.strokeStyle = cor('--line'); ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 1; i < dw; i++) { const p = P(i, 0, 0), q = P(i, dh, 0); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      for (let j = 1; j < dh; j++) { const p = P(0, j, 0), q = P(dw, j, 0); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
      const lista = D.objs.map(o => { const [x1, y1] = R(o.x, o.y), [x2, y2] = R(o.x + o.w, o.y + o.h); return { o, x0: Math.min(x1, x2), y0: Math.min(y1, y2), x1: Math.max(x1, x2), y1: Math.max(y1, y2) }; })
        .sort((p, q) => (p.x0 + p.x1 + p.y0 + p.y1) - (q.x0 + q.x1 + q.y0 + q.y1));
      lista.forEach(({ o, x0, y0, x1, y1 }) => {
        const g = .06, w = x1 - x0, h = y1 - y0;
        if (o.t === 'p') {
          box(x0 + g, y0 + g, 0, x1 - g, y1 - g, PH / m, MAD);
          const [c, r] = LAY[(o.cx || 3) - 1], cols = w >= h ? c : r, rows = w >= h ? r : c, cw = (w - g * 2) / cols, ch = (h - g * 2) / rows;
          for (let l = 0; l < (o.camadas || 1); l++) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
            box(x0 + g + i * cw + .02, y0 + g + j * ch + .02, (PH + BH * l) / m, x0 + g + (i + 1) * cw - .02, y0 + g + (j + 1) * ch - .02, (PH + BH * (l + 1)) / m - .01 / m, CAIXA[(i + j + l) % 3]);
        } else if (o.t === 'w') {
          box(x0, y0, 0, x1, y1, (o.alt || 3) / m, [150, 156, 164]);
        } else {
          const andares = o.andares || 1, pt = .1, posts = [];
          const longoX = w >= h, n = Math.max(1, Math.round(longoX ? w : h));
          for (let i = 0; i <= n; i++) { const u = (longoX ? x0 : y0) + i * ((longoX ? w : h) / n); posts.push(longoX ? [u, y0] : [x0, u]); posts.push(longoX ? [u, y1] : [x1, u]); }
          const poste = ([px, py]) => box(clamp(px - pt / 2, x0, x1 - pt), clamp(py - pt / 2, y0, y1 - pt), 0, clamp(px - pt / 2, x0, x1 - pt) + pt, clamp(py - pt / 2, y0, y1 - pt) + pt, andares * HA / m, AZUL);
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          posts.filter(p => p[0] + p[1] < cx + cy).forEach(poste);                                           // montantes de trás
          for (let l = 0; l < andares; l++) box(x0, y0, (l * HA + .06) / m, x1, y1, (l * HA + .06) / m + .05 / m, DECK);
          for (let l = 0; l < andares; l++) {                                                                // longarinas
            const z = (l * HA + .06) / m + .05 / m, b = .07;
            if (longoX) { box(x0, y0, z, x1, y0 + b, z + .06 / m, LARANJA); box(x0, y1 - b, z, x1, y1, z + .06 / m, LARANJA); }
            else { box(x0, y0, z, x0 + b, y1, z + .06 / m, LARANJA); box(x1 - b, y0, z, x1, y1, z + .06 / m, LARANJA); }
          }
          posts.filter(p => p[0] + p[1] >= cx + cy).forEach(poste);                                          // montantes da frente
        }
        if (o.nome) { const [px, py] = P((x0 + x1) / 2, (y0 + y1) / 2, altura(o) / m + .15 / m); ctx.font = '700 12px system-ui,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(o.nome, px, py); ctx.fillStyle = '#fff'; ctx.fillText(o.nome, px, py); }
      });
      cv.style.cursor = 'default'; cv.style.touchAction = 'auto';
    };
    const draw = () => (vista === 'plano' ? drawPlano : drawIso)();
    const tudo = () => { barra(); info(); painel(); draw(); };

    /* ---------- toque / mouse (vista Plano) ---------- */
    const cel = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / cs), Math.floor((e.clientY - r.top) / cs)]; };
    const rectDe = d => {
      const dx = d.ex - d.sx, dy = d.ey - d.sy;
      if (tool === 'area' || tool === 'palete') return { x: Math.min(d.sx, d.ex), y: Math.min(d.sy, d.ey), w: Math.abs(dx) + 1, h: Math.abs(dy) + 1 };
      const T = tool === 'p2' ? 2 : 1;                      // parede e prateleira fina: 1 quadradinho de grossura
      return Math.abs(dx) >= Math.abs(dy) ? { x: Math.min(d.sx, d.ex), y: d.sy, w: Math.abs(dx) + 1, h: T } : { x: d.sx, y: Math.min(d.sy, d.ey), w: T, h: Math.abs(dy) + 1 };
    };
    cv.onpointerdown = e => {
      if (vista !== 'plano' || tool === 'nav') return;
      const [cx, cy] = cel(e); if (cx < 0 || cy < 0 || cx >= FW || cy >= FH) return;
      cv.setPointerCapture(e.pointerId);
      if (tool === 'sel') {
        const o = objEm(cx, cy); selId = o ? o.id : null;
        if (o && podeE()) drag = { mode: 'move', id: o.id, dx: cx - o.x, dy: cy - o.y, moveu: false };
        painel(); draw(); return;
      }
      if (tool === 'del') { const o = objEm(cx, cy); if (o) apagar(o.id); return; }
      if (!podeE()) return;
      if (tool !== 'area' && !D.area) { alert('Primeiro defina a área com a ferramenta ⬚ Área.'); return; }
      drag = { mode: 'draw', sx: cx, sy: cy, ex: cx, ey: cy }; ghost = null; moveGhost(); draw();
    };
    const moveGhost = () => {
      if (!drag) return;
      if (drag.mode === 'move') { const o = obj(drag.id), r = { x: drag.nx ?? o.x, y: drag.ny ?? o.y, w: o.w, h: o.h }; ghost = drag.moveu ? { r: { ...o, ...r }, ok: livre(r, o.id) } : null; return; }
      let r = rectDe(drag); r = { x: r.x, y: r.y, w: Math.min(r.w, FW - r.x), h: Math.min(r.h, FH - r.y) };
      const ok = tool === 'area' ? D.objs.every(o => dentro(o, r)) : livre(r);
      ghost = { r: tool === 'palete' ? { t: 'p', camadas: 3, cx: 3, ...r } : tool === 'area' ? r : tool === 'parede' ? { t: 'w', alt: 3, ...r } : { t: 's', andares: 4, ...r }, ok };
    };
    cv.onpointermove = e => {
      if (!drag) return;
      const [cx, cy] = cel(e);
      if (drag.mode === 'move') { const o = obj(drag.id); drag.nx = clamp(cx - drag.dx, 0, FW - o.w); drag.ny = clamp(cy - drag.dy, 0, FH - o.h); drag.moveu = drag.nx !== o.x || drag.ny !== o.y; }
      else { drag.ex = clamp(cx, 0, FW - 1); drag.ey = clamp(cy, 0, FH - 1); }
      moveGhost(); draw();
    };
    const solta = () => {
      if (!drag) return; const d = drag, g = ghost; drag = null; ghost = null;
      if (d.mode === 'move') { if (d.moveu && podeE()) { const o = obj(d.id), r = { x: d.nx, y: d.ny, w: o.w, h: o.h }; if (livre(r, o.id)) { push(); o.x = r.x; o.y = r.y; salvar(); } } painel(); info(); draw(); return; }
      if (g && g.ok) {
        push();
        if (tool === 'area') { D.area = { x: g.r.x, y: g.r.y, w: g.r.w, h: g.r.h }; tool = 'palete'; }
        else { const o = { id: uid(), t: g.r.t, x: g.r.x, y: g.r.y, w: g.r.w, h: g.r.h, nome: '', conteudo: '' }; if (o.t === 'p') { o.camadas = 3; o.cx = 3; } else if (o.t === 'w') o.alt = 3; else o.andares = 4; D.objs.push(o); }
        salvar(); tudo();
      } else { if (g && !g.ok) alert(tool === 'area' ? 'A área precisa cobrir todos os objetos que já estão no mapa.' : 'Não cabe aí: precisa ficar dentro da área e sem encostar em outro objeto.'); draw(); }
    };
    cv.onpointerup = solta; cv.onpointercancel = () => { drag = null; ghost = null; draw(); };
    document.addEventListener('keydown', function ev(e) {
      if (!body.isConnected) return document.removeEventListener('keydown', ev);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && vista === 'plano' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) apagar(selId);
    });

    tudo();
    if (D.area) requestAnimationFrame(() => { wrap.scrollLeft = Math.max(0, (D.area.x - 1) * cs); wrap.scrollTop = Math.max(0, (D.area.y - 1) * cs); });
  };
})();
