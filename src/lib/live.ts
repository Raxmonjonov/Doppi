import { api } from '../api/client'

/* Jonli efir WebRTC signal almashinuvi — Netlify Functions + Blobs
   ustidagi poll asosidagi relay. Server foydalanuvchilar o'rtasida
   faqat SDP/ICE paketlarini uzatadi (video oq etmas — resurslar cheklangan). */

export const STUN: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]

export interface Signal {
  id: number
  from: number
  to: number
  kind: string
  data: unknown
}

export interface SignalPoll {
  signals: Signal[]
  status: string
  viewers: number
}

export async function fetchSignals(liveId: number, since: number): Promise<SignalPoll> {
  try {
    return await api<SignalPoll>(`/api/lives/${liveId}/signals?since=${since}`)
  } catch {
    return { signals: [], status: 'live', viewers: 0 }
  }
}

export async function pushSignal(liveId: number, kind: string, to: number, data: unknown): Promise<void> {
  try {
    await api(`/api/lives/${liveId}/signal`, { method: 'POST', body: { kind, to, data } })
  } catch {
    /* offline — keyingi o'qishlarda holat baribir aniqlanadi */
  }
}

export function pickRecorderMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c
  }
  return ''
}