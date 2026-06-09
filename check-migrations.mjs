import pg from 'pg';
const { Client } = pg;
const c = new Client({ connectionString: 'postgresql://app_local_user:djK6F3s!SSN0@127.0.0.1:5432/app_local_db' });
await c.connect();
const r = await c.query(`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 8`);
for (const row of r.rows) {
  console.log(`${row.finished_at ? 'OK ' : 'PEND'} ${row.rolled_back_at ? 'RB' : '  '} ${row.migration_name}`);
}
await c.end();
