export interface User {
  id: number
  name: string
  username: string
  avatar: string
  online: boolean
  about?: string
}

export interface Post {
  id: number
  author: User
  time: string
  text: string
  images: string[]
  video?: string
  likes: number
  comments: Comment[]
  shared?: number
  live?: boolean
  likedByMe?: boolean
  sealUntil?: number
  shields?: number
  shieldedByMe?: boolean
}

export interface Comment {
  id: number
  author: User
  text: string
  time: string
}

export interface Story {
  id: number
  author: User
  image: string
  viewed: boolean
}

export interface Reel {
  id: number
  author: User
  image: string
  caption: string
  sound: string
  likes: number
  comments: Comment[]
  shares: number
  viewMode: 'audio' | 'disco' | 'none'
  likedByMe?: boolean
}

export interface AlbumPhoto {
  url: string
  tag?: { x: number; y: number; name: string }
}

export interface Album {
  id: number
  title: string
  count: number
  likes: number
  photos: AlbumPhoto[]
  likedByMe?: boolean
  sealUntil?: number
}

export interface Group {
  id: number
  name: string
  cover: string
  createdBy: number
  memberIds: number[]
  members?: string
  joined?: boolean
}

export interface Page {
  id: number
  name: string
  followers: string
  cover: string
  category: string
  subscribed: boolean
}

export interface Message {
  id: number
  from: number
  text: string
  time: string
  image?: string
  audio?: string
  audioDuration?: number
  sealUntil?: number
}

export interface Thread {
  id: number
  user: User
  online: boolean
  messages: Message[]
}

export const me: User = {
  id: 1,
  name: '',
  username: '',
  avatar: '',
  online: true,
  about: '',
}

export const sharePeers: User[] = []

export const friends: User[] = []
export const initialPosts: Post[] = []
export const stories: Story[] = []
export const reels: Reel[] = []
export const albums: Album[] = []
export const groups: Group[] = []
export const pages: Page[] = [
  { id: 1, name: 'Do\'ppi Yangiliklar', followers: '125K', cover: 'https://picsum.photos/seed/doppi1/640/300', category: 'Ommaviy axborot', subscribed: false },
  { id: 2, name: 'O\'zbek Mumtoz Musiqa', followers: '87K', cover: 'https://picsum.photos/seed/doppi2/640/300', category: 'Musiqa', subscribed: false },
  { id: 3, name: 'Sport & Sog\'lom Hayot', followers: '64K', cover: 'https://picsum.photos/seed/doppi3/640/300', category: 'Sport', subscribed: false },
  { id: 4, name: 'Texnologiya Olami', followers: '48K', cover: 'https://picsum.photos/seed/doppi4/640/300', category: 'Texnologiya', subscribed: false },
  { id: 5, name: 'Oshxona Sehri', followers: '39K', cover: 'https://picsum.photos/seed/doppi5/640/300', category: 'Ovqat', subscribed: false },
  { id: 6, name: 'Sayohat Uzbekistan', followers: '23K', cover: 'https://picsum.photos/seed/doppi6/640/300', category: 'Sayohat', subscribed: false },
]
export const chatThreads: Thread[] = []
export const suggestedUsers: User[] = []
export const onlineFriends: User[] = []