/* ===== Gavetas e tela inicial =====
   Para criar uma subgaveta nova: registre o módulo em js/modules/ e adicione { name, m } em subs. */
const DRAWERS = [
  { name: 'Almoxarifado Operacional', short: 'Almox. Op.',
    subs: [{ name: 'Planilha EPI', m: 'epi' }, { name: 'Contratos', m: 'contratos' }, { name: 'Requisição', m: 'requisicoes' }] },
  { name: 'Jurídico Operacional', short: 'Jurídico Op.', subs: [{ name: 'EPIs por contrato', m: 'epis_contrato' }, { name: 'Gastos em EPIs', m: 'controle_gastos' }, { name: 'Controle mensal', m: 'controle_mensal' }] },
  { name: 'Ferramentas', short: 'Ferramentas', subs: [{ name: 'Foto de Separação', m: 'fotos' }, { name: 'Gerador de Identificação', m: 'etiquetas' }, { name: 'Contagem de estoque', m: 'contagem' }] }
];

// Abre a função escolhida (tela cheia)
function abrir(s) {
  CFO.open(s.name, CFO.modules[s.m] || (b => { b.innerHTML = `<p class="empty">Esta função ainda não foi carregada. Confira se o arquivo dela está na mesma pasta do index.html e se o index.html está atualizado (depois, atualize a página com Ctrl+F5).</p>`; }));
}

// Início: quadrados na lateral; ao tocar em um, abre um "leque" com as funções ao lado dele
const home = document.getElementById('home');
home.classList.add('fanhome');
let aberto = null;
function fechar() { if (aberto) { aberto.classList.remove('open'); aberto.querySelector('.drawer').setAttribute('aria-expanded', 'false'); aberto = null; } }
function posicionar(fan) {            // mantém o leque inteiro dentro da tela
  fan.style.setProperty('--dy', '0px');
  const topo = 70, fim = innerHeight - 12;
  fan.style.maxHeight = (fim - topo) + 'px';
  const r = fan.getBoundingClientRect();
  let dy = 0;
  if (r.bottom > fim) dy = fim - r.bottom;
  if (r.top + dy < topo) dy = topo - r.top;
  fan.style.setProperty('--dy', dy + 'px');
}
DRAWERS.forEach(d => {
  const w = document.createElement('div'); w.className = 'dw';
  const b = document.createElement('button');
  b.className = 'drawer'; b.textContent = d.name; b.setAttribute('aria-expanded', 'false');
  const fan = document.createElement('div'); fan.className = 'fan'; fan.setAttribute('role', 'menu');
  const fl = document.createElement('div'); fl.className = 'fl'; fan.append(fl);
  const con = document.createElement('i'); con.className = 'con';
  d.subs.forEach((s, i) => {
    const f = document.createElement('button');
    f.className = 'fi'; f.textContent = s.name; f.setAttribute('role', 'menuitem'); f.style.setProperty('--i', i);
    f.onclick = () => { fechar(); abrir(s); };
    fl.append(f);
  });
  b.onclick = e => {
    e.stopPropagation();
    const mesmo = aberto === w; fechar();
    if (mesmo) return;
    w.classList.add('open'); b.setAttribute('aria-expanded', 'true'); aberto = w; posicionar(fan);
  };
  w.append(b, con, fan); home.append(w);
});
// Tocar em qualquer lugar fora de um botão fecha o leque
document.addEventListener('pointerdown', e => { if (aberto && !e.target.closest('.drawer, .fan')) fechar(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
addEventListener('resize', () => { if (aberto) posicionar(aberto.querySelector('.fan')); });

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
