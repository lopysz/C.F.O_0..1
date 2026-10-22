/* ===== Núcleo: utilitários, armazenamento, telas e diálogos ===== */
const CFO = { modules: {}, screens: [] };

CFO.norm = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Converte texto em número (aceita 1.234,50 e 12.9)
CFO.toNum = v => { v = String(v ?? '').replace(/[^\d,.-]/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); return parseFloat(v) || 0; };
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

// Filtro de Tipo da requisição (coluna Motivo): TODOS, ADMISSÃO, EVENTUAL, MENSAL... (usado em EPI, Requisição, EPIs por contrato e Controle de gastos)
CFO.motivo = (() => {
  const LISTA = ['ADMISSÃO', 'EVENTUAL', 'MENSAL', 'RETIRADA DE MENSAL', 'TROCA (DANO)', 'TROCA (REGULAR)', 'TROCA POR DANO / DEFEITO'];
  const igual = (a, b) => CFO.norm(a) === CFO.norm(b);
  return {
    LISTA,
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
