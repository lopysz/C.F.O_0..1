/* ===== Gavetas e tela inicial =====
   Para criar uma subgaveta nova: registre o módulo em js/modules/ e adicione { name, m } em subs. */
const DRAWERS = [
  { name: 'Almoxarifado Operacional', short: 'Almox. Op.',
    subs: [{ name: 'Planilha EPI', m: 'epi' }, { name: 'Contratos ativos', m: 'contratos' }] },
  { name: 'Jurídico Operacional', short: 'Jurídico Op.', subs: [] },
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
    CFO.open(s.name, CFO.modules[s.m]);
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

// Botão "Importar pasta" (topo): escolhe uma pasta e distribui as planilhas
const pick = document.createElement('input');
pick.type = 'file'; pick.multiple = true; pick.hidden = true; pick.setAttribute('webkitdirectory', '');
document.body.append(pick);
document.getElementById('impPasta').onclick = () => pick.click();
pick.onchange = async () => { const f = [...pick.files]; pick.value = ''; await CFO.importFiles(f); };
