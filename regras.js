/* ===== Regras (Configurações > Regras) =====
   Regras que o sistema aplica sozinho, ajustáveis por empresa/setor (ficam salvas junto dos dados e sincronizam como o resto).
   Regra 1 - "Mês de uso da requisição": um tipo de requisição (ex.: MENSAL) conta N meses à frente do mês em que foi aprovada.
     Ex.: MENSAL aprovada em outubro, com +1 -> conta como novembro. Padrão = MENSAL +1 (igual ao que o Controle mensal já fazia).
   Para usar a regra numa tela nova: CFO.regras.mesUso(requisicao) devolve o mês (AAAAMM) já com a regra aplicada.
   Para criar outro tipo de regra: guarde em CFO.store 'regras' numa chave nova (ex.: regras.prazo) e acrescente o bloco em config-perfis.js. */
(() => {
  const PADRAO = [{ tipo: 'MENSAL', meses: 1, ativa: true }];
  let cache = null, quando = 0;
  const bruta = () => { const v = CFO.store.get('regras', null); return v && Array.isArray(v.mes) ? v.mes : PADRAO.map(x => ({ ...x })); };
  const ativas = () => {                                  // lê no máximo 1x por segundo (as telas chamam isto linha a linha)
    const n = Date.now(); if (cache && n - quando < 1000) return cache;
    cache = bruta().filter(x => x.ativa && +x.meses).map(x => ({ tipo: CFO.motivo.canon(x.tipo), meses: Math.trunc(+x.meses) })); quando = n; return cache;
  };
  const soma = (k, n) => { const t = Math.floor(k / 100) * 12 + (k % 100 - 1) + n; return Math.floor(t / 12) * 100 + (t % 12) + 1; };
  const desloc = r => { const m = CFO.motivo.canon(r.motivo), x = ativas().find(a => a.tipo === m); return x ? x.meses : 0; };
  // Mês de uso (AAAAMM) já com a regra; 0 se a data da requisição não for entendida
  const mesUso = r => { const k = CFO.periodo.key(r.mes); return k ? soma(k, desloc(r)) : 0; };
  CFO.regras = {
    PADRAO, lista: bruta, desloc, mesUso,
    salvar(mes) { const v = CFO.store.get('regras', null) || {}; v.mes = mes; CFO.store.set('regras', v); cache = null; },
    // Texto "AAAA-MM" do mês de uso (o seletor de anos da tela entende este formato)
    texto: r => { const k = mesUso(r); return k ? Math.floor(k / 100) + '-' + (k % 100) : r.mes; },
    rotulo: k => CFO.periodo.NOMES[k % 100 - 1].slice(0, 3) + '/' + Math.floor(k / 100),
    // Igual a CFO.periodo.fn / test, mas pelo mês de uso
    fn: (m, y) => r => { if (!m && !y) return true; const k = mesUso(r); return !!k && (!m || k % 100 === +m) && (!y || Math.floor(k / 100) === +y); },
    test(root) { return this.fn(root.querySelector('#fm').value, root.querySelector('#fa').value); }
  };
})();
