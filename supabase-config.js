/* ===== Configuração do Supabase =====
   anonKey: Project Settings > API Keys > "anon" (começa com eyJ...) ou "publishable" (começa com sb_publishable_...)
            NUNCA coloque senha nem a chave service_role aqui. */
window.CFO_SUPABASE = {
  url: 'https://eoojyzantstnuyblsarp.supabase.co',
  anonKey: 'sb_publishable_rJszWt19jXqkMc1LJNLgEA_lvCAzScJ',
  bucket: 'Nuvem',
  pasta: '',        // '' = pega tudo do bucket (inclusive subpastas)
  pastaEnvio: 'CFO', // pasta criada dentro do bucket ao enviar
  arquivos: []      // deixe vazio: o sistema lista sozinho
};
