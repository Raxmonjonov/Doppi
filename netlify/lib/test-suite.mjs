/* Store-agnostic functional suite for netlify/lib/api-core.mjs.
   Used by api-core.test.mjs (file store) and postgres-store.test.mjs (Postgres store). */
import { handleRequest } from './api-core.mjs'

export async function runSuite(store, label) {
  let passed = 0
  let failed = 0

  const ok = (name, cond, extra = '') => {
    if (cond) {
      passed++
      console.log(`  PASS ${name}${extra ? ` (${extra})` : ''}`)
    } else {
      failed++
      console.log(`  FAIL ${name}${extra ? ` (${extra})` : ''}`)
    }
  }
  const show = (l, r) => console.log(`  DEBUG ${l}: status=${r.status} json=${JSON.stringify(r.json).slice(0, 200)}`)

  const call = async (method, url, body, token) => {
    const headers = { authorization: '' }
    if (token) headers.authorization = `Bearer ${token}`
    /* Production entrypoints strip the query before handleRequest — do the same. */
    const [pathname, search] = String(url).split('?')
    const query = Object.fromEntries(new URLSearchParams(search ?? ''))
    return handleRequest(method, pathname, query, { json: async () => body ?? {}, headers }, store)
  }
  const register = (username, password, name) =>
    call('POST', '/api/auth/register', { username, password, name, email: `${username}@test.dev` })

  console.log(`\n=== ${label} ===`)

  // 1) register + login
  let r = await register('nftest1', 'pass123', 'Net Test')
  ok('register returns token', !!r.json.token, `status=${r.status}`)
  if (!r.json.token) show('register1', r)
  const uid1 = r.json.user?.id

  r = await call('POST', '/api/auth/login', { username: 'nftest1', password: 'pass123' })
  ok('login returns token', !!r.json.token, `status=${r.status}`)
  if (!r.json.token) show('login', r)
  const tok2 = r.json.token

  r = await register('nftest2', 'pass123', 'Net Two')
  ok('register user2', !!r.json.token, `status=${r.status}`)
  if (!r.json.token) show('register2', r)
  const tok3 = r.json.token
  const uid2 = r.json.user?.id

  // 2) data uchun qiymatlar
  const seal = Date.now() + 7200000
  const pid = Date.now()
  const aid = Date.now() + 1
  // 2) media yuklash (avval, chunki post rasmga havola beradi)
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  r = await call('POST', '/api/media', { dataUrl: `data:image/png;base64,${pngBase64}` }, tok2)
  const mediaId = r.json.id
  const mediaUrl = r.json.url
  ok('media upload -> 201 + url', r.status === 201 && !!mediaId && mediaUrl === `/api/media/${mediaId}`, `status=${r.status}`)
  ok('media returns mime + size', r.json.mime === 'image/png' && r.json.size > 0, `mime=${r.json.mime} size=${r.json.size}`)

  if (mediaUrl) {
    const mr = await call('GET', mediaUrl, undefined, undefined)
    const bytes = mr.binary ? Buffer.from(mr.binary.body) : Buffer.alloc(0)
    ok('media GET returns bytes', mr.status === 200 && bytes.length > 0, `status=${mr.status} len=${bytes.length}`)
    ok('media GET content-type', mr.binary?.type === 'image/png', `type=${mr.binary?.type}`)
    ok('media bytes intact', bytes.equals(Buffer.from(pngBase64, 'base64')))
  }

  // 3) PUT data with sealed post (with media url) + sealed album
  const post = {
    id: pid,
    author: { id: uid1, name: 'Net Test', username: 'nftest1', avatar: '', online: true, about: '' },
    time: 'hozir',
    text: 'sealed flow test',
    images: mediaUrl ? [mediaUrl] : [],
    likes: 0,
    comments: [],
    sealUntil: seal,
  }
  const album = { id: aid, title: 'Sealed Album', count: 1, likes: 0, photos: [], sealUntil: seal }
  r = await call('PUT', '/api/data', { posts: [post], stories: [], reels: [], albums: [album], groups: [] }, tok2)
  ok('PUT /api/data ok', r.status === 200, `status=${r.status}`)
  if (r.status !== 200) show('putData', r)

  r = await call('GET', '/api/data', undefined, tok2)
  const data = r.json
  const gotPost = data.posts.find((p) => p.id === pid)
  const gotAlbum = data.albums.find((a) => a.id === aid)
  ok('GET post sealUntil', gotPost && Number(gotPost.sealUntil) === seal)
  ok('GET album sealUntil', gotAlbum && Number(gotAlbum.sealUntil) === seal)
  ok('GET post shields count', gotPost && (gotPost.shields ?? 0) === 0)

  // 3) shield rules
  r = await call('POST', `/api/posts/${pid}/shield`, undefined, tok3)
  ok('shield adds +30min', r.status === 200 && Number(r.json.sealUntil) === seal + 30 * 60 * 1000 && r.json.shields === 1, `shields=${r.json.shields}`)
  r = await call('POST', `/api/posts/${pid}/shield`, undefined, tok3)
  ok('duplicate shield -> 409', r.status === 409, `status=${r.status}`)
  r = await call('POST', `/api/posts/${pid}/shield`, undefined, tok2)
  ok('own shield -> 403', r.status === 403, `status=${r.status}`)

  r = await call('GET', '/api/data', undefined, tok3)
  const g2 = r.json.posts.find((p) => p.id === pid)
  ok('GET shields after shield', g2.shields === 1 && g2.shieldedByMe === true, `shields=${g2.shields}`)

  // 4) post like/comment/share
  r = await call('POST', `/api/posts/${pid}/like`, undefined, tok3)
  ok('like ok', r.json.liked === true && r.json.likes === 1)
  r = await call('POST', `/api/posts/${pid}/comment`, { text: 'izo' }, tok3)
  ok('comment ok', r.status === 200 && !!r.json.comment)
  r = await call('POST', `/api/posts/${pid}/share`, undefined, tok3)
  ok('share ok', r.json.shared === 1)

  // 5) DM sealed message
  r = await call('POST', '/api/threads', { user: uid2 }, tok2)
  ok('thread create', r.status === 200 && !!r.json.thread, `status=${r.status}`)
  const tid = r.json.thread.id
  r = await call('POST', `/api/threads/${tid}/messages`, { text: 'dm seal', sealUntil: seal }, tok2)
  ok('dm sealed message', r.status === 200 && Number(r.json.message.sealUntil) === seal)
  r = await call('GET', '/api/threads', undefined, tok2)
  const thread = r.json.threads.find((x) => x.id === tid)
  ok('thread GET carries sealed msg', thread && thread.messages.some((m) => Number(m.sealUntil) === seal))

  // 6) group sealed message
  r = await call('POST', '/api/groups', { name: 'G', cover: '', membersCount: 1 }, tok2)
  const gid = r.json.group ? r.json.group.id : r.json.id
  ok('group create', !!gid)
  if (gid) {
    r = await call('POST', `/api/groups/${gid}/messages`, { text: 'grp seal', sealUntil: seal }, tok2)
    ok('group sealed message', r.status === 200 && Number(r.json.message.sealUntil) === seal)
    r = await call('GET', `/api/groups/${gid}`, undefined, tok2)
    ok('group GET carries sealed msg', r.json.group.messages.some((m) => Number(m.sealUntil) === seal))
  }

  // 7) admin login + dashboard
  r = await call('POST', '/api/admin/login', { username: 'Admin', password: "Admin.Do'ppi.Uzbekitan.66" })
  ok('admin login', !!r.json.token)
  if (r.json.token) {
    r = await call('GET', '/api/dashboard', undefined, r.json.token)
    ok('admin dashboard', r.status === 200 && !!r.json.totals, `status=${r.status}`)
  }

  // 8) media cheklovlari + GC
  r = await call('POST', '/api/media', { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, tok2)
  ok('media bad mime -> 415', r.status === 415, `status=${r.status}`)
  r = await call('POST', '/api/media', { dataUrl: `data:image/png;base64,${'A'.repeat(12 * 1024 * 1024)}` }, tok2)
  ok('media oversize -> 413', r.status === 413, `status=${r.status}`)
  r = await call('POST', '/api/media', { dataUrl: `data:image/png;base64,${pngBase64}` })
  ok('media upload needs auth -> 401', r.status === 401, `status=${r.status}`)
  r = await call('GET', '/api/media/../../etc/passwd', undefined, undefined)
  ok('media path traversal blocked', r.status === 404 || r.status === 400, `status=${r.status}`)

  // 8b) media GC: only unreferenced files are removed (admin only)
  const orphan = await call('POST', '/api/media', { dataUrl: `data:image/png;base64,${pngBase64}` }, tok2)
  const orphanId = orphan.json.id
  r = await call('POST', '/api/media/gc', undefined, tok2)
  ok('media gc needs admin -> 403', r.status === 403, `status=${r.status}`)

  const adminTok = (await call('POST', '/api/admin/login', { username: 'Admin', password: "Admin.Do'ppi.Uzbekitan.66" })).json.token
  r = await call('POST', '/api/media/gc', undefined, adminTok)
  ok('media gc removes orphan only', r.status === 200 && r.json.removed >= 1 && r.json.kept >= 1, `removed=${r.json.removed} kept=${r.json.kept}`)

  const afterOrphan = await call('GET', `/api/media/${orphanId}`, undefined, undefined)
  ok('orphan media is gone -> 404', afterOrphan.status === 404, `status=${afterOrphan.status}`)
  if (mediaUrl) {
    const afterKept = await call('GET', mediaUrl, undefined, undefined)
    ok('referenced media survives gc', afterKept.status === 200 && !!afterKept.binary, `status=${afterKept.status}`)
  }

  // 8c) eski data: URL larni haqiqiy faylga ko'chirish
  const legacyPost = {
    id: pid + 7,
    author: { id: uid1, name: 'Net Test', username: 'nftest1', avatar: '', online: true, about: '' },
    time: 'old',
    text: 'legacy data url',
    images: [`data:image/png;base64,${pngBase64}`],
    likes: 0,
    comments: [],
  }
  /* Hozirgi ma'lumotni olib, unga eski postni qo'shamiz (muhr va qalqon saqlansin). */
  const current = (await call('GET', '/api/data', undefined, tok2)).json
  r = await call('PUT', '/api/data', { posts: [...current.posts, legacyPost], stories: [], reels: [], albums: current.albums, groups: [] }, tok2)
  ok('PUT legacy data-url post', r.status === 200, `status=${r.status}`)
  const docBefore = JSON.stringify((await call('GET', '/api/data', undefined, tok2)).json)
  ok('legacy post still has data: url', docBefore.includes('data:image/png'))

  r = await call('POST', '/api/media/migrate', undefined, tok2)
  ok('media migrate needs admin -> 403', r.status === 403, `status=${r.status}`)

  r = await call('POST', '/api/media/migrate?limit=10', undefined, adminTok)
  ok('media migrate converts data url', r.status === 200 && r.json.migrated >= 1, `migrated=${r.json.migrated}`)

  const docAfter = (await call('GET', '/api/data', undefined, tok2)).json
  const migratedPost = docAfter.posts.find((p) => p.id === legacyPost.id)
  const newUrl = migratedPost?.images?.[0] ?? ''
  ok('legacy post now points to /api/media', newUrl.startsWith('/api/media/'), `url=${newUrl.slice(0, 40)}`)
  ok('data: url gone from doc', !JSON.stringify(docAfter).includes('data:image/png'))
  if (newUrl) {
    const mr2 = await call('GET', newUrl, undefined, undefined)
    ok('migrated media is downloadable', mr2.status === 200 && !!mr2.binary, `status=${mr2.status}`)
  }

  // 9) reload from a fresh store read (persistence)
  const freshStore = await relaunch(store)
  const r2 = await (async () => {
    const headers = { authorization: `Bearer ${tok2}` }
    return handleRequest('GET', '/api/data', {}, { json: async () => ({}), headers }, freshStore)
  })()
  const still = r2.json.posts.find((p) => p.id === pid)
  ok('persisted across restart', !!still && Number(still.sealUntil) === seal + 30 * 60 * 1000, `seal=${still?.sealUntil}`)

  console.log(`\nRESULT [${label}]: ${passed} passed, ${failed} failed`)
  return { passed, failed }
}

/* Store impl may expose relaunch() to simulate a cold start. Default: same store. */
async function relaunch(store) {
  if (typeof store.relaunch === 'function') return store.relaunch()
  return store
}