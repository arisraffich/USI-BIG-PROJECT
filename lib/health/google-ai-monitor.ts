import { sendSlackNotification } from '@/lib/notifications/slack'

type MonitorStatus = 'healthy' | 'down' | 'checking'

interface MonitorState {
    status: MonitorStatus
    isMonitoring: boolean
    consecutiveSuccesses: number
    lastChecked: string | null
    startedAt: string | null
}

const REQUIRED_SUCCESSES = 3
const CHECK_INTERVAL_MS = 30_000 // 30 seconds

let state: MonitorState = {
    status: 'healthy',
    isMonitoring: false,
    consecutiveSuccesses: 0,
    lastChecked: null,
    startedAt: null,
}

let intervalId: ReturnType<typeof setInterval> | null = null

async function pingGoogleAI(): Promise<boolean> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return false

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Generate a small red circle on a white background' }] }],
                    generationConfig: {
                        responseModalities: ['IMAGE'],
                        imageConfig: { imageSize: '1K' },
                    },
                }),
            }
        )
        return response.ok
    } catch {
        return false
    }
}

async function checkAndUpdate() {
    const success = await pingGoogleAI()
    state.lastChecked = new Date().toISOString()

    if (success) {
        state.consecutiveSuccesses++
        console.log(`[AI Monitor] ✅ Ping success (${state.consecutiveSuccesses}/${REQUIRED_SUCCESSES})`)

        if (state.consecutiveSuccesses >= REQUIRED_SUCCESSES) {
            state.status = 'healthy'
            stopMonitoring()

            try {
                await sendSlackNotification({
                    text: '✅ Google AI image generation is back online',
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '✅ *Google AI Back Online*\nImage generation service has recovered. You can resume generating illustrations.',
                            },
                        },
                    ],
                })
            } catch (e) {
                console.error('[AI Monitor] Failed to send recovery Slack notification:', e)
            }
        }
    } else {
        state.consecutiveSuccesses = 0
        console.log('[AI Monitor] ❌ Ping failed — Google AI still down')
    }
}

function stopMonitoring() {
    if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
    }
    state.isMonitoring = false
    state.startedAt = null
    console.log('[AI Monitor] Monitoring stopped')
}

export function triggerMonitoring(): void {
    if (state.isMonitoring) return

    console.log('[AI Monitor] 🔶 Outage detected — starting active monitoring (every 30s)')
    state.status = 'down'
    state.isMonitoring = true
    state.consecutiveSuccesses = 0
    state.startedAt = new Date().toISOString()

    try {
        sendSlackNotification({
            text: '⚠️ Google AI image generation is currently down (503)',
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '⚠️ *Google AI Down*\nImage generation requests are failing with 503 (server overloaded). Monitoring recovery — you\'ll be notified when it\'s back.',
                    },
                },
            ],
        }).catch(e => console.error('[AI Monitor] Failed to send outage Slack notification:', e))
    } catch {
        // non-blocking
    }

    intervalId = setInterval(checkAndUpdate, CHECK_INTERVAL_MS)
}

export function getMonitorStatus(): { status: MonitorStatus; isMonitoring: boolean; lastChecked: string | null } {
    return {
        status: state.status,
        isMonitoring: state.isMonitoring,
        lastChecked: state.lastChecked,
    }
}
