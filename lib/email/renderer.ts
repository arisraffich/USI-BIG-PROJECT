import { createAdminClient } from '@/lib/supabase/server'
import type { EmailTemplate, RenderedEmail } from './types'

function applyInlineStyles(html: string): string {
  return html
    .replace(/<h2>/g, '<h2 style="font-size: 20px; font-weight: bold; margin-bottom: 16px;">')
    .replace(/<p>/g, '<p style="margin-bottom: 16px;">')
    .replace(/<ul>/g, '<ul style="margin-bottom: 16px;">')
    .replace(/<ol>/g, '<ol style="margin-bottom: 16px; line-height: 1.8;">')
    .replace(/<li>/g, '<li style="margin-bottom: 8px;">')
    .replace(/<small>/g, '<span style="color: #666; font-size: 14px;">')
    .replace(/<\/small>/g, '</span>')
}

function replaceVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match
  })
}

function buildButtonHtml(text: string, color: string, url: string): string {
  return `<p style="margin: 24px 0;">
  <a href="${url}" style="background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">${text}</a>
</p>`
}

const LOGO_URL = 'https://vwzzfbpjzjbhejqizmqh.supabase.co/storage/v1/object/public/assets/email/usi-logo.png'

const EMAIL_SIGNATURE = `
<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
  <tr>
    <td>
      <img src="${LOGO_URL}" alt="US Illustrations" height="45" style="display: block; margin-bottom: 8px;" />
      <a href="https://www.usillustrations.com" style="color: #888; font-size: 13px; text-decoration: none;">https://www.usillustrations.com</a>
    </td>
  </tr>
</table>`

function wrapInShell(content: string): string {
  return `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6; color: #333;">${content}${EMAIL_SIGNATURE}</div>`
}

export async function loadTemplate(slug: string): Promise<EmailTemplate | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) return null
  return data as EmailTemplate
}

export async function renderTemplate(
  slug: string,
  variables: Record<string, string>
): Promise<RenderedEmail | null> {
  const template = await loadTemplate(slug)
  if (!template) return null
  return renderFromTemplate(template, variables)
}

export function renderFromTemplate(
  template: EmailTemplate,
  variables: Record<string, string>
): RenderedEmail {
  const subject = replaceVariables(template.subject, variables)

  let bodyContent = applyInlineStyles(replaceVariables(template.body_html, variables))

  if (template.has_button && template.button_text && template.button_url_variable) {
    const buttonUrl = variables[template.button_url_variable] || '#'
    const buttonColor = template.button_color || '#2563eb'
    const buttonText = replaceVariables(template.button_text, variables)
    bodyContent += buildButtonHtml(buttonText, buttonColor, buttonUrl)
  }

  if (template.closing_html) {
    bodyContent += applyInlineStyles(replaceVariables(template.closing_html, variables))
  }

  return {
    subject,
    html: wrapInShell(bodyContent),
  }
}
