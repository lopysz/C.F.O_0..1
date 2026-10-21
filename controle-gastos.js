/* ===== Jurídico Operacional > Controle de gastos =====
   Tabelas e gráficos a partir das Requisições. Duas visões: Financeiro (R$) e Logística (quantidades).
   Filtros: contrato, solicitante, mês e ano. */
(() => {
  const esc = CFO.esc, P = CFO.periodo;
  const R$ = v => 'R$ ' + (+v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const N = v => (+v || 0).toLocaleString('pt-BR');
  const numCmp = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
  const valor = r => r.itens.reduce((a, i) => a + i.qa * i.preco, 0), qtd = r => r.itens.reduce((a, i) => a + i.qa, 0);

  // Agrupa requisições por chave -> { nome, reqs, valor, qtd }
  const agrupar = (reqs, chave, nome = chave) => {
    const m = new Map();
    reqs.forEach(r => { const k = chave(r), x = m.get(k) || { k, nome: nome(r), n: 0, valor: 0, qtd: 0 }; x.n++; x.valor += valor(r); x.qtd += qtd(r); m.set(k, x); });
    return [...m.values()];
  };

  // Gráfico de colunas (SVG): [{rot, v}]
  const colunas = (dados, fmt) => {
    if (!dados.length) return '<p class="empty">Sem dados no período.</p>';
    const W = Math.max(320, dados.length * 56), H = 220, base = 170, top = 20, max = Math.max(...dados.map(d => d.v), 1), bw = Math.min(36, (W - 20) / dados.length - 10);
    return `<div class="tw chart"><svg viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Gráfico de gastos por mês">
      <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>
      ${dados.map((d, i) => { const x = 10 + i * (W - 20) / dados.length + ((W - 20) / dados.length - bw) / 2, h = (base - top) * d.v / max;
        return `<g><title>${esc(d.rot)}: ${fmt(d.v)}</title><rect x="${x}" y="${base - h}" width="${bw}" height="${Math.max(h, 1)}" rx="4" fill="var(--accent)"/>
        <text x="${x + bw / 2}" y="${base - h - 5}" text-anchor="middle" font-size="10" fill="var(--text)">${esc(fmt(d.v, true))}</text>
        <text x="${x + bw / 2}" y="${base + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(d.rot)}</text></g>`; }).join('')}</svg></div>`;
  };
  // Gráfico de barras horizontais (ranking): [{rot, v}]
  const barras = (dados, fmt) => {
    if (!dados.length) return '<p class="empty">Sem dados no período.</p>';
    const max = Math.max(...dados.map(d => d.v), 1);
    return `<div class="hbars">${dados.map(d => `<div class="hb"><span class="hl" title="${esc(d.rot)}">${esc(d.rot)}</span>
      <span class="ht"><i style="width:${Math.max(2, 100 * d.v / max)}%"></i></span><span class="hv">${fmt(d.v)}</span></div>`).join('')}</div>`;
  };
  const curto = v => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' mi' : v >= 1e3 ? (v / 1e3).toFixed(1).replace('.', ',') + ' mil' : String(Math.round(v));

  CFO.modules.controle_gastos = body => {
    let aba = 'fin', fc = '', fs = '';
    body.innerHTML = `<div class="tabs"><button id="tfin" class="ghost">Financeiro</button><button id="tlog" class="ghost">Logística</button></div>
      <div class="bar"><select id="fc"></select><select id="fs"></select>${P.html()}</div>
      <div id="out"></div>`;
    const $ = s => body.querySelector(s);
    const todas = () => CFO.store.get('requisicoes', []);

    function opcoes() {                     // listas de contrato e solicitante (solicitante depende do contrato escolhido)
      const rs = todas(), cts = agrupar(rs, r => r.contrato, r => r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')).sort((a, b) => numCmp(a.k, b.k));
      $('#fc').innerHTML = '<option value="">Todos os contratos</option>' + cts.map(c => `<option value="${esc(c.k)}" ${c.k === fc ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
      const sols = [...new Set(rs.filter(r => !fc || r.contrato === fc).map(r => r.sol || '(sem nome)'))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      if (fs && !sols.includes(fs)) fs = '';
      $('#fs').innerHTML = '<option value="">Todos os solicitantes</option>' + sols.map(s => `<option ${s === fs ? 'selected' : ''}>${esc(s)}</option>`).join('');
      P.fill(body, rs);
    }

    function render() {
      $('#tfin').classList.toggle('on', aba === 'fin'); $('#tlog').classList.toggle('on', aba === 'log');
      const ok = P.test(body), rs = todas().filter(r => ok(r) && (!fc || r.contrato === fc) && (!fs || (r.sol || '(sem nome)') === fs));
      const fin = aba === 'fin', campo = fin ? 'valor' : 'qtd', fmt = (v, c) => fin ? (c ? curto(v) : R$(v)) : N(v), rot = fin ? 'Valor' : 'Itens retirados';
      const totV = rs.reduce((a, r) => a + valor(r), 0), totQ = rs.reduce((a, r) => a + qtd(r), 0);

      const meses = agrupar(rs, r => P.key(r.mes), r => P.label(r.mes)).sort((a, b) => a.k - b.k);
      const porContrato = agrupar(rs, r => r.contrato, r => r.contrato + (r.contratoNome ? ' - ' + r.contratoNome : '')).sort((a, b) => b[campo] - a[campo]);
      const porSol = agrupar(rs, r => r.sol || '(sem nome)').sort((a, b) => b[campo] - a[campo]);
      const itens = new Map();
      rs.forEach(r => r.itens.forEach(i => { const x = itens.get(i.item) || { nome: i.item, qtd: 0, valor: 0 }; x.qtd += i.qa; x.valor += i.qa * i.preco; itens.set(i.item, x); }));
      const porItem = [...itens.values()].sort((a, b) => b[campo] - a[campo]);

      const cards = fin
        ? [['Total gasto', R$(totV)], ['Requisições', rs.length], ['Ticket médio', R$(rs.length ? totV / rs.length : 0)], ['Maior mês', meses.length ? R$(Math.max(...meses.map(m => m.valor))) : '-']]
        : [['Itens retirados', N(totQ)], ['Requisições', rs.length], ['Itens por requisição', rs.length ? (totQ / rs.length).toFixed(1).replace('.', ',') : '0'], ['Contratos atendidos', new Set(rs.map(r => r.contrato)).size]];

      const tab = (cab, linhas) => `<div class="tw"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('') || `<tr><td colspan="${cab.length}" class="empty">Sem dados</td></tr>`}</tbody></table></div>`;
      const top = (lista, n = 8) => lista.slice(0, n).map(x => ({ rot: x.nome, v: x[campo] }));

      $('#out').innerHTML = `<div class="cards">${cards.map(d => `<div class="card"><small>${d[0]}</small><b>${d[1]}</b></div>`).join('')}</div>
        <h3 class="sec">${fin ? 'Gasto' : 'Retirada de itens'} por mês</h3>${colunas(meses.map(m => ({ rot: m.nome, v: m[campo] })), fmt)}
        ${tab(['Mês', 'Requisições', 'Itens', ...(fin ? ['Valor', 'Variação'] : [])], meses.map((m, i) => {
          const ant = meses[i - 1], v = ant && ant.valor ? (m.valor - ant.valor) / ant.valor * 100 : null;
          return `<tr><td>${esc(m.nome)}</td><td>${m.n}</td><td>${N(m.qtd)}</td>${fin ? `<td>${R$(m.valor)}</td><td>${v === null ? '-' : (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%'}</td>` : ''}</tr>`; }))}
        ${fc ? '' : `<h3 class="sec">Por contrato</h3>${barras(top(porContrato), fmt)}
          ${tab(['Contrato', 'Req.', 'Itens', ...(fin ? ['Valor'] : [])], porContrato.map(x => `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${N(x.qtd)}</td>${fin ? `<td>${R$(x.valor)}</td>` : ''}</tr>`))}`}
        ${fs ? '' : `<h3 class="sec">Por solicitante</h3>${barras(top(porSol), fmt)}
          ${tab(['Solicitante', 'Req.', 'Itens', ...(fin ? ['Valor'] : [])], porSol.map(x => `<tr><td>${esc(x.nome)}</td><td>${x.n}</td><td>${N(x.qtd)}</td>${fin ? `<td>${R$(x.valor)}</td>` : ''}</tr>`))}`}
        <h3 class="sec">${fin ? 'EPIs de maior gasto' : 'EPIs mais retirados'}</h3>${barras(top(porItem), fmt)}
        ${tab(['EPI', 'Qtd', ...(fin ? ['Valor'] : [])], porItem.map(x => `<tr><td>${esc(x.nome)}</td><td>${N(x.qtd)}</td>${fin ? `<td>${R$(x.valor)}</td>` : ''}</tr>`))}`;
    }

    $('#tfin').onclick = () => { aba = 'fin'; render(); };
    $('#tlog').onclick = () => { aba = 'log'; render(); };
    $('#fc').onchange = e => { fc = e.target.value; opcoes(); render(); };
    $('#fs').onchange = e => { fs = e.target.value; render(); };
    $('#fm').onchange = $('#fa').onchange = render;
    opcoes(); render();
  };
})();
