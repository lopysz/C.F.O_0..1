/* ===== Gavetas e tela inicial =====
   Para criar uma subgaveta nova: registre o módulo em js/modules/ e adicione { name, m } em subs. */
const DRAWERS = [
  { name: 'Almoxarifado Operacional', short: 'Almox. Op.',
    subs: [{ name: 'Planilha EPI', m: 'epi' }, { name: 'Contratos ativos', m: 'contratos' }, { name: 'Requisição', m: 'requisicoes' }] },
  { name: 'Jurídico Operacional', short: 'Jurídico Op.', subs: [{ name: 'EPIs por contrato', m: 'epis_contrato' }, { name: 'Controle de gastos', m: 'controle_gastos' }] },
  { name: 'Ferramentas', short: 'Ferramentas', subs: [{ name: 'Foto de Separação', m: 'fotos' }, { name: 'Gerador de Identificação', m: 'etiquetas' }] }
];

// Quadrado central com círculos (subgavetas) ao redor
function hub(d, body) {
  const n = 6;
  body.classList.add('center');
  body.innerHTML = `<div class="hub"><div class="core">${d.short}</div>${Array.from({ length: n }, (_, i) => {
    const s = d.subs[i], a = (-90 + i * 360 / n) * Math.PI / 180;
    return `<button class="orb ${s ? '' : 'off'}" data-i="${i}" style="left:${50 + 36 * Math.cos(a)}%;top:${50 + 36 * Math.sin(a)}%">${s ? s.name : 'Em breve'}</button>`;
  }).join('')}</div>`;
  body.querySelectorAll('.orb:not(.off)').forEach(b => b.onclick = () => {
    const s = d.subs[b.dataset.i];
    CFO.open(s.name, CFO.modules[s.m] || (b => { b.innerHTML = `<p class="empty">Esta função ainda não foi carregada. Confira se o arquivo dela está na mesma pasta do index.html e se o index.html está atualizado (depois, atualize a página com Ctrl+F5).</p>`; }));
  });
}

// Início
const home = document.getElementById('home');
DRAWERS.forEach(d => {
  const b = document.createElement('button');
  b.className = 'drawer'; b.textContent = d.name;
  b.onclick = () => CFO.open(d.name, body => hub(d, body));
  home.append(b);
});

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
    <button type="button" data-a="arq">📄 Arquivos (dispositivo ou Google Drive)</button>
    <p class="log">No celular, ao escolher "Arquivos", o menu do Android/iPhone mostra o Google Drive junto com as pastas do aparelho. No computador, abra a pasta do Drive sincronizada.</p>
    <button type="button" data-a="drive">☁ Google Drive pela conta (pasta inteira)</button>
    <button type="button" data-a="cfg" class="ghost">⚙ Configurar Google Drive</button>
    <button value="cancel" class="ghost" formnovalidate>Cancelar</button></form>`;
  d.onclose = () => d.remove();
  d.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a; d.close();
    if (a === 'pasta') pickPasta.click();
    else if (a === 'arq') pickArquivos.click();
    else if (a === 'drive') CFO.importDrive(b);
    else CFO.driveConfig();
  });
  document.body.append(d); d.showModal();
};
