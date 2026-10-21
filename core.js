/* ===== Núcleo: utilitários, armazenamento, telas e diálogos ===== */
const CFO = { modules: {}, screens: [] };

CFO.norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
CFO.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Dados salvos no navegador (localStorage)
CFO.store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('cfo:' + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem('cfo:' + k, JSON.stringify(v)); }
};

// Abre uma tela cobrindo a atual (com X para voltar)
CFO.open = (title, render) => {
  const s = document.createElement('section');
  s.className = 'screen';
  s.innerHTML = `<header><button class="x" aria-label="Voltar">✕</button><h2>${CFO.esc(title)}</h2></header><div class="body"></div>`;
  s.querySelector('.x').onclick = CFO.close;
  document.getElementById('screens').append(s);
  CFO.screens.push(s);
  render(s.querySelector('.body'));
};
CFO.close = () => CFO.screens.pop()?.remove();

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
    const r = indexedDB.open('cfo', 2);
    r.onupgradeneeded = () => ['fotos', 'imgs', 'fichas'].forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const run = async (s, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => { const t = db.transaction(s, mode), rq = fn(t.objectStore(s)); t.oncomplete = () => res(rq?.result); t.onerror = () => rej(t.error); });
  };
  return {
    put: (s, v) => run(s, 'readwrite', st => st.put(v)), all: s => run(s, 'readonly', st => st.getAll()),
    get: (s, id) => run(s, 'readonly', st => st.get(id)), del: (s, id) => run(s, 'readwrite', st => st.delete(id)),
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

// Imprime um trecho de HTML (A4) - no diálogo do navegador também dá para "Salvar como PDF"
CFO.print = html => {
  let a = document.getElementById('printArea');
  if (!a) { a = document.createElement('div'); a.id = 'printArea'; document.body.append(a); }
  a.innerHTML = html;
  setTimeout(() => window.print(), 150);
};

// Datas auxiliares (usadas nas planilhas)
const dias = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const hoje = () => dias(0);
