/* ===== Valor dos EPIs (agora é a coluna "Valor (R$)" da Planilha EPI; a gaveta "Valores dos EPIs" foi apagada) =====
   - O valor de cada EPI fica na própria linha da Planilha EPI (campo "valor"), antes da coluna Estoque.
   - Linha sem valor: é preenchida SOZINHA, uma vez, com o valor da tabela antiga (se havia) ou com o preço da requisição mais recente que tem o item.
     Depois de preenchido o valor não muda mais sozinho: para aumentar ou diminuir, edite na planilha (lápis ou engrenagem).
   - Este arquivo continua fornecendo CFO.preco(item de requisição) para os cálculos de gasto: vale o preço da própria requisição;
     se vier vazio/zero, usa o "Valor" da Planilha EPI (a linha do mesmo item/tamanho; senão o mesmo EPI em outro tamanho; senão a tabela antiga).
   - 'valores_epi' (tabela antiga) só é LIDA, como reserva e para trazer os valores que já estavam guardados.
   Para usar em outro lugar: CFO.valorEpi('nome do item') devolve o número (ou null). */
(() => {
  const norm = CFO.norm, LS = 'valores_epi';
  const cmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const chave = nome => norm(CFO.baseEpi(nome));            // tamanhos contam juntos: "Botina (42)" e "Botina (43)" = "Botina"

  // Preenche o "Valor" das linhas da Planilha EPI que estão sem valor. Devolve true se mudou alguma.
  function fixar() {
    const epi = CFO.store.get('epi', []);
    const falta = epi.filter(e => e && e.item && !(+e.valor > 0)); if (!falta.length) return false;
    const antigo = CFO.store.get(LS, {}) || {}, ultimo = new Map(), achar = CFO.casarEpi(epi.filter(e => e && e.item));
    CFO.store.get('requisicoes', []).filter(r => r && r.itens).sort((a, b) => cmp(b.id, a.id)).forEach(r => r.itens.forEach(i => {   // mais recente primeiro
      if (!(+i.preco > 0)) return;
      const m = achar(i.item), k = chave(m ? m.item : i.item); if (k && !ultimo.has(k)) ultimo.set(k, +i.preco);
    }));
    let mudou = false;
    falta.forEach(e => { const k = chave(e.item), v = +antigo[k] > 0 ? +antigo[k] : ultimo.get(k); if (v > 0) { e.valor = Math.round(v * 100) / 100; mudou = true; } });
    if (mudou) {
      CFO.store.set('epi', epi); CFO.preco.limpar();
      try { document.dispatchEvent(new Event('cfo-sync')); } catch { /* sem tela aberta */ }      // a Planilha EPI aberta relê os dados
    }
    return mudou;
  }

  // Preço de um item de requisição para os cálculos de gasto
  let cache = null, quando = 0;
  const tabela = () => {
    const agora = Date.now(); if (cache && agora - quando < 1500) return cache;
    const epi = CFO.store.get('epi', []).filter(e => e && e.item), base = new Map();
    epi.forEach(e => { const k = chave(e.item); if (k && +e.valor > 0 && !base.has(k)) base.set(k, +e.valor); });
    cache = { achar: CFO.casarEpi(epi), base, antigo: CFO.store.get(LS, {}) || {}, memo: new Map() }; quando = agora;
    return cache;
  };
  CFO.preco = i => {
    const p = +i.preco; if (p > 0) return p;
    const t = tabela(); let v = t.memo.get(i.item);
    if (v === undefined) {
      const m = t.achar(i.item); v = m && +m.valor > 0 ? +m.valor : 0;
      if (!v) { const k = chave(m ? m.item : i.item); v = t.base.get(k) || +t.antigo[k] || 0; }
      t.memo.set(i.item, v);
    }
    return v;
  };
  CFO.preco.limpar = () => { cache = null; };

  // Preenche sozinho (sem precisar abrir a tela), pouco depois de carregar e quando chegam dados novos da nuvem
  let espera = null;
  const auto = () => { clearTimeout(espera); espera = setTimeout(() => { try { if (CFO.usuario && CFO.usuario()) { fixar(); CFO.preco.limpar(); } } catch { /* sem dados ainda */ } }, 2500); };
  document.addEventListener('cfo-sync', auto); window.addEventListener('cfo-user', auto); auto();

  CFO.valorEpi = nome => {
    const epi = CFO.store.get('epi', []).filter(e => e && e.item), n = norm(nome), k = chave(nome);
    const x = epi.find(e => norm(e.item) === n && +e.valor > 0) || epi.find(e => chave(e.item) === k && +e.valor > 0);
    return x ? +x.valor : null;
  };
})();
