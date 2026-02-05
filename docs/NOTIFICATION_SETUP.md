# Notification Setup Guide

The USI Platform sends notifications via three channels: Email (Resend), SMS (Quo.com), and Slack.

## 1. Email (Resend)

### Setup

1. Create a [Resend](https://resend.com) account
2. Add and verify your sending domain
3. Generate an API key
4. Add to `.env.local`:

```env
RESEND_API_KEY=re_your-api-key-here
```

### What gets emailed
- Customer review links (when admin sends project for review)
- Approval confirmation emails
- ZIP file delivery to `info@usillustrations.com` (sketches and line art)

## 2. SMS (Quo.com) - Optional

### Setup

1. Create a [Quo.com](https://quo.com) account (formerly OpenPhone)
2. Get your API key from Settings > API
3. Get your phone number in E.164 format (e.g., `+1234567890`)
4. Add to `.env.local`:

```env
QUO_API_KEY=your-api-key-here
QUO_PHONE_NUMBER=+1234567890
```

### What gets sent via SMS
- Customer notification when project is ready for review

## 3. Slack Webhooks - Optional

### Setup

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Create a new app (or use existing) for your workspace
3. Enable Incoming Webhooks
4. Add a webhook to your desired channel
5. Copy the webhook URL
6. Add to `.env.local`:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### What gets sent to Slack
- New project created
- Characters submitted by customer
- Characters approved/revision requested
- Illustrations sent for review
- Customer feedback received
- Project approved
- Error alerts

See `docs/SLACK_SETUP_GUIDE.md` for detailed Slack setup instructions.

## Verification

All notification services fail gracefully - if one service is not configured or fails, the others still work. Check server logs for `[Notification]` prefixed messages to debug issues.
