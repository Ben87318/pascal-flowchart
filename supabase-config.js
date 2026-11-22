// Конфиг связи с базой — ОБЛАКО (Supabase Cloud, работает у всех с интернетом).
//
// Публичный (anon) ключ хранить во фронтенде — НОРМАЛЬНО для Supabase,
// доступ всё равно режется RLS-политиками (только своё).
// Секретный ключ (sb_secret_...) сюда НЕ класть никогда.

export const SUPABASE_URL = 'https://twcewvnnhtjsarmleujw.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_FQ4B0RRvmDPmWciVZenq7w_IGlZZY97';
