/* ===== Importar do Google Drive por link =====
   Cole o link de uma pasta (ou de uma planilha) compartilhada como "Qualquer pessoa com o link - Leitor".
   Não precisa de login nem de Client ID: só de uma Chave de API (configuração única, salva só neste navegador).
   Lê as planilhas da pasta e subpastas (até 4 níveis) e envia para CFO.importFiles. */
(() => {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const FOLDER = 'application/vnd.google-apps.folder', SHEET = 'application/vnd.google-apps.spreadsheet';
  const key = () => (CFO.store.get('drive', {}).apiKey || '').trim();

  CFO.driveConfig = depois => CFO.dialog('Chave do Google Drive', `
    <p class="log" style="margin-top:0">Configuração única (fica salva só neste navegador). No <b>Google Cloud Console</b>: crie um projeto, ative a <b>Google Drive API</b> e crie uma <b>chave de API</b>. Não precisa de ID do cliente nem de login. Dica: em "Restrições de aplicativo" limite a chave ao endereço onde este sistema está hospedado.</p>
    <label>Chave de API (API Key)<input name="apiKey" value="${CFO.esc(key())}" placeholder="AIza..."></label>`,
    d => { CFO.store.set('drive', { apiKey: d.apiKey.trim() }); if (depois && d.apiKey.trim()) depois(); });

  const idDoLink = t => {
    t = String(t || '').trim();
    const m = t.match(/\/(?:folders|d)\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/);
    return m ? m[1] : /^[\w-]{20,}$/.test(t) ? t : null;
  };
  const motivo = s => s === 400 ? 'chave de API inválida' : s === 403 || s === 404
    ? 'sem permissão ou não encontrado. Confira se o compartilhamento está como "Qualquer pessoa com o link" (Leitor) e se a Google Drive API está ativa na chave'
    : 'o Drive respondeu ' + s;
  const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(motivo(r.status)); return r; };
  const q = (k, extra = '') => `supportsAllDrives=true&includeItemsFromAllDrives=true&key=${encodeURIComponent(k)}${extra}`;

  // Baixa uma planilha (Google Sheets vira .xlsx); devolve null para outros tipos de arquivo
  async function arquivo(f, k) {
    const sheet = f.mimeType === SHEET;
    if (!sheet && !/\.(xlsx|xls|csv)$/i.test(f.name)) return null;
    const url = sheet ? `${API}/${f.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}&key=${encodeURIComponent(k)}` : `${API}/${f.id}?alt=media&${q(k)}`;
    return new File([await (await get(url)).blob()], sheet ? f.name + '.xlsx' : f.name);
  }
  async function baixar(pasta, k, nivel = 0, out = []) {
    let token = '';
    do {
      const qs = encodeURIComponent(`'${pasta}' in parents and trashed=false`);
      const r = await (await get(`${API}?q=${qs}&pageSize=200&fields=nextPageToken,files(id,name,mimeType)&${q(k)}${token ? '&pageToken=' + token : ''}`)).json();
      for (const f of r.files || []) {
        if (f.mimeType === FOLDER) { if (nivel < 3) await baixar(f.id, k, nivel + 1, out); continue; }
        const a = await arquivo(f, k); if (a) out.push(a);
      }
      token = r.nextPageToken || '';
    } while (token);
    return out;
  }

  const pedirLink = () => new Promise(ok => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog"><h3>Importar do Google Drive</h3>
      <label>Link da pasta ou da planilha<input name="link" required placeholder="https://drive.google.com/drive/folders/..." value="${CFO.esc(CFO.store.get('drive_link', ''))}"></label>
      <p class="log" style="margin-top:0">No Drive: botão direito na pasta &gt; Compartilhar &gt; Acesso geral &gt; "Qualquer pessoa com o link" como <b>Leitor</b> &gt; Copiar link.</p>
      <div class="row"><button value="cancel" class="ghost" formnovalidate>Cancelar</button><button value="ok">Importar</button></div></form>`;
    d.onclose = () => { ok(d.returnValue === 'ok' ? d.querySelector('input').value : null); d.remove(); };
    document.body.append(d); d.showModal();
  });
  const aviso = txt => { const e = document.createElement('div'); e.textContent = txt; e.style.cssText = 'position:fixed;left:50%;bottom:1.2rem;transform:translateX(-50%);background:var(--panel2);border:1px solid var(--accent);border-radius:10px;padding:.6rem 1rem;z-index:99'; document.body.append(e); return () => e.remove(); };

  CFO.importDrive = async () => {
    const k = key();
    if (!k) { CFO.driveConfig(() => CFO.importDrive()); return; }
    const link = await pedirLink(); if (link === null) return;
    const id = idDoLink(link);
    if (!id) { alert('Não reconheci esse link. Cole o link de compartilhamento da pasta ou da planilha do Google Drive.'); return; }
    CFO.store.set('drive_link', link.trim());
    const fim = aviso('Baixando do Drive...');
    try {
      const meta = await (await get(`${API}/${id}?fields=id,name,mimeType&${q(k)}`)).json();
      const files = meta.mimeType === FOLDER ? await baixar(id, k) : [await arquivo(meta, k)].filter(Boolean);
      fim(); await CFO.importFiles(files);
    } catch (e) { fim(); alert('Não foi possível importar do Drive: ' + (e.message || e)); }
  };
})();
