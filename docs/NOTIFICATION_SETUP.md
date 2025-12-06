# Notification Setup Guide

This guide will help you set up email (Gmail), SMS (Quo.com), and Slack notifications for the USI Platform.

## 📧 Step 1: Gmail Email Setup

### Prerequisites
- Gmail account: `info@usillustrations.com`
- Two-Factor Authentication (2FA) enabled

### Steps

1. **Enable 2-Step Verification:**
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Under "Signing in to Google," click "2-Step Verification"
   - Follow the prompts to enable it

2. **Generate App Password:**
   - After enabling 2FA, return to [Google Account Security](https://myaccount.google.com/security)
   - Click "App Passwords" (under "Signing in to Google")
   - Select "Mail" as the app
   - Select "Other (Custom name)" as device
   - Enter name: "USI Platform Email"
   - Click "Generate"
   - **Copy the 16-character password** (you'll need this!)

3. **Add to .env.local:**
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=info@usillustrations.com
   SMTP_PASSWORD=your-16-character-app-password-here
   ```

### Test
Visit: `http://localhost:3000/api/notifications/test` to test email sending.

---

## 📱 Step 2: Quo.com SMS Setup

### Prerequisites
- Quo.com account (formerly OpenPhone)
- Active phone number in Quo.com

### Steps

1. **Get API Key:**
   - Log in to [Quo.com](https://quo.com)
   - Go to Settings → API (or Developer Settings)
   - Generate a new API key
   - **Copy the API key**

2. **Get Your Phone Number:**
   - In Quo.com dashboard, find your phone number
   - Format: E.164 format (e.g., `+1234567890`)
   - **Copy the phone number**

3. **Add to .env.local:**
   ```env
   QUO_API_KEY=your-api-key-here
   QUO_PHONE_NUMBER=+1234567890
   ```

### Test
Visit: `http://localhost:3000/api/notifications/test` to test SMS sending.
(You'll need to set `TEST_PHONE_NUMBER` in .env.local first)

---

## 💬 Step 3: Slack Webhook Setup

### Prerequisites
- Slack workspace
- Admin access (or permission to create apps)

### Steps

1. **Create Incoming Webhook:**
   - Go to [Slack API - Incoming Webhooks](https://api.slack.com/messaging/webhooks)
   - Click "Create New App" (or use existing app)
   - Select your workspace
   - Click "Incoming Webhooks"
   - Toggle "Activate Incoming Webhooks" to ON
   - Click "Add New Webhook to Workspace"
   - Select the channel where you want notifications
   - Click "Allow"
   - **Copy the Webhook URL** (starts with `https://hooks.slack.com/services/...`)

2. **Add to .env.local:**
   ```env
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

### Test
Visit: `http://localhost:3000/api/notifications/test` to test Slack notifications.

---

## ✅ Verification

After setting up all three services, test them:

```bash
curl http://localhost:3000/api/notifications/test
```

You should see:
```json
{
  "success": true,
  "results": {
    "email": { "success": true, "message": "..." },
    "sms": { "success": true, "message": "..." },
    "slack": { "success": true, "message": "..." }
  }
}
```

---

## 🔧 Troubleshooting

### Email Issues
- **"Invalid login"**: Make sure you're using the App Password, not your regular Gmail password
- **"Connection timeout"**: Check firewall/network settings
- **"Authentication failed"**: Verify 2FA is enabled and App Password is correct

### SMS Issues
- **"401 Unauthorized"**: Check your Quo.com API key
- **"Invalid phone number"**: Ensure phone number is in E.164 format (`+1234567890`)
- **"API endpoint not found"**: Quo.com may use a different endpoint - check their latest docs

### Slack Issues
- **"invalid_payload"**: Check webhook URL format
- **"channel_not_found"**: Verify the webhook is for the correct channel
- **"webhook_inactive"**: Recreate the webhook in Slack

---

## 📝 Complete .env.local Example

```env
# ... existing variables ...

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=info@usillustrations.com
SMTP_PASSWORD=abcd efgh ijkl mnop

# SMS (Quo.com)
QUO_API_KEY=your-quo-api-key
QUO_PHONE_NUMBER=+1234567890

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR_WORKSPACE_ID/YOUR_CHANNEL_ID/YOUR_TOKEN

# Optional: For testing SMS
TEST_PHONE_NUMBER=+1234567890
```

---

## 🚀 Next Steps

Once all notifications are configured:
1. Test each service individually
2. Test the complete workflow (create project → send notifications)
3. Monitor logs for any issues
4. Set up error alerts if needed












