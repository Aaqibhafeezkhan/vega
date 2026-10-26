// Applies supabase/migrations/*.sql in order, once each. Usage: npm run db:migrate
// Needs SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD in .env (admin only, never shipped to the client).
// TLS is verified against Supabase's published root CA (scripts/certs).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))

const ref = process.env.SUPABASE_PROJECT_REF
const password = process.env.SUPABASE_DB_PASSWORD
if (!ref || !password) {
  console.error('Set SUPABASE_PROJECT_REF and SUPABASE_DB_PASSWORD in .env')
  process.exit(1)
}
const ca = readFileSync(join(root, 'scripts', 'certs', 'supabase-prod-ca-2021.crt'), 'utf8')

// Direct host is IPv6-only on the free plan; fall back to the shared pooler (region unknown, so try each).
const regions = process.env.SUPABASE_REGION
  ? [process.env.SUPABASE_REGION]
  : ['ap-south-1', 'us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-southeast-2', 'eu-west-2', 'us-east-2', 'ap-northeast-1', 'sa-east-1', 'ca-central-1']
const candidates = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
  ...regions.map((r) => ({ host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}` }))
]

async function connect() {
  for (const c of candidates) {
    const client = new pg.Client({ ...c, password, database: 'postgres', ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 6000 })
    try {
      await client.connect()
      console.log(`connected via ${c.host}`)
      return client
    } catch (err) {
      console.log(`  ${c.host}: ${err.message}`)
      await client.end().catch(() => {})
    }
  }
  throw new Error('could not reach the database; set SUPABASE_REGION or check the password')
}

const client = await connect()
await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`)
await client.query(`alter table public._migrations enable row level security`) // no policies: invisible to API roles
const dir = join(root, 'supabase', 'migrations')
const done = new Set((await client.query('select name from public._migrations')).rows.map((r) => r.name))
for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if (done.has(f)) continue
  console.log(`applying ${f}`)
  await client.query('begin')
  try {
    await client.query(readFileSync(join(dir, f), 'utf8'))
    await client.query('insert into public._migrations(name) values ($1)', [f])
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  }
}
console.log('database up to date')
await client.end()
