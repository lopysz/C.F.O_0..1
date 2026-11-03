/* ===== Ícones padronizados (substitui emojis por desenhos de linha, iguais aos do menu) =====
   Como funciona: qualquer emoji que aparecer na tela (em botões, textos, mensagens do assistente...) é trocado
   automaticamente pelo desenho correspondente da lista ICONES abaixo. O desenho herda a cor do texto.
   - Para mudar um desenho: edite o caminho em ICONES.
   - Para trocar qual emoji vira qual desenho: edite o mapa EMOJI_PARA_ICONE.
   - Para usar em código novo: CFO.ico('nuvem') devolve o <svg> pronto.
   - Para impedir a troca num trecho: coloque data-noico no elemento. */
(() => {
  const ICONES = {
    pasta: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    nuvem: '<path d="M7 18a4 4 0 01-.6-7.95A5.5 5.5 0 0117 9a4.5 4.5 0 011 9z"/>',
    arquivo: '<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/>',
    planilha: '<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4M9.5 13h5M9.5 16.5h5"/>',
    proibido: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
    alerta: '<path d="M12 4l9.5 16h-19z"/><path d="M12 10v4.5M12 17.3v.1"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    okcirculo: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    xcirculo: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    mapa: '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    trocar: '<path d="M8 5v14M8 5L5 8M8 5l3 3M16 19V5M16 19l-3-3M16 19l3-3"/>',
    local: '<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    ampulheta: '<path d="M7 4h10M7 20h10M8 4v3.5L12 12l-4 4.5V20M16 4v3.5L12 12l4 4.5V20"/>',
    ponto: '<circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/>',
    caixa: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    fogo: '<path d="M12 21a6 6 0 006-6c0-3.5-2.5-5-3.5-8-2 1.5-3 3.5-3 5.5-1.2-.7-1.8-2-2-3.5C7.5 10 6 12 6 15a6 6 0 006 6z"/>',
    dinheiro: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.6-.8-1.6-1.2-2.8-1.2-1.7 0-2.8.9-2.8 2s1 1.7 2.8 2 2.8.9 2.8 2-1.1 2-2.8 2c-1.2 0-2.2-.4-2.8-1.2M12 6.5V8M12 16v1.5"/>',
    desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    robo: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V5M9 13v1M15 13v1M2.5 13v2M21.5 13v2"/><circle cx="12" cy="4" r="1"/>',
    conversa: '<path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1h-8l-4.5 3.5V16H5a1 1 0 01-1-1V6a1 1 0 011-1z"/>',
    baixar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>',
    enviar: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/>',
    pausar: '<path d="M9 5v14M15 5v14"/>',
    parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    cursor: '<path d="M6 4l5.5 15 2.3-6.2L20 10.5z"/>',
    lapis: '<path d="M4 20l1-4L16.5 4.5a2 2 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
    teclado: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
    janela: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    desvio: '<path d="M4 17h3c3 0 4-10 8-10h5M17 4l3 3-3 3M4 7h3c1.2 0 2 .8 2.8 2M14 15c.6.8 1.3 2 3 2h3M17 14l3 3-3 3"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    lixeira: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    livro: '<path d="M4 5.5A1.5 1.5 0 015.5 4H12v16H5.5A1.5 1.5 0 014 18.5zM12 4h6.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H12"/>',
    salvar: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    biblioteca: '<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/><path d="M16 6.5l3.5-1 3 13-3.5 1z"/>',
    quebra: '<path d="M10 4a2 2 0 014 0v2h4v4h-2a2 2 0 000 4h2v6H4v-4h2a2 2 0 000-4H4V6h6z"/>',
    teste: '<path d="M9 4h6M10 4v6l-5 9a1 1 0 00.9 1.5h12.2A1 1 0 0019 19l-5-9V4M8 15h8"/>',
    impressora: '<path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    grafico: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
    filtro: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>',
    busca: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    cubo: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    bandeja: '<path d="M4 13l2.5-7h11L20 13v6H4z"/><path d="M4 13h4.5l1 2h5l1-2H20"/>',
    lampada: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
    camadas: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
    atualizar: '<path d="M20 11a8 8 0 00-14.5-3.5L4 9M4 4v5h5M4 13a8 8 0 0014.5 3.5L20 15M20 20v-5h-5"/>',
    prancheta: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>',
    girar: '<path d="M20 12a8 8 0 11-2.6-5.9M20 4v5h-5"/>',
    centro: '<circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'
  };
  // cor própria para alguns (o resto herda a cor do texto)
  const COR = { proibido: 'bad', xcirculo: 'bad', alerta: 'warn', okcirculo: 'good', ok: 'good', fogo: 'warn' };
  const PONTO = { '🟢': 'good', '🔴': 'bad', '🟡': 'warn' };
  const EMOJI_PARA_ICONE = {
    '📁': 'pasta', '☁': 'nuvem', '📄': 'arquivo', '📗': 'planilha', '⛔': 'proibido', '🚫': 'proibido',
    '⚠': 'alerta', '✅': 'okcirculo', '✔': 'ok', '✓': 'ok', '❌': 'xcirculo', '✕': 'x', '🗺': 'mapa', '⇅': 'trocar',
    '📍': 'local', '⏳': 'ampulheta', '📦': 'caixa', '🔥': 'fogo', '💰': 'dinheiro', '↩': 'desfazer', '↶': 'desfazer',
    '🤖': 'robo', '💭': 'conversa', '⬇': 'baixar', '📥': 'bandeja', '⬆': 'enviar', '⏸': 'pausar', '⏹': 'parar', '▶': 'play',
    '🖱': 'cursor', '👆': 'cursor', '✍': 'lapis', '✎': 'lapis', '📝': 'lapis', '⌨': 'teclado', '🪟': 'janela', '🔀': 'desvio',
    '⚙': 'engrenagem', '🗑': 'lixeira', '📖': 'livro', '💾': 'salvar', '📚': 'biblioteca', '🧩': 'quebra', '🧪': 'teste',
    '🖨': 'impressora', '📷': 'camera', '📈': 'grafico', '🎚': 'filtro', 'ℹ': 'info', '🔎': 'busca', '🔍': 'busca',
    '🧊': 'cubo', '💡': 'lampada', '🏗': 'camadas', '🔄': 'atualizar', '📋': 'prancheta', '↻': 'girar', '⌖': 'centro'
  };
  const RX = /(?:[\u{1F000}-\u{1FAFF}]|[\u2190-\u21FF\u2300-\u23FF\u25B6\u2600-\u27BF\u2B00-\u2BFF])\uFE0F?/gu;
  const TESTE = new RegExp(RX.source, 'u');
  const PULAR = 'script,style,svg,textarea,noscript,title,[data-noico]';
  const chave = e => e.replace(/\uFE0F/g, '');

  function icone(nome, cor) {
    const d = ICONES[nome]; if (!d) return '';
    const c = cor || COR[nome];
    return `<svg class="ic${c ? ' ic-' + c : ''}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  }
  function doEmoji(e) {
    const k = chave(e);
    if (PONTO[k]) return icone('ponto', PONTO[k]);
    return EMOJI_PARA_ICONE[k] ? icone(EMOJI_PARA_ICONE[k]) : '';
  }
  CFO.ico = icone;

  function tratarTexto(no) {
    const t = no.nodeValue; if (!t || !TESTE.test(t)) return;
    const pai = no.parentElement; if (!pai || pai.closest(PULAR)) return;
    if (pai.closest('option')) {                       // dentro de lista suspensa não cabe desenho: tira o emoji
      const novo = t.replace(RX, e => (doEmoji(e) || PONTO[chave(e)] ? '' : e)).replace(/^\s+/, ''); if (novo !== t) no.nodeValue = novo; return;
    }
    let ultimo = 0, achou = false; const frag = document.createDocumentFragment();
    t.replace(RX, (e, i) => {
      const svg = doEmoji(e); if (!svg) return e;
      achou = true;
      if (i > ultimo) frag.append(t.slice(ultimo, i));
      const m = document.createElement('template'); m.innerHTML = svg; frag.append(m.content);
      ultimo = i + e.length; return e;
    });
    if (!achou) return;
    if (ultimo < t.length) frag.append(t.slice(ultimo));
    no.replaceWith(frag);
  }
  function varrer(no) {
    if (no.nodeType === 3) return tratarTexto(no);
    if (no.nodeType !== 1 || no.closest?.(PULAR)) return;
    const w = document.createTreeWalker(no, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement && !n.parentElement.closest(PULAR) && TESTE.test(n.nodeValue) ? 1 : 3 });
    const lista = []; while (w.nextNode()) lista.push(w.currentNode);
    lista.forEach(tratarTexto);
    (no.matches?.('[placeholder]') ? [no] : []).concat([...no.querySelectorAll?.('[placeholder]') || []]).forEach(e => {
      const p = e.getAttribute('placeholder'); if (TESTE.test(p)) e.setAttribute('placeholder', p.replace(RX, '').trim());
    });
  }
  new MutationObserver(ms => ms.forEach(m => {
    if (m.type === 'characterData') tratarTexto(m.target);
    else m.addedNodes.forEach(varrer);
  })).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  varrer(document.body);
})();
