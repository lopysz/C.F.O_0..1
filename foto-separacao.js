/* ===== Ferramentas > Foto de Separação ===== */

// Foto de Separação: histórico de fotos das requisições separadas (data/hora do aparelho)
CFO.modules.fotos = body => {
  let list = [], q = '', day = '';
  const fmt = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
  const shrink = CFO.shrink;

  body.innerHTML = `
    <div class="bar">
      <button id="shot">📷 Tirar foto</button>
      <input id="q" type="search" placeholder="Buscar requisição, solicitante ou observação...">
      <input id="day" type="date" title="Filtrar por dia" style="width:auto">
      <button id="clr" class="ghost danger">Limpar tudo</button>
      <input id="cam" type="file" accept="image/*" capture="environment" hidden>
    </div>
    <p class="log" id="count"></p><div id="lst"></div>`;
  const $ = s => body.querySelector(s);

  async function load() { list = (await CFO.db.all('fotos')).sort((a, b) => b.ts.localeCompare(a.ts)); render(); }

  function render() {
    const v = list.filter(f => (!day || f.dia === day) && CFO.norm(`${f.req} ${f.sol || ''} ${f.obs} ${fmt(f.ts)}`).includes(CFO.norm(q)));
    $('#count').textContent = `${v.length} foto(s)` + (v.length !== list.length ? ` de ${list.length}` : '');
    $('#lst').innerHTML = v.map(f => `
      <div class="foto${f.ret ? ' ret' : ''}" data-id="${f.id}">
        <label class="fchk" title="Marcar como retirado"><input type="checkbox" class="rt" ${f.ret ? 'checked' : ''}></label>
        <span class="fimg"><img src="${f.th}" alt="Foto de separação"></span>
        <div class="ftxt"><b>${fmt(f.ts)}</b><br>${f.req ? 'Requisição: ' + CFO.esc(f.req) + (f.sol ? ' · ' + CFO.esc(f.sol) : '') : '<small>Sem nº de requisição</small>'}${f.obs ? `<br><small>${CFO.esc(f.obs)}</small>` : ''}</div>
        ${f.ret ? `<span class="fok">✔ RETIRADO${f.retTs ? `<small>${fmt(f.retTs)}</small>` : ''}</span>` : ''}</div>`).join('')
      || '<p class="empty">Nenhuma foto. Toque em "Tirar foto" para registrar uma separação.</p>';
    body.querySelectorAll('.foto .fchk').forEach(l => l.onclick = e => e.stopPropagation());
    body.querySelectorAll('.foto .rt').forEach(c => c.onchange = async () => {
      const id = c.closest('.foto').dataset.id, f = list.find(x => x.id === id); if (!f) return;
      f.ret = c.checked; f.retTs = c.checked ? new Date().toISOString() : '';
      await CFO.db.put('fotos', f); render();
    });
    body.querySelectorAll('.foto').forEach(el => el.onclick = () => view(el.dataset.id));
  }

  function view(id) {
    CFO.open('Foto de separação', async b => {
      const f = list.find(x => x.id === id), full = (await CFO.db.get('imgs', id))?.img || f.th;
      b.innerHTML = `<div class="full"><img src="${full}" alt="Foto de separação">
        <p><b>${fmt(f.ts)}</b><br>${f.req ? 'Requisição: ' + CFO.esc(f.req) + (f.sol ? ' · ' + CFO.esc(f.sol) : '') : ''}${f.obs ? '<br>' + CFO.esc(f.obs) : ''}${f.ret ? '<br><b class="okt">✔ RETIRADO</b>' : ''}</p>
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
    const reqs = CFO.store.get('requisicoes', []).slice().sort((a, b) => String(b.chegou || '').localeCompare(String(a.chegou || '')) || String(b.id).localeCompare(String(a.id), 'pt-BR', { numeric: true }));
    URL.revokeObjectURL(url);
    CFO.dialog('Salvar foto', `<img class="prev" src="${th}" alt=""><p class="log">${fmt(now.toISOString())}</p>
      <label>Nº da requisição<input name="req" required inputmode="numeric" autocomplete="off" list="dl-req"></label>
      <label>Nome do solicitante<input name="sol" required autocomplete="off"></label>
      <label>Observação (opcional)<input name="obs"></label>
      <datalist id="dl-req">${reqs.slice(0, 80).map(r => `<option value="${CFO.esc(r.id)}">${CFO.esc(r.sol)}</option>`).join('')}</datalist>`,
      async d => {
        const id = Date.now() + Math.random().toString(36).slice(2, 6);
        await CFO.db.put('imgs', { id, img });
        await CFO.db.put('fotos', { id, ts: now.toISOString(), dia: now.toLocaleDateString('en-CA'), req: d.req.trim(), sol: d.sol.trim(), obs: d.obs.trim(), th });
        navigator.storage?.persist?.();
        load();
      });
    // Ao digitar o nº da requisição, o nome do solicitante é preenchido sozinho (se a requisição já estiver no sistema)
    const dlg = document.querySelector('dialog[open]');
    if (dlg) {
      const inReq = dlg.querySelector('[name=req]'), inSol = dlg.querySelector('[name=sol]');
      inReq.oninput = () => { const r = reqs.find(x => CFO.norm(x.id) === CFO.norm(inReq.value)); if (r && r.sol) inSol.value = r.sol; };
      inReq.focus();
    }
  };
  $('#q').oninput = e => { q = e.target.value; render(); };
  $('#day').onchange = e => { day = e.target.value; render(); };
  const re = () => { if (body.isConnected) load(); else document.removeEventListener('cfo-sync', re); };
  document.addEventListener('cfo-sync', re);
  $('#clr').onclick = async () => { if (confirm('Apagar TODAS as fotos? Não dá para desfazer.')) { await CFO.db.clear('fotos'); await CFO.db.clear('imgs'); load(); } };
  load();
};
