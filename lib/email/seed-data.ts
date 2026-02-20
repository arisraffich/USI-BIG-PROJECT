export const EMAIL_TEMPLATE_SEEDS = [
  {
    slug: 'submission_confirmation',
    name: 'Submission Confirmation',
    description: 'Sent to the customer after they submit character forms.',
    subject: 'We received your submission!',
    body_html: `<h2>Thank You, {{authorFirstName}}!</h2>
<p>We've received your project submission and our illustrators are getting started!</p>
<p>Here's what happens next:</p>
<ol>
<li>We'll create character illustrations based on your descriptions</li>
<li>You'll receive an email to review and approve the characters</li>
<li>Full scene illustrations will be created and sent for your review</li>
</ol>`,
    closing_html: `<p>You'll receive email updates at each step. No action needed from you right now!</p>`,
    has_button: false,
    button_text: null,
    button_color: null,
    button_url_variable: null,
    available_variables: ['authorFirstName'],
    sort_order: 1,
  },
  {
    slug: 'submission_internal',
    name: 'Submission Internal Notification',
    description: 'Sent to info@ when a customer completes their submission.',
    subject: "{{authorName}}'s project submission is complete",
    body_html: `<p><strong>{{authorName}}</strong> has completed their project submission.</p>
<p><strong>Secondary Characters:</strong> {{secondaryCharacterCount}}</p>
<p><strong>Status:</strong> {{status}}</p>`,
    closing_html: null,
    has_button: true,
    button_text: 'View Project',
    button_color: '#2563eb',
    button_url_variable: 'projectAdminUrl',
    available_variables: ['authorName', 'secondaryCharacterCount', 'status', 'projectAdminUrl'],
    sort_order: 2,
  },
  {
    slug: 'define_secondary_characters',
    name: 'Define Secondary Characters',
    description: 'Stage 1 — Sent to the customer to fill out secondary character forms.',
    subject: 'Defining Secondary Characters for Your Book',
    body_html: `<h2>Stage 1: Defining Secondary Characters</h2>
<p>Hi {{authorFirstName}},</p>
<p>With your Main Character ready, it is time to define the rest of the cast.</p>
<p>Please click the link below to describe your secondary characters (age, style, clothing, etc.):</p>`,
    closing_html: `<p>Once submitted, our artists will start illustrating them for your review.</p>
<p>Best regards,</p>
<p><strong>US Illustrations Team</strong></p>`,
    has_button: true,
    button_text: 'Define Characters',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 3,
  },
  {
    slug: 'characters_ready_review',
    name: 'Characters Ready for Review',
    description: 'Stage 2 — Sent when character illustrations are ready for first review.',
    subject: 'Review Your Secondary Characters',
    body_html: `<h2>Stage 2: Character Illustrations Approval</h2>
<p>Hi {{authorFirstName}},</p>
<p>The illustrations for your secondary characters are complete and ready for review.</p>
<p>Please access your project dashboard below to view them:</p>`,
    closing_html: `<p>We will proceed to the next steps once all characters are approved.</p>
<p>Best regards,</p>
<p><strong>US Illustrations Team</strong></p>`,
    has_button: true,
    button_text: 'View Characters',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 4,
  },
  {
    slug: 'character_revisions',
    name: 'Character Revisions',
    description: 'Stage 2 — Sent when revised character illustrations are ready for review.',
    subject: 'Round {{revisionRound}} Review: Secondary Characters',
    body_html: `<h2>Stage 2: Character Revisions | Round {{revisionRound}}</h2>
<p>Hi {{authorFirstName}},</p>
<p>We have updated your secondary characters based on your recent feedback.</p>
<ul>
<li><strong>Request Edits:</strong> If further adjustments are still needed.</li>
<li><strong>Approve:</strong> If the changes are correct.</li>
</ul>
<p>We will finalize the characters once everything is approved.</p>`,
    closing_html: `<p>Best regards,</p>
<p><strong>US Illustrations Team</strong></p>`,
    has_button: true,
    button_text: 'Review Characters',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl', 'revisionRound'],
    sort_order: 5,
  },
  {
    slug: 'all_sketches_ready',
    name: 'All Sketches Ready',
    description: 'Stage 3 — Sent when all illustration sketches are ready for first review.',
    subject: 'Stage 3: Your Sketches Are Ready for Review',
    body_html: `<h2>All Sketches Ready</h2>
<p>Hi {{authorFirstName}},</p>
<p>Great news – all your illustration sketches are ready for review!</p>
<p>Please take your time going through each page. If anything needs adjusting, just click <strong>Request Revisions</strong> and add your notes. Once everything looks good, click <strong>Approve Sketches</strong> and we'll move forward with the final coloring.</p>
<p>Review them here:</p>`,
    closing_html: `<p>Looking forward to hearing what you think!</p>
<p>Best,</p>
<p><strong>US Illustrations Team</strong></p>`,
    has_button: true,
    button_text: 'Review All Sketches',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 6,
  },
  {
    slug: 'sketches_revised',
    name: 'Sketches Revised',
    description: 'Stage 3 — Sent when revised sketches are ready for review.',
    subject: 'Stage 3: Sketches Revised{{roundText}}',
    body_html: `<h2>Sketches Revised{{roundText}}</h2>
<p>Hi {{authorFirstName}},</p>
<p>We've made the changes you requested – take a look at the updated sketches and let us know what you think.</p>
<p>If it still needs some tweaking, no problem – just click <strong>Request Revisions</strong> and send over your notes. If everything looks good, click <strong>Approve Sketches</strong> and we'll move forward with the final coloring stage.</p>
<p>You can review them here:</p>`,
    closing_html: `<p>Talk soon,</p>
<p><strong>US Illustrations Team</strong></p>`,
    has_button: true,
    button_text: 'Review Sketches',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl', 'roundText'],
    sort_order: 7,
  },
  {
    slug: 'sketches_approved_download',
    name: 'Sketches Approved — Download',
    description: 'Internal — Sent to info@ with a download link when sketches are approved.',
    subject: 'Download {{authorName}} Sketches',
    body_html: `<p>{{authorName}} approved all sketches.</p>
<p>Download below</p>`,
    closing_html: null,
    has_button: true,
    button_text: 'Download Sketches',
    button_color: '#7c3aed',
    button_url_variable: 'downloadUrl',
    available_variables: ['authorName', 'downloadUrl'],
    sort_order: 8,
  },
  {
    slug: 'send_lineart_internal',
    name: 'Send Line Art',
    description: 'Internal — Sent to info@ with line art ZIP attachment.',
    subject: "{{customerName}}'s project is ready for coloring",
    body_html: `<p><strong>{{customerName}}'s</strong> project is ready for coloring.</p>
<p>Please download LineArt and Colored illustrations from the attached ZIP file.</p>
<p><small>Book: {{bookTitle}}</small></p>`,
    closing_html: null,
    has_button: false,
    button_text: null,
    button_color: null,
    button_url_variable: null,
    available_variables: ['customerName', 'bookTitle'],
    sort_order: 9,
  },
  {
    slug: 'send_sketches_internal',
    name: 'Send Sketches',
    description: 'Internal — Sent to info@ with sketches ZIP attachment.',
    subject: "{{customerName}}'s project is ready for coloring",
    body_html: `<p><strong>{{customerName}}'s</strong> project is ready for coloring.</p>
<p>Please download Sketches and Colored illustrations from the attached ZIP file.</p>
<p><small>Book: {{bookTitle}}</small></p>`,
    closing_html: null,
    has_button: false,
    button_text: null,
    button_color: null,
    button_url_variable: null,
    available_variables: ['customerName', 'bookTitle'],
    sort_order: 10,
  },
]

export const SAMPLE_VARIABLES: Record<string, string> = {
  authorFirstName: 'Sarah',
  authorName: 'Sarah Johnson',
  reviewUrl: 'https://example.com/review/abc123',
  projectAdminUrl: 'https://example.com/admin/project/abc123',
  downloadUrl: 'https://example.com/api/projects/abc123/download-illustrations',
  revisionRound: '2',
  roundText: ' | Round 2',
  secondaryCharacterCount: '3',
  status: 'character_generation',
  customerName: 'Sarah Johnson',
  bookTitle: 'The Magic Garden',
}
