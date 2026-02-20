export interface EmailTemplate {
  id: string
  slug: string
  name: string
  description: string | null
  subject: string
  body_html: string
  closing_html: string | null
  has_button: boolean
  button_text: string | null
  button_color: string | null
  button_url_variable: string | null
  available_variables: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RenderedEmail {
  subject: string
  html: string
}
