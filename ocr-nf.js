/* ===== OCR: ler a lista de produtos/códigos da tela do sistema de NF e preencher o "Código NF" da Planilha EPI =====
   Como funciona (tudo no navegador, nada é enviado para fora além de baixar o leitor de texto):
   1) "Compartilhar tela": escolhe a janela do sistema de NF; "Capturar" tira uma foto da tela (role a lista e capture de novo quantas vezes precisar).
      Também aceita Ctrl+V (print colado) ou escolher imagens.
   2) O OCR (Tesseract.js, em português) lê o texto; cada linha "CÓDIGO  DESCRIÇÃO" (ou "DESCRIÇÃO  CÓDIGO") vira um item da lista.
   3) Cada item é ligado a uma linha da Planilha EPI pelo nome. NADA é gravado antes de você conferir e apertar "Aplicar".
   Leitor: tesseract.js 5.1.1 (jsdelivr), baixado só na primeira vez que abre a janela. */
(() => {
  const esc = CFO.esc, norm = CFO.norm;
  let tess = null, worker = null, prog = () => {};

  const carregar = () => tess || (tess = new Promise((ok, no) => {
    if (window.Tesseract) return ok(window.Tesseract);
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = () => ok(window.Tesseract); s.onerror = () => { tess = null; no(new Error('Não consegui baixar o leitor de texto (OCR). Confira a internet e tente de novo.')); };
    document.head.append(s);
  }));
  const leitor = async () => {
    if (worker) return worker;
    const T = await carregar();
    worker = await T.createWorker('por', 1, { logger: m => prog(m) });
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });   // 6 = bloco de linhas (tabela/lista)
    return worker;
  };
  // Prepara a imagem: cinza + contraste + aumenta (texto de tela é pequeno e o OCR lê melhor maior)
  const preparar = (fonte, w, h) => {
    const k = Math.min(3, Math.max(1, 2400 / w)), c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.35)'; x.imageSmoothingQuality = 'high'; x.drawImage(fonte, 0, 0, c.width, c.height);
    return c;
  };

  // Texto do OCR -> [{ cod, desc }]. Aceita "código descrição ..." (mais comum) ou "descrição ... código".
  const COLUNA_FIM = /^(UN|UND|UNID|PC|PCS|PÇ|PAR|PARES|CX|KG|LT|MT|[\d.,]+|R\$)$/i;
  function lerLinhas(texto) {
    const out = [];
    String(texto || '').split('\n').forEach(l0 => {
      const l = l0.replace(/[|¦_]/g, ' ').replace(/\s+/g, ' ').trim(); if (l.length < 5) return;
      let cod = '', desc = '', m = l.match(/^([0-9OoIl]{2,12})\s+(.{3,})$/);
      if (m && /\d/.test(m[1])) { cod = m[1]; desc = m[2]; }
      else { m = l.match(/^(.{3,}?)\s+([0-9OoIl]{3,12})$/); if (m && /\d{2}/.test(m[2])) { desc = m[1]; cod = m[2]; } }
      if (!cod) return;
      cod = cod.replace(/[Oo]/g, '0').replace(/[Il]/g, '1');                 // letras que o OCR confunde com número (só no código)
      const t = desc.split(' '); while (t.length > 1 && COLUNA_FIM.test(t[t.length - 1])) t.pop();   // tira unidade/preço do fim
      desc = t.join(' ').replace(/[^\wÀ-ÿ()\/.,+\-% ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/[A-Za-zÀ-ÿ]{3}/.test(desc)) return;
      out.push({ cod, desc });
    });
    return out;
  };
  CFO.ocrLerLinhas = lerLinhas;      // (para testes)

  CFO.ocrNf = () => new Promise(fim => {
    const rows = () => CFO.store.get('epi', []).filter(r => r && r.item);
    let itens = [], stream = null, ocupado = false, n = 0;
    const d = document.createElement('dialog'); d.className = 'ocr-dlg';
    d.innerHTML = `<h3>Ler códigos da tela (OCR)</h3>
      <p class="log" style="margin:.2rem 0">Abra o sistema de NF na <b>lista de produtos</b> (código e descrição aparecendo). Toque em <b>Compartilhar tela</b>, escolha a janela dele e toque em <b>Capturar</b>. Role a lista e capture de novo quantas vezes precisar. Também dá para colar um print (Ctrl+V) ou escolher imagens.</p>
      <div class="bar" style="padding:0;min-height:0;flex-wrap:wrap"><button type="button" id="oc-sh">Compartilhar tela</button><button type="button" id="oc-cap" disabled>📷 Capturar</button><button type="button" id="oc-fl" class="ghost">Escolher imagens</button><input type="file" id="oc-fi" accept="image/*" multiple hidden></div>
      <video id="oc-v" muted playsinline style="display:none;max-width:100%;max-height:140px;margin-top:.5rem;border:1px solid var(--line);border-radius:8px"></video>
      <p class="log" id="oc-st" style="margin:.5rem 0"></p>
      <div class="tw ocr-tw"><table><thead><tr><th></th><th>Código NF</th><th>Descrição lida</th><th>Item da Planilha EPI</th></tr></thead><tbody id="oc-b"></tbody></table></div>
      <div class="bar" style="padding:0;min-height:0;margin-top:.6rem"><button type="button" id="oc-ok" disabled>Aplicar nos itens marcados</button><button type="button" id="oc-x" class="ghost">Fechar</button></div>`;
    document.body.append(d);
    const $ = s => d.querySelector(s), st = t => { $('#oc-st').textContent = t; };
    const nome = ids => { const r = rows(), x = ids.map(i => r.find(y => y.id === i)).filter(Boolean); return !x.length ? '— não ligado —' : x.length === 1 ? x[0].item : `${CFO.baseEpi(x[0].item)} (${x.length} tamanhos)`; };

    function desenhar() {
      const r = rows(), marc = itens.filter(i => i.ok && i.alvo.length).length;
      $('#oc-b').innerHTML = itens.map((i, k) => {
        const hoje = i.alvo.map(id => (r.find(y => y.id === id) || {}).codigoNf).filter(Boolean).filter(c => c !== i.cod)[0];
        return `<tr><td><input type="checkbox" data-k="${k}" ${i.ok && i.alvo.length ? 'checked' : ''} ${i.alvo.length ? '' : 'disabled'}></td>
          <td><input class="gi" data-c="${k}" value="${esc(i.cod)}" style="min-width:5.5rem"></td><td>${esc(i.desc)}</td>
          <td>${esc(nome(i.alvo))}${i.tipo === 'parecido' ? ' <small>(parecido: conferir)</small>' : ''}${hoje ? ` <small>(hoje: ${esc(hoje)})</small>` : ''} <button type="button" class="ghost" data-t="${k}" style="padding:.1rem .45rem">trocar</button></td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">Nada lido ainda. Capture a tela ou escolha uma imagem.</td></tr>';
      $('#oc-ok').disabled = !marc; $('#oc-ok').textContent = `Aplicar nos itens marcados (${marc})`;
      $('#oc-b').querySelectorAll('[data-k]').forEach(c => c.onchange = () => { itens[c.dataset.k].ok = c.checked; desenhar(); });
      $('#oc-b').querySelectorAll('[data-c]').forEach(c => c.oninput = () => { itens[c.dataset.c].cod = c.value.trim(); });
      $('#oc-b').querySelectorAll('[data-t]').forEach(b => b.onclick = () => {                 // troca a ligação: lista só aparece quando pedir (a planilha pode ser grande)
        const it = itens[b.dataset.t], sel = document.createElement('select'); sel.className = 'gi';
        sel.innerHTML = '<option value="">— não ligar —</option>' + rows().map(y => `<option value="${esc(y.id)}" ${it.alvo.length === 1 && it.alvo[0] === y.id ? 'selected' : ''}>${esc(y.item)}${y.codigo ? ' · ' + esc(y.codigo) : ''}</option>`).join('');
        b.replaceWith(sel); sel.focus();
        sel.onchange = () => { it.alvo = sel.value ? [sel.value] : []; it.tipo = sel.value ? 'exato' : ''; it.ok = !!sel.value; desenhar(); };
      });
    }

    async function ler(fonte, w, h) {
      if (ocupado) return; ocupado = true; n++;
      ['#oc-cap', '#oc-sh', '#oc-fl', '#oc-ok'].forEach(s => { $(s).disabled = true; });
      try {
        st('Preparando o leitor de texto (só demora na primeira vez)…');
        const w1 = await leitor(); prog = m => { if (m.status === 'recognizing text') st(`Lendo a tela… ${Math.round((m.progress || 0) * 100)}%`); };
        const { data } = await w1.recognize(preparar(fonte, w, h));
        const novos = lerLinhas(data.text), r = rows(); let add = 0;
        novos.forEach(x => {
          if (itens.some(i => i.cod === x.cod && norm(i.desc) === norm(x.desc))) return;
          const m = CFO.linhasPorNome(r, x.desc);
          itens.push({ cod: x.cod, desc: x.desc, alvo: m.rows.map(y => y.id), tipo: m.tipo, ok: m.tipo === 'exato' || m.tipo === 'base' }); add++;
        });
        st(novos.length ? `Captura ${n}: ${novos.length} linha(s) com código lida(s), ${add} nova(s). Confira os códigos (o OCR pode errar números) antes de aplicar.` : `Captura ${n}: não achei linhas com código. Deixe a lista maior/mais nítida na tela e tente de novo.`);
      } catch (e) { st('Erro: ' + (e.message || e)); }
      ocupado = false; $('#oc-sh').disabled = false; $('#oc-fl').disabled = false; $('#oc-cap').disabled = !stream; desenhar();
    }
    const doBlob = f => new Promise(ok => { const im = new Image(); im.onload = async () => { await ler(im, im.naturalWidth, im.naturalHeight); ok(); }; im.onerror = () => { st('Não consegui abrir essa imagem.'); ok(); }; im.src = URL.createObjectURL(f); });

    const parar = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('#oc-v').style.display = 'none'; $('#oc-cap').disabled = true; $('#oc-sh').textContent = 'Compartilhar tela'; };
    $('#oc-sh').onclick = async () => {
      if (stream) return parar();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return st('Este navegador/aparelho não deixa compartilhar a tela. Tire um print e use "Escolher imagens" ou Ctrl+V.');
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const v = $('#oc-v'); v.srcObject = stream; await v.play(); v.style.display = 'block';
        stream.getVideoTracks()[0].addEventListener('ended', parar);
        $('#oc-cap').disabled = false; $('#oc-sh').textContent = 'Parar de compartilhar'; st('Tela compartilhada. Deixe a lista do sistema de NF visível e toque em Capturar.');
      } catch (e) { stream = null; st('Não consegui compartilhar a tela' + (e && e.name === 'NotAllowedError' ? ' (cancelado ou sem permissão).' : '.')); }
    };
    $('#oc-cap').onclick = () => { const v = $('#oc-v'); if (v.videoWidth) ler(v, v.videoWidth, v.videoHeight); };
    $('#oc-fl').onclick = () => $('#oc-fi').click();
    $('#oc-fi').onchange = async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) await doBlob(f); };
    d.addEventListener('paste', e => { const f = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/')); if (f) { e.preventDefault(); doBlob(f.getAsFile()); } });
    $('#oc-ok').onclick = () => {
      const todas = CFO.store.get('epi', []), sel = itens.filter(i => i.ok && i.alvo.length && String(i.cod).trim());
      let linhas = 0; sel.forEach(i => i.alvo.forEach(id => { const r = todas.find(y => y.id === id); if (r && String(r.codigoNf ?? '').trim() !== String(i.cod).trim()) { r.codigoNf = String(i.cod).trim(); linhas++; } }));
      if (!linhas) return st('Nenhuma linha mudaria (os códigos já estão iguais).');
      if (!confirm(`Gravar o Código NF em ${linhas} linha(s) da Planilha EPI?`)) return;
      CFO.store.set('epi', todas); alert(`${linhas} linha(s) atualizada(s).`); fecha();
    };
    const fecha = () => { parar(); if (worker) { worker.terminate(); worker = null; } d.close(); d.remove(); fim(); };
    $('#oc-x').onclick = () => { if (itens.some(i => i.ok && i.alvo.length) && !confirm('Fechar sem aplicar? O que foi lido será perdido.')) return; fecha(); };
    d.addEventListener('cancel', e => { e.preventDefault(); $('#oc-x').click(); });
    desenhar(); d.showModal();
  });
})();
