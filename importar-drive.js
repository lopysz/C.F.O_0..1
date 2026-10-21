/* ===== Importar pasta do Google Drive =====
   Abre o seletor do Google Drive, escolhe uma pasta e envia as planilhas dela (subpastas inclusas) para CFO.importFiles.
   Precisa de uma configuração única (Client ID e API Key do Google Cloud) - salva só neste navegador. */
(() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const cfg = () => CFO.store.get('drive', { clientId: '', apiKey: '' });
  const loadScript = src => new Promise((ok, no) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('Sem acesso a ' + src)); document.head.append(s);
  });

  CFO.driveConfig = () => CFO.dialog('Configurar Google Drive', `
    <p class="log" style="margin-top:0">Configuração única (fica salva só neste navegador). No <b>Google Cloud Console</b>: crie um projeto, ative as APIs <b>Google Drive API</b> e <b>Google Picker API</b>, crie uma <b>chave de API</b> e um <b>ID do cliente OAuth (Aplicativo da Web)</b> e adicione o endereço onde este sistema está hospedado em "Origens JavaScript autorizadas".</p>
    <label>ID do cliente (Client ID)<input name="clientId" value="${CFO.esc(cfg().clientId)}" placeholder="xxxx.apps.googleusercontent.com"></label>
    <label>Chave de API (API Key)<input name="apiKey" value="${CFO.esc(cfg().apiKey)}"></label>`,
    d => CFO.store.set('drive', { clientId: d.clientId.trim(), apiKey: d.apiKey.trim() }));

  const token = clientId => new Promise((ok, no) => {
    google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE,
      callback: r => r.access_token ? ok(r.access_token) : no(new Error(r.error || 'Acesso negado')) }).requestAccessToken();
  });
  const pickFolder = (tk, key) => new Promise(ok => {
    const v = new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes('application/vnd.google-apps.folder');
    new google.picker.PickerBuilder().addView(v).setOAuthToken(tk).setDeveloperKey(key).setTitle('Escolha a pasta com as planilhas')
      .setCallback(r => { if (r.action === 'picked') ok(r.docs[0]); else if (r.action === 'cancel') ok(null); }).build().setVisible(true);
  });
  const api = (tk, url) => fetch(url, { headers: { Authorization: 'Bearer ' + tk } }).then(r => { if (!r.ok) throw new Error('Drive respondeu ' + r.status); return r; });

  // Lista planilhas da pasta e subpastas (até 4 níveis) e baixa como File
  async function baixar(tk, pasta, nivel = 0, out = []) {
    const q = encodeURIComponent(`'${pasta}' in parents and trashed=false`);
    const lista = (await (await api(tk, `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=200&fields=files(id,name,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json()).files || [];
    for (const f of lista) {
      if (f.mimeType === 'application/vnd.google-apps.folder') { if (nivel < 3) await baixar(tk, f.id, nivel + 1, out); continue; }
      const sheet = f.mimeType === 'application/vnd.google-apps.spreadsheet';
      if (!sheet && !/\.(xlsx|xls|csv)$/i.test(f.name)) continue;
      const url = sheet ? `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}` : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`;
      out.push(new File([await (await api(tk, url)).blob()], sheet ? f.name + '.xlsx' : f.name));
    }
    return out;
  }

  CFO.importDrive = async btn => {
    const c = cfg();
    if (!c.clientId || !c.apiKey) { CFO.driveConfig(); return; }
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Conectando...';
    try {
      await Promise.all([loadScript('https://apis.google.com/js/api.js'), loadScript('https://accounts.google.com/gsi/client')]);
      await new Promise(ok => gapi.load('picker', ok));
      const tk = await token(c.clientId), pasta = await pickFolder(tk, c.apiKey);
      if (!pasta) return;
      btn.textContent = 'Baixando...';
      const files = await baixar(tk, pasta.id);
      await CFO.importFiles(files);
    } catch (e) { alert('Não foi possível importar do Drive: ' + (e.message || e) + '\nConfira a configuração (botão ⚙) e a conexão.'); }
    finally { btn.disabled = false; btn.textContent = txt; }
  };
})();
