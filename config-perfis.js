/* ===== Configurações (engrenagem ⚙ no topo) =====
   - Aparência: tema claro/escuro (todos os perfis).
   - Perfis (só o perfil principal, admin: true no login.js): criar, excluir e limitar o que cada perfil pode fazer
     (quais abas abre, se edita/apaga nas planilhas, se usa os botões do topo e os Registros).
   Os perfis ficam em 'perfis' (sincroniza com a nuvem). Regras em CFO.pode('abrir' | 'editar' | 'apagar', área). */
(() => {
  const esc = CFO.esc;
  const IC = {
    moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    chev: '<path d="M9 6l6 6-6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
  };
  const ico = (n, s = 18) => `<svg class="cf-i" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
  CFO.iconesCfg = IC;

  const TIPO = { total: 'Acesso total', leve: 'Modo leve', aprendiz: 'Aprendiz', custom: 'Perfil criado' };
  const EDITAR = [['epi', 'Planilha EPI'], ['contratos', 'Contratos'], ['requisicoes', 'Requisições'], ['mapa', 'Mapa do almoxarifado']];
  const EXTRAS = [['topo', 'Botões do topo (Importar planilhas, Nuvem, Sincronizar WL)'], ['registros', 'Registros (modificações de cada perfil)']];

  CFO.modules.config = body => {
    const escuro = () => CFO.tema.escuro();
    function draw() {
      const perfis = CFO.perfis(), eu = CFO.usuario() || {}, adm = CFO.admin();
      body.innerHTML = `<div class="cf">
        <section class="cf-sec"><h3>Aparência</h3>
          <div class="cf-row"><span>${ico(escuro() ? 'moon' : 'sun')}<b>Tema</b><small>${escuro() ? 'Escuro' : 'Claro'}</small></span>
          <button id="cf-tema" class="ghost">Mudar para ${escuro() ? 'claro' : 'escuro'}</button></div></section>
        ${adm ? `<section class="cf-sec"><h3>Perfis</h3>
          <p class="log" style="margin-top:0">Toque num perfil para limitar o que ele pode fazer. O perfil principal tem sempre acesso total.</p>
          <div class="cf-lista">${perfis.map(p => `<div class="cf-row cf-perfil" data-k="${esc(p.chave)}">
            <span>${ico(p.admin ? 'shield' : 'user')}<b>${esc(p.nome)}</b><small>${p.admin ? 'Perfil principal' : esc(TIPO[p.perfil] || p.perfil)}${p.logins.length ? ' · login: ' + esc(p.logins.join(', ')) : ''}</small></span>
            <span class="cf-ac">${!p.admin && p.chave !== CFO.norm(eu.nome) ? `<button class="ghost cf-del" data-del="${esc(p.chave)}" title="Excluir perfil" aria-label="Excluir perfil ${esc(p.nome)}">${ico('trash')}</button>` : ''}${p.admin ? '' : ico('chev')}</span></div>`).join('')}</div>
          <div class="bar" style="padding:0;margin-top:.8rem;min-height:0"><button id="cf-novo">${ico('plus', 16)} Novo perfil</button></div></section>`
        : `<section class="cf-sec"><h3>Perfis</h3><p class="log" style="margin-top:0">Só o perfil principal cria, exclui e limita perfis.</p></section>`}</div>`;
      body.querySelector('#cf-tema').onclick = () => { CFO.tema.alternar(); draw(); };
      if (!adm) return;
      body.querySelector('#cf-novo').onclick = novo;
      body.querySelectorAll('.cf-perfil').forEach(el => el.onclick = e => { if (e.target.closest('.cf-del')) return; const p = CFO.perfis().find(x => x.chave === el.dataset.k); if (p && !p.admin) editar(p); });
      body.querySelectorAll('.cf-del').forEach(b => b.onclick = e => { e.stopPropagation(); excluir(b.dataset.del); });
    }

    function excluir(chave) {
      const p = CFO.perfis().find(x => x.chave === chave); if (!p) return;
      if (!confirm(`Excluir o perfil "${p.nome}"? Ele não conseguirá mais entrar.`)) return;
      CFO.perfilExcluir(chave); draw();
    }

    function novo() {
      CFO.dialog('Novo perfil',
        `<label>Nome do perfil<input name="nome" required autocomplete="off"></label>
         <label>Login (usado para entrar)<input name="login" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
         <label>Senha<input name="senha" type="password" required autocomplete="new-password"></label>
         <p class="log">O perfil novo começa com tudo liberado (menos Registros). Depois toque nele para limitar.</p>`,
        async d => { const erro = await CFO.perfilNovo(d.nome, d.login, d.senha); if (erro) return alert(erro); draw(); const p = CFO.perfis().find(x => x.chave === CFO.norm(d.nome)); if (p) editar(p); });
    }

    // Tela de permissões de um perfil
    function editar(p) {
      CFO.open('Permissões · ' + p.nome, b => {
        const pm = CFO.permsDe(p.nome, p.perfil), bloq = new Set(pm.bloquear || []), semE = new Set(pm.semEditar || []), semA = new Set(pm.semApagar || []);
        const nivel = k => semE.has(k) ? 'leitura' : semA.has(k) ? 'semapagar' : 'total';
        const grupos = DRAWERS.map(d => `<div class="cf-g"><h4>${esc(d.name)}</h4>${d.subs.map(s => `<label class="cf-ck"><input type="checkbox" data-a="${s.m}" ${bloq.has(s.m) ? '' : 'checked'}><span>${esc(s.name)}</span></label>`).join('')}</div>`).join('');
        b.innerHTML = `<div class="cf">
          <section class="cf-sec"><h3>Abas que ${esc(p.nome)} pode abrir</h3>${grupos}
            <div class="cf-g"><h4>Menu ⋮ e topo</h4>${EXTRAS.map(x => `<label class="cf-ck"><input type="checkbox" data-a="${x[0]}" ${bloq.has(x[0]) ? '' : 'checked'}><span>${esc(x[1])}</span></label>`).join('')}</div></section>
          <section class="cf-sec"><h3>O que pode fazer nas planilhas</h3>
            ${EDITAR.map(x => `<div class="cf-row"><span><b>${esc(x[1])}</b></span><select data-e="${x[0]}"><option value="total"${nivel(x[0]) === 'total' ? ' selected' : ''}>Editar e apagar</option>${x[0] === 'mapa' ? '' : `<option value="semapagar"${nivel(x[0]) === 'semapagar' ? ' selected' : ''}>Editar, sem apagar</option>`}<option value="leitura"${nivel(x[0]) === 'leitura' ? ' selected' : ''}>Só visualizar</option></select></div>`).join('')}
            <p class="log">"Só visualizar" esconde adicionar, editar, importar, movimentar estoque e marcar requisições.</p></section>
          <div class="bar" style="padding:0;gap:.6rem;flex-wrap:wrap"><button id="cf-salvar">Salvar permissões</button>
            ${p.custom ? '<button id="cf-senha" class="ghost">Trocar senha</button>' : ''}
            <button id="cf-padrao" class="ghost">Restaurar padrão</button></div></div>`;
        b.querySelector('#cf-salvar').onclick = () => {
          const bloquear = [...b.querySelectorAll('[data-a]')].filter(i => !i.checked).map(i => i.dataset.a), semEditar = [], semApagar = [];
          b.querySelectorAll('[data-e]').forEach(s => { if (s.value === 'leitura') semEditar.push(s.dataset.e); else if (s.value === 'semapagar') semApagar.push(s.dataset.e); });
          CFO.perfilPerms(p.chave, { bloquear, semEditar, semApagar }); CFO.close(); draw();
        };
        b.querySelector('#cf-padrao').onclick = () => { if (!confirm('Voltar às permissões padrão deste perfil?')) return; const d = CFO.store.get('perfis', {}) || {}; if (d.perms) { delete d.perms[p.chave]; CFO.store.set('perfis', d); } CFO.close(); draw(); };
        const ps = b.querySelector('#cf-senha'); if (ps) ps.onclick = () => CFO.dialog('Nova senha de ' + p.nome, '<label>Nova senha<input name="s" type="password" required autocomplete="new-password"></label>', d => { if (d.s) { CFO.perfilSenha(p.chave, d.s); alert('Senha trocada.'); } });
      });
    }
    draw();
  };
})();
