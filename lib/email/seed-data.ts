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
    slug: 'story_followup_v1',
    name: 'Story Follow-Up 1',
    description: 'Follow-up 1 — Reminds the customer to complete project details.',
    subject: 'Quick reminder to complete your project details',
    body_html: `<h2>Quick Reminder</h2>
<p>Hi {{authorFirstName}},</p>
<p>Just a friendly reminder to complete your project details when you have a moment.</p>
<p>We need your story text, scene descriptions, and character details before our team can begin the illustration process.</p>
<p>You can continue your submission using the button below.</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Complete Project Details',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 20,
  },
  {
    slug: 'story_followup_v2',
    name: 'Story Follow-Up 2',
    description: 'Follow-up 2 — Clearer reminder that the project is waiting on details.',
    subject: 'Your project is waiting for your details',
    body_html: `<h2>Your Project Is Waiting</h2>
<p>Hi {{authorFirstName}},</p>
<p>We're still waiting for your project details so we can move forward.</p>
<p>Once your story, scene descriptions, and character forms are submitted, our artists can begin preparing the next stage.</p>
<p>Please complete the remaining details here:</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Complete Project Details',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 21,
  },
  {
    slug: 'story_followup_v3',
    name: 'Story Follow-Up 3',
    description: 'Follow-up 3 — Final reminder to complete project details.',
    subject: 'Final reminder to complete your project details',
    body_html: `<h2>Final Reminder</h2>
<p>Hi {{authorFirstName}},</p>
<p>This is a final reminder to complete your project details.</p>
<p>We won't be able to begin the illustration process until your story, scene descriptions, and character details are submitted.</p>
<p>If you're ready, you can complete everything here:</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Complete Project Details',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 22,
  },
  {
    slug: 'character_followup_v1',
    name: 'Character Follow-Up 1',
    description: 'Follow-up 1 — Reminds the customer to review characters.',
    subject: 'Reminder: your characters are ready for review',
    body_html: `<h2>Your Characters Are Ready</h2>
<p>Hi {{authorFirstName}},</p>
<p>Just a friendly reminder that your character illustrations are ready for review.</p>
<p>Please take a look and either approve them or leave revision notes so we know what to adjust.</p>
<p>You can review your characters using the button below.</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Review Characters',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 23,
  },
  {
    slug: 'character_followup_v2',
    name: 'Character Follow-Up 2',
    description: 'Follow-up 2 — Clearer reminder that character review is pending.',
    subject: 'Your character review is still pending',
    body_html: `<h2>Character Review Pending</h2>
<p>Hi {{authorFirstName}},</p>
<p>We're still waiting for your character review before we can continue to the next stage.</p>
<p>Please approve the characters if they look good, or send us revision notes if anything needs to be changed.</p>
<p>You can review them here:</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Review Characters',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 24,
  },
  {
    slug: 'character_followup_v3',
    name: 'Character Follow-Up 3',
    description: 'Follow-up 3 — Final reminder to review characters.',
    subject: 'Final reminder to review your characters',
    body_html: `<h2>Final Character Review Reminder</h2>
<p>Hi {{authorFirstName}},</p>
<p>This is a final reminder that your character review is still pending.</p>
<p>We'll need your approval or revision notes before we can move forward with the illustration sketches.</p>
<p>Please review your characters here when you're ready:</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Review Characters',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 25,
  },
  {
    slug: 'sketch_followup_v1',
    name: 'Sketch Follow-Up 1',
    description: 'Follow-up 1 — Reminds the customer to review sketches.',
    subject: 'Reminder: your sketches are ready for review',
    body_html: `<h2>Your Sketches Are Ready</h2>
<p>Hi {{authorFirstName}},</p>
<p>Just a friendly reminder that your illustration sketches are ready for review.</p>
<p>Please review each page and either approve the sketches or leave revision notes where changes are needed.</p>
<p>You can review your sketches using the button below.</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Review Sketches',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 26,
  },
  {
    slug: 'sketch_followup_v2',
    name: 'Sketch Follow-Up 2',
    description: 'Follow-up 2 — Clearer reminder that sketch review is pending.',
    subject: 'Your sketch review is still pending',
    body_html: `<h2>Sketch Review Pending</h2>
<p>Hi {{authorFirstName}},</p>
<p>We're still waiting for your sketch review before we can continue.</p>
<p>Please approve the sketches if everything looks good, or send revision notes for any pages that need changes.</p>
<p>You can continue your review here:</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Review Sketches',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 27,
  },
  {
    slug: 'sketch_followup_v3',
    name: 'Sketch Follow-Up 3',
    description: 'Follow-up 3 — Final reminder to review sketches.',
    subject: 'Final reminder to review your sketches',
    body_html: `<h2>Final Sketch Review Reminder</h2>
<p>Hi {{authorFirstName}},</p>
<p>This is a final reminder that your sketch review is still pending.</p>
<p>We'll need your approval or revision notes before we can move forward with the next stage.</p>
<p>Please review your sketches here when you're ready:</p>`,
    closing_html: `<p>Best,</p>
<p><strong>Karine</strong></p>`,
    has_button: true,
    button_text: 'Review Sketches',
    button_color: '#2563eb',
    button_url_variable: 'reviewUrl',
    available_variables: ['authorFirstName', 'reviewUrl'],
    sort_order: 28,
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
