/* ===== Importar planilhas do Supabase Storage (bucket público) =====
   Baixa cada .xlsx/.xls/.csv do bucket e entrega ao mesmo importador das planilhas locais (CFO.importFiles). */
CFO.importSupabase = async () => {
  const c = window.CFO_SUPABASE || {};
  if (!c.url || !c.bucket) { alert('Preencha url e bucket no arquivo supabase-config.js'); return; }
  if (!c.anonKey && !(c.arquivos && c.arquivos.length)) { alert('Falta a chave "anon" no supabase-config.js (Project Settings > API Keys). Ela é necessária para listar os arquivos do bucket.'); return; }
  const base = (/^https?:/.test(c.url) ? c.url : `https://${c.url}.supabase.co`).replace(/\/+$/, ''), bucket = encodeURIComponent(c.bucket);
  const H = c.anonKey ? { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey } : {};
  const ehPlanilha = n => /\.(xlsx|xls|csv)$/i.test(n) && !n.startsWith('~$');
  const caminhos = [], vistos = [];
  try {
    if (c.arquivos && c.arquivos.length) c.arquivos.forEach(n => caminhos.push((c.pasta ? c.pasta.replace(/\/+$/, '') + '/' : '') + n));
    else {
      const listar = async prefix => {                    // lista a pasta e entra nas subpastas
        const r = await fetch(`${base}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }) });
        if (!r.ok) throw new Error('Listagem bloqueada (' + r.status + ')');
        for (const o of await r.json()) {
          const p = (prefix ? prefix + '/' : '') + o.name;
          if (o.id === null) await listar(p); else { vistos.push(p); if (ehPlanilha(o.name)) caminhos.push(p); }
        }
      };
      await listar((c.pasta || '').replace(/^\/+|\/+$/g, ''));
    }
  } catch (e) {
    alert('Não consegui listar os arquivos do bucket.\n' + e.message + '\n\nSolução: crie a política de leitura (SELECT) no Storage, ou preencha "arquivos" no supabase-config.js.');
    return;
  }
  if (!caminhos.length) {
    alert(vistos.length
      ? 'O bucket tem ' + vistos.length + ' arquivo(s), mas nenhum .xlsx/.xls/.csv:\n' + vistos.slice(0, 10).join('\n')
      : 'A listagem voltou VAZIA. Normalmente é falta da política de leitura (SELECT) no Storage para a role anon, ou o nome do bucket está diferente do que está no Supabase.');
    return;
  }
  const files = [], falhas = [];
  for (const p of caminhos) {
    const enc = p.split('/').map(encodeURIComponent).join('/');
    let blob = null, erro = '';
    for (const [tipo, hdr] of [['public', {}], ['authenticated', H]]) {   // 1º público, 2º com a chave (política SELECT)
      try {
        const r = await fetch(`${base}/storage/v1/object/${tipo}/${bucket}/${enc}`, { headers: hdr });
        if (r.ok) { blob = await r.blob(); break; }
        erro += `${tipo}: ${r.status} `;
      } catch (e) { erro += `${tipo}: ${e.message} `; }
    }
    if (blob) files.push(new File([blob], p.split('/').pop())); else falhas.push(p + '  (' + erro.trim() + ')');
  }
  await CFO.importFiles(files);
  if (falhas.length) alert('Não foi possível baixar:\n' + falhas.join('\n'));
};
