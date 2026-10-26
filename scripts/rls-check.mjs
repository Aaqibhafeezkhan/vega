// Verifies row-level security end to end against the live project: two throwaway users, cross-access must fail.
// Usage: npm run db:rls-check   (admin script; uses the service role key from .env, never ship it to the client)
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env
if (!url || !anon || !service) throw new Error('missing env')

const admin = createClient(url, service, { auth: { persistSession: false } })
const mk = () => createClient(url, anon, { auth: { persistSession: false } })
const rand = Math.random().toString(36).slice(2, 8)
const users = []
let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`)
  if (!ok) failures++
}

try {
  const clients = []
  for (const n of ['a', 'b']) {
    const email = `vega-rls-${n}-${rand}@example.com`
    const password = `Tmp-${rand}-${n}-x9!Zq`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    users.push(data.user.id)
    const c = mk()
    const s = await c.auth.signInWithPassword({ email, password })
    if (s.error) throw s.error
    clients.push({ c, id: data.user.id })
  }
  const [A, B] = clients
  const track = { ref: { source: 'audius', id: 'x' }, title: 't', artists: ['a'], durationMs: 1000 }

  const prof = await A.c.from('profiles').select('id').eq('id', A.id)
  check('profile auto-created by trigger', prof.data?.length === 1)

  const ins = await A.c.from('liked_tracks').insert({ user_id: A.id, track_key: 'audius:x', track, updated_at: Date.now() })
  check('user can insert own row', !ins.error, ins.error?.message)

  const spoof = await B.c.from('liked_tracks').insert({ user_id: A.id, track_key: 'audius:y', track, updated_at: Date.now() })
  check('user cannot insert row for someone else', !!spoof.error)

  const peek = await B.c.from('liked_tracks').select('*')
  check('user cannot read someone else\'s rows', peek.data?.length === 0)

  const upd = await B.c.from('liked_tracks').update({ deleted: true }).eq('user_id', A.id).select()
  check('user cannot update someone else\'s rows', (upd.data?.length ?? 0) === 0)

  const del = await B.c.from('liked_tracks').delete().eq('user_id', A.id).select()
  check('user cannot delete someone else\'s rows', (del.data?.length ?? 0) === 0)

  const anonRead = await mk().from('liked_tracks').select('*')
  check('anonymous cannot read', !!anonRead.error || anonRead.data?.length === 0, anonRead.error?.message ?? '')
  const anonWrite = await mk().from('playlists').insert({ user_id: A.id, id: 'p', name: 'n', created_at: 1, updated_at: 1 })
  check('anonymous cannot write', !!anonWrite.error)

  const own = await A.c.from('liked_tracks').select('*')
  check('owner still sees own row', own.data?.length === 1)
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id)
  console.log(`cleaned up ${users.length} test users`)
}
process.exit(failures ? 1 : 0)
