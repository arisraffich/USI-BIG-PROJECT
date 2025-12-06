# Gmail SMTP Setup Guide for USI Platform

## Step-by-Step Instructions

### Step 1: Enable 2-Step Verification

1. **Go to Google Account Security:**
   - Visit: https://myaccount.google.com/security
   - Sign in with: `info@usillustrations.com`

2. **Enable 2-Step Verification:**
   - Under "Signing in to Google," click **"2-Step Verification"**
   - Click **"Get Started"** and follow the prompts
   - You'll need to verify your phone number
   - Complete the setup process

### Step 2: Generate App Password

1. **Go to App Passwords:**
   - After enabling 2FA, return to: https://myaccount.google.com/security
   - Under "Signing in to Google," click **"App Passwords"**
   - (If you don't see "App Passwords," make sure 2-Step Verification is enabled)

2. **Create App Password:**
   - Select app: **"Mail"**
   - Select device: **"Other (Custom name)"**
   - Enter name: **"USI Platform Email"**
   - Click **"Generate"**

3. **Copy the Password:**
   - A 16-character password will appear (format: `xxxx xxxx xxxx xxxx`)
   - **Copy this password immediately** - you won't be able to see it again!
   - Remove spaces when using it (or keep spaces, both work)

### Step 3: Add to .env.local

Once you have the App Password, I'll add it to your `.env.local` file with these settings:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=info@usillustrations.com
SMTP_PASSWORD=your-16-character-app-password-here
```

### Step 4: Test Email Sending

After adding the credentials, we'll test by:
1. Sending a test email to your Gmail account
2. Verifying it arrives successfully

---

## Troubleshooting

**"App Passwords" option not showing:**
- Make sure 2-Step Verification is fully enabled
- Try refreshing the page
- Make sure you're signed in with the correct account

**"Invalid login" error:**
- Make sure you're using the App Password, NOT your regular Gmail password
- Check that there are no extra spaces in the password
- Verify 2-Step Verification is enabled

**"Connection timeout":**
- Check your firewall/network settings
- Verify SMTP settings: `smtp.gmail.com:587`

---

## Quick Links

- [Google Account Security](https://myaccount.google.com/security)
- [2-Step Verification Setup](https://myaccount.google.com/signinoptions/two-step-verification)
- [App Passwords](https://myaccount.google.com/apppasswords)

---

**Ready?** Follow Steps 1-2 above, then share your App Password and I'll add it to your configuration!












