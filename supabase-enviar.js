/* ===== Enviar dados para o Supabase Storage (bucket > pasta) =====
   A "pasta" no Supabase nasce sozinha no primeiro envio (pasta = prefixo do caminho do arquivo).
   Envia um backup .json com TODOS os dados do sistema (EPI, contratos, requisições, metas, etc.).
   Cada envio cria um arquivo novo com data e hora; nada é sobrescrito. */
CFO.supaEnviar = async (caminho, blob, tipo) => {
  const c = window.CFO_SUPABASE || {};
  if (!c.url || !c.bucket || !c.anonKey) throw new Error('Preencha url, bucket e anonKey no supabase-config.js');
  const base = (/^https?:/.test(c.url) ? c.url : `https://${c.url}.supabase.co`).replace(/\/+$/, '');
  const enc = caminho.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${base}/storage/v1/object/${encodeURIComponent(c.bucket)}/${enc}`, {
    method: 'POST',
    headers: { apikey: c.anonKey, Authorization: 'Bearer ' + c.anonKey, 'Content-Type': tipo || blob.type || 'application/octet-stream' },
    body: blob
  });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch {} throw new Error(`${r.status} ${m}`.trim()); }
};

CFO.enviarBackup = async () => {
  const c = window.CFO_SUPABASE || {}, pasta = (c.pastaEnvio || 'CFO').replace(/^\/+|\/+$/g, '');
  const dados = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('cfo:')) dados[k.slice(4)] = CFO.store.get(k.slice(4), null);
  }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const nome = `backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  const corpo = JSON.stringify({ sistema: 'C.F.O', geradoEm: d.toISOString(), dados });
  try {
    await CFO.supaEnviar(`${pasta}/${nome}`, new Blob([corpo], { type: 'application/json' }), 'application/json');
    alert(`Enviado!\n${c.bucket}/${pasta}/${nome}\n(${Object.keys(dados).length} conjuntos de dados)`);
  } catch (e) {
    alert('Não consegui enviar.\n' + e.message + '\n\nSe for 401/403: falta a política de INSERT no Storage (veja as instruções).');
  }
};
document.getElementById('env').onclick = () => { if (confirm('Enviar um backup de todos os dados para o Supabase?')) CFO.enviarBackup(); };
