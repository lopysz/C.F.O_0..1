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

  const TIPO = { total: 'Acesso total', leve: 'Modo leve', aprendiz: 'Aprendiz', custom: 'Perfil criado', setor: 'Outro setor' };
  const EDITAR = [['epi', 'Planilha EPI'], ['contratos', 'Contratos'], ['requisicoes', 'Requisições'], ['mapa', 'Mapa do almoxarifado'], ['mapalivre', 'Mapa livre']];
  const EXTRAS = [['topo', 'Botões do topo (Importar planilhas, Nuvem, Sincronizar WL)'], ['registros', 'Registros (modificações de cada perfil)']];

  CFO.modules.config = body => {
    const escuro = () => CFO.tema.escuro();
    // Linha de um perfil na lista
    const linha = (p, eu) => `<div class="cf-row cf-perfil" data-k="${esc(p.chave)}">
      <span>${ico(p.admin ? 'shield' : 'user')}<b>${esc(p.nome)}</b><small>${p.admin ? 'Perfil principal' : p.perfil === 'setor' ? (p.jr ? 'Administrador júnior' : 'Outro setor') : esc(TIPO[p.perfil] || p.perfil)}${p.logins.length ? ' · login: ' + esc(p.logins.join(', ')) : ''}</small></span>
      <span class="cf-ac">${!p.admin && p.chave !== CFO.norm(eu.nome) ? `<button class="ghost cf-del" data-del="${esc(p.chave)}" title="Excluir perfil" aria-label="Excluir perfil ${esc(p.nome)}">${ico('trash')}</button>` : ''}${p.admin ? '' : ico('chev')}</span></div>`;

    // Setor isolado: aviso, backup e (administrador júnior) nomes das funções
    function secSetor(eu) {
      return `<section class="cf-sec"><h3>Meu setor · ${esc(eu.setorNome)}</h3>
        <p class="log" style="margin-top:0">Os dados deste setor ficam <b>só neste aparelho</b>: não vão para a nuvem e não misturam com o almoxarifado de EPIs. Para não perder nada, exporte as planilhas (botão Exportar de cada função) e faça o backup abaixo de vez em quando.</p>
        <div class="bar" style="padding:0;gap:.6rem;flex-wrap:wrap;min-height:0"><button id="cf-bk">⬇️ Exportar backup do setor</button><button id="cf-rs" class="ghost">⬆️ Restaurar backup</button><button id="cf-ap" class="ghost danger">Apagar dados do setor</button></div>
        <input id="cf-fl" type="file" accept=".json,application/json" hidden></section>`;
    }
    function secNomes() {
      const r = CFO.store.get('rotulos', null) || {}, n = r.n || {}, oc = CFO.ocultos();
      const campo = (id, padrao, rot) => `<label>${rot}<input data-n="${id}" value="${esc(n[id] || '')}" placeholder="${esc(padrao)}" autocomplete="off"></label>`;
      const btnApagar = (tipo, id, rot) => `<button type="button" class="ghost danger" data-hide="${tipo}:${esc(id)}" title="Apagar ${esc(rot)}" aria-label="Apagar ${esc(rot)}">${ico('trash', 16)} Apagar</button>`;
      const visiveis = DRAWERS_TODAS.filter(d => !oc.g.includes(d.id));
      const apagadas = [...DRAWERS_TODAS.filter(d => oc.g.includes(d.id)).map(d => ['g', d.id, d.name + ' (gaveta inteira)']),
        ...DRAWERS_TODAS.filter(d => !oc.g.includes(d.id)).flatMap(d => d.subs.filter(x => oc.f.includes(x.m)).map(x => ['f', x.m, x.name + ' (' + d.name + ')']))];
      return `<section class="cf-sec" data-nt><h3>Nomes das funções</h3>
        <p class="log" style="margin-top:0">Dê o nome que fizer sentido para o seu setor. O sistema usa o nome novo nos menus, telas, relatórios e exportações. Deixe em branco para manter o nome padrão.</p>
        <div class="cf-g"><h4>Palavra "EPI"</h4><div class="cf-nm"><label>Singular<input id="cf-t1" value="${esc(r.termo || '')}" placeholder="EPI" autocomplete="off"></label><label>Plural<input id="cf-t2" value="${esc(r.termos || '')}" placeholder="EPIs" autocomplete="off"></label></div>
          <p class="log">Ex.: <b>Peça</b> / <b>Peças</b> troca "Planilha EPI" por "Planilha Peça", "Gastos em EPIs" por "Gastos em Peças" e assim por diante, inclusive no controle mensal. Se o plural ficar em branco, o sistema monta sozinho.</p></div>
        ${visiveis.map(d => `<div class="cf-g"><h4>${esc(d.name)}</h4><div class="cf-nm">${campo('d:' + d.id, d.name, 'Nome da gaveta')}${campo('c:' + d.id, d.short, 'Nome curto (barra do celular)')}</div>
          <div class="bar" style="padding:0;min-height:0;margin:.3rem 0">${btnApagar('g', d.id, 'gaveta ' + d.name)}</div>
          ${d.subs.filter(x => !oc.f.includes(x.m)).map(x => `<div class="cf-nm">${campo('s:' + x.m, x.name, esc(x.name))}${btnApagar('f', x.m, 'função ' + x.name)}</div>`).join('')}</div>`).join('')}
        <div class="bar" style="padding:0;gap:.6rem;flex-wrap:wrap;min-height:0"><button id="cf-nsalvar">Salvar nomes</button><button id="cf-npadrao" class="ghost">Voltar aos nomes padrão</button></div>
        <p class="log">A página recarrega ao salvar para aplicar os nomes em todas as telas.</p>
        ${apagadas.length ? `<div class="cf-g"><h4>Apagadas</h4><p class="log" style="margin-top:0">Somem do menu e do início, mas os dados ficam guardados no aparelho e voltam se você restaurar.</p>
          ${apagadas.map(([t, id, nome]) => `<div class="cf-row"><span><b>${esc(nome)}</b></span><button type="button" class="ghost" data-show="${t}:${esc(id)}">Restaurar</button></div>`).join('')}</div>` : ''}</section>`;
    }

    function draw() {
      const perfis = CFO.perfis(), eu = CFO.usuario() || {}, adm = CFO.admin();
      const epi = perfis.filter(p => p.perfil !== 'setor'), outros = perfis.filter(p => p.perfil === 'setor');
      const setores = [...new Map(outros.map(p => [p.setor, p.setorNome])).entries()];
      body.innerHTML = `<div class="cf">
        <section class="cf-sec"><h3>Aparência</h3>
          <div class="cf-row"><span>${ico(escuro() ? 'moon' : 'sun')}<b>Tema</b><small>${escuro() ? 'Escuro' : 'Claro'}</small></span>
          <button id="cf-tema" class="ghost">Mudar para ${escuro() ? 'claro' : 'escuro'}</button></div></section>
        ${adm ? `<section class="cf-sec"><h3>Almoxarifado de EPIs</h3>
          <p class="log" style="margin-top:0">Usam os dados e a nuvem do sistema. Toque num perfil para limitar o que ele pode fazer. O perfil principal tem sempre acesso total.</p>
          <div class="cf-lista">${epi.map(p => linha(p, eu)).join('')}</div></section>
          <section class="cf-sec"><h3>Outros setores</h3>
          <p class="log" style="margin-top:0">Cada setor trabalha isolado, com dados próprios só no aparelho dele: sem nuvem, sem WL e sem as requisições e planilhas do almoxarifado de EPIs.</p>
          ${setores.map(([id, nome]) => `<div class="cf-setor"><h4><span>${esc(nome || 'Setor')}</span><button class="ghost cf-rn" data-rs="${esc(id)}" aria-label="Renomear setor ${esc(nome)}" title="Renomear setor">✎</button></h4>
            <div class="cf-lista">${outros.filter(p => p.setor === id).map(p => linha(p, eu)).join('')}</div></div>`).join('') || '<p class="empty">Nenhum perfil de outro setor ainda.</p>'}</section>
          <div class="bar" style="padding:0;margin-bottom:1rem;min-height:0"><button id="cf-novo">${ico('plus', 16)} Novo perfil</button></div>`
        : (eu.isolado ? secSetor(eu) + (eu.jr ? secNomes() : '') : `<section class="cf-sec"><h3>Perfis</h3><p class="log" style="margin-top:0">Só o perfil principal cria, exclui e limita perfis.</p></section>`)}</div>`;
      body.querySelector('#cf-tema').onclick = () => { CFO.tema.alternar(); draw(); };
      if (!adm) {
        if (!eu.isolado) return;
        body.querySelector('#cf-bk').onclick = () => CFO.setorBackup.exportar();
        const fl = body.querySelector('#cf-fl'); body.querySelector('#cf-rs').onclick = () => fl.click();
        fl.onchange = () => { const f = fl.files[0]; fl.value = ''; CFO.setorBackup.restaurar(f); };
        body.querySelector('#cf-ap').onclick = () => CFO.setorBackup.apagar();
        const ns = body.querySelector('#cf-nsalvar'); if (!ns) return;
        ns.onclick = () => {
          const n = {}; body.querySelectorAll('[data-n]').forEach(i => { const v = i.value.trim(); if (v) n[i.dataset.n] = v; });
          CFO.rotulosSalvar({ n, termo: body.querySelector('#cf-t1').value.trim(), termos: body.querySelector('#cf-t2').value.trim() });
        };
        const muda = (lista, tipo, id, add) => { const o = CFO.ocultos(), k = tipo === 'g' ? 'g' : 'f'; o[k] = add ? [...o[k], id] : o[k].filter(x => x !== id); CFO.ocultosSalvar(o); };
        body.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => {
          const [t, id] = b.dataset.hide.split(':'), d = t === 'g' ? DRAWERS_TODAS.find(x => x.id === id) : null, f = t === 'f' ? DRAWERS_TODAS.flatMap(x => x.subs).find(x => x.m === id) : null;
          const nome = d ? 'a gaveta "' + d.name + '" inteira (com todas as funções dela)' : 'a função "' + (f || {}).name + '"';
          if (confirm('Apagar ' + nome + '?\n\nEla some do menu e do início deste setor. Os dados ficam guardados e você pode restaurar aqui mesmo depois.')) muda(null, t, id, true);
        });
        body.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { const [t, id] = b.dataset.show.split(':'); muda(null, t, id, false); });
        body.querySelector('#cf-npadrao').onclick = () => { if (confirm('Voltar todos os nomes ao padrão do sistema?')) CFO.rotulosLimpar(); };
        return;
      }
      body.querySelector('#cf-novo').onclick = novo;
      body.querySelectorAll('.cf-perfil').forEach(el => el.onclick = e => { if (e.target.closest('.cf-del')) return; const p = CFO.perfis().find(x => x.chave === el.dataset.k); if (p && !p.admin) editar(p); });
      body.querySelectorAll('.cf-del').forEach(b => b.onclick = e => { e.stopPropagation(); excluir(b.dataset.del); });
      body.querySelectorAll('.cf-rn').forEach(b => b.onclick = () => { const nome = (setores.find(x => x[0] === b.dataset.rs) || [])[1] || ''; CFO.dialog('Renomear setor', `<label>Nome do setor<input name="n" required value="${esc(nome)}" autocomplete="off"></label>`, d => { CFO.setorRenomear(b.dataset.rs, d.n); draw(); }); });
    }

    function excluir(chave) {
      const p = CFO.perfis().find(x => x.chave === chave); if (!p) return;
      if (!confirm(`Excluir o perfil "${p.nome}"? Ele não conseguirá mais entrar.` + (p.perfil === 'setor' ? '\n\nSe for o último perfil do setor, os dados do setor neste aparelho também serão apagados.' : ''))) return;
      CFO.perfilExcluir(chave); draw();
    }

    function novo() {
      const setores = [...new Set(CFO.perfis().filter(p => p.perfil === 'setor').map(p => p.setorNome).filter(Boolean))];
      CFO.dialog('Novo perfil',
        `<label>Nome do perfil<input name="nome" required autocomplete="off"></label>
         <label>Login (usado para entrar)<input name="login" required autocomplete="off" autocapitalize="none" spellcheck="false"></label>
         <label>Senha<input name="senha" type="password" required autocomplete="new-password"></label>
         <label>Divisão<select name="tipo"><option value="epi">Almoxarifado de EPIs</option><option value="setor">Outros setores (isolado, sem nuvem)</option></select></label>
         <div id="np-setor" hidden>
           <label>Nome do setor<input name="setor" list="np-sl" autocomplete="off" placeholder="Ex.: Ferramentaria"></label><datalist id="np-sl">${setores.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
           <label class="cf-ck"><input type="checkbox" name="jr"><span>Administrador júnior (pode dar outros nomes às funções e à palavra "EPI")</span></label>
           <p class="log">Esse perfil começa com tudo vazio, só neste aparelho: não sincroniza com a nuvem nem com o WL. Dá para exportar as planilhas em Excel/PDF normalmente.</p>
         </div>
         <p class="log" id="np-nota">O perfil novo começa com tudo liberado (menos Registros). Depois toque nele para limitar.</p>`,
        async d => {
          const setor = d.tipo === 'setor';
          const erro = await CFO.perfilNovo(d.nome, d.login, d.senha, setor ? { setorNome: d.setor, jr: !!d.jr } : {}); if (erro) return alert(erro);
          draw(); const p = CFO.perfis().find(x => x.chave === CFO.norm(d.nome)); if (p) editar(p);
        });
      const dlg = document.body.lastElementChild, sel = dlg.querySelector('[name=tipo]'), caixa = dlg.querySelector('#np-setor'), nome = dlg.querySelector('[name=setor]');
      sel.onchange = () => { const so = sel.value === 'setor'; caixa.hidden = !so; nome.required = so; dlg.querySelector('#np-nota').hidden = so; };
    }

    // Tela de permissões de um perfil
    function editar(p) {
      CFO.open('Permissões · ' + p.nome, b => {
        const pm = CFO.permsDe(p.nome, p.perfil), bloq = new Set(pm.bloquear || []), semE = new Set(pm.semEditar || []), semA = new Set(pm.semApagar || []);
        const nivel = k => semE.has(k) ? 'leitura' : semA.has(k) ? 'semapagar' : 'total';
        const grupos = DRAWERS.map(d => `<div class="cf-g"><h4>${esc(d.name)}</h4>${d.subs.map(s => `<label class="cf-ck"><input type="checkbox" data-a="${s.m}" ${bloq.has(s.m) ? '' : 'checked'}><span>${esc(s.name)}</span></label>`).join('')}</div>`).join('');
        b.innerHTML = `<div class="cf">
          ${p.perfil === 'setor' ? `<section class="cf-sec"><h3>Outro setor</h3><label>Nome do setor<input id="cf-sn" value="${esc(p.setorNome)}" autocomplete="off"></label>
            <label class="cf-ck"><input type="checkbox" id="cf-jr" ${p.jr ? 'checked' : ''}><span>Administrador júnior (pode dar outros nomes às funções e à palavra "EPI")</span></label>
            <p class="log">Este perfil não sincroniza com a nuvem nem recebe os dados do almoxarifado de EPIs: os dados dele ficam só no aparelho em que ele entrar. Nuvem, WL e Registros nunca aparecem para ele.</p></section>` : ''}
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
          CFO.perfilPerms(p.chave, { bloquear, semEditar, semApagar });
          if (p.perfil === 'setor') { const sn = b.querySelector('#cf-sn').value.trim(); if (sn && sn !== p.setorNome) CFO.setorRenomear(p.setor, sn); CFO.perfilJr(p.chave, b.querySelector('#cf-jr').checked); }
          CFO.close(); draw();
        };
        b.querySelector('#cf-padrao').onclick = () => { if (!confirm('Voltar às permissões padrão deste perfil?')) return; const d = CFO.store.get('perfis', {}) || {}; if (d.perms) { delete d.perms[p.chave]; CFO.store.set('perfis', d); } CFO.close(); draw(); };
        const ps = b.querySelector('#cf-senha'); if (ps) ps.onclick = () => CFO.dialog('Nova senha de ' + p.nome, '<label>Nova senha<input name="s" type="password" required autocomplete="new-password"></label>', d => { if (d.s) { CFO.perfilSenha(p.chave, d.s); alert('Senha trocada.'); } });
      });
    }
    draw();
  };
})();
