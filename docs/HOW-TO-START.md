# 🚀 HOW TO START THE SERVER

## Method 1: Double-click the script (Easiest)

1. Open **Finder**
2. Navigate to: `/Users/aris/Documents/GitHub/USI Project/usi-platform`
3. **Double-click** the file `start.sh`
4. Terminal will open and start the server
5. Wait for: `▲ Next.js 16.0.7` and `- Local: http://localhost:3000`
6. Open Firefox and go to: **http://localhost:3000**

## Method 2: Terminal commands

1. Press **Cmd + Space** (Spotlight)
2. Type **"Terminal"** and press Enter
3. Copy and paste this **EXACT** command:

```bash
cd "/Users/aris/Documents/GitHub/USI Project/usi-platform" && npm run dev
```

4. Press **Enter**
5. Wait for the server to start (you'll see `▲ Next.js 16.0.7`)
6. Open Firefox and go to: **http://localhost:3000**

## ⚠️ IMPORTANT

- **Keep Terminal open** while using the app
- If you close Terminal, the server stops
- The server must be running for the app to work

## ✅ How to know it's working

You should see in Terminal:
```
▲ Next.js 16.0.7
- Local:        http://localhost:3000
```

Then Firefox should load the page (not show "Unable to connect").

## ❌ If it still doesn't work

1. Check Terminal for error messages (red text)
2. Make sure you're in the right directory
3. Try: `rm -rf .next && npm run dev` (fresh start)






