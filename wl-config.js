/* ===== Configuração do WL (somente leitura) =====
   Endereço e chave PÚBLICA (publishable) do Supabase do WL: é a mesma chave que o próprio site do WL usa no navegador.
   NUNCA coloque senha, token de login nem chave service_role aqui. O sistema só LÊ do WL, nunca grava. */
window.CFO_WL = {
  url: 'https://uvdeggkpanefzfugbcai.supabase.co',
  key: 'sb_publishable_lmpHsrMcwU5m7tONJBTuXA_feZTewwf',
  tabela: 'requisitions',     // requisições
  catalogo: 'epi_catalog',    // nomes e preços dos EPIs (ligados pelo código epi_code)
  diasAuto: 45,               // sincronização automática busca os últimos N dias (a completa busca tudo)
  minutosAuto: 30             // de quanto em quanto tempo atualiza sozinho enquanto o sistema estiver aberto
};
