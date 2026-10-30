/* ===== Nuvem para "Outros setores" (pasta própria, isolada do almoxarifado de EPIs) =====
   Usa o MESMO bucket/chave do supabase-config.js, mas cada setor só lê e grava dentro da sua própria pasta:
     <bucket>/<pastaEnvio>/setores/<id do setor>/dados/<chave>.json
   Essa pasta é separada de <pastaEnvio>/dados e <pastaEnvio>/db (onde fica o almoxarifado de EPIs) e de
   qualquer outra pasta/setores/<outro id>: um setor nunca lista, lê nem grava fora da própria pasta, então
   não existe conflito de dados com o EPI nem entre setores diferentes.
   Mesma regra do principal: no mesmo conjunto (a mesma chave), vale a alteração mais recente. */
(() => {
  const c = window.CFO_SUPABASE || {};
  const btn = document.getElementById('envS');
  const raiz = (c.pastaEnvio || 'CFO').replace(/^\/+|\/+$/g, '');
  const ativoBase = !!(c.url && c.bucket && c.anonKey);
  const base = ativoBase ? (/^https?:/.test(c.url) ? c.url : `https://${c.url}.supabase.co`).replace(/\/+$/, '') : '';
  const H = ativoBase ? { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey } : {};
  const bk = ativoBase ? encodeURIComponent(c.bucket) : '';

  const espaco = CFO.espaco;                                 // ex.: 's_joao' — só roda para perfil de setor
  const ativo = ativoBase && !!espaco;
  if (!btn) return;
  if (!ativo) { btn.hidden = true; return; }
  const id = espaco.slice(2);                                // tira o 's_'
  const pasta = `${raiz}/setores/${id}/dados`;

  const MK = 'cfo_sync_setor:' + id;                          // meta própria deste setor (não entra no backup do setor: não começa com 'cfs:')
  const meta = (() => { try { return { mod: {}, seen: {}, dirty: {}, synced: false, ...JSON.parse(localStorage.getItem(MK) || '{}') }; } catch { return { mod: {}, seen: {}, dirty: {}, synced: false }; } })();
  const salvaMeta = () => { try { localStorage.setItem(MK, JSON.stringify(meta)); } catch {} };
  const nomeObj = k => `${pasta}/${k.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  const prefLocal = 'cfs:' + espaco + ':';
  const chavesLocais = () => { const r = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(prefLocal)) r.push(k.slice(prefLocal.length)); } return r; };

  let estado = 'off', msg = '';
  const mostra = (e, m = '') => {
    estado = e; msg = m;
    btn.textContent = { off: '☁️ Nuvem', ok: '☁️ ✓', work: '☁️ …', err: '☁️ !' }[e] || '☁️ Nuvem';
    btn.title = m || ({ off: 'Sincronização desligada', ok: 'Sincronizado', work: 'Sincronizando...', err: 'Erro ao sincronizar' }[e]);
  };

  const listar = async () => {
    const r = await fetch(`${base}/storage/v1/object/list/${bk}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ prefix: pasta, limit: 1000, offset: 0 }) });
    if (!r.ok) throw new Error('listar ' + r.status);
    const m = new Map(); (await r.json()).forEach(o => { if (o.id !== null && /\.json$/.test(o.name)) m.set(pasta + '/' + o.name, o.updated_at || o.created_at || ''); });
    return m;
  };
  const baixar = async nome => {
    const enc = nome.split('/').map(encodeURIComponent).join('/');
    let r = await fetch(`${base}/storage/v1/object/authenticated/${bk}/${enc}`, { headers: H, cache: 'no-store' });
    if (!r.ok) r = await fetch(`${base}/storage/v1/object/public/${bk}/${enc}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('baixar ' + r.status);
    return r.json();
  };
  const enviar = k => CFO.supaEnviar(nomeObj(k), new Blob([JSON.stringify({ key: k, updatedAt: meta.mod[k] || Date.now(), value: CFO.store.get(k, null) })], { type: 'application/json' }), 'application/json', true);
  const aplica = (d, nome, upd) => { localStorage.setItem(prefLocal + d.key, JSON.stringify(d.value)); meta.mod[d.key] = d.updatedAt || 0; delete meta.dirty[d.key]; meta.seen[nome] = upd; };

  let t = null;
  const agendar = () => { if (ativo && meta.synced) { clearTimeout(t); t = setTimeout(sync, 2500); } };
  // avisa esta cópia quando algo do setor é salvo (gancho posto no final do arquivo)
  const marcaDirty = k => { meta.mod[k] = Date.now(); meta.dirty[k] = 1; salvaMeta(); agendar(); };

  let rodando = null, pendente = false;
  async function sync({ forcar = false, manual = false, reenviar = false } = {}) {
    if (!ativo) return;
    if (rodando) { pendente = true; return rodando; }
    rodando = (async () => {
      mostra('work');
      try {
        const remoto = await listar(); let mudou = false;
        for (const [nome, upd] of remoto) {
          if (!forcar && meta.seen[nome] === upd) continue;
          const d = await baixar(nome); if (!d || !d.key) continue;
          const localNovo = meta.dirty[d.key] && meta.synced && (meta.mod[d.key] || 0) > (d.updatedAt || 0);
          if (forcar || !localNovo) { aplica(d, nome, upd); mudou = true; }
        }
        const enviados = [];
        for (const k of chavesLocais()) {
          const nome = nomeObj(k);
          if (meta.dirty[k] || reenviar || !remoto.has(nome)) {
            if (!meta.mod[k]) meta.mod[k] = Date.now();
            const antes = meta.mod[k];
            await enviar(k); if (meta.mod[k] === antes) delete meta.dirty[k]; enviados.push(nome);   // mudou durante o envio? continua marcado para o próximo ciclo
          }
        }
        if (enviados.length) { const novo = await listar(); enviados.forEach(n => { if (novo.has(n)) meta.seen[n] = novo.get(n); }); }   // o que este aparelho enviou não precisa ser baixado de volta
        meta.synced = true; salvaMeta();
        mostra('ok', 'Sincronizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (mudou ? ' (dados novos recebidos)' : ''));
        if (mudou) document.dispatchEvent(new Event('cfo-sync'));   // as telas abertas se atualizam sozinhas (antes ficavam com dados velhos e podiam sobrescrever a nuvem)
      } catch (e) {
        mostra('err', 'Sem sincronizar: ' + e.message + (navigator.onLine ? '' : ' (sem internet)'));
        if (manual) alert('Não consegui sincronizar o setor.\n' + e.message);
      }
    })();
    await rodando; rodando = null;
    if (pendente) { pendente = false; sync(); }
  }

  // Toda gravação de dado do setor marca para enviar (sem mexer no envio do almoxarifado de EPIs)
  const gravaAntes = CFO.store.set;
  CFO.store.set = (k, v) => { gravaAntes(k, v); if (CFO.espaco === espaco) marcaDirty(k); };

  btn.hidden = false;
  btn.onclick = () => {
    const d = document.createElement('dialog'); d.className = 'imp';
    d.innerHTML = `<form method="dialog"><h3>Nuvem do setor</h3><p class="log">${CFO.esc(msg)}</p>
      <button type="button" data-a="sync">🔄 Sincronizar agora</button>
      <button type="button" data-a="pull">⬇️ Baixar tudo da nuvem (substitui os dados deste aparelho)</button>
      <button type="button" data-a="reenv">⬆️ Reenviar tudo deste aparelho para a nuvem</button>
      <button value="cancel" class="ghost" formnovalidate>Fechar</button></form>`;
    d.onclose = () => d.remove();
    d.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a; d.close();
      if (a === 'sync') sync({ manual: true });
      else if (a === 'pull') { if (confirm('Substituir os dados do setor NESTE aparelho pelos que estão na nuvem?')) sync({ forcar: true }); }
      else if (a === 'reenv') { if (confirm('Reenviar todos os dados do setor deste aparelho para a nuvem?')) sync({ reenviar: true, manual: true }); }
    });
    document.body.append(d); d.showModal();
  };

  mostra('work'); sync();
  setInterval(() => { if (!document.hidden) sync(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  addEventListener('online', () => sync());
})();
