# Slack Webhook Setup Guide for USI Platform

## Step-by-Step Instructions

### Step 1: Create a Slack App

1. **Go to Slack API:**
   - Visit: https://api.slack.com/apps
   - Sign in with your Slack workspace

2. **Create New App:**
   - Click **"Create New App"**
   - Select **"From scratch"**
   - Enter App Name: **"USI Platform"** (or any name you prefer)
   - Select your workspace
   - Click **"Create App"**

### Step 2: Enable Incoming Webhooks

1. **Navigate to Incoming Webhooks:**
   - In your app settings, click **"Incoming Webhooks"** in the left sidebar
   - Toggle **"Activate Incoming Webhooks"** to **ON**

2. **Add New Webhook:**
   - Scroll down and click **"Add New Webhook to Workspace"**
   - Select the channel where you want notifications (e.g., `#general`, `#notifications`, or create a new channel)
   - Click **"Allow"**

3. **Copy Webhook URL:**
   - A Webhook URL will be generated (format: `https://hooks.slack.com/services/YOUR_WORKSPACE_ID/YOUR_CHANNEL_ID/YOUR_TOKEN`)
   - **Copy this URL** - you'll need it!

### Step 3: Add to .env.local

Once you have the Webhook URL, I'll add it to your `.env.local` file:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Step 4: Test Slack Notification

After adding the webhook URL, we'll test by sending a test notification to your Slack channel.

---

## Quick Links

- [Slack API Apps](https://api.slack.com/apps)
- [Incoming Webhooks Guide](https://api.slack.com/messaging/webhooks)

---

## What Notifications Will Be Sent

Once configured, Slack will receive:
- ✅ Project status updates
- ✅ Character generation complete notifications
- ✅ Sketch generation complete notifications
- ⚠️ Error alerts

---

**Ready?** Follow Steps 1-2 above, then share your Webhook URL and I'll add it to your configuration!












