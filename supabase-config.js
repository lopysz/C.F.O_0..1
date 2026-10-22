/* ===== Configuração do Supabase (preencha) =====
   url:     Project Settings > API > Project URL        (ex.: https://abcdxyz.supabase.co)
   anonKey: Project Settings > API > chave "anon public" (NUNCA use a service_role aqui)
   bucket:  nome do bucket do Storage onde estão as planilhas
   pasta:   subpasta dentro do bucket ('' = raiz)
   arquivos: (opcional) lista de nomes, caso a listagem automática seja bloqueada. Ex.: ['EPI.xlsx','Contratos.xlsx'] */
window.CFO_SUPABASE = {
  url: '',
  anonKey: '',
  bucket: '',
  pasta: '',
  arquivos: []
};
