/* ===== Importar pasta: distribui cada planilha para a função certa =====
   Reconhece pelo conteúdo (cabeçalhos, apelidos e sinônimos) e, em empate, pelo nome do arquivo. Lê todas as abas.
   Planilha que o sistema não reconhece (ou reconhece só em parte): abre a janela "Conferir colunas" para a pessoa dizer qual coluna é qual;
   a escolha fica lembrada para as próximas planilhas com o mesmo cabeçalho. */
CFO.importFiles = async files => {
  const mods = Object.values(CFO.modules).filter(m => m.score), lines = [];
  const list = [...files].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name) && !f.name.startsWith('~$'));
  let calar = false;                                       // "não perguntar das próximas" (marcado ao cancelar)
  for (const f of list) {
    let sheets;
    try { sheets = await CFO.readBook(f); } catch { lines.push([f.name, 'Não foi possível ler o arquivo']); continue; }
    const nf = CFO.norm(f.name);
    for (const s of sheets) {
      if (!s.data.length) continue;
      let best = null, top = 0;
      mods.forEach(m => {
        const raw = m.score(s.data); if (raw < 2) return;
        const pts = raw + ((m.cfg.hints || []).some(h => nf.includes(h)) ? .5 : 0);
        if (pts > top) { top = pts; best = m; }
      });
      const name = f.name + (sheets.length > 1 ? ` (${s.sheet})` : '');
      let mapa = null;
      if (!best) {                                         // não reconhecida: a pessoa escolhe a função e as colunas
        const opcoes = mods.filter(m => m.cfg && m.cfg.columns);
        if (calar || !opcoes.length || s.data.length < 2) { lines.push([name, 'Tipo de planilha não reconhecido']); continue; }
        mapa = await CFO.perguntarColunas({ nome: name, data: s.data, mods: opcoes });
        if (mapa.cancel) { if (mapa.todas) calar = true; lines.push([name, 'Tipo de planilha não reconhecido (ignorada)']); continue; }
        best = mapa.mod;
      } else if (best.cfg.columns) {                       // reconhecida: confere só se sobrou coluna sem entender
        mapa = await CFO.mapaPara(best, s.data, name);
        if (mapa.cancel) { lines.push([name, 'Importação cancelada']); continue; }
      }
      const r = best.importData(s.data, mapa);
      lines.push([name, `${best.cfg.title}: ${r.add} novo(s)` + (r.upd ? `, ${r.upd} atualizada(s)` : '') + (r.dup ? `, ${r.dup} duplicado(s) ignorado(s)` : '')]);
    }
  }
  if (!lines.length) lines.push(['Nenhuma planilha (.xlsx, .xls, .csv) encontrada', '']);
  CFO.open('Resultado da importação', body => {
    body.innerHTML = `<div class="tw"><table><thead><tr><th>Arquivo</th><th>Resultado</th></tr></thead><tbody>${lines.map(l => `<tr><td>${CFO.esc(l[0])}</td><td>${CFO.esc(l[1])}</td></tr>`).join('')}</tbody></table></div>`;
  });
};
