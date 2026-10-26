/* ===== Ferramentas > Sincronizar WL =====
   Copia para o C.F.O as requisições que chegam no WL (somente leitura). Roda sozinho enquanto o sistema está aberto
   e também pelo botão "Atualizar agora". Cada requisição é gravada pelo número (RQ-0000): se já existe, é atualizada. */
(() => {
  const C = window.CFO_WL, esc = CFO.esc, norm = CFO.norm;
  const PAG = 1000;
  let rodando = false;

  const pick = (o, ks) => { for (const k of ks) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
  const num = v => v === undefined ? 0 : CFO.toNum(String(v));
  const parseContrato = s => { s = String(s || '').trim(); const m = s.match(/^(\d+)\s*[-–]?\s*(.*)$/); return m ? { num: m[1], nome: m[2].trim() } : { num: s, nome: '' }; };
  const hdr = { apikey: C.key, Authorization: 'Bearer ' + C.key };

  // Lê uma tabela inteira do WL, de 1000 em 1000 (limite do Supabase por pedido)
  async function ler(tabela, extra = '') {
    const tudo = [];
    for (let off = 0; ; off += PAG) {
      const r = await fetch(`${C.url}/rest/v1/${tabela}?select=*${extra}&limit=${PAG}&offset=${off}`, { headers: hdr });
      if (!r.ok) throw new Error(`WL respondeu ${r.status} ao ler "${tabela}"`);
      const l = await r.json(); tudo.push(...l);
      if (l.length < PAG) break;
    }
    return tudo;
  }

  const ISO = d => d.toISOString().slice(0, 10);

  async function sincronizar({ completa = false } = {}) {
    if (rodando) return { erro: 'Já está sincronizando.' };
    rodando = true;
    const t0 = Date.now(), res = { ok: false, add: 0, upd: 0, status: {}, iguais: 0, ignoradas: 0, canc: 0, naoEpi: 0, tipos: {}, semNome: 0, semPreco: 0, lista: [], amostraItem: null, amostraCat: null };
    try {
      const desde = completa ? '' : '&date=gte.' + ISO(new Date(Date.now() - C.diasAuto * 864e5));
      const [reqs, cat] = await Promise.all([ler(C.tabela, desde + '&order=created_at.desc,id.asc'), ler(C.catalogo).catch(() => [])]);

      // Catálogo: código do EPI -> { nome, preco }
      const porCod = new Map();
      cat.forEach(c => { const cod = pick(c, ['code', 'epi_code', 'codigo', 'sku']); if (cod !== undefined) porCod.set(String(cod).trim(), { nome: pick(c, ['name', 'description', 'nome', 'item', 'epi_name', 'title']), preco: pick(c, ['unit_price', 'price', 'unit_value', 'value', 'preco', 'cost', 'valor']) }); });
      res.amostraCat = cat[0] ? Object.keys(cat[0]).join(', ') : '(catálogo vazio ou sem acesso)';

      const mapa = new Map(CFO.store.get('requisicoes', []).map(r => [r.id, r]));
      reqs.forEach(w => {
        const id = String(w.number || '').trim();
        const guarda = (rid, motivo) => { if (res.lista.length < 10) res.lista.push({ id: rid, motivo, data: w.created_at || w.date || '' }); };   // 10 mais recentes (a leitura vem do mais novo para o mais antigo)
        if (!id) { res.ignoradas++; guarda('(sem número)', 'Sem número RQ no WL'); return; }
        // Qualquer tipo (EPI, UNIFORM...) conta como EPI: só as canceladas são ignoradas
        const canc = w.cancellation_reason || /cancel/i.test(w.status || '');
        if (canc) { guarda(id, 'Cancelada' + (w.cancellation_reason ? ': ' + w.cancellation_reason : (w.status ? ' (status: ' + w.status + ')' : ''))); res.ignoradas++; res.canc++; return; }
        const st = String(w.status || '-').trim(); res.status[st] = (res.status[st] || 0) + 1;
        const c = parseContrato(w.contract_name || w.cost_center);
        const mes = w.month && w.year ? `${w.month} ${w.year}` : String(w.date || '');
        const itens = (Array.isArray(w.items) ? w.items : []).map(it => {
          if (!res.amostraItem) res.amostraItem = Object.keys(it).join(', ');
          const cg = porCod.get(String(it.epi_code ?? '').trim()) || {};
          const nome = String(pick(it, ['name', 'item_name', 'description', 'epi_name', 'nome', 'item', 'title']) ?? cg.nome ?? it.epi_code ?? '').trim();
          const preco = num(pick(it, ['unit_price', 'price', 'unit_value', 'value', 'preco', 'cost'])) || num(cg.preco);
          const q = num(pick(it, ['quantity', 'qty'])), qa = pick(it, ['approved_quantity', 'quantity_approved', 'approved_qty']), qs = pick(it, ['requested_quantity', 'quantity_requested', 'requested_qty']);
          const tam = String(it.size ?? '').trim(), ntam = norm(tam);
          if (!nome || nome === String(it.epi_code ?? '').trim()) res.semNome++;
          if (!preco) res.semPreco++;
          const jaTem = new RegExp('\\(' + tam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)\\s*$', 'i').test(nome);
          return { item: nome + (tam && ntam !== 'na' && !jaTem ? ` (${tam})` : ''), tam: tam || 'N/A', qs: qs === undefined ? q : num(qs), qa: qa === undefined ? q : num(qa), preco };
        });
        const novo = { id, sol: String(w.requester || '').trim(), motivo: String(w.motive || '').trim(), contrato: c.num, contratoNome: c.nome, mes, itens, origem: 'WL' };
        const antigo = mapa.get(id);
        if (antigo?.chegou) novo.chegou = antigo.chegou;     // 'chegou' = quando entrou no sistema (Painel do Início)
        if (!antigo) res.add++; else if (JSON.stringify(antigo) !== JSON.stringify(novo)) res.upd++; else { res.iguais++; return; }
        if (!antigo) novo.chegou = new Date().toISOString();
        mapa.set(id, novo);
      });
      if (res.add || res.upd) CFO.store.set('requisicoes', [...mapa.values()]);   // só grava (e só envia à nuvem) se mudou algo
      res.ok = true; res.total = reqs.length;
    } catch (e) {
      res.erro = (e && e.message) || String(e);
      if (/fetch|network|cors/i.test(res.erro)) res.erro += ' (confira a internet; se persistir, o WL pode ter bloqueado a leitura)';
    } finally { rodando = false; }
    res.quando = new Date().toISOString(); res.seg = Math.round((Date.now() - t0) / 100) / 10; res.completa = completa;
    try { localStorage.setItem('cfo_wl_ultimo', JSON.stringify(res)); } catch {}
    document.dispatchEvent(new CustomEvent('cfo-wl', { detail: res }));
    return res;
  }
  CFO.wl = { sincronizar };

  CFO.modules.wl = body => {
    body.innerHTML = `<details class="sobre"><summary>ℹ️ Para que serve esta tela</summary><p>Copia para o C.F.O as requisições que chegam no <b>WL</b>, só leitura (nada é gravado no WL). Enquanto o sistema estiver aberto, atualiza sozinho a cada ${C.minutosAuto} minutos (últimos ${C.diasAuto} dias). Use <b>Sincronização completa</b> para trazer tudo desde o começo. Se uma requisição já existe aqui, ela é atualizada pelo número RQ, sem duplicar.</p></details>
      <div class="bar"><button id="ag">Atualizar agora</button><button id="cp" class="ghost">Sincronização completa</button>
        <label class="chk"><input type="checkbox" id="au"> Atualizar sozinho</label></div>
      <div id="st"></div>`;
    const $ = s => body.querySelector(s), fmt = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
    $('#au').checked = CFO.store.get('wl:auto', true);
    $('#au').onchange = e => CFO.store.set('wl:auto', e.target.checked);
    function mostrar() {
      const r = (() => { try { return JSON.parse(localStorage.getItem('cfo_wl_ultimo')); } catch { return null; } })();
      $('#st').innerHTML = !r ? '<p class="empty">Ainda não sincronizou. Toque em "Atualizar agora".</p>' : r.erro
        ? `<p class="log down">Última tentativa (${fmt(r.quando)}): ${esc(r.erro)}</p>`
        : `<div class="cards kpis"><div class="card"><small>Última sincronização</small><b>${fmt(r.quando)}</b><small>${r.completa ? 'completa' : 'últimos ' + C.diasAuto + ' dias'} · ${r.seg}s</small></div>
           <div class="card"><small>Novas</small><b>${r.add}</b></div><div class="card"><small>Atualizadas</small><b>${r.upd}</b><small>${r.iguais || 0} sem mudança</small></div><div class="card"><small>Ignoradas</small><b>${r.ignoradas}</b><small>${r.canc || 0} canceladas · ${r.naoEpi || 0} de outro tipo${r.tipos && Object.keys(r.tipos).length ? ' (' + esc(Object.entries(r.tipos).map(([k, v]) => k + ': ' + v).join(', ')) + ')' : ''}</small></div></div>`
        + (r.status && Object.keys(r.status).length ? `<p class="log">Status das requisições lidas: ${esc(Object.entries(r.status).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ': ' + v).join(' · '))}</p>` : '')
        + (r.lista && r.lista.length ? `<h4>Últimas ${r.lista.length} ignoradas</h4><div class="log">${r.lista.map(x => `<p><b>${esc(x.id)}</b>${x.data ? ' · ' + esc(String(x.data).slice(0, 10).split('-').reverse().join('/')) : ''}<br>${esc(x.motivo)}</p>`).join('')}</div>` : '')
        + (r.semNome || r.semPreco ? `<p class="log down">Atenção: ${r.semNome} item(ns) sem nome e ${r.semPreco} sem preço. Campos dos itens no WL: ${esc(r.amostraItem || '-')} · Campos do catálogo: ${esc(r.amostraCat || '-')}. Me mande esses nomes para eu ajustar.</p>` : '');
    }
    const rodar = async completa => { $('#ag').disabled = $('#cp').disabled = true; $('#st').innerHTML = '<p class="log">Sincronizando com o WL...</p>'; await sincronizar({ completa }); $('#ag').disabled = $('#cp').disabled = false; mostrar(); };
    $('#ag').onclick = () => rodar(false);
    $('#cp').onclick = () => { if (confirm('Trazer TODAS as requisições do WL? Pode demorar um pouco.')) rodar(true); };
    const re = () => { if (body.isConnected) mostrar(); else document.removeEventListener('cfo-wl', re); };
    document.addEventListener('cfo-wl', re);
    mostrar();
  };

  // Automático: ao abrir o sistema e a cada N minutos enquanto ele estiver aberto
  const auto = () => { if (CFO.store.get('wl:auto', true)) sincronizar(); };
  setTimeout(auto, 5000);
  setInterval(auto, C.minutosAuto * 60000);
})();
