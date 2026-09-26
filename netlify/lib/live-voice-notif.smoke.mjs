/* Live smoke: audio media + notifications + call ring (real PostgreSQL server). */
const BASE = 'http://127.0.0.1:4000'

async function call(method, path, body, token) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 120) }
  }
  return { status: res.status, json, type: res.headers.get('content-type') }
}

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name} ${extra}`)
  }
}

const suffix = Date.now().toString(36).slice(-4)
const u1 = `liveA${suffix}`
const u2 = `liveB${suffix}`

const run = async () => {
  console.log('\n=== live smoke: voice + notifications ===')

  const r1 = await call('POST', '/api/auth/register', { name: 'Live A', username: u1, password: 'pass123', email: `${u1}@test.dev` })
  const r2 = await call('POST', '/api/auth/register', { name: 'Live B', username: u2, password: 'pass123', email: `${u2}@test.dev` })
  ok('register two users', r1.status === 200 && r2.status === 200, `${r1.status}/${r2.status}`)
  const tok1 = r1.json?.token
  const tok2 = r2.json?.token
  const id1 = r1.json?.user?.id
  const id2 = r2.json?.user?.id
  if (!tok1 || !tok2) {
    console.log('  abort: token missing', JSON.stringify(r1.json), JSON.stringify(r2.json))
    process.exit(1)
  }

  // 1) audio media upload
  const audioB64 = Buffer.from('ID3fake-ogg-live-audio-payload').toString('base64')
  let r = await call('POST', '/api/media', { dataUrl: `data:audio/webm;base64,${audioB64}` }, tok1)
  ok('audio upload -> 201', r.status === 201 && !!r.json?.url, `status=${r.status} ${JSON.stringify(r.json)}`)
  ok('audio mime returned', r.json?.mime === 'audio/webm', `mime=${r.json?.mime}`)
  const audioUrl = r.json?.url

  r = await call('GET', audioUrl)
  ok('audio download 200 + content-type', r.status === 200 && String(r.type).startsWith('audio/webm'), `status=${r.status} type=${r.type}`)

  r = await call('POST', '/api/media', { dataUrl: `data:audio/x-flac;base64,${audioB64}` }, tok1)
  ok('unsupported audio mime -> 415', r.status === 415, `status=${r.status}`)

  r = await call('POST', '/api/media', { dataUrl: `data:audio/webm;base64,${Buffer.alloc(13 * 1024 * 1024).toString('base64')}` }, tok1)
  ok('oversized audio -> 413', r.status === 413, `status=${r.status}`)

  // 2) DM voice message
  r = await call('POST', '/api/threads', { user: id2 }, tok1)
  const tid = r.json?.thread?.id
  ok('thread created', r.status === 200 && !!tid, `status=${r.status}`)

  r = await call('POST', `/api/threads/${tid}/messages`, { audio: audioUrl, audioDuration: 4.25 }, tok1)
  ok('voice message -> 200', r.status === 200 && r.json?.message?.audio === audioUrl && r.json?.message?.audioDuration === 4.25, `status=${r.status} ${JSON.stringify(r.json?.message)}`)

  r = await call('GET', '/api/threads', undefined, tok2)
  const th = r.json?.threads?.find((x) => x.id === tid)
  ok('voice message in history', !!th?.messages?.some((m) => m.audio === audioUrl && m.audioDuration === 4.25))

  r = await call('POST', `/api/threads/${tid}/messages`, { text: '' }, tok1)
  ok('empty message -> 400', r.status === 400, `status=${r.status}`)

  // 3) notifications for messages
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const notifs2 = r.json?.notifications ?? []
  const dmNotif = notifs2.find((n) => n.kind === 'message' && n.threadId === tid && n.hasAudio)
  ok('receiver got voice notification', !!dmNotif, `count=${notifs2.length}`)
  ok('notification unread + not closed', dmNotif?.read === false && dmNotif?.closed === false)
  ok('notification actor filled', dmNotif?.actor?.id === id1, `actor=${dmNotif?.actor?.id}`)

  r = await call('GET', '/api/notifications?since=0', undefined, tok1)
  ok('sender has no notification', !(r.json?.notifications ?? []).some((n) => n.threadId === tid && n.kind === 'message'))

  r = await call('GET', '/api/notifications', undefined, undefined)
  ok('notifications need auth', r.status === 401, `status=${r.status}`)

  r = await call('POST', `/api/threads/${tid}/messages`, { text: 'salom live' }, tok1)
  ok('text message -> 200', r.status === 200, `status=${r.status}`)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  ok('text notification exists', (r.json?.notifications ?? []).some((n) => n.body === 'salom live'))
  ok('unread counter > 0', (r.json?.unread ?? 0) > 0, `unread=${r.json?.unread}`)

  // 4) group voice message
  r = await call('POST', '/api/groups', { name: 'Live G', cover: '', membersCount: 1 }, tok1)
  const gid = r.json?.group?.id ?? r.json?.id
  ok('group created', !!gid, `status=${r.status}`)
  await call('POST', `/api/groups/${gid}/members`, { userId: id2 }, tok1)
  r = await call('POST', `/api/groups/${gid}/messages`, { audio: audioUrl, audioDuration: 2 }, tok1)
  ok('group voice message -> 200', r.status === 200 && r.json?.message?.audio === audioUrl, `status=${r.status} ${JSON.stringify(r.json?.message)}`)
  r = await call('GET', `/api/groups/${gid}`, undefined, tok1)
  ok('group voice in history', (r.json?.group?.messages ?? []).some((m) => m.audio === audioUrl))
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  ok('group member got notification', (r.json?.notifications ?? []).some((n) => n.kind === 'group' && n.groupId === gid && n.hasAudio))

  // 5) call ring notification + hangup close
  r = await call('POST', `/api/threads/${tid}/calls`, { kind: 'ring', to: id2, data: { kind: 'video' } }, tok1)
  ok('ring signal -> 200', r.status === 200, `status=${r.status}`)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const callNotif = (r.json?.notifications ?? []).find((n) => n.kind === 'call' && n.threadId === tid && !n.closed)
  ok('call notification exists', !!callNotif, `callKind=${callNotif?.callKind}`)
  ok('call notification is joinable (unread)', callNotif?.read === false && callNotif?.closed === false)

  r = await call('POST', `/api/threads/${tid}/calls`, { kind: 'hangup', to: id2, data: null }, tok1)
  ok('hangup -> 200', r.status === 200, `status=${r.status}`)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const closed = (r.json?.notifications ?? []).find((n) => n.id === callNotif?.id)
  ok('caller hangup closes callee notification', closed?.closed === true && closed?.read === true, `closed=${closed?.closed}`)

  // callee ends the call -> its own notification must close too
  r = await call('POST', `/api/threads/${tid}/calls`, { kind: 'ring', to: id2, data: { kind: 'video' } }, tok1)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const call2 = (r.json?.notifications ?? []).find((n) => n.kind === 'call' && n.threadId === tid && !n.closed)
  ok('second ring notification exists', !!call2)
  await call('POST', `/api/threads/${tid}/calls`, { kind: 'hangup', to: id1, data: null }, tok2)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const closed2 = (r.json?.notifications ?? []).find((n) => n.id === call2?.id)
  ok('callee hangup closes own notification', closed2?.closed === true, `closed=${closed2?.closed}`)

  // group call ring
  r = await call('POST', `/api/groups/${gid}/calls`, { kind: 'ring', to: 0, data: { kind: 'audio' } }, tok1)
  ok('group ring -> 200', r.status === 200, `status=${r.status}`)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const gcall = (r.json?.notifications ?? []).find((n) => n.kind === 'call' && n.groupId === gid && !n.closed)
  ok('group call notification exists', !!gcall && gcall?.callKind === 'audio')
  await call('POST', `/api/groups/${gid}/calls`, { kind: 'decline', to: id1, data: null }, tok2)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  const gclosed = (r.json?.notifications ?? []).find((n) => n.id === gcall?.id)
  ok('decline closed own group call notification', gclosed?.closed === true)

  // 6) mark read
  r = await call('POST', '/api/notifications/read', {}, tok2)
  ok('mark all read -> 200', r.status === 200 && r.json?.marked >= 1, `marked=${r.json?.marked}`)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  ok('unread is zero', r.json?.unread === 0, `unread=${r.json?.unread}`)

  // 7) cursor pagination
  r = await call('GET', '/api/notifications?since=99999999999999', undefined, tok2)
  ok('since beyond max -> empty', r.status === 200 && (r.json?.notifications ?? []).length === 0, `got=${(r.json?.notifications ?? []).length}`)

  // 8) Web Push obunasi
  r = await call('GET', '/api/push/key')
  ok('push key -> enabled', r.status === 200 && r.json?.enabled === true && typeof r.json?.publicKey === 'string', `status=${r.status}`)
  const sub = {
    endpoint: `https://127.0.0.1:1/push/doppi-live-${Date.now()}`,
    keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
  }
  r = await call('POST', '/api/push/subscribe', { subscription: sub }, tok2)
  ok('push subscribe -> 200', r.status === 200 && r.json?.ok === true, `status=${r.status}`)
  r = await call('POST', '/api/push/subscribe', { subscription: sub }, tok2)
  ok('push subscribe idempotent -> 200', r.status === 200, `status=${r.status}`)
  r = await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://x/y' } }, tok2)
  ok('push subscribe bad endpoint -> 400', r.status === 400, `status=${r.status}`)
  r = await call('POST', '/api/push/subscribe', { subscription: sub })
  ok('push subscribe needs auth -> 401', r.status === 401, `status=${r.status}`)
  // obuna bor holatda xabar yuborilishi buzilmasin
  r = await call('POST', `/api/threads/${tid}/messages`, { text: 'push bilan birga' }, tok1)
  ok('dm message works with push subscription', r.status === 200, `status=${r.status}`)
  r = await call('GET', '/api/notifications?since=0', undefined, tok2)
  ok('push subscriber still gets notification', (r.json?.notifications ?? []).some((n) => n.body === 'push bilan birga'))
  r = await call('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }, tok2)
  ok('push unsubscribe -> removed 1', r.status === 200 && r.json?.removed === 1, `removed=${r.json?.removed}`)
  r = await call('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint }, tok2)
  ok('push unsubscribe idempotent -> removed 0', r.status === 200 && r.json?.removed === 0, `removed=${r.json?.removed}`)
  r = await call('POST', '/api/push/unsubscribe', {}, tok2)
  ok('push unsubscribe needs endpoint -> 400', r.status === 400, `status=${r.status}`)
  r = await call('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint })
  ok('push unsubscribe needs auth -> 401', r.status === 401, `status=${r.status}`)

  // 9) parol tiklash: yetkazish kanali + pochta bombasi himoyasi
  r = await call('POST', '/api/auth/forgot', { username: u1 })
  const liveCode = r.json?.debugCode
  ok('forgot -> 200 with delivery channel', r.status === 200 && /^\d{6}$/.test(String(liveCode ?? '')), `code=${liveCode}`)
  ok('forgot reports delivery provider', !!r.json?.via, `via=${r.json?.via}`)
  r = await call('POST', '/api/auth/forgot', { username: u1 })
  ok('repeat forgot throttled', r.status === 200 && r.json?.throttled === true, `throttled=${r.json?.throttled}`)
  r = await call('POST', '/api/auth/forgot', { username: 'bunday-live-user-yoq' })
  ok('forgot hides unknown user', r.status === 200 && !r.json?.debugCode, `status=${r.status}`)
  r = await call('POST', '/api/auth/reset', { username: u1, code: '000000', password: 'yangi123' })
  ok('reset wrong code -> 400', r.status === 400, `status=${r.status}`)
  r = await call('POST', '/api/auth/reset', { username: u1, code: liveCode, password: 'yangi123' })
  ok('reset with delivered code -> 200', r.status === 200 && r.json?.ok === true, `status=${r.status}`)
  r = await call('POST', '/api/auth/login', { username: u1, password: 'yangi123' })
  ok('login with new password -> 200', r.status === 200 && !!r.json?.token, `status=${r.status}`)

  // cleanup
  await call('DELETE', `/api/groups/${gid}`, undefined, tok1)
  await call('DELETE', `/api/threads/${tid}`, undefined, tok1)
  if (audioUrl) await call('DELETE', audioUrl, undefined, tok1)

  console.log(`\n=== live smoke: ${pass} passed, ${fail} failed ===`)
  process.exit(fail ? 1 : 0)
}

run().catch((e) => {
  console.error('crash:', e)
  process.exit(1)
})
