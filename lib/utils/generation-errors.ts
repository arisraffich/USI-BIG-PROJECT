export interface MappedError {
    message: string
    technicalDetails: string
    is503?: boolean
}

export function triggerAIMonitoring() {
    fetch('/api/health/google-ai/trigger', { method: 'POST' }).catch(() => {})
}

export function mapErrorToUserMessage(error: string): MappedError {
    const lowerError = error.toLowerCase()

    if (lowerError.includes('503') || lowerError.includes('unavailable') || lowerError.includes('overloaded') || lowerError.includes('high demand')) {
        triggerAIMonitoring()
        return {
            message: "Google's image servers are currently overloaded. We're monitoring recovery and will notify you on Slack when it's back.",
            technicalDetails: error,
            is503: true,
        }
    }

    const jsonMatch = error.match(/\{[\s\S]*"message"\s*:\s*"([^"]+)"[\s\S]*\}/)
    const googleMessage = jsonMatch ? jsonMatch[1] : null

    if (googleMessage) {
        return { message: googleMessage, technicalDetails: error }
    }

    if (lowerError.includes('rate') || lowerError.includes('quota') || lowerError.includes('limit')) {
        return { message: 'Too many requests - please wait a moment and try again', technicalDetails: error }
    }
    if (lowerError.includes('safety') || lowerError.includes('blocked') || lowerError.includes('moderation') || lowerError.includes('policy')) {
        return { message: 'Content flagged by safety filters - please revise the description', technicalDetails: error }
    }
    if (lowerError.includes('no image generated')) {
        return { message: 'No image was generated - try editing the description', technicalDetails: error }
    }
    if (lowerError.includes('billing') || lowerError.includes('payment') || lowerError.includes('disabled') || lowerError.includes('402')) {
        return { message: 'API billing issue - please check your Google Cloud account', technicalDetails: error }
    }
    if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
        return { message: 'Request timed out - please try again', technicalDetails: error }
    }
    if (lowerError.includes('network') || lowerError.includes('connection')) {
        return { message: 'Network error - please check your connection and try again', technicalDetails: error }
    }

    return { message: 'Generation failed - please try again', technicalDetails: error }
}
