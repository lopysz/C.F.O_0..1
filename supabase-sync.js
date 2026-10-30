/* ===== Sincronização automática com o Supabase Storage =====
   - Cada conjunto de dados (EPI, contratos, requisições...) vira um arquivo em  <bucket>/<pastaEnvio>/dados/<nome>.json
   - Ao abrir: baixa o que estiver mais novo na nuvem (aparelho novo recebe tudo). Depois: cada alteração é enviada sozinha.
   - A cada 60 s e ao voltar para a aba, confere se outra pessoa/aparelho alterou algo.
   - Conflito no mesmo conjunto: vale a alteração mais recente.
   - Aparelho que NUNCA sincronizou: o que existe na nuvem vence o que está só no aparelho. */
(() => {
  const c = window.CFO_SUPABASE || {};
  const btn = document.getElementById('env');
  const raiz = (c.pastaEnvio || 'CFO').replace(/^\/+|\/+$/g, '');
  const pasta = raiz + '/dados', dbRaiz = raiz + '/db', STORES = ['fotos', 'imgs', 'fichas'];
  const ativo = !!(c.url && c.bucket && c.anonKey);
  const base = ativo ? (/^https?:/.test(c.url) ? c.url : `https://${c.url}.supabase.co`).replace(/\/+$/, '') : '';
  const H = ativo ? { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey } : {};
  const bk = ativo ? encodeURIComponent(c.bucket) : '';

  // controle local (não entra no backup: não começa com "cfo:")
  const VERSAO = 'sync-3 (fotos)';
  const MK = 'cfo_sync';
  const meta = (() => { try { return { mod: {}, seen: {}, dirty: {}, dbDirty: {}, synced: false, ...JSON.parse(localStorage.getItem(MK) || '{}') }; } catch { return { mod: {}, seen: {}, dirty: {}, dbDirty: {}, synced: false }; } })();
  const salvaMeta = () => { try { localStorage.setItem(MK, JSON.stringify(meta)); } catch {} };
  const nomeDb = (st, id) => `${dbRaiz}/${st}/${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  const nomeObj = k => `${pasta}/${k.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
  const chavesLocais = () => { const r = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('cfo:')) r.push(k.slice(4)); } return r; };

  let estado = 'off', msg = '';
  const mostra = (e, m = '') => {
    estado = e; msg = m; if (!btn) return;
    btn.textContent = { off: '☁️ Nuvem', ok: '☁️ ✓', work: '☁️ …', err: '☁️ !' }[e] || '☁️ Nuvem';
    btn.title = m || ({ off: 'Sincronização desligada', ok: 'Sincronizado', work: 'Sincronizando...', err: 'Erro ao sincronizar' }[e]);
  };

  const listar = async (prefix = pasta) => {
    const r = await fetch(`${base}/storage/v1/object/list/${bk}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }) });
    if (!r.ok) throw new Error('listar ' + r.status);
    const m = new Map(); (await r.json()).forEach(o => { if (o.id !== null && /\.json$/.test(o.name)) m.set(prefix + '/' + o.name, o.updated_at || o.created_at || ''); });
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

  // Banco de fotos (IndexedDB): cada foto/ficha vira um arquivo em <pasta>/db/<grupo>/<id>.json
  const raw = { put: CFO.db.put, del: CFO.db.del, clear: CFO.db.clear, get: CFO.db.get, all: CFO.db.all, keys: CFO.db.keys };
  const envObj = (nome, obj) => CFO.supaEnviar(nome, new Blob([JSON.stringify(obj)], { type: 'application/json' }), 'application/json', true);
  let t = null;
  const agendar = () => { if (ativo && meta.synced && !CFO.espaco) { clearTimeout(t); t = setTimeout(sync, 2500); } };
  const marca = (st, id, op) => { if (!CFO.espaco && STORES.includes(st) && id !== undefined) { meta.dbDirty[st + '/' + id] = { op, ts: Date.now() }; salvaMeta(); agendar(); } };
  CFO.db.put = async (st, v) => { const r = await raw.put(st, v); marca(st, v && v.id, 'put'); return r; };
  CFO.db.del = async (st, id) => { const r = await raw.del(st, id); marca(st, id, 'del'); return r; };
  CFO.db.clear = async st => { const todos = await raw.all(st); const r = await raw.clear(st); todos.forEach(x => marca(st, x.id, 'del')); return r; };
  CFO.db.get = async (st, id) => {                        // foto completa: se não estiver neste aparelho, baixa da nuvem na hora
    let r = await raw.get(st, id);
    if (!r && st === 'imgs' && ativo && !CFO.espaco) {
      try { const d = await baixar(nomeDb('imgs', id)); if (d && !d.deleted && d.value) { await raw.put('imgs', d.value); r = d.value; } } catch {}
    }
    return r;
  };

  let rodando = null, pendente = false;
  async function sync({ forcar = false, manual = false, reenviar = false } = {}) {
    if (!ativo || CFO.espaco) return;                    // perfil de outro setor: nenhuma sincronia
    if (rodando) { pendente = true; return rodando; }
    rodando = (async () => {
      mostra('work');
      try {
        const remoto = await listar(); let mudou = false;
        const restrito = !(CFO.usuario && CFO.usuario());   // antes do login só baixa a lista de perfis (para o login de perfis criados funcionar); o resto, depois de entrar
        for (const [nome, upd] of remoto) {
          if (restrito && nome !== nomeObj('perfis')) continue;
          if (!forcar && meta.seen[nome] === upd) continue;
          const d = await baixar(nome); if (!d || !d.key) continue;
          const localNovo = meta.dirty[d.key] && meta.synced && (meta.mod[d.key] || 0) > (d.updatedAt || 0);
          if (forcar || !localNovo) { aplica(d, nome, upd); mudou = true; }
        }
        if (restrito) { salvaMeta(); mostra('ok', 'Aguardando login'); if (mudou) document.dispatchEvent(new Event('cfo-sync')); return; }
        const nomesEnv = [];
        for (const k of chavesLocais()) {
          const nome = nomeObj(k);
          if (meta.dirty[k] || reenviar || !remoto.has(nome)) {
            if (!meta.mod[k]) meta.mod[k] = Date.now();
            const antes = meta.mod[k];
            await enviar(k); if (meta.mod[k] === antes) delete meta.dirty[k]; nomesEnv.push(nome);   // mudou durante o envio? continua marcado e vai no próximo ciclo
          }
        }
        if (nomesEnv.length) { const novo = await listar(); nomesEnv.forEach(n => { if (novo.has(n)) meta.seen[n] = novo.get(n); }); }
        // --- Fotos e fichas (banco do navegador) ---
        const remotoDb = new Map();
        for (const st of STORES) (await listar(`${dbRaiz}/${st}`)).forEach((u, n) => remotoDb.set(n, { u, st }));
        for (const [nome, { u, st }] of remotoDb) {
          if (st === 'imgs') continue;                      // foto completa só é baixada quando alguém abre a foto
          if (!forcar && meta.seen[nome] === u) continue;
          const d = await baixar(nome); if (!d || d.id === undefined) continue;
          const dk = st + '/' + d.id, loc = meta.dbDirty[dk];
          if (loc && meta.synced && loc.ts > (d.updatedAt || 0)) continue;   // alteração local mais nova: será enviada
          if (d.deleted) { await raw.del(st, d.id); if (st === 'fotos') await raw.del('imgs', d.id); }
          else if (d.value) await raw.put(st, d.value);
          delete meta.dbDirty[dk]; meta.seen[nome] = u; mudou = true;
        }
        const nomesDb = [];
        for (const [dk, op] of Object.entries(meta.dbDirty)) {
          const i = dk.indexOf('/'), st = dk.slice(0, i), id = dk.slice(i + 1), nome = nomeDb(st, id);
          const rec = op.op === 'put' ? await raw.get(st, id) : null;
          await envObj(nome, rec ? { store: st, id: rec.id, updatedAt: op.ts, value: rec } : { store: st, id, deleted: true, updatedAt: op.ts });
          if (meta.dbDirty[dk] === op) delete meta.dbDirty[dk]; nomesDb.push(nome);
        }
        for (const st of STORES) for (const id of await raw.keys(st)) {   // fotos antigas ainda não enviadas (só as chaves: não carrega as fotos na memória a cada ciclo)
          const nome = nomeDb(st, id);
          if ((reenviar || !remotoDb.has(nome)) && !nomesDb.includes(nome)) { const rec = await raw.get(st, id); if (rec) await envObj(nome, { store: st, id: rec.id, updatedAt: Date.now(), value: rec }); nomesDb.push(nome); }
        }
        if (nomesDb.length) for (const st of STORES) (await listar(`${dbRaiz}/${st}`)).forEach((u, n) => { if (nomesDb.includes(n)) meta.seen[n] = u; });
        meta.synced = true; salvaMeta();
        mostra('ok', 'Sincronizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (mudou ? ' (dados novos recebidos)' : ''));
        if (mudou) document.dispatchEvent(new Event('cfo-sync'));   // as telas abertas se atualizam sozinhas
      } catch (e) {
        mostra('err', 'Sem sincronizar: ' + e.message + (navigator.onLine ? '' : ' (sem internet)'));
        if (manual) alert('Não consegui sincronizar.\n' + e.message + '\n\nConfira as políticas do Storage (SELECT, INSERT e UPDATE) e a chave no supabase-config.js.');
      }
    })();
    await rodando; rodando = null;
    if (pendente) { pendente = false; sync(); }
  }

  // Toda gravação do sistema marca o conjunto como alterado e agenda o envio
  const gravaOriginal = CFO.store.set;
  CFO.store.set = (k, v) => {
    gravaOriginal(k, v);
    if (CFO.espaco && k !== 'perfis') return;                        // dados de setor isolado nunca entram na fila da nuvem
    meta.mod[k] = Date.now(); meta.dirty[k] = 1; salvaMeta();
    agendar();
  };

  async function diagnostico() {
    const l = [`Versão do sistema neste aparelho: ${VERSAO}`, `Usuário/aparelho já sincronizou antes: ${meta.synced ? 'sim' : 'não'}`, `Último estado: ${msg || estado}`, `Alterações de fotos aguardando envio: ${Object.keys(meta.dbDirty).length}`];
    try {
      for (const st of STORES) {
        const loc = (await raw.all(st)).length, rem = (await listar(`${dbRaiz}/${st}`)).size;
        l.push(`${st}: ${loc} neste aparelho | ${rem} na nuvem`);
      }
      l.push(`dados (texto): ${chavesLocais().length} neste aparelho | ${(await listar()).size} na nuvem`);
    } catch (e) { l.push('Erro ao consultar a nuvem: ' + e.message); }
    alert(l.join('\n'));
  }

  // Botão da nuvem
  if (btn) btn.onclick = () => {
    const d = document.createElement('dialog'); d.className = 'imp';
    d.innerHTML = `<form method="dialog"><h3>Nuvem (Supabase)</h3><p class="log">${CFO.esc(msg || (ativo ? '' : 'Preencha o supabase-config.js'))}</p>
      <button type="button" data-a="sync">🔄 Sincronizar agora</button>
      <button type="button" data-a="pull">⬇️ Baixar tudo da nuvem (substitui os dados deste aparelho)</button>
      <button type="button" data-a="reenv">⬆️ Reenviar tudo deste aparelho para a nuvem</button>
      <button type="button" data-a="diag">🔍 Diagnóstico</button>
      <button type="button" data-a="bk">💾 Enviar um arquivo de backup</button>
      <button value="cancel" class="ghost" formnovalidate>Fechar</button></form>`;
    d.onclose = () => d.remove();
    d.querySelectorAll('button[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a; d.close();
      if (a === 'sync') sync({ manual: true });
      else if (a === 'pull') { if (confirm('Substituir os dados DESTE aparelho pelos que estão na nuvem?')) sync({ forcar: true }); }
      else if (a === 'reenv') { if (confirm('Reenviar todos os dados e fotos deste aparelho para a nuvem?')) sync({ reenviar: true, manual: true }); }
      else if (a === 'diag') diagnostico();
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
  window.addEventListener('cfo-user', () => { if (CFO.usuario && CFO.usuario() && !CFO.espaco) sync(); });   // entrou: agora sincroniza tudo
})();
