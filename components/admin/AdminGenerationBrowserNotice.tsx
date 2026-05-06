'use client'

import { useEffect, useRef, useState } from 'react'

type FetchInput = Parameters<typeof window.fetch>[0]
type FetchInit = Parameters<typeof window.fetch>[1]
type FetchSubscriber = (activeCount: number) => void

type GenerationNoticeStore = {
    activeCount: number
    originalFetch: typeof window.fetch
    patched: boolean
    subscribers: Set<FetchSubscriber>
}

declare global {
    interface Window {
        __usiGenerationNoticeStore?: GenerationNoticeStore
        webkitAudioContext?: typeof AudioContext
    }
}

const DEFAULT_TITLE = 'US Illustrations - Project Management'
const NORMAL_FAVICON = '/favicon.ico'
const PENDING_FAVICON = '/favicon_pending.png'

const TRACKED_GENERATION_PATHS = new Set([
    '/api/characters/generate',
    '/api/characters/generate-sketch',
    '/api/covers/generate',
    '/api/covers/regenerate',
    '/api/illustrations/auto-tune',
    '/api/illustrations/generate',
    '/api/illustrations/generate-sketch',
    '/api/line-art',
    '/api/line-art/generate',
    '/api/tools/cover/generate-back',
    '/api/tools/cover/generate-front',
    '/api/tools/remaster',
    '/api/tools/sketch',
])

const TRACKED_GENERATION_PATTERNS = [
    /^\/api\/admin\/projects\/[^/]+\/characters\/manual-submit$/,
    /^\/api\/admin\/projects\/[^/]+\/retry-generation$/,
]

function getGenerationStore(): GenerationNoticeStore {
    if (!window.__usiGenerationNoticeStore) {
        window.__usiGenerationNoticeStore = {
            activeCount: 0,
            originalFetch: window.fetch.bind(window),
            patched: false,
            subscribers: new Set(),
        }
    }

    return window.__usiGenerationNoticeStore
}

function notifySubscribers(store: GenerationNoticeStore) {
    store.subscribers.forEach(subscriber => subscriber(store.activeCount))
}

function getRequestMethod(input: FetchInput, init?: FetchInit): string {
    if (init?.method) return init.method.toUpperCase()
    if (input instanceof Request) return input.method.toUpperCase()
    return 'GET'
}

function getRequestPath(input: FetchInput): string | null {
    try {
        const rawUrl = input instanceof Request ? input.url : input.toString()
        return new URL(rawUrl, window.location.origin).pathname
    } catch {
        return null
    }
}

function shouldTrackGenerationRequest(input: FetchInput, init?: FetchInit): boolean {
    const method = getRequestMethod(input, init)
    if (method === 'GET' || method === 'HEAD') return false

    const pathname = getRequestPath(input)
    if (!pathname) return false

    return TRACKED_GENERATION_PATHS.has(pathname)
        || TRACKED_GENERATION_PATTERNS.some(pattern => pattern.test(pathname))
}

function patchFetch(store: GenerationNoticeStore) {
    if (store.patched) return

    window.fetch = (async (input: FetchInput, init?: FetchInit) => {
        const shouldTrack = shouldTrackGenerationRequest(input, init)

        if (shouldTrack) {
            store.activeCount += 1
            notifySubscribers(store)
        }

        try {
            return await store.originalFetch(input, init)
        } finally {
            if (shouldTrack) {
                store.activeCount = Math.max(0, store.activeCount - 1)
                notifySubscribers(store)
            }
        }
    }) as typeof window.fetch

    store.patched = true
}

function restoreFetchIfUnused(store: GenerationNoticeStore) {
    if (store.subscribers.size > 0 || !store.patched) return
    window.fetch = store.originalFetch
    store.patched = false
}

function getFaviconLink(): HTMLLinkElement {
    const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (existing) return existing

    const link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
    return link
}

function setFavicon(href: string) {
    getFaviconLink().href = href
}

function playSoftCompletionSound() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextConstructor) return

    try {
        const context = new AudioContextConstructor()
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const now = context.currentTime

        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(740, now)
        oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.18)

        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.035, now + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)

        oscillator.connect(gain)
        gain.connect(context.destination)

        void context.resume().catch(() => undefined)
        oscillator.start(now)
        oscillator.stop(now + 0.26)
        window.setTimeout(() => void context.close().catch(() => undefined), 500)
    } catch {
        // Browsers may block audio when the tab has not had a recent user gesture.
    }
}

export function AdminGenerationBrowserNotice() {
    const [activeCount, setActiveCount] = useState(0)
    const previousActiveCountRef = useRef(0)
    const normalTitleRef = useRef(DEFAULT_TITLE)
    const normalFaviconRef = useRef(NORMAL_FAVICON)
    const flashTimerRef = useRef<number | null>(null)
    const restoreTimerRef = useRef<number | null>(null)

    useEffect(() => {
        const store = getGenerationStore()
        patchFetch(store)

        const subscriber: FetchSubscriber = (nextActiveCount) => setActiveCount(nextActiveCount)
        store.subscribers.add(subscriber)
        const initialSyncTimer = window.setTimeout(() => subscriber(store.activeCount), 0)

        return () => {
            window.clearTimeout(initialSyncTimer)
            store.subscribers.delete(subscriber)
            restoreFetchIfUnused(store)
        }
    }, [])

    useEffect(() => {
        const faviconLink = getFaviconLink()
        normalTitleRef.current = document.title || DEFAULT_TITLE
        normalFaviconRef.current = faviconLink.href || NORMAL_FAVICON
    }, [])

    useEffect(() => {
        const clearTimers = () => {
            if (flashTimerRef.current !== null) {
                window.clearInterval(flashTimerRef.current)
                flashTimerRef.current = null
            }
            if (restoreTimerRef.current !== null) {
                window.clearTimeout(restoreTimerRef.current)
                restoreTimerRef.current = null
            }
        }

        const restoreNormal = () => {
            clearTimers()
            document.title = normalTitleRef.current
            setFavicon(normalFaviconRef.current)
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && activeCount === 0) {
                restoreNormal()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [activeCount])

    useEffect(() => {
        const previousActiveCount = previousActiveCountRef.current
        previousActiveCountRef.current = activeCount

        const clearTimers = () => {
            if (flashTimerRef.current !== null) {
                window.clearInterval(flashTimerRef.current)
                flashTimerRef.current = null
            }
            if (restoreTimerRef.current !== null) {
                window.clearTimeout(restoreTimerRef.current)
                restoreTimerRef.current = null
            }
        }

        if (activeCount > 0) {
            if (previousActiveCount === 0) {
                const currentTitle = document.title
                if (!currentTitle.startsWith('Generating') && !currentTitle.startsWith('Done')) {
                    normalTitleRef.current = currentTitle || DEFAULT_TITLE
                    normalFaviconRef.current = getFaviconLink().href || NORMAL_FAVICON
                }
            }

            clearTimers()
            document.title = activeCount === 1 ? 'Generating image... | USI' : `Generating ${activeCount} images... | USI`
            setFavicon(PENDING_FAVICON)
            return
        }

        if (previousActiveCount === 0) return

        clearTimers()
        document.title = 'Done ✓ | USI'

        if (document.visibilityState === 'hidden') {
            playSoftCompletionSound()
        }

        let flashStep = 0
        const flashFrames = [NORMAL_FAVICON, PENDING_FAVICON, NORMAL_FAVICON, PENDING_FAVICON, NORMAL_FAVICON, PENDING_FAVICON, NORMAL_FAVICON]
        flashTimerRef.current = window.setInterval(() => {
            setFavicon(flashFrames[flashStep] || NORMAL_FAVICON)
            flashStep += 1

            if (flashStep >= flashFrames.length && flashTimerRef.current !== null) {
                window.clearInterval(flashTimerRef.current)
                flashTimerRef.current = null
                setFavicon(normalFaviconRef.current)
            }
        }, 320)

        if (document.visibilityState === 'visible') {
            restoreTimerRef.current = window.setTimeout(() => {
                document.title = normalTitleRef.current
                setFavicon(normalFaviconRef.current)
            }, 3000)
        }
    }, [activeCount])

    return null
}
