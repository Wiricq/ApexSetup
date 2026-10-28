// ===== Налаштування спільної бази (Supabase) =====
// Supabase → Project Settings → API: скопіюйте "Project URL" та ключ "anon public".
// Ключ anon публічний за задумом: доступ захищають правила (RLS) із supabase-setup.sql.
// НІКОЛИ не вставляйте сюди ключ service_role!
// Поки поля порожні — сайт працює по-старому, у localStorage.
window.APEX_DB_CONFIG = {
  url: "https://gjvrzyvbllrsdfdjxcya.supabase.co/rest/v1/",      // наприклад: "https://abcdefgh.supabase.co"
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdnJ6eXZibGxyc2RmZGp4Y3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTY1NzYsImV4cCI6MjEwNjk3MjU3Nn0.0C7vCDFZOZouBxxzunoZWkg8LhI70SedySslIg6hkQ4"   // довгий рядок, що починається з "eyJ..."
};