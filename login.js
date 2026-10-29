/* ===== Tela de login (antes do sistema) =====
   ATENÇÃO: é uma "porta de entrada" no próprio navegador. Ela impede o uso casual, mas NÃO é segurança de verdade:
   quem entende de programação consegue contornar. Segurança real exige login no servidor (Supabase Auth).
   As senhas não ficam escritas aqui, só o resultado de uma conta matemática delas (hash SHA-256).
   Para trocar/criar usuário: gere o hash de  usuario(minúsculo):senha:cfo  e coloque na lista USUARIOS. */
(() => {
  const sha256 = msg => {
    const b = new TextEncoder().encode(msg), l = b.length, pr = [];
    for (let n = 2; pr.length < 64; n++) if (pr.every(p => n % p)) pr.push(n);
    const K = pr.map(p => Math.floor((Math.cbrt(p) % 1) * 2 ** 32)), H = pr.slice(0, 8).map(p => Math.floor((Math.sqrt(p) % 1) * 2 ** 32));
    const n = ((l + 9 + 63) >> 6) << 6, w = new Uint8Array(n); w.set(b); w[l] = 0x80;
    const dv = new DataView(w.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l * 8 / 2 ** 32));
    const rr = (x, k) => (x >>> k) | (x << (32 - k)), W = new Uint32Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = W[i - 15], c = W[i - 2]; W[i] = (W[i - 16] + (rr(a, 7) ^ rr(a, 18) ^ (a >>> 3)) + W[i - 7] + (rr(c, 17) ^ rr(c, 19) ^ (c >>> 10))) >>> 0; }
      let [a, bb, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0, t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
      }
      [a, bb, c, d, e, f, g, h].forEach((v, i) => H[i] = (H[i] + v) >>> 0);
    }
    return H.map(v => v.toString(16).padStart(8, '0')).join('');
  };
  CFO.sha256 = sha256;

  // ver: true = enxerga quem está online (bolinha verde e avisos). Os outros perfis aparecem na lista, mas não veem.
  const USUARIOS = {
    rafael:   { nome: 'Rafael',   perfil: 'total', ver: true, admin: true, h: '17b0efd9ab3c75a398574ee900efc9a26b4207fa6222007502cacce62e238078' },
    aprendiz: { nome: 'Aprendiz', perfil: 'aprendiz', h: '8018fc30c1a0af469ac65a3551d2f65cf7155fc855982718d3c441acc63a2b63' },
    robson:   { nome: 'Robson',   perfil: 'total', h: 'cef4d6fa0dd2858f97018eb8f3372b368bd6ebd65500d2cd2687c1cdb1cb5e0b' },
    wellington: { nome: 'Wellington', perfil: 'total', h: '28f3db7567fab1c00379dff3e8ec466f6211f9f9f93d9ec2b8d9f9459b5d8ad7' },
    // Perfil "leve" (computador antigo): mesmas permissões do total, mas o mapa 3D é desenhado só com linhas e a tela perde sombras/animações.
    // Entra como  demax,  rafael demax  ou  rafaeldemax  (mesma senha)
    'demax': { nome: 'Rafael Demax', perfil: 'leve', ver: true, h: '38afeb57271c48f0dfcd5ef4bd4a0f2f3fb5c4fa504cf09d642497ec31137076' },
    'rafael demax': { nome: 'Rafael Demax', perfil: 'leve', ver: true, h: 'bd5d314f3433d989b86e358801769c29427647836fa97c79e203a757131822b0' },
    'rafaeldemax': { nome: 'Rafael Demax', perfil: 'leve', ver: true, h: '3d26bd30872e56e352e359eb15f13bbd68a4f84886f7704e38fe54a175a25ef7' },
    // João: outro setor isolado (dados só no aparelho), administrador júnior, com o Mapa livre. Entra como  joao  ou  joão  (mesma senha)
    'joao': { nome: 'João', perfil: 'setor', setor: 'joao', jr: true, h: '8cf088d2920c2ba9302e1c0791ff56e7690ee3405a4813ee247ab8714ad9db4e' },
    'joão': { nome: 'João', perfil: 'setor', setor: 'joao', jr: true, h: 'e706fe1c90ae77b1c640a1b20916a465c42a005f588073db8461cfab7ec4a68d' }
  };
  /* ----- Perfis criados/excluídos/limitados na engrenagem ⚙ (só o perfil principal, admin: true, mexe) -----
     Guardados em 'perfis' = { novos: { login: { nome, perfil: 'custom', h } }, excluidos: [nome normalizado], perms: { nome normalizado: { bloquear, semApagar, semEditar } } }
     ATENÇÃO: continua sendo controle na tela (no navegador), não segurança de servidor. */
  // setores = { <id>: { nome } }: "Outros setores" (cada um tem dados próprios, só no aparelho; perfil: 'setor', setor: <id>, jr: true = administrador júnior)
  const dadosPerfis = () => { const d = CFO.store.get('perfis', null) || {}; return { novos: d.novos || {}, excluidos: d.excluidos || [], perms: d.perms || {}, setores: { joao: { nome: 'Setor do João' }, ...(d.setores || {}) } }; };
  const US = () => {
    const d = dadosPerfis(), out = {};
    Object.entries(USUARIOS).forEach(([id, x]) => { if (x.admin || !d.excluidos.includes(CFO.norm(x.nome))) out[id] = x; });
    Object.entries(d.novos).forEach(([id, x]) => { if (!out[id]) out[id] = x; });
    return out;
  };
  const SK = 'cfo_login';
  const atual = () => { try { const u = localStorage.getItem(SK); return US()[u] ? u : null; } catch { return null; } };


  /* ----- Permissões por perfil (valem só na tela: não são segurança de servidor) -----
     total    = pode tudo
     aprendiz = usa Ferramentas e Almoxarifado, mas NÃO apaga Planilha EPI, Contratos e Requisições; a gaveta Jurídico aparece sem funções
     Para criar um perfil novo, acrescente aqui e use  perfil: 'nome'  no usuário. */
  const PERFIS = {
    total: {},
    leve: { leve: true },
    aprendiz: { bloquear: ['epis_contrato', 'controle_gastos', 'controle_mensal', 'registros'], semApagar: ['epi', 'contratos', 'requisicoes'] },
    custom: { bloquear: ['registros'] },         // perfil novo: começa com tudo liberado, menos Registros; ajuste em ⚙ > Perfis
    setor: { bloquear: ['registros'] }           // outro setor: dados próprios, sem nuvem/WL (isso é fixo, não depende desta lista)
  };
  // Permissões de um perfil: as da engrenagem (se existirem) valem no lugar das padrão
  CFO.permsDe = (nome, perfil) => { const o = dadosPerfis().perms[CFO.norm(nome)], b = PERFIS[perfil] || {}; return o ? { ...b, ...o } : b; };
  CFO.permsPadrao = perfil => PERFIS[perfil] || {};
  CFO.usuario = () => {
    const u = atual(); if (!u) return null; const x = US()[u], iso = x.perfil === 'setor';
    return { id: u, nome: x.nome, perfil: x.perfil, ver: !!x.ver, admin: !!x.admin, isolado: iso, setor: iso ? x.setor || '' : '', setorNome: iso ? (dadosPerfis().setores[x.setor] || {}).nome || '' : '', jr: iso && !!x.jr };
  };
  CFO.admin = () => !!(CFO.usuario() || {}).admin;
  CFO.leve = () => { const u = atual(), p = u && PERFIS[US()[u].perfil]; return !!(p && p.leve); };
  // Lista de perfis para a tela de Configurações (logins diferentes do mesmo nome contam como um perfil só)
  CFO.perfis = () => {
    const g = new Map(), st = dadosPerfis().setores;
    Object.entries(US()).forEach(([id, x]) => {
      const k = CFO.norm(x.nome), iso = x.perfil === 'setor', e = g.get(k) || { chave: k, nome: x.nome, perfil: x.perfil, logins: [], admin: false, custom: x.perfil === 'custom' || iso, setor: iso ? x.setor || '' : '', setorNome: iso ? (st[x.setor] || {}).nome || '' : '', jr: false };
      e.logins.push(id); e.admin = e.admin || !!x.admin; e.jr = e.jr || (iso && !!x.jr); g.set(k, e);
    });
    return [...g.values()];
  };
  CFO.setorRenomear = (id, nome) => { const d = dadosPerfis(); if (d.setores[id] && String(nome).trim()) { d.setores[id].nome = String(nome).trim(); CFO.store.set('perfis', d); } };
  CFO.perfilJr = (chave, jr) => { const d = dadosPerfis(); Object.values(d.novos).forEach(x => { if (CFO.norm(x.nome) === chave && x.perfil === 'setor') x.jr = !!jr; }); CFO.store.set('perfis', d); };
  // extra = { setorNome, jr }: com setorNome o perfil é de "Outros setores" (cria o setor se ainda não existir)
  CFO.perfilNovo = async (nome, login, senha, extra = {}) => {
    login = String(login).trim().toLowerCase(); const d = dadosPerfis();
    if (!nome.trim() || !login || !senha) return 'Preencha nome, login e senha.';
    if (US()[login]) return 'Já existe um perfil com esse login.';
    if (CFO.perfis().some(p => p.chave === CFO.norm(nome))) return 'Já existe um perfil com esse nome.';
    const x = { nome: nome.trim(), perfil: 'custom', h: sha256(login + ':' + senha + ':cfo') }, sn = String(extra.setorNome || '').trim();
    if (sn) {
      let id = Object.keys(d.setores).find(i => CFO.norm(d.setores[i].nome) === CFO.norm(sn));
      if (!id) { id = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); d.setores[id] = { nome: sn }; }
      x.perfil = 'setor'; x.setor = id; if (extra.jr) x.jr = true;
    }
    d.novos[login] = x; CFO.store.set('perfis', d); return '';
  };
  CFO.perfilSenha = (chave, senha) => { const d = dadosPerfis(); Object.entries(d.novos).forEach(([id, x]) => { if (CFO.norm(x.nome) === chave) x.h = sha256(id + ':' + senha + ':cfo'); }); CFO.store.set('perfis', d); };
  CFO.perfilExcluir = chave => {
    const d = dadosPerfis(), setores = [];
    Object.entries(d.novos).forEach(([id, x]) => { if (CFO.norm(x.nome) === chave) { if (x.setor) setores.push(x.setor); delete d.novos[id]; } });
    setores.forEach(s => { if (!Object.values(d.novos).some(x => x.setor === s)) { delete d.setores[s]; CFO.setorApagarDados && CFO.setorApagarDados(s); } });   // último perfil do setor: some o setor e os dados dele deste aparelho
    if (!d.excluidos.includes(chave)) d.excluidos.push(chave); delete d.perms[chave]; CFO.store.set('perfis', d);
  };
  CFO.perfilPerms = (chave, perms) => { const d = dadosPerfis(); d.perms[chave] = perms; CFO.store.set('perfis', d); };
  // CFO.pode('abrir', 'controle_mensal')  |  CFO.pode('apagar', 'contratos')
  CFO.pode = (acao, area) => {
    const u = atual(), us = u && US()[u], p = us && CFO.permsDe(us.nome, us.perfil);
    if (!p) return false;
    if (area === 'mapalivre' && !(us.admin || us.perfil === 'setor')) return false;   // Mapa livre: só perfil principal e outros setores
    if (us.admin) return true;                                   // perfil principal pode tudo
    if (acao === 'abrir') return !(p.bloquear || []).includes(area);
    if (acao === 'editar') return !(p.semEditar || []).includes(area);
    if (acao === 'apagar') return !(p.semApagar || []).includes(area) && !(p.semEditar || []).includes(area);
    return true;
  };

  // Espaço de dados do perfil logado: '' = dados principais (nuvem) | 's_<setor>' = setor isolado (só neste aparelho). Definido aqui, antes de qualquer outro arquivo ler dados.
  const espacoDe = x => x && x.perfil === 'setor' ? 's_' + (x.setor || 'sem') : '';
  CFO.espaco = (() => { const u = atual(); return u ? espacoDe(US()[u]) : ''; })();

  const ov = document.createElement('div'); ov.id = 'login';
  ov.innerHTML = `<div class="lg-top"><h1>Bem vindo</h1><h2>C.F.O</h2></div>
    <form class="lg-card" autocomplete="on">
      <input id="lg-u" name="username" type="text" placeholder="Login" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
      <input id="lg-p" name="password" type="password" placeholder="Senha" autocomplete="current-password" required>
      <p id="lg-e" class="lg-err" role="alert"></p>
      <button type="submit">Entrar</button>
    </form>`;
  document.body.append(ov);

  const sair = document.createElement('button'); sair.className = 'ghost'; sair.id = 'sair';
  const topo = document.querySelector('.topbtns'); if (topo) topo.append(sair);

  const entrar = u => {
    localStorage.setItem(SK, u);
    if (espacoDe(US()[u]) !== CFO.espaco) { location.reload(); return; }   // mudou de espaço de dados (principal <-> setor): recarrega limpo
    ov.hidden = true; document.body.classList.remove('locked'); document.body.classList.toggle('leve', CFO.leve());
    sair.textContent = 'Sair · ' + US()[u].nome + (CFO.espaco ? ' · ' + ((dadosPerfis().setores[US()[u].setor] || {}).nome || 'outro setor') : ''); sair.hidden = false; CFO.onUser?.(); window.dispatchEvent(new Event('cfo-user'));
  };
  const bloquear = () => {
    localStorage.removeItem(SK);
    if (CFO.espaco) { location.reload(); return; }                            // saindo de um setor isolado: recarrega para limpar tudo da tela
    document.body.classList.remove('leve'); while (CFO.screens.length) CFO.close();
    ov.hidden = false; document.body.classList.add('locked'); sair.hidden = true;
    ov.querySelector('#lg-p').value = ''; ov.querySelector('#lg-e').textContent = ''; CFO.onUser?.(); window.dispatchEvent(new Event('cfo-user'));
    setTimeout(() => ov.querySelector('#lg-u').focus(), 50);
  };
  sair.onclick = bloquear;

  let falhas = 0;
  ov.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const u = ov.querySelector('#lg-u').value.trim().toLowerCase(), p = ov.querySelector('#lg-p').value, err = ov.querySelector('#lg-e'), btn = ev.target.querySelector('button');
    const ok = US()[u] && sha256(u + ':' + p + ':cfo') === US()[u].h;
    if (ok) { falhas = 0; entrar(u); return; }
    falhas++; err.textContent = 'Login ou senha incorretos.'; btn.disabled = true;
    await new Promise(r => setTimeout(r, Math.min(500 * falhas, 5000)));   // atraso crescente contra tentativas em sequência
    btn.disabled = false; ov.querySelector('#lg-p').select();
  };

  const u = atual();
  if (u) entrar(u); else bloquear();
})();
