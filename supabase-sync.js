/* ===== Sincronização automática com o Supabase Storage =====
   - Cada conjunto de dados (EPI, contratos, requisições...) vira um arquivo em  <bucket>/<pastaEnvio>/dados/<nome>.json
   - Ao abrir: baixa o que estiver mais novo na nuvem (aparelho novo recebe tudo). Depois: cada alteração é enviada sozinha.
   - A cada 60 s e ao voltar para a aba, confere se outra pessoa/aparelho alterou algo.
   - Conflito no mesmo conjunto: vale a alteração mais recente.
   - Aparelho que NUNCA sincronizou: o que existe na nuvem vence o que está só no aparelho. */
(() => {
  const c = window.CFO_SUPABASE || {};
  const btn = document.getElementById('env');
  const pasta = (c.pastaEnvio || 'CFO').replace(/^\/+|\/+$/g, '') + '/dados';
  const ativo = !!(c.url && c.bucket && c.anonKey);
  const base = ativo ? (/^https?:/.test(c.url) ? c.url : `https://${c.url}.supabase.co`).replace(/\/+$/, '') : '';
  const H = ativo ? { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey } : {};
  const bk = ativo ? encodeURIComponent(c.bucket) : '';

  // controle local (não entra no backup: não começa com "cfo:")
  const MK = 'cfo_sync';
  const meta = (() => { try { return { mod: {}, seen: {}, dirty: {}, synced: false, ...JSON.parse(localStorage.getItem(MK) || '{}') }; } catch { return { mod: {}, seen: {}, dirty: {}, synced: false }; } })();
  const salvaMeta = () => { try { localStorage.setItem(MK, JSON.stringify(meta)); } catch {} };
  const nomeObj = k => `${pasta}/${k.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  const chavesLocais = () => { const r = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('cfo:')) r.push(k.slice(4)); } return r; };

  let estado = 'off', msg = '';
  const mostra = (e, m = '') => {
    estado = e; msg = m; if (!btn) return;
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
  const enviar = (k) => CFO.supaEnviar(nomeObj(k), new Blob([JSON.stringify({ key: k, updatedAt: meta.mod[k] || Date.now(), value: CFO.store.get(k, null) })], { type: 'application/json' }), 'application/json', true);
  const aplica = (d, nome, upd) => {                      // grava direto no navegador, sem marcar como alteração
    localStorage.setItem('cfo:' + d.key, JSON.stringify(d.value));
    meta.mod[d.key] = d.updatedAt || 0; delete meta.dirty[d.key]; meta.seen[nome] = upd;
  };

  let rodando = null, pendente = false, avisoMudou = false;
  async function sync({ forcar = false, manual = false } = {}) {
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
        const nomesEnv = [];
        for (const k of chavesLocais()) {
          const nome = nomeObj(k);
          if (meta.dirty[k] || !remoto.has(nome)) {
            if (!meta.mod[k]) meta.mod[k] = Date.now();
            await enviar(k); delete meta.dirty[k]; nomesEnv.push(nome);
          }
        }
        if (nomesEnv.length) { const novo = await listar(); nomesEnv.forEach(n => { if (novo.has(n)) meta.seen[n] = novo.get(n); }); }
        meta.synced = true; salvaMeta();
        mostra('ok', 'Sincronizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (mudou ? ' (dados novos recebidos)' : ''));
        if (mudou) avisoMudou = true;
        if (mudou && (manual || forcar)) alert('Dados baixados da nuvem. Se alguma tela estiver aberta, feche e abra de novo para ver as mudanças.');
        else if (mudou && !CFO.screens.length) { /* nenhuma tela aberta: já aparece atualizado ao abrir */ }
        else if (mudou) mostra('ok', 'Dados novos recebidos — feche e abra a tela para ver');
      } catch (e) {
        mostra('err', 'Sem sincronizar: ' + e.message + (navigator.onLine ? '' : ' (sem internet)'));
        if (manual) alert('Não consegui sincronizar.\n' + e.message + '\n\nConfira as políticas do Storage (SELECT, INSERT e UPDATE) e a chave no supabase-config.js.');
      }
    })();
    await rodando; rodando = null;
    if (pendente) { pendente = false; sync(); }
  }

  // Toda gravação do sistema marca o conjunto como alterado e agenda o envio
  let t = null;
  const gravaOriginal = CFO.store.set;
  CFO.store.set = (k, v) => {
    gravaOriginal(k, v);
    meta.mod[k] = Date.now(); meta.dirty[k] = 1; salvaMeta();
    if (ativo && meta.synced) { clearTimeout(t); t = setTimeout(sync, 2500); }
  };

  // Botão da nuvem
  if (btn) btn.onclick = () => {
    const d = document.createElement('dialog'); d.className = 'imp';
    d.innerHTML = `<form method="dialog"><h3>Nuvem (Supabase)</h3><p class="log">${CFO.esc(msg || (ativo ? '' : 'Preencha o supabase-config.js'))}</p>
      <button type="button" data-a="sync">🔄 Sincronizar agora</button>
      <button type="button" data-a="pull">⬇️ Baixar tudo da nuvem (substitui os dados deste aparelho)</button>
      <button type="button" data-a="bk">💾 Enviar um arquivo de backup</button>
      <button value="cancel" class="ghost" formnovalidate>Fechar</button></form>`;
    d.onclose = () => d.remove();
    d.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a; d.close();
      if (a === 'sync') sync({ manual: true });
      else if (a === 'pull') { if (confirm('Substituir os dados DESTE aparelho pelos que estão na nuvem?')) sync({ forcar: true }); }
      else CFO.enviarBackup();
    });
    document.body.append(d); d.showModal();
  };

  if (!ativo) { mostra('off'); return; }
  mostra('work');
  sync();                                                            // ao abrir
  setInterval(() => { if (!document.hidden) sync(); }, 60000);       // confere a cada 60 s
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  addEventListener('online', () => sync());
})();
