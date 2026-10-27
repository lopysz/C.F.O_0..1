/* ===== Ferramentas > Gerador de Identificação (fichas de prateleira, A4) ===== */
(() => {
  const esc = CFO.esc, num = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });

  // Modelo da ficha - segue o PDF de referência (só as informações mudam)
  const fichaHTML = f => `
    <div class="fp">
      <h1>FICHA DE PRODUTO</h1>
      <div class="fp-row fp-top">
        <div class="fp-box fp-photo"><div class="fp-img">${f.foto ? `<img src="${f.foto}" alt="">` : ''}</div><div class="fp-ca">C.A. ${esc(f.ca)}</div></div>
        <div class="fp-box"><h2>DENOMINAÇÕES</h2><ol>${f.den.map(d => `<li>${esc(d)}</li>`).join('')}</ol></div>
      </div>
      <div class="fp-row fp-bottom">
        <div class="fp-box"><h2>UTILIDADE</h2><ul>${f.util.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div>
        <div class="fp-box"><h2>UTILIZADOS NOS CONTRATOS</h2><div class="fp-chips">${[...f.contratos].sort(num).map(c => `<span>${esc(c)}</span>`).join('')}</div></div>
      </div>
      <div class="fp-rev">Data de revisão __ /__ /__</div>
    </div>`;

  // Nomes sugeridos ao escrever o EPI: Planilha EPI + itens das requisições
  const nomesEpi = () => [...new Set([...CFO.store.get('epi', []).map(e => e.item), ...CFO.store.get('requisicoes', []).flatMap(r => r.itens.map(i => i.item))].filter(Boolean).map(CFO.baseEpi))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  CFO.modules.etiquetas = body => {
    let list = [];
    body.innerHTML = `<div class="bar"><button id="new">+ Nova ficha</button><input id="q" type="search" placeholder="Buscar por C.A. ou nome..."></div><div id="lst"></div>`;
    const $ = s => body.querySelector(s);

    /* --- Lista --- */
    async function load() { list = (await CFO.db.all('fichas')).sort((a, b) => (a.den[0] || '').localeCompare(b.den[0] || '', 'pt-BR')); render(); }
    function render() {
      const t = CFO.norm($('#q').value), v = list.filter(f => CFO.norm(f.ca + ' ' + f.den.join(' ')).includes(t));
      $('#lst').innerHTML = v.map(f => `<div class="foto" data-id="${f.id}"><img src="${f.foto}" alt="" ${f.foto ? '' : 'hidden'}>
        <div><b>${esc(f.den[0] || 'Sem nome')}</b><br>C.A. ${esc(f.ca)}<br><small>${f.contratos.length} contrato(s)</small></div></div>`).join('')
        || '<p class="empty">Nenhuma ficha. Toque em "Nova ficha" para criar a primeira.</p>';
      body.querySelectorAll('.foto').forEach(el => el.onclick = () => preview(list.find(f => f.id === el.dataset.id)));
    }
    $('#q').oninput = render;
    $('#new').onclick = () => editor(null);

    /* --- Visualização / impressão --- */
    function preview(f) {
      CFO.open('Ficha de produto', b => {
        b.innerHTML = `<div class="bar"><button id="print">🖨 Imprimir / PDF</button><button id="print2" class="ghost">🖨 2 por folha</button><button id="edit" class="ghost">Editar</button>
          <button id="dup" class="ghost">Duplicar</button><button id="del" class="ghost danger">Excluir</button></div>
          <div class="pv">${fichaHTML(f)}</div>`;
        const pv = b.querySelector('.pv'), fp = pv.querySelector('.fp');
        new ResizeObserver(() => { const k = Math.min(1.15, pv.clientWidth / 794); fp.style.transform = `scale(${k})`; pv.style.height = fp.offsetHeight * k + 'px'; }).observe(pv);
        b.querySelector('#print').onclick = () => CFO.print(fichaHTML(f));
        // 2 fichas iguais na mesma folha A4 (uma em cima da outra, com linha pontilhada para cortar). Montado aqui, sem depender de "páginas por folha" do navegador
        b.querySelector('#print2').onclick = () => {
          const h = fp.offsetHeight, k = Math.min(1, 528 / h, 0.95);
          const cel = `<div style="width:${Math.round(794 * k)}px;height:${Math.round(h * k)}px;overflow:hidden"><div style="width:794px;transform:scale(${k});transform-origin:top left">${fichaHTML(f)}</div></div>`;
          const L = ext => `<div style="height:540px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;${ext}">${cel}</div>`;
          CFO.print(`<style>@page{size:A4;margin:0}</style><div style="width:100%;height:1080px;overflow:hidden">${L('border-bottom:1px dashed #94a3b8')}${L('')}</div>`);
        };
        b.querySelector('#edit').onclick = () => editor(f);
        b.querySelector('#dup').onclick = async () => { await CFO.db.put('fichas', { ...structuredClone(f), id: Date.now() + Math.random().toString(36).slice(2, 6) }); CFO.close(); load(); };
        b.querySelector('#del').onclick = async () => { if (confirm('Excluir esta ficha?')) { await CFO.db.del('fichas', f.id); CFO.close(); load(); } };
      });
    }

    /* --- Editor --- */
    function editor(f0) {
      CFO.open(f0 ? 'Editar ficha' : 'Nova ficha', b => {
        const f = f0 ? structuredClone(f0) : { id: Date.now() + Math.random().toString(36).slice(2, 6), foto: '', epi: '', ca: '', den: [''], util: ['', '', ''], contratos: [] };
        const sel = new Set(f.contratos), q = s => b.querySelector(s);
        const base = [...new Map(CFO.store.get('contratos', []).filter(r => r.num).map(r => [String(r.num), r])).values()].sort((x, y) => num(x.num, y.num));
        b.innerHTML = `<div class="ed">
          <label>Foto do item</label>
          <div class="photo"><img id="ph" alt="" ${f.foto ? `src="${f.foto}"` : 'hidden'}><button id="pick" class="ghost">Escolher foto</button><input id="pf" type="file" accept="image/*" hidden></div>
          <label>Ou escreva o nome do EPI (todos os tamanhos contam juntos)<input id="epi" list="epiNomes" placeholder="Ex.: Luva de vaqueta" value="${esc(f.epi || '')}"></label>
          <datalist id="epiNomes">${nomesEpi().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
          <label>C.A.<input id="ca" value="${esc(f.ca)}"></label>
          <label>Denominações</label><div id="den"></div><button id="addDen" class="ghost">+ Adicionar denominação</button>
          <label>Utilidades</label><div id="util"></div><button id="addUtil" class="ghost">+ Adicionar utilidade</button>
          <label>Utilizado nos contratos</label>
          <div class="bar"><input id="cq" type="search" placeholder="Buscar contrato..."><button id="all" class="ghost">Marcar por contratos</button><button id="none" class="ghost">Desmarcar</button></div>
          <div id="clist" class="clist"></div>
          <div class="bar"><input id="manual" placeholder="Outro nº (ex.: 1408)"><button id="addC" class="ghost">Adicionar nº</button></div>
          <p id="selc" class="log"></p>
          <div class="bar"><button id="save">Salvar ficha</button></div></div>`;

        const addRow = (box, val, area) => {
          const d = document.createElement('div'); d.className = 'rowin';
          d.innerHTML = `${area ? '<textarea rows="2"></textarea>' : '<input>'}<button class="ghost" type="button" aria-label="Remover">✕</button>`;
          d.firstChild.value = val; d.lastChild.onclick = () => d.remove(); q(box).append(d);
        };
        f.den.forEach(v => addRow('#den', v)); f.util.forEach(v => addRow('#util', v, true));
        q('#addDen').onclick = () => addRow('#den', ''); q('#addUtil').onclick = () => addRow('#util', '', true);

        q('#pick').onclick = () => q('#pf').click();
        q('#pf').onchange = async e => {
          const file = e.target.files[0]; if (!file) return;
          const u = URL.createObjectURL(file); f.foto = await CFO.shrink(u, 700, .85); URL.revokeObjectURL(u);
          q('#ph').src = f.foto; q('#ph').hidden = false;
        };

        function drawC() {
          const t = CFO.norm(q('#cq').value);
          const items = [...base.map(r => ({ n: String(r.num), t: r.nome })), ...[...sel].filter(n => !base.some(r => String(r.num) === n)).map(n => ({ n, t: '(digitado)' }))]
            .filter(i => CFO.norm(i.n + ' ' + i.t).includes(t));
          q('#clist').innerHTML = items.map(i => `<label class="ck"><input type="checkbox" value="${esc(i.n)}" ${sel.has(i.n) ? 'checked' : ''}><b>${esc(i.n)}</b><span>${esc(i.t)}</span></label>`).join('')
            || '<p class="empty">Nenhum contrato cadastrado. Importe a planilha de contratos ou adicione o número abaixo.</p>';
          q('#clist').querySelectorAll('input').forEach(c => c.onchange = () => { c.checked ? sel.add(c.value) : sel.delete(c.value); cnt(); });
          cnt();
        }
        const cnt = () => q('#selc').textContent = `${sel.size} contrato(s) selecionado(s)`;
        const shown = () => [...q('#clist').querySelectorAll('input')].map(c => c.value);
        q('#cq').oninput = drawC;
        // Marca só os contratos que usam o EPI escrito (dados de Jurídico Operacional > EPIs por contrato)
        q('#all').onclick = () => {
          const nome = q('#epi').value.trim();
          if (!nome) { alert('Escreva o nome do EPI no campo acima para marcar os contratos que o usam.'); q('#epi').focus(); return; }
          const achados = CFO.contratosDoEpi(nome);
          if (!achados.length) { alert(`Nenhum contrato usa "${nome}" nas requisições importadas. Confira o nome do EPI.`); return; }
          sel.clear(); achados.forEach(n => sel.add(n)); q('#cq').value = ''; drawC();
          q('#selc').textContent = `${sel.size} contrato(s) usam "${CFO.baseEpi(nome)}" (todos os tamanhos juntos)`;
        };
        q('#none').onclick = () => { shown().forEach(n => sel.delete(n)); drawC(); };
        q('#addC').onclick = () => { const n = q('#manual').value.trim(); if (n) { sel.add(n); q('#manual').value = ''; drawC(); } };
        drawC();

        q('#save').onclick = async () => {
          const vals = box => [...q(box).querySelectorAll('input,textarea')].map(x => x.value.trim()).filter(Boolean);
          const ca = q('#ca').value.trim(), den = vals('#den');
          if (!ca && !den.length) { alert('Informe ao menos o C.A. ou uma denominação.'); return; }
          Object.assign(f, { epi: q('#epi').value.trim(), ca, den, util: vals('#util'), contratos: [...sel] });
          await CFO.db.put('fichas', f);
          CFO.close(); if (f0) CFO.close(); load();
        };
      });
    }
    load();
  };
})();
