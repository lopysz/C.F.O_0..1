/* ===== Navegação: menu lateral (PC) / barra inferior (celular) + leque =====
   Para criar uma subgaveta nova: registre o módulo (CFO.modules.<nome>) e adicione { name, m } em subs. */
const DRAWERS = [
  { id: 'a', icon: 'box', name: 'Almoxarifado Operacional', short: 'Almox. Op.',
    subs: [{ name: 'Planilha EPI', m: 'epi' }, { name: 'Contratos', m: 'contratos' }, { name: 'Requisição', m: 'requisicoes' }] },
  { id: 'j', icon: 'scale', name: 'Jurídico Operacional', short: 'Jurídico Op.',
    subs: [{ name: 'EPIs por contrato', m: 'epis_contrato' }, { name: 'Gastos em EPIs', m: 'controle_gastos' }, { name: 'Controle mensal', m: 'controle_mensal' }] },
  { id: 'f', icon: 'tool', name: 'Ferramentas', short: 'Ferramentas',
    subs: [{ name: 'Foto de Separação', m: 'fotos' }, { name: 'Gerador de Identificação', m: 'etiquetas' }, { name: 'Contagem de estoque', m: 'contagem' }, { name: 'Mapa almoxarifado', m: 'mapa' }] }
];

const IC = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  scale: '<path d="M12 4v16M6 20h12M5 8h14"/><path d="M5 8l-2.5 6a3 3 0 005 0zM19 8l-2.5 6a3 3 0 005 0z"/>',
  tool: '<path d="M14.5 6.5a4 4 0 005 5L10 21a2.1 2.1 0 01-3-3z"/><path d="M14.5 6.5l3-3 3 3-3 3"/>',
  chev: '<path d="M9 6l6 6-6 6"/>', doc: '<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  back: '<path d="M15 6l-6 6 6 6"/>', more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'
};
const svg = (n, cls = '') => `<svg viewBox="0 0 24 24"${cls ? ` class="${cls}"` : ''}>${IC[n]}</svg>`;
const $ = s => document.querySelector(s);
const rail = $('#rail'), tabbar = $('#tabbar'), fan = $('#fan'), fl = $('#fl'), inicio = $('#home'), crumb = $('#crumb'), back = $('#back'), barra = $('.bar');
const mobile = () => matchMedia('(max-width:900px)').matches;
let ctx = null, aberto = null;

// Abre a função escolhida (substitui as telas abertas)
function ir(d, s) {
  if (!CFO.pode('abrir', s.m)) return;
  while (CFO.screens.length) CFO.close();
  ctx = d;
  CFO.open(s.name, CFO.modules[s.m] || (b => { b.innerHTML = `<p class="empty">Esta função ainda não foi carregada. Confira se o arquivo dela está na mesma pasta do index.html e se o index.html está atualizado (depois, atualize a página com Ctrl+F5).</p>`; }));
}
function voltarInicio() { fechar(); while (CFO.screens.length) CFO.close(); }

// Menus (a mesma lista alimenta a lateral e a barra inferior)
const navHTML = lateral => `<button class="nav" data-home aria-label="Início">${svg('home')}<b>Início</b></button>` +
  DRAWERS.map(d => `<button class="nav" data-d="${d.id}" aria-expanded="false" aria-haspopup="menu">${svg(d.icon)}<b>${lateral ? d.name : d.short}</b>${lateral ? svg('chev', 'chev') : ''}</button>`).join('');
rail.innerHTML = `<div class="brand"><i>C</i><span>C.F.O<small>Caixa de Ferramentas Operacional</small></span></div>${navHTML(true)}<div class="sp"></div><div class="ver">versão 20261025c</div>`;
tabbar.innerHTML = navHTML(false);
back.innerHTML = svg('back'); $('#more').innerHTML = svg('more'); $('#theme').innerHTML = svg('moon');

// Início (funções sem permissão para o perfil aparecem apagadas, com cadeado)
function renderInicio() {
  inicio.innerHTML = `<div class="wrap"><p class="sub" style="margin-top:0">Caixa de Ferramentas Operacional</p>
  <div class="sec">Painel gerencial</div><div id="painel"></div>
  <div class="sec" style="margin-top:2rem">Escolha uma função</div>
  <div class="cols" style="margin-top:0">${DRAWERS.map(d => `<div class="card"><h3>${svg(d.icon)}${d.name}${d.subs.every(s => !CFO.pode('abrir', s.m)) ? '<span class="tag" style="margin-left:auto">Sem acesso</span>' : ''}</h3><div class="short">${d.subs.map((s, i) => `<button data-d="${d.id}" data-i="${i}"${CFO.pode('abrir', s.m) ? '' : ' disabled'}>${s.name}${svg(CFO.pode('abrir', s.m) ? 'chev' : 'lock')}</button>`).join('')}</div></div>`).join('')}</div></div>`;
  inicio.querySelectorAll('.short button:not(:disabled)').forEach(b => b.onclick = () => { const d = DRAWERS.find(x => x.id === b.dataset.d); ir(d, d.subs[+b.dataset.i]); });
  // Painel gerencial (painel.js): os botões das telinhas abrem a função correspondente
  CFO.painel?.montar($('#painel'), m => { const d = DRAWERS.find(x => x.subs.some(s => s.m === m)); if (d) ir(d, d.subs.find(s => s.m === m)); });
}
CFO.onUser = () => { renderInicio(); fechar(); };
renderInicio();

// Barra superior e destaque do menu conforme as telas abertas
function atualizar() {
  const n = CFO.screens.length;
  back.hidden = n === 0;
  const partes = n ? [ctx?.name, ...CFO.screens.map(s => s.dataset.title)].filter(Boolean) : ['C.F.O'];
  crumb.innerHTML = partes.map((p, i) => i === partes.length - 1 ? `<b>${CFO.esc(p)}</b>` : `<span class="p">${CFO.esc(p)} / </span>`).join('');
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('on', n ? b.dataset.d === ctx?.id : b.hasAttribute('data-home')));
  barra.classList.remove('more');
  CFO.painel?.aoMudarTela();
}
CFO.onChange = atualizar;
back.onclick = () => CFO.close();
$('#more').onclick = e => { e.stopPropagation(); barra.classList.toggle('more'); };

// Leque
function fechar() { fan.classList.remove('open'); aberto = null; document.querySelectorAll('.nav[data-d]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
function abrirLeque(btn) {
  const d = DRAWERS.find(x => x.id === btn.dataset.d), n = d.subs.length, m = mobile();
  fl.innerHTML = d.subs.map(s => { const ok = CFO.pode('abrir', s.m); return `<button class="fi" role="menuitem"${ok ? '' : ' disabled aria-disabled="true" title="Sem acesso"'}>${svg(ok ? 'doc' : 'lock')}${s.name}</button>`; }).join('');
  fan.classList.remove('open');
  const r = btn.getBoundingClientRect(), h = fan.offsetHeight, w = fan.offsetWidth;
  let x, y;
  if (m) { x = Math.min(Math.max(r.left + r.width / 2 - w / 2, 12), innerWidth - w - 12); y = Math.max(r.top - h - 12, 64); }
  else { x = r.right + 14; y = Math.min(Math.max(r.top + r.height / 2 - h / 2, 70), innerHeight - h - 12); }
  fan.style.left = x + 'px'; fan.style.top = y + 'px';
  fl.querySelectorAll('.fi').forEach((f, i) => { f.style.setProperty('--d', ((m ? n - 1 - i : i) * 45) + 'ms'); if (!f.disabled) f.onclick = () => { fechar(); ir(d, d.subs[i]); }; });
  btn.setAttribute('aria-expanded', 'true'); aberto = d.id;
  requestAnimationFrame(() => fan.classList.add('open'));
}
document.querySelectorAll('.nav[data-d]').forEach(b => b.onclick = e => { e.stopPropagation(); aberto === b.dataset.d ? fechar() : (fechar(), abrirLeque(b)); });
document.querySelectorAll('.nav[data-home]').forEach(b => b.onclick = voltarInicio);
document.addEventListener('pointerdown', e => {
  if (aberto && !e.target.closest('.fan, .nav[data-d]')) fechar();
  if (barra.classList.contains('more') && !e.target.closest('.topbtns, #more')) barra.classList.remove('more');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
addEventListener('resize', fechar);

// Alturas da barra superior/inferior (as telas das funções encaixam entre elas)
const medidas = () => { const s = document.documentElement.style; s.setProperty('--bar-h', barra.offsetHeight + 'px'); s.setProperty('--tab-h', (mobile() ? tabbar.offsetHeight : 0) + 'px'); };
new ResizeObserver(medidas).observe(barra); new ResizeObserver(medidas).observe(tabbar); medidas();

// Tema claro/escuro (a escolha fica salva no aparelho)
const raiz = document.documentElement;
try { const t = localStorage.getItem('cfo_tema'); if (t) raiz.dataset.theme = t; } catch {}
$('#theme').onclick = () => {
  const escuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  raiz.dataset.theme = escuro ? 'light' : 'dark';
  try { localStorage.setItem('cfo_tema', raiz.dataset.theme); } catch {}
};
atualizar();

// Botão "Importar planilhas" (topo): escolhe de onde vêm as planilhas e distribui cada uma para a função certa
const input = (extra = {}) => {
  const e = document.createElement('input');
  e.type = 'file'; e.multiple = true; e.hidden = true; Object.entries(extra).forEach(([k, v]) => e.setAttribute(k, v));
  e.onchange = async () => { const f = [...e.files]; e.value = ''; await CFO.importFiles(f); };
  document.body.append(e); return e;
};
const pickPasta = input({ webkitdirectory: '' });
// No celular/tablet, o seletor de arquivos do sistema lista também o Google Drive
const pickArquivos = input({ accept: '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv' });

document.getElementById('imp').onclick = () => {
  const d = document.createElement('dialog'); d.className = 'imp';
  d.innerHTML = `<form method="dialog"><h3>Importar planilhas</h3>
    <button type="button" data-a="pasta">📁 Pasta do dispositivo</button>
    <button type="button" data-a="supa">☁️ Supabase (planilhas do bucket)</button>
    <button type="button" data-a="arq">📄 Arquivos (dispositivo ou Google Drive)</button>
    <p class="log">No celular, ao escolher "Arquivos", o menu do Android/iPhone mostra o Google Drive junto com as pastas do aparelho.</p>
    <button value="cancel" class="ghost" formnovalidate>Cancelar</button></form>`;
  d.onclose = () => d.remove();
  d.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a; d.close();
    if (a === 'pasta') pickPasta.click();
    else if (a === 'supa') CFO.importSupabase();
    else pickArquivos.click();
  });
  document.body.append(d); d.showModal();
};

// Botão "Sincronizar WL" (menu dos três pontinhos, junto de Importar planilhas e Nuvem)
document.getElementById('wlbtn').onclick = () => ir({ id: '', name: 'Opções' }, { name: 'Sincronizar WL', m: 'wl' });
