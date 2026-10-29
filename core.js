/* ===== Núcleo: utilitários, armazenamento, telas e diálogos ===== */
const CFO = { modules: {}, screens: [] };

CFO.norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Converte texto em número (aceita 1.234,50 e 12.9)
CFO.toNum = v => { v = String(v ?? '').replace(/[^\d,.-]/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return parseFloat(v) || 0; };
CFO.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Bibliotecas pesadas (Excel) só são baixadas quando alguém importa/exporta uma planilha: a abertura do sistema fica bem mais leve
CFO.lib = (() => {
  const U = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js' }, G = { xlsx: 'XLSX', exceljs: 'ExcelJS' }, P = {};
  return nome => window[G[nome]] ? Promise.resolve(true) : P[nome] || (P[nome] = new Promise(res => {
    const s = document.createElement('script'); s.src = U[nome]; s.onload = () => res(true); s.onerror = () => { delete P[nome]; s.remove(); res(false); }; document.head.append(s);
  }));
})();

// Dados salvos no navegador (localStorage)
// CFO.espaco = '' -> dados principais ('cfo:', sincronizam com a nuvem) | 's_<id>' -> setor isolado ('cfs:<espaço>:', ficam só neste aparelho, nunca vão para a nuvem).
// Quem define é o login.js (antes de qualquer outro arquivo ler dados). 'perfis' (lista de perfis e setores) é sempre o dado principal.
CFO.espaco = '';
const CHAVES_GERAIS = new Set(['perfis']);
const chaveLocal = k => (CFO.espaco && !CHAVES_GERAIS.has(k) ? 'cfs:' + CFO.espaco + ':' : 'cfo:') + k;
CFO.store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(chaveLocal(k))) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(chaveLocal(k), JSON.stringify(v)); }
};

// Abre uma tela cobrindo a atual (com X para voltar)
CFO.open = (title, render) => {
  const s = document.createElement('section');
  s.className = 'screen'; s.dataset.title = title;
  s.innerHTML = `<header><button class="x" aria-label="Voltar">✕</button><h2>${CFO.esc(title)}</h2></header><div class="body"></div>`;
  s.querySelector('.x').onclick = CFO.close;
  document.getElementById('screens').append(s);
  CFO.screens.push(s); CFO.onChange?.();
  render(s.querySelector('.body'));
};
CFO.close = () => { CFO.screens.pop()?.remove(); CFO.onChange?.(); };

// Janela de formulário
CFO.dialog = (title, fields, onOk) => {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog"><h3>${CFO.esc(title)}</h3>${fields}
    <div class="row"><button value="cancel" class="ghost" formnovalidate>Cancelar</button><button value="ok">Salvar</button></div></form>`;
  d.onclose = () => {
    if (d.returnValue === 'ok') onOk(Object.fromEntries(new FormData(d.querySelector('form'))));
    d.remove();
  };
  document.body.append(d);
  d.showModal();
};

// Banco para dados grandes (fotos) - IndexedDB. Lojas: 'fotos' (dados + miniatura), 'imgs' (foto completa) e 'fichas' (identificação)
CFO.db = (() => {
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(CFO.espaco ? 'cfo_' + CFO.espaco : 'cfo', 2);   // setor isolado = banco de fotos separado
    r.onupgradeneeded = () => ['fotos', 'imgs', 'fichas'].forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const run = async (s, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction(s, mode), rq = fn(t.objectStore(s)); t.oncomplete = () => res(rq?.result); t.onerror = () => rej(t.error); });
  };
  return {
    put: (s, v) => run(s, 'readwrite', st => st.put(v)), all: s => run(s, 'readonly', st => st.getAll()),
    get: (s, id) => run(s, 'readonly', st => st.get(id)), keys: s => run(s, 'readonly', st => st.getAllKeys()), del: (s, id) => run(s, 'readwrite', st => st.delete(id)),
    clear: s => run(s, 'readwrite', st => st.clear())
  };
})();

// Reduz uma imagem (fundo branco) e devolve JPEG em dataURL
CFO.shrink = (src, max, qual) => new Promise(res => {
  const i = new Image();
  i.onload = () => {
    const k = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = Math.round(i.width * k); c.height = Math.round(i.height * k);
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(i, 0, 0, c.width, c.height);
    res(c.toDataURL('image/jpeg', qual));
  };
  i.src = src;
});

// Imprime um trecho de HTML (A4) - no diálogo do navegador também dá para "Salvar como PDF".
// Imprime dentro de um quadro (iframe) separado, só com o relatório: assim o layout do sistema não cria folhas em branco.
CFO.printDoc = html => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${CFO.esc(document.title)}</title>
  ${[...document.querySelectorAll('style, link[rel=stylesheet]')].map(e => e.outerHTML).join('\n')}
  <style>@page{size:A4;margin:0}html,body{display:block!important;margin:0;padding:0;background:#fff!important;color:#0f172a;min-height:0!important;height:auto!important;overflow:visible}
  #printArea{display:block!important}</style></head><body><div id="printArea">${html}</div></body></html>`;
CFO.print = html => {
  document.querySelectorAll('iframe.print-frame').forEach(f => f.remove());
  const f = document.createElement('iframe'); f.className = 'print-frame';
  f.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:0;visibility:hidden';
  f.srcdoc = CFO.printDoc(CFO.termo ? CFO.termo.html(html) : html);   // setor com nome próprio no lugar de "EPI"
  f.onload = () => setTimeout(() => {
    const w = f.contentWindow; if (!w) return;
    w.addEventListener('afterprint', () => setTimeout(() => f.remove(), 500));
    w.focus(); w.print();
  }, 250);
  document.body.append(f);
};

// Datas auxiliares (usadas nas planilhas)
const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const hoje = () => dias(0);

// Filtro de Mês/Ano (usado em Requisição e EPIs por contrato). O mês da requisição pode vir como "Janeiro/2026", "01/2026", "2026-01"...
CFO.periodo = (() => {
  const NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const chaves = NOMES.map(CFO.norm);
  const parse = s => {
    const t = CFO.norm(s), a = t.match(/^([a-z]+)(\d{4})$/), x = String(s ?? '');
    if (a) { const i = chaves.findIndex(n => n === a[1] || n.startsWith(a[1].slice(0, 3))); if (i >= 0) return { m: i + 1, y: +a[2] }; }
    let b = x.match(/(\d{4})[-\/.](\d{1,2})/); if (b) return { m: +b[2], y: +b[1] };
    b = x.match(/(\d{1,2})[-\/.](?:\d{1,2}[-\/.])?(\d{4})/); if (b) return { m: +b[1], y: +b[2] };
    return null;
  };
  return {
    parse, NOMES,
    // HTML dos dois seletores (as opções de ano são preenchidas por fill)
    html: () => `<select id="fm" aria-label="Mês"><option value="">Todos os meses</option>${NOMES.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('')}</select>
      <select id="fa" aria-label="Ano"><option value="">Todos os anos</option></select>`,
    // Preenche os anos existentes nas requisições, mantendo o que estava escolhido (ou o ano indicado em keep)
    fill(root, reqs, keep) {
      const fa = root.querySelector('#fa'), atual = String(keep ?? fa.value);
      const anos = [...new Set(reqs.map(r => parse(r.mes)?.y).filter(Boolean))].sort((a, b) => b - a);
      fa.innerHTML = '<option value="">Todos os anos</option>' + anos.map(y => `<option ${String(y) === atual ? 'selected' : ''}>${y}</option>`).join('');
    },
    // Função de teste para um mês/ano (vazio = todos)
    fn: (m, y) => r => { if (!m && !y) return true; const p = parse(r.mes); return !!p && (!m || p.m === +m) && (!y || p.y === +y); },
    // Função de teste conforme o que está escolhido na tela
    test(root) { return this.fn(root.querySelector('#fm').value, root.querySelector('#fa').value); },
    // Chave AAAAMM para ordenar e "Mês/Ano" para exibir
    key: s => { const p = parse(s); return p ? p.y * 100 + p.m : 0; },
    label: s => { const p = parse(s); return p ? NOMES[p.m - 1].slice(0, 3) + '/' + p.y : String(s || '-'); }
  };
})();

// Botão "Filtros": junta os filtros de uma barra (selects, "só com...", datas) numa telinha, deixando a barra limpa.
// Os controles são os MESMOS (só mudam de lugar), então tudo continua funcionando; é possível combinar vários filtros ao mesmo tempo.
CFO.filtros = (() => {
  const aberto = new WeakMap(), SEL = 'select, label.chk, label.hm-d, [data-f]';
  const inp = el => el.matches('input') ? el : el.querySelector('input');
  const ativo = el => el.matches('select') ? el.selectedIndex > 0 : el.matches('[data-f]') ? el.dataset.on === '1' : (i => i && (i.type === 'checkbox' ? i.checked : i.value !== ''))(inp(el));
  const chave = el => el.id || (el.querySelector('[id]') || {}).id;
  return body => body.querySelectorAll('.bar').forEach(bar => {
    if (bar.__f) return;
    const ctr = [...bar.querySelectorAll(SEL)].filter(e => !e.closest('dialog'));
    if (ctr.length < 2) return;
    bar.__f = true;
    const dlg = document.createElement('dialog'); dlg.className = 'mp-dlg fdlg';
    dlg.innerHTML = '<h3>Filtros</h3><p class="log" style="margin:0">Combine quantos quiser: a lista muda na hora.</p><div class="fbody"></div><div class="row"><button type="button" class="ghost" data-lim>Limpar filtros</button><button type="button" data-ok>Pronto</button></div>';
    const fb = dlg.querySelector('.fbody'), btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ghost fbtn';
    ctr[0].before(btn);
    const ids = ctr.map(chave);
    ctr.forEach(el => { const g = document.createElement('div'); g.className = 'fgrp'; const cap = el.getAttribute('aria-label') || el.dataset.cap; if (cap && el.matches('select')) { const sm = document.createElement('small'); sm.textContent = cap; g.append(sm); } g.append(el); fb.append(g); });
    bar.append(dlg);
    const atual = () => ids.map(i => i && body.querySelector('#' + CSS.escape(i))).filter(Boolean).map(e => e.closest('label.chk, label.hm-d') || e);
    const atualiza = () => { const n = atual().filter(ativo).length; btn.textContent = '🎚️ Filtros' + (n ? ' (' + n + ')' : ''); btn.classList.toggle('on', n > 0); };
    const fecha = () => { aberto.set(body, false); dlg.close(); atualiza(); };
    btn.onclick = () => { aberto.set(body, true); dlg.showModal(); };
    dlg.querySelector('[data-ok]').onclick = fecha;
    dlg.addEventListener('close', () => { if (dlg.isConnected) { aberto.set(body, false); atualiza(); } });
    ['change', 'input'].forEach(t => dlg.addEventListener(t, atualiza)); dlg.addEventListener('click', () => setTimeout(atualiza, 0));
    // Limpar: algumas telas se redesenham a cada mudança, então cada controle é procurado de novo na tela
    dlg.querySelector('[data-lim]').onclick = () => {
      ids.forEach(i => { const e = i && body.querySelector('#' + CSS.escape(i)); if (!e) return; const u = e.closest('label.chk, label.hm-d') || e; if (!ativo(u)) return;
        if (e.matches('select')) { e.selectedIndex = 0; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
        else if (e.matches('[data-f]')) e.click();
        else { if (e.type === 'checkbox') e.checked = false; else e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); } });
      const b2 = body.querySelector('.fbtn'); if (b2 && !b2.isConnected) return; atualiza();
    };
    atualiza(); setTimeout(atualiza, 0); setTimeout(atualiza, 400);   // valores iniciais podem ser definidos logo depois pela tela
    if (aberto.get(body)) dlg.showModal();                              // a tela se redesenhou com a telinha aberta: reabre
  });
})();

// Filtro de Tipo da requisição (coluna Motivo): TODOS, ADMISSÃO, EVENTUAL, MENSAL... (usado em EPI, Requisição, EPIs por contrato e Gastos em EPIs)
CFO.motivo = (() => {
  const LISTA = ['ADMISSÃO', 'EVENTUAL', 'MENSAL', 'RETIRADA MENSAL', 'TROCA (DANO)', 'TROCA (REGULAR)'];
  // Nomes diferentes do mesmo tipo contam juntos (ex.: "RETIRADA DE MENSAL" = "RETIRADA MENSAL", "USO EVENTUAL" = "EVENTUAL")
  const ALIAS = { retiradademensal: 'retiradamensal', usoeventual: 'eventual', trocapordanodefeito: 'trocadano' };
  const canon = s => { const n = CFO.norm(s); return ALIAS[n] || n; };
  const igual = (a, b) => canon(a) === canon(b);
  return {
    LISTA, canon,
    html: (id = 'ft') => `<select id="${id}" aria-label="Tipo da requisição"><option value="">TODOS</option>${LISTA.map(n => `<option>${CFO.esc(n)}</option>`).join('')}</select>`,
    // Mantém a lista e acrescenta tipos que existem nas requisições importadas mas não estão nela; mantém o que estava escolhido (ou keep)
    fill(root, reqs, id = 'ft', keep) {
      const s = root.querySelector('#' + id), atual = keep ?? s.value;
      const extras = [...new Map(reqs.filter(r => r.motivo && !LISTA.some(n => igual(n, r.motivo))).map(r => [CFO.norm(r.motivo), String(r.motivo).trim()])).values()];
      s.innerHTML = '<option value="">TODOS</option>' + [...LISTA, ...extras].map(n => `<option ${n === atual ? 'selected' : ''}>${CFO.esc(n)}</option>`).join('');
    },
    // Função de teste para um tipo (vazio = todos)
    fn: t => r => !t || igual(r.motivo, t),
    test(root, id = 'ft') { return this.fn(root.querySelector('#' + id).value); }
  };
})();


/* ----- Itens com tamanho: "BOTINA DE COURO (42)" e "BOTINA DE COURO (38)" são o MESMO item em tamanhos diferentes ----- */
CFO.TAM_RE = /^(\d{1,3}([.,]\d)?|P{1,2}|M|G{1,2}|XG{1,2}|EG{1,2}|XXG|XXL|XL|S|L|U|UNICO|ÚNICO|UNICA|ÚNICA|N\/A)$/i;
CFO.tamEpi = nome => { const m = String(nome ?? '').match(/\(([^)]+)\)\s*$/); return m && CFO.TAM_RE.test(m[1].trim()) ? CFO.norm(m[1]) : ''; };
CFO.baseEpi = nome => { const s = String(nome ?? '').trim(), m = s.match(/^(.*?)\s*\(([^)]+)\)\s*$/); return m && m[1] && CFO.TAM_RE.test(m[2].trim()) ? m[1].trim() : s; };
