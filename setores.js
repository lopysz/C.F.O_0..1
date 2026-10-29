/* ===== Outros setores: espaço de dados próprio, nomes das funções e backup =====
   Perfil de "Outros setores" (ex.: Ferramentaria) trabalha isolado:
   - os dados ficam só neste aparelho (CFO.espaco = 's_<id do setor>'; veja CFO.store e CFO.db em core.js): nada de nuvem, WL, requisições ou planilhas do almoxarifado de EPIs;
   - o administrador júnior do setor pode trocar o nome das funções e da palavra "EPI"; o sistema usa o nome novo em telas, relatórios e exportações.
   Os nomes ficam em 'rotulos' = { n: { 'd:a': 'Nome', 'c:a': 'Nome curto', 's:epi': 'Nome' }, termo: 'Peça', termos: 'Peças' } (dentro do espaço do setor). */
(() => {
  const E = () => CFO.espaco;
  let RC = null;                                                       // cache (os nomes só mudam depois de salvar + recarregar a página)
  const rotulos = () => RC || (RC = (E() && CFO.store.get('rotulos', null)) || { n: {} });

  // Nome de uma função/gaveta: o do setor, se ele trocou; senão o padrão
  CFO.rot = (id, padrao) => { const v = E() && (rotulos().n || {})[id]; return v && String(v).trim() ? String(v).trim() : padrao; };

  // Palavra "EPI" -> nome do setor (singular e plural)
  const plural = s => /ão$/i.test(s) ? s.replace(/ão$/i, 'ões') : /m$/i.test(s) ? s.replace(/m$/i, 'ns') : /[rz]$/i.test(s) ? s + 'es' : /l$/i.test(s) ? s.replace(/l$/i, 'is') : /s$/i.test(s) ? s : s + 's';
  let TC;
  const T = () => {
    if (TC !== undefined) return TC;
    const r = rotulos(), s = String(r.termo || '').trim();
    if (!E() || !s || /^epis?$/.test(CFO.norm(s))) return TC = null;   // vazio ou "EPI" de novo: nada a trocar
    return TC = { s, p: String(r.termos || '').trim() || plural(s) };
  };
  const RE = /\bEPIs?\b/gi, TESTE = /\bEPIs?\b/i;
  const troca = (txt, t) => String(txt).replace(RE, m => { const base = /s$/i.test(m) ? t.p : t.s; return m === m.toUpperCase() ? base.toUpperCase() : base; });
  const PULAR = 'script,style,textarea,input,select,td,[data-nt]';

  CFO.termo = {
    ativo: () => !!T(),
    t: txt => { const t = T(); return t && typeof txt === 'string' ? troca(txt, t) : txt; },
    // HTML de relatório: troca só o texto (fora de tags e fora das células de dados <td>)
    html: h => {
      const t = T(); if (!t || typeof h !== 'string') return h;
      return h.replace(/>([^<>]+)</g, (m, x, i) => (h.lastIndexOf('<td', i) > h.lastIndexOf('</td', i)) ? m : '>' + troca(x, t) + '<');
    }
  };

  // Troca nas telas (texto e dicas dos botões/campos). Só roda quando o setor definiu um nome novo: para os outros perfis não custa nada.
  if (T()) {
    const fix = n => { if (n.nodeValue && TESTE.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest(PULAR))) n.nodeValue = troca(n.nodeValue, T()); };
    const varre = raiz => {
      if (raiz.nodeType === 3) return fix(raiz);
      if (raiz.nodeType !== 1 || raiz.closest(PULAR)) return;
      const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), lista = []; while (w.nextNode()) lista.push(w.currentNode); lista.forEach(fix);
      [raiz, ...raiz.querySelectorAll('[placeholder],[title],[aria-label]')].forEach(el => {
        if (el.closest('[data-nt]')) return;
        ['placeholder', 'title', 'aria-label'].forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v && TESTE.test(v)) el.setAttribute(a, troca(v, T())); });
      });
    };
    new MutationObserver(ms => ms.forEach(m => { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(varre); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
    varre(document.body);
  }

  // Salvar / voltar ao padrão (recarrega a página para o sistema inteiro usar os nomes novos)
  CFO.rotulosSalvar = o => { CFO.store.set('rotulos', { ...o, ocultos: rotulos().ocultos }); location.reload(); };
  CFO.rotulosLimpar = () => { CFO.store.set('rotulos', { n: {}, ocultos: rotulos().ocultos }); location.reload(); };

  /* ----- Funções e gavetas apagadas (só o administrador júnior do setor) -----
     'rotulos'.ocultos = { g: [id da gaveta], f: [módulo da função] }. Some do menu, do início e do painel; os dados continuam guardados e dá para restaurar. */
  CFO.ocultos = () => { const o = (E() && rotulos().ocultos) || {}; return { g: o.g || [], f: o.f || [] }; };
  CFO.ocultosSalvar = o => { CFO.store.set('rotulos', { ...rotulos(), ocultos: { g: [...new Set(o.g)], f: [...new Set(o.f)] } }); location.reload(); };

  /* ----- Dados do setor neste aparelho ----- */
  const prefixo = id => 'cfs:' + id + ':';
  const chavesDe = id => { const r = [], p = prefixo(id); for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(p)) r.push(k); } return r; };

  // Apaga os dados de um setor (planilhas, fotos...) deste aparelho
  CFO.setorApagarDados = id => {
    chavesDe('s_' + id).forEach(k => localStorage.removeItem(k));
    try { indexedDB.deleteDatabase('cfo_s_' + id); } catch {}
  };

  CFO.setorBackup = {
    // Arquivo .json com tudo do setor (menos fotos). Não passa por nuvem nenhuma.
    exportar() {
      if (!E()) return;
      const p = prefixo(E()), dados = {}, u = CFO.usuario() || {};
      chavesDe(E()).forEach(k => { try { dados[k.slice(p.length)] = JSON.parse(localStorage.getItem(k)); } catch {} });
      const d = new Date(), z = n => String(n).padStart(2, '0');
      const nome = `backup-${CFO.norm(u.setorNome) || 'setor'}-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}.json`;
      CFO.baixar(new Blob([JSON.stringify({ sistema: 'C.F.O setor', setor: u.setorNome || '', geradoEm: d.toISOString(), dados })], { type: 'application/json' }), nome);
    },
    async restaurar(file) {
      if (!E() || !file) return;
      let j; try { j = JSON.parse(await file.text()); } catch { return alert('Arquivo inválido.'); }
      if (!j || j.sistema !== 'C.F.O setor' || typeof j.dados !== 'object') return alert('Este arquivo não é um backup de setor do C.F.O.');
      const n = Object.keys(j.dados).length;
      if (!confirm(`Restaurar ${n} conjunto(s) de dados${j.setor ? ' do setor "' + j.setor + '"' : ''}?\n\nOs dados atuais com o mesmo nome serão substituídos.`)) return;
      Object.entries(j.dados).forEach(([k, v]) => CFO.store.set(k, v));
      alert('Backup restaurado.'); location.reload();
    },
    apagar() {
      if (!E()) return;
      if (!confirm('Apagar TODOS os dados do seu setor neste aparelho (planilhas, movimentações, mapa, fotos)?\n\nFaça o backup antes: não dá para desfazer.')) return;
      if (!confirm('Tem certeza? Tudo do setor será apagado deste aparelho.')) return;
      CFO.setorApagarDados(E().slice(2)); location.reload();
    }
  };
})();
