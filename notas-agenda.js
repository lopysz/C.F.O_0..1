/* ===== Bloco de notas e Agenda (atalhos do botão flutuante) =====
   Abrem numa janela no meio da tela (não cobre tudo). Cada PERFIL tem o seu bloco e a sua agenda:
     notas_<perfil>   -> { texto, ts }
     agenda_<perfil>  -> { 'AAAA-MM-DD': [ { id, t: texto, h: 'HH:MM' ou '', ok: true/false } ] }
   Gravam com CFO.store.set, então vão para a nuvem sozinhos (almoxarifado: supabase-sync.js | outros setores: setor-sync.js).
   <perfil> = nome do perfil sem acento/símbolos (logins diferentes do mesmo nome dividem o mesmo bloco).
   Chamado por assistente.js (botão flutuante): CFO.notasAgenda.notas() / .agenda() / .fechar().
   Remover = apagar este arquivo e a linha <script> do index.html (o botão flutuante continua funcionando só com o chat). */
(() => {
  const esc = CFO.esc;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const perfil = () => { const u = CFO.usuario && CFO.usuario(); return u ? (CFO.norm(u.nome) || CFO.norm(u.id)) : ''; };
  const KN = () => 'notas_' + perfil(), KA = () => 'agenda_' + perfil();
  const lerAgenda = () => { const d = CFO.store.get(KA(), {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; };

  const css = document.createElement('style');
  css.textContent = `
  .na-ov{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));background:rgba(0,0,0,.4)}
  .na-ov[hidden]{display:none!important}
  .na-box{display:flex;flex-direction:column;width:min(88vw,460px);height:min(62vh,540px);height:min(62dvh,540px);background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
  .na-h{display:flex;align-items:center;gap:.5rem;padding:.65rem .8rem;border-bottom:1px solid var(--line)}.na-h b{flex:1;font-size:1rem}
  .na-h button{padding:.25rem .55rem;font-size:.85rem}
  .na-b{flex:1;min-height:0;display:flex;flex-direction:column}
  .na-b textarea{flex:1;min-height:0;width:100%;resize:none;border:0;border-radius:0;background:transparent;color:var(--text);padding:.8rem;font:inherit;line-height:1.5;outline:none}
  .na-b textarea:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
  .na-s{padding:.4rem .8rem;border-top:1px solid var(--line);font-size:.78rem;color:var(--muted)}
  .na-c{flex:1;min-height:0;overflow:auto;padding:.6rem .7rem}
  .na-nav{display:flex;align-items:center;gap:.4rem;margin-bottom:.4rem}.na-nav b{flex:1;text-align:center}
  .na-nav button{padding:.2rem .6rem;font-size:.85rem}
  .na-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
  .na-g .sem{font-size:.72rem;color:var(--muted);padding:.15rem 0}
  .na-d{position:relative;padding:.35rem 0;font-size:.85rem;border-radius:8px;background:transparent;color:var(--text);border:1px solid transparent}
  .na-d.fora{color:var(--muted);opacity:.55}
  .na-d.hoje{border-color:var(--accent)}
  .na-d.sel{background:var(--accent);color:var(--on-accent);border-color:var(--accent);opacity:1}
  .na-d.tem::after{content:"";position:absolute;left:50%;bottom:2px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--accent)}
  .na-d.sel.tem::after{background:var(--on-accent)}
  .na-t{margin:.7rem 0 .3rem;font-weight:700;font-size:.92rem}
  .na-e{display:flex;align-items:center;gap:.5rem;padding:.35rem .1rem;border-bottom:1px solid var(--line);font-size:.9rem}
  .na-e span{flex:1;min-width:0;overflow-wrap:anywhere}.na-e.ok span{text-decoration:line-through;color:var(--muted)}
  .na-e time{color:var(--muted);font-size:.8rem}
  .na-e input[type=checkbox]{width:1.1rem;height:1.1rem;flex:none;padding:0}
  .na-e button{padding:.1rem .45rem;font-size:.85rem}
  .na-vz{color:var(--muted);font-size:.85rem;padding:.3rem 0}
  .na-add{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.6rem}.na-add input[type=text]{flex:1;min-width:8rem}.na-add input{min-width:0}.na-add input[type=time]{width:auto}
  @media print{.na-ov{display:none!important}}`;
  document.head.append(css);

  const ov = document.createElement('div'); ov.className = 'na-ov'; ov.hidden = true;
  document.body.append(ov);
  let modo = '', ta = null, tNota = null, mes = null, sel = '', voltar = null;

  const salvaNota = () => { clearTimeout(tNota); tNota = null; if (!ta) return; const st = ov.querySelector('.na-s'); try { CFO.store.set(KN(), { texto: ta.value, ts: Date.now() }); if (st) st.textContent = 'Salvo ✓ · vai para a nuvem sozinho'; } catch { if (st) st.textContent = '⚠️ Não consegui salvar (sem espaço no aparelho?)'; } };
  const fechar = () => {
    if (ov.hidden) return; if (modo === 'notas') salvaNota();
    ov.hidden = true; ov.innerHTML = ''; modo = ''; ta = null;
    if (voltar && voltar.isConnected && !voltar.hidden) voltar.focus(); voltar = null;
  };
  const moldura = (titulo, corpo) => {
    ov.innerHTML = `<section class="na-box" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><div class="na-h"><b>${esc(titulo)}</b><button class="ghost" data-x aria-label="Fechar">✕</button></div><div class="na-b">${corpo}</div></section>`;
    ov.hidden = false;
  };

  /* ---------- Bloco de notas ---------- */
  const abrirNotas = () => {
    if (!perfil()) return; voltar = document.activeElement; modo = 'notas';
    moldura('📝 Bloco de notas', '<textarea aria-label="Suas anotações" placeholder="Escreva aqui…" spellcheck="true"></textarea><div class="na-s" aria-live="polite"></div>');
    ta = ov.querySelector('textarea'); const st = ov.querySelector('.na-s');
    const n = CFO.store.get(KN(), null); ta.value = n && typeof n.texto === 'string' ? n.texto : '';
    st.textContent = 'Salvo automaticamente neste perfil e na nuvem';
    ta.addEventListener('input', () => { st.textContent = 'Salvando…'; clearTimeout(tNota); tNota = setTimeout(salvaNota, 600); });
    setTimeout(() => ta && ta.focus(), 50);
  };

  /* ---------- Agenda ---------- */
  const desenhaAgenda = () => {
    const box = ov.querySelector('.na-c'); if (!box) return; const A = lerAgenda(), hoje = ymd(new Date());
    const y = mes.getFullYear(), m = mes.getMonth(), ini = new Date(y, m, 1 - new Date(y, m, 1).getDay()), cel = [];
    for (let i = 0; i < 42; i++) { const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i), k = ymd(d);
      cel.push(`<button type="button" class="na-d${d.getMonth() !== m ? ' fora' : ''}${k === hoje ? ' hoje' : ''}${k === sel ? ' sel' : ''}${(A[k] || []).length ? ' tem' : ''}" data-d="${k}" aria-label="${d.getDate()} de ${MESES[d.getMonth()]}">${d.getDate()}</button>`); }
    const L = (A[sel] || []).slice().sort((a, b) => (a.h || '99:99').localeCompare(b.h || '99:99'));
    const [sy, sm, sd] = sel.split('-').map(Number);
    box.innerHTML = `<div class="na-nav"><button type="button" class="ghost" data-mes="-1" aria-label="Mês anterior">‹</button><b>${MESES[m]} ${y}</b><button type="button" class="ghost" data-hoje>Hoje</button><button type="button" class="ghost" data-mes="1" aria-label="Próximo mês">›</button></div>
      <div class="na-g">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(s => `<span class="sem">${s}</span>`).join('')}${cel.join('')}</div>
      <div class="na-t">${sd} de ${MESES[sm - 1]} de ${sy}</div>
      ${L.length ? L.map(e => `<div class="na-e${e.ok ? ' ok' : ''}"><input type="checkbox" data-ok="${esc(e.id)}" ${e.ok ? 'checked' : ''} aria-label="Concluído"><span>${e.h ? `<time>${esc(e.h)}</time> ` : ''}${esc(e.t)}</span><button type="button" class="ghost" data-del="${esc(e.id)}" aria-label="Apagar">✕</button></div>`).join('') : '<p class="na-vz">Nada marcado para este dia.</p>'}
      <form class="na-add"><input type="time" name="h" aria-label="Hora (opcional)"><input type="text" name="t" placeholder="Novo compromisso…" maxlength="200" autocomplete="off" aria-label="Novo compromisso" required><button type="submit">Adicionar</button></form>`;
  };
  const mexe = f => { const A = lerAgenda(); f(A); Object.keys(A).forEach(k => { if (!Array.isArray(A[k]) || !A[k].length) delete A[k]; }); CFO.store.set(KA(), A); desenhaAgenda(); };
  const abrirAgenda = () => {
    if (!perfil()) return; voltar = document.activeElement; modo = 'agenda';
    const h = new Date(); mes = new Date(h.getFullYear(), h.getMonth(), 1); sel = ymd(h);
    moldura('📅 Agenda', '<div class="na-c"></div>'); desenhaAgenda();
  };

  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-x]')) return fechar();
    if (modo !== 'agenda') return;
    const d = e.target.closest('[data-d]'), n = e.target.closest('[data-mes]'), ho = e.target.closest('[data-hoje]'), del = e.target.closest('[data-del]');
    if (d) { sel = d.dataset.d; const [y, m] = sel.split('-').map(Number); mes = new Date(y, m - 1, 1); desenhaAgenda(); }
    else if (n) { mes = new Date(mes.getFullYear(), mes.getMonth() + (+n.dataset.mes), 1); desenhaAgenda(); }
    else if (ho) { const h = new Date(); mes = new Date(h.getFullYear(), h.getMonth(), 1); sel = ymd(h); desenhaAgenda(); }
    else if (del) mexe(A => { A[sel] = (A[sel] || []).filter(x => x.id !== del.dataset.del); });
  });
  ov.addEventListener('change', e => { const c = e.target.closest('[data-ok]'); if (c && modo === 'agenda') mexe(A => { const x = (A[sel] || []).find(i => i.id === c.dataset.ok); if (x) x.ok = c.checked; }); });
  ov.addEventListener('submit', e => {
    e.preventDefault(); if (modo !== 'agenda') return; const f = e.target, t = String(f.t.value).trim(); if (!t) return;
    const h = f.h.value || ''; mexe(A => { (A[sel] = A[sel] || []).push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t, h, ok: false }); });
    const novo = ov.querySelector('.na-add input[name=t]'); if (novo) novo.focus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) { e.stopPropagation(); fechar(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && modo === 'notas') salvaNota(); });
  addEventListener('pagehide', () => { if (modo === 'notas') salvaNota(); });
  // Chegou dado novo da nuvem (outro aparelho do mesmo perfil): atualiza a janela aberta sem atrapalhar quem está digitando
  document.addEventListener('cfo-sync', () => {
    if (ov.hidden) return;
    if (modo === 'agenda') desenhaAgenda();
    else if (modo === 'notas' && ta && document.activeElement !== ta && !tNota) { const n = CFO.store.get(KN(), null); if (n && typeof n.texto === 'string' && n.texto !== ta.value) ta.value = n.texto; }
  });
  window.addEventListener('cfo-user', fechar);

  CFO.notasAgenda = { notas: abrirNotas, agenda: abrirAgenda, fechar };
})();
