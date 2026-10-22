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

  const USUARIOS = {
    rafael:   { nome: 'Rafael',   h: '17b0efd9ab3c75a398574ee900efc9a26b4207fa6222007502cacce62e238078' },
    aprendiz: { nome: 'Aprendiz', h: '8018fc30c1a0af469ac65a3551d2f65cf7155fc855982718d3c441acc63a2b63' },
    robson:   { nome: 'Robson',   h: 'cef4d6fa0dd2858f97018eb8f3372b368bd6ebd65500d2cd2687c1cdb1cb5e0b' }
  };
  const SK = 'cfo_login';
  const atual = () => { try { const u = localStorage.getItem(SK); return USUARIOS[u] ? u : null; } catch { return null; } };

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
    localStorage.setItem(SK, u); ov.hidden = true; document.body.classList.remove('locked');
    sair.textContent = 'Sair · ' + USUARIOS[u].nome; sair.hidden = false;
  };
  const bloquear = () => {
    localStorage.removeItem(SK); while (CFO.screens.length) CFO.close();
    ov.hidden = false; document.body.classList.add('locked'); sair.hidden = true;
    ov.querySelector('#lg-p').value = ''; ov.querySelector('#lg-e').textContent = '';
    setTimeout(() => ov.querySelector('#lg-u').focus(), 50);
  };
  sair.onclick = bloquear;

  let falhas = 0;
  ov.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    const u = ov.querySelector('#lg-u').value.trim().toLowerCase(), p = ov.querySelector('#lg-p').value, err = ov.querySelector('#lg-e'), btn = ev.target.querySelector('button');
    const ok = USUARIOS[u] && sha256(u + ':' + p + ':cfo') === USUARIOS[u].h;
    if (ok) { falhas = 0; entrar(u); return; }
    falhas++; err.textContent = 'Login ou senha incorretos.'; btn.disabled = true;
    await new Promise(r => setTimeout(r, Math.min(500 * falhas, 5000)));   // atraso crescente contra tentativas em sequência
    btn.disabled = false; ov.querySelector('#lg-p').select();
  };

  const u = atual();
  if (u) entrar(u); else bloquear();
})();
