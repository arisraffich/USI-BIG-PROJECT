# How to Start the Development Server

## Quick Start

1. **Open Terminal** (Applications → Utilities → Terminal, or press Cmd+Space and type "Terminal")

2. **Navigate to the project:**
   ```bash
   cd "/Users/aris/Documents/GitHub/USI Project/usi-platform"
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

4. **Wait for this message:**
   ```
   ▲ Next.js 16.0.7
   - Local:        http://localhost:3000
   ```

5. **Open your browser** and go to: http://localhost:3000

## If You See Errors

- **Port already in use:** Try `PORT=3001 npm run dev` and go to http://localhost:3001
- **Permission errors:** Make sure you're running Terminal normally (not as root)
- **Module errors:** Run `npm install` first

## Keep Terminal Open

**Important:** Keep the Terminal window open while using the app. Closing it will stop the server.






