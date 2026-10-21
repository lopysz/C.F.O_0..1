/* ===== Importar pasta: distribui cada planilha para a função certa =====
   Reconhece pelo conteúdo (cabeçalhos) e, em empate, pelo nome do arquivo. Lê todas as abas. */
CFO.importFiles = async files => {
  const mods = Object.values(CFO.modules).filter(m => m.score), lines = [];
  const list = [...files].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name) && !f.name.startsWith('~$'));
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
      if (!best) { lines.push([name, 'Tipo de planilha não reconhecido']); continue; }
      const r = best.importData(s.data);
      lines.push([name, `${best.cfg.title}: ${r.add} novo(s)` + (r.dup ? `, ${r.dup} duplicado(s) ignorado(s)` : '')]);
    }
  }
  if (!lines.length) lines.push(['Nenhuma planilha (.xlsx, .xls, .csv) encontrada', '']);
  CFO.open('Resultado da importação', body => {
    body.innerHTML = `<div class="tw"><table><thead><tr><th>Arquivo</th><th>Resultado</th></tr></thead><tbody>${lines.map(l => `<tr><td>${CFO.esc(l[0])}</td><td>${CFO.esc(l[1])}</td></tr>`).join('')}</tbody></table></div>`;
  });
};
