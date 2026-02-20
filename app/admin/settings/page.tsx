'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { EmailTemplateEditor } from '@/components/admin/EmailTemplateEditor'
import {
  ArrowLeft, Mail, MessageSquare, ChevronRight,
  Loader2, AlertCircle, RefreshCw,
} from 'lucide-react'
import Link from 'next/link'
import type { EmailTemplate } from '@/lib/email/types'

const INTERNAL_SLUGS = new Set([
  'submission_internal',
  'sketches_approved_download',
  'send_lineart_internal',
  'send_sketches_internal',
])

export default function SettingsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [emailTab, setEmailTab] = useState<'customer' | 'internal'>('customer')

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/email-templates')
      if (!res.ok) throw new Error('Failed to load templates')
      const data = await res.json()
      setTemplates(data)
    } catch {
      setError('Failed to load email templates. Make sure the database table exists.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const handleSeed = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/admin/email-templates', { method: 'POST' })
      if (res.ok) {
        await loadTemplates()
      }
    } finally {
      setSeeding(false)
    }
  }

  const filteredTemplates = useMemo(() => {
    return templates.filter(t =>
      emailTab === 'internal' ? INTERNAL_SLUGS.has(t.slug) : !INTERNAL_SLUGS.has(t.slug)
    )
  }, [templates, emailTab])

  const selectedTemplate = templates.find(t => t.slug === selectedSlug) || null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Sidebar — Template List */}
          <div className="space-y-6">
            {/* Email Templates Section */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-sm text-gray-800">Email Templates</span>
              </div>

              {/* Tabs */}
              {!loading && !error && templates.length > 0 && (
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setEmailTab('customer')}
                    className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                      emailTab === 'customer'
                        ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Customer
                  </button>
                  <button
                    onClick={() => setEmailTab('internal')}
                    className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                      emailTab === 'internal'
                        ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Internal
                  </button>
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : error ? (
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadTemplates}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Retry
                  </Button>
                </div>
              ) : templates.length === 0 ? (
                <div className="p-4 space-y-3">
                  <p className="text-sm text-gray-500">No templates found. Seed the default templates to get started.</p>
                  <Button size="sm" onClick={handleSeed} disabled={seeding}>
                    {seeding ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Seed Default Templates
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredTemplates.map((t, i) => (
                    <button
                      key={t.slug}
                      onClick={() => setSelectedSlug(t.slug)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                        selectedSlug === t.slug ? 'bg-blue-50 border-l-2 border-blue-600' : ''
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-xs flex items-center justify-center font-medium text-gray-500 flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${selectedSlug === t.slug ? 'text-blue-700' : 'text-gray-800'}`}>
                          {t.name}
                        </p>
                        {t.description && (
                          <p className="text-xs text-gray-400 truncate">{t.description}</p>
                        )}
                      </div>
                      <ChevronRight className={`w-4 h-4 flex-shrink-0 ${selectedSlug === t.slug ? 'text-blue-500' : 'text-gray-300'}`} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Slack Templates Section (Coming Later) */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden opacity-50">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-sm text-gray-800">Slack Templates</span>
                <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Coming Soon</span>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-400">Slack notification templates will be editable here in a future update.</p>
              </div>
            </div>
          </div>

          {/* Main Content — Editor */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            {selectedTemplate ? (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">{selectedTemplate.name}</h2>
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">
                    {selectedTemplate.slug}
                  </span>
                  {selectedTemplate.has_button && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                      Has CTA Button
                    </span>
                  )}
                </div>
                <EmailTemplateEditor
                  key={selectedTemplate.slug}
                  template={selectedTemplate}
                  onSaved={loadTemplates}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Mail className="w-12 h-12 mb-3 text-gray-300" />
                <p className="text-sm">Select a template from the left to edit</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
