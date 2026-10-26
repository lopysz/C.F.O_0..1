/* ===== Almoxarifado Operacional > Histórico de movimentação =====
   Lista tudo que foi movimentado na Planilha EPI (botão ⇅ de cada item e Contagem de estoque), guardado em 'epi:mov'.
   VERDE = entrada de item | VERMELHO = saída de item | AMARELO = ajuste feito pela Contagem de estoque. */
(() => {
  const esc = CFO.esc, N = v => (+v || 0).toLocaleString('pt-BR'), norm = CFO.norm, LIMITE = 500;
  const pad = n => String(n).padStart(2, '0');
  const dia = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };   // dia local (não UTC)
  const quando = iso => { const d = new Date(iso); return isNaN(d) ? '-' : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const tipo = m => m.tipo === 'Entrada' ? 'e' : m.tipo === 'Saída' ? 's' : 'c';
  const NOME = { e: 'Entrada', s: 'Saída', c: 'Ajuste (contagem)' }, COR = { e: '#15803d', s: '#b91c1c', c: '#b45309' };
  // Quantidade com sinal. Contagem: mostra a diferença quando o histórico guardou o estoque anterior ("ant")
  const qtdTxt = m => {
    const k = tipo(m);
    if (k === 'e') return '+' + N(m.qtd);
    if (k === 's') return '−' + N(m.qtd);
    if (m.ant === undefined) return 'contado ' + N(m.qtd);
    const d = m.qtd - m.ant; return (d > 0 ? '+' : d < 0 ? '−' : '') + N(Math.abs(d)) + ` (contado ${N(m.qtd)})`;
  };

  CFO.modules.historico = body => {
    const f = { q: '', t: '', de: '', ate: '' };
    body.innerHTML = `<div class="bar">
        <input id="hq" type="search" placeholder="Buscar item ou responsável...">
        <select id="ht" aria-label="Tipo de movimentação"><option value="">Entradas e saídas</option><option value="e">🟢 Só entradas</option><option value="s">🔴 Só saídas</option><option value="c">🟡 Só ajustes de contagem</option></select>
        <label class="hm-d">De <input id="hde" type="date"></label><label class="hm-d">Até <input id="hate" type="date"></label>
        <button id="hexp" class="ghost">Exportar</button></div>
      <div id="hout"></div>`;
    const $ = s => body.querySelector(s), out = $('#hout');

    const filtrar = () => CFO.store.get('epi:mov', []).filter(m => m && m.data)
      .filter(m => (!f.t || tipo(m) === f.t) && (!f.q || norm(m.item + ' ' + (m.resp || '')).includes(f.q)) && (!f.de || dia(m.data) >= f.de) && (!f.ate || dia(m.data) <= f.ate))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));

    function draw() {
      const L = filtrar(), soma = k => L.filter(m => tipo(m) === k).reduce((a, m) => a + (+m.qtd || 0), 0), n = k => L.filter(m => tipo(m) === k).length;
      const vis = L.slice(0, LIMITE);
      out.innerHTML = `<div class="cards">
          <div class="card hm-ce"><small>Entradas (${n('e')})</small><b>+${N(soma('e'))}</b></div>
          <div class="card hm-cs"><small>Saídas (${n('s')})</small><b>−${N(soma('s'))}</b></div>
          <div class="card"><small>Ajustes de contagem</small><b>${n('c')}</b></div>
          <div class="card"><small>Movimentações</small><b>${L.length}</b></div></div>
        <div class="tw"><table><thead><tr><th>Data</th><th>Item</th><th>Movimento</th><th>Quantidade</th><th>Responsável</th></tr></thead><tbody>
          ${vis.map(m => { const k = tipo(m); return `<tr class="hm-${k}"><td>${esc(quando(m.data))}</td><td>${esc(m.item)}</td><td><b>${NOME[k]}</b></td><td class="hm-q">${esc(qtdTxt(m))}</td><td>${esc(m.resp || '-')}</td></tr>`; }).join('')
            || '<tr><td colspan="5" class="empty">Nenhuma movimentação. Use o botão ⇅ de um item na Planilha EPI para registrar entradas e saídas.</td></tr>'}
        </tbody></table></div>${L.length > LIMITE ? `<p class="empty">Mostrando as ${LIMITE} mais recentes de ${L.length}. Use os filtros ou exporte para ver tudo.</p>` : ''}`;
    }

    $('#hq').oninput = e => { f.q = norm(e.target.value); draw(); };
    $('#ht').onchange = e => { f.t = e.target.value; draw(); };
    $('#hde').onchange = e => { f.de = e.target.value; draw(); };
    $('#hate').onchange = e => { f.ate = e.target.value; draw(); };

    $('#hexp').onclick = () => CFO.exportar({
      titulo: 'Exportar - Histórico de movimentação',
      itens: [{ id: 'mov', nome: 'Movimentações (conforme os filtros da tela)' }],
      run: (fmt, sel, { logo }) => {
        const L = filtrar(), cab = ['Data', 'Item', 'Movimento', 'Quantidade', 'Responsável'];
        if (fmt === 'xlsx') {
          const dados = L.map(m => { const k = tipo(m); return [quando(m.data), m.item, NOME[k], k === 'e' ? +m.qtd : k === 's' ? -m.qtd : qtdTxt(m), m.resp || '']; });
          CFO.xlsxSalvar('historico-movimentacao.xlsx', [{ nome: 'Movimentação', aoa: [cab, ...dados], cabRow: 0, cols: [18, 46, 20, 22, 24] }], { logo });
        } else {
          CFO.print(`<style>@page{size:A4 landscape;margin:10mm}.rel td,.rel th{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style><div class="rel">${CFO.cabecalhoPdf('Histórico de movimentação', logo)}<p class="meta">Gerado em ${new Date().toLocaleString('pt-BR')} · verde = entrada · vermelho = saída · amarelo = ajuste de contagem</p>
            <table><thead><tr>${cab.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${L.map(m => { const k = tipo(m), bg = { e: '#e6f6ec', s: '#fdecec', c: '#fff6e0' }[k];
              return `<tr style="background:${bg}"><td>${esc(quando(m.data))}</td><td>${esc(m.item)}</td><td style="color:${COR[k]};font-weight:700">${NOME[k]}</td><td style="color:${COR[k]};font-weight:700">${esc(qtdTxt(m))}</td><td>${esc(m.resp || '')}</td></tr>`; }).join('')}</tbody></table></div>`);
        }
      }
    });
    draw();
  };
})();
