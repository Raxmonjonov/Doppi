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
}

export interface Group {
  id: number
  name: string
  members: string
  cover: string
  joined: boolean
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
}

export interface Thread {
  id: number
  user: User
  online: boolean
  messages: Message[]
}

export interface AppNotification {
  id: number
  type: 'like' | 'comment' | 'friend' | 'group'
  user: User
  text: string
  time: string
  unread: boolean
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
export const pages: Page[] = []
export const chatThreads: Thread[] = []
export const notifications: AppNotification[] = []
export const suggestedUsers: User[] = []
export const onlineFriends: User[] = []