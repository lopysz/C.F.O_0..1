/* ===== Ferramentas > Foto de Separação ===== */

// Foto de Separação: histórico de fotos das requisições separadas (data/hora do aparelho)
CFO.modules.fotos = body => {
  let list = [], q = '', day = '';
  const fmt = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  const shrink = CFO.shrink;

  body.innerHTML = `
    <div class="bar">
      <button id="shot">📷 Tirar foto</button>
      <input id="q" type="search" placeholder="Buscar requisição ou observação...">
      <input id="day" type="date" title="Filtrar por dia" style="width:auto">
      <button id="clr" class="ghost danger">Limpar tudo</button>
      <input id="cam" type="file" accept="image/*" capture="environment" hidden>
    </div>
    <p class="log" id="count"></p><div id="lst"></div>`;
  const $ = s => body.querySelector(s);

  async function load() { list = (await CFO.db.all('fotos')).sort((a, b) => b.ts.localeCompare(a.ts)); render(); }

  function render() {
    const v = list.filter(f => (!day || f.dia === day) && CFO.norm(`${f.req} ${f.obs} ${fmt(f.ts)}`).includes(CFO.norm(q)));
    $('#count').textContent = `${v.length} foto(s)` + (v.length !== list.length ? ` de ${list.length}` : '');
    $('#lst').innerHTML = v.map(f => `
      <div class="foto" data-id="${f.id}"><img src="${f.th}" alt="Foto de separação">
        <div><b>${fmt(f.ts)}</b><br>${f.req ? 'Requisição: ' + CFO.esc(f.req) : '<small>Sem nº de requisição</small>'}${f.obs ? `<br><small>${CFO.esc(f.obs)}</small>` : ''}</div></div>`).join('')
      || '<p class="empty">Nenhuma foto. Toque em "Tirar foto" para registrar uma separação.</p>';
    body.querySelectorAll('.foto').forEach(el => el.onclick = () => view(el.dataset.id));
  }

  function view(id) {
    CFO.open('Foto de separação', async b => {
      const f = list.find(x => x.id === id), full = (await CFO.db.get('imgs', id))?.img || f.th;
      b.innerHTML = `<div class="full"><img src="${full}" alt="Foto de separação">
        <p><b>${fmt(f.ts)}</b><br>${f.req ? 'Requisição: ' + CFO.esc(f.req) : ''}${f.obs ? '<br>' + CFO.esc(f.obs) : ''}</p>
        <div class="bar"><a id="dl" class="btn" download="separacao-${f.dia}-${f.ts.slice(11, 19).replace(/:/g, '')}.jpg" href="${full}">Baixar</a>
        <button id="del" class="ghost danger">Excluir</button></div></div>`;
      b.querySelector('#del').onclick = async () => {
        if (!confirm('Excluir esta foto?')) return;
        await CFO.db.del('fotos', id); await CFO.db.del('imgs', id); CFO.close(); load();
      };
    });
  }

  $('#shot').onclick = () => $('#cam').click();
  $('#cam').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const url = URL.createObjectURL(file), now = new Date();
    const img = await shrink(url, 1280, .7), th = await shrink(url, 240, .7);
    URL.revokeObjectURL(url);
    CFO.dialog('Salvar foto', `<img class="prev" src="${th}" alt=""><p class="log">${fmt(now.toISOString())}</p>
      <label>Nº da requisição (opcional)<input name="req"></label><label>Observação (opcional)<input name="obs"></label>`,
      async d => {
        const id = Date.now() + Math.random().toString(36).slice(2, 6);
        await CFO.db.put('imgs', { id, img });
        await CFO.db.put('fotos', { id, ts: now.toISOString(), dia: now.toLocaleDateString('en-CA'), req: d.req.trim(), obs: d.obs.trim(), th });
        navigator.storage?.persist?.();
        load();
      });
  };
  $('#q').oninput = e => { q = e.target.value; render(); };
  $('#day').onchange = e => { day = e.target.value; render(); };
  const re = () => { if (body.isConnected) load(); else document.removeEventListener('cfo-sync', re); };
  document.addEventListener('cfo-sync', re);
  $('#clr').onclick = async () => { if (confirm('Apagar TODAS as fotos? Não dá para desfazer.')) { await CFO.db.clear('fotos'); await CFO.db.clear('imgs'); load(); } };
  load();
};
