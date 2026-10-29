/* ===== Quem está online (presença em tempo real) =====
   - Usa o Realtime do Supabase (Presence) com a mesma URL/chave do supabase-config.js: nada novo para configurar.
   - Mostra na barra do topo uma bolinha verde com o número de pessoas online; ao tocar, abre a lista de perfis conectados.
   - Só os perfis com  ver: true  (no login.js: Rafael e Rafael Demax) enxergam a bolinha, a lista e os avisos; os demais só aparecem para eles.
   - Quando alguém entra, aparece um aviso rápido ("Robson entrou"). Quem sai ou fecha a aba some da lista sozinho.
   - Pessoa = nome do perfil (os logins "demax", "rafael demax" e "rafaeldemax" contam como um só: Rafael Demax).
     O mesmo perfil em 2 aparelhos conta 1 pessoa, mas a lista mostra "2 aparelhos".
   - Não grava nada no banco: a presença só existe enquanto a aba está aberta. */
(() => {
  const c = window.CFO_SUPABASE || {};
  if (!(c.url && c.anonKey)) return;
  const esc = CFO.esc;
  const base = (/^https?:/.test(c.url) ? c.url : `https://${c.url}.supabase.co`).replace(/\/+$/, '');
  const WS = base.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(c.anonKey) + '&vsn=1.0.0';
  const TOPICO = 'realtime:cfo-online';

  // identifica este aparelho (continua o mesmo ao recarregar a página)
  let aparelho = ''; try { aparelho = localStorage.getItem('cfo_aparelho') || ''; } catch {}
  if (!aparelho) { aparelho = 'a' + Math.random().toString(36).slice(2, 10); try { localStorage.setItem('cfo_aparelho', aparelho); } catch {} }

  // ----- Interface -----
  const barra = document.querySelector('.bar'), mais = document.getElementById('more');
  const pill = document.createElement('button');
  pill.className = 'ghost onl'; pill.id = 'onl'; pill.hidden = true; pill.setAttribute('aria-label', 'Quem está online');
  pill.innerHTML = '<i class="onl-dot"></i><span>0</span>';
  if (barra) barra.insertBefore(pill, mais || null);

  let ws = null, beat = null, retry = null, tent = 0, ligado = false, euMeta = null, primeiro = true;
  let estado = {};                         // chave do aparelho -> lista de metas
  let antes = new Set();                   // nomes online na última atualização (para avisar quem entrou)

  const pessoas = () => {
    const g = new Map();
    Object.values(estado).flat().forEach(m => {
      if (!m || !m.nome) return;
      const x = g.get(m.nome) || { nome: m.nome, perfil: m.perfil, desde: m.desde, n: 0 };
      x.n++; if (m.desde && m.desde < x.desde) x.desde = m.desde; g.set(m.nome, x);
    });
    return [...g.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  };
  const hora = iso => { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const PERFIL = { total: 'Acesso total', leve: 'Modo leve', aprendiz: 'Aprendiz' };

  const aviso = txt => {
    const t = document.createElement('div'); t.className = 'onl-toast'; t.textContent = txt;
    document.body.append(t); setTimeout(() => t.classList.add('sai'), 3200); setTimeout(() => t.remove(), 3700);
  };

  const desenha = () => {
    const eu = CFO.usuario?.();
    pill.hidden = !(eu && eu.ver);
    if (!eu || !eu.ver) return;
    const lista = pessoas(), nomes = new Set(lista.map(p => p.nome));
    pill.querySelector('span').textContent = ligado ? lista.length : '–';
    pill.classList.toggle('off', !ligado);
    pill.title = ligado ? (lista.length ? 'Online: ' + lista.map(p => p.nome).join(', ') : 'Ninguém online') : 'Sem conexão com o servidor';
    if (!primeiro) nomes.forEach(n => { if (!antes.has(n) && n !== eu.nome) aviso(n + ' entrou'); });
    if (ligado && Object.keys(estado).length) primeiro = false;
    antes = nomes;
    const dlg = document.getElementById('onl-dlg'); if (dlg?.open) dlg.querySelector('.onl-lista').innerHTML = html(lista, eu);
  };

  const html = (lista, eu) => !ligado ? '<p class="onl-vazio">Sem conexão com o servidor. Tentando reconectar...</p>'
    : lista.length ? lista.map(p => `<div class="onl-p"><i class="onl-dot"></i><div><b>${esc(p.nome)}${eu && p.nome === eu.nome ? ' (você)' : ''}</b>
        <small>${esc(PERFIL[p.perfil] || p.perfil || '')}${p.n > 1 ? ' · ' + p.n + ' aparelhos' : ''}${p.desde ? ' · desde ' + hora(p.desde) : ''}</small></div></div>`).join('')
      : '<p class="onl-vazio">Ninguém online.</p>';

  pill.onclick = e => {
    e.stopPropagation();
    document.getElementById('onl-dlg')?.remove();
    const d = document.createElement('dialog'); d.id = 'onl-dlg'; d.className = 'onl-dlg';
    d.innerHTML = `<form method="dialog"><h3>Quem está online</h3><div class="onl-lista"></div><div class="row"><button value="ok" class="ghost">Fechar</button></div></form>`;
    document.body.append(d); d.onclose = () => d.remove();
    d.querySelector('.onl-lista').innerHTML = html(pessoas(), CFO.usuario?.());
    d.showModal();
  };

  // ----- Conexão (protocolo do Realtime do Supabase) -----
  const envia = (topic, event, payload = {}) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++seq), join_ref: '1' })); };
  let seq = 1;

  function conectar() {
    const eu = CFO.usuario?.();
    if (!eu || ws) return;
    euMeta = { nome: eu.nome, perfil: eu.perfil, desde: new Date().toISOString() };
    try { ws = new WebSocket(WS); } catch { agendar(); return; }
    const w = ws;
    w.onopen = () => {
      tent = 0;
      w.send(JSON.stringify({ topic: TOPICO, event: 'phx_join', ref: '1', join_ref: '1',
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: aparelho }, postgres_changes: [], private: false }, access_token: c.anonKey } }));
      clearInterval(beat); beat = setInterval(() => envia('phoenix', 'heartbeat'), 25000);
    };
    w.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.topic !== TOPICO) return;
      if (m.event === 'phx_reply' && m.ref === '1') {
        if (m.payload?.status === 'ok') { ligado = true; envia(TOPICO, 'presence', { type: 'presence', event: 'track', payload: euMeta }); desenha(); }
        else { ligado = false; desenha(); }
      } else if (m.event === 'presence_state') {
        estado = {}; Object.entries(m.payload || {}).forEach(([k, v]) => estado[k] = v.metas || []); desenha();
      } else if (m.event === 'presence_diff') {
        const { joins = {}, leaves = {} } = m.payload || {};
        Object.entries(leaves).forEach(([k, v]) => {
          const refs = new Set((v.metas || []).map(x => x.phx_ref));
          estado[k] = (estado[k] || []).filter(x => !refs.has(x.phx_ref)); if (!estado[k].length) delete estado[k];
        });
        Object.entries(joins).forEach(([k, v]) => { estado[k] = [...(estado[k] || []), ...(v.metas || [])]; });
        desenha();
      }
    };
    w.onclose = () => { if (ws !== w) return; limpa(); agendar(); };
    w.onerror = () => { try { w.close(); } catch {} };
  }
  function limpa() { clearInterval(beat); ws = null; ligado = false; estado = {}; desenha(); }
  function agendar() { clearTimeout(retry); if (!CFO.usuario?.()) return; retry = setTimeout(conectar, Math.min(1500 * ++tent, 15000)); }
  function desconectar() {
    clearTimeout(retry); const w = ws;
    if (w) { try { envia(TOPICO, 'presence', { type: 'presence', event: 'untrack' }); w.close(); } catch {} }
    ws = null; limpa(); primeiro = true; antes = new Set();
  }
  // troca de usuário (login.js avisa) / fechar a aba
  window.addEventListener('cfo-user', () => { desconectar(); if (CFO.usuario?.()) conectar(); });
  window.addEventListener('pagehide', () => { try { ws?.close(); } catch {} });
  // celular que "acorda": reconecta ao voltar para a aba
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CFO.usuario?.() && !ws) { tent = 0; conectar(); } });

  desenha(); conectar();
})();
