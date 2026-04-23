import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select column_name from information_schema.columns where table_name='tenant_admin_users' order by ordinal_position`);
console.log('cols:', r.rows.map(x=>x.column_name).join(','));
try {
  const t = await c.query(`select id, sessions_invalidated_at from tenant_admin_users where lower(email)=$1 and status=$2 limit 1`, ['jdouglas@sthughshigh.org','active']);
  console.log('OK rows=',t.rows.length);
} catch(e) { console.log('ERR:', e.message, e.code); }
await c.end();
