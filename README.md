# Minecraft Proxy with AntiCheat & Denicker

A powerful and user-friendly Minecraft proxy server with built-in anticheat detection and player denicking capabilities.

## Features

- **🚀 Easy Setup**: Automatic Microsoft account authentication on first connect
- **🔄 Server Switching**: Change servers without restarting the proxy
- **🛡️ Advanced AntiCheat**: Detects various cheats including:
  - NoSlow (moving at full speed while using items)
  - AutoBlock (attacking while blocking)
  - Velocity/Knockback modifications
  - Invalid rotations
  - Scaffold cheats
- **🎭 Denicker System**: Detects nicked players by analyzing skin data
- **📦 Plugin System**: Easy to extend with new features
- **⏰ No Timeouts**: Stay connected while authenticating

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Proxy

```bash
node proxy.js
```

### 3. Connect with Minecraft

1. Open Minecraft and add server `localhost`
2. You'll see the proxy MOTD show your currently selected server and plugins
3. Connect to the server
4. **Follow the authentication prompt** - a browser window will open automatically
5. Complete Microsoft login
6. You're connected!

## In-Game Commands

### 🌐 Server Management

- `/server` - List available servers and see current connection
- `/server <name>` - Quick switch to a predefined server
- `/server <host:port>` - Connect to any server
- `/addserver <name> <host:port>` - Save a server for quick access
- `/removeserver <name>` - Remove a saved server

### 🛡️ AntiCheat Commands

#### Per-Check Commands
- `/ac info <check>` - Show check description and settings.
- `/ac toggle <check>` - Toggle alerts for a check.
- `/ac sound <check>` - Toggle the "ding" sound for a check.
- `/ac vl <check> <number>` - Set the violation level needed to flag.
- `/ac cooldown <check> <seconds>` - Set the time between flags for a check.
- `/ac reset <check>` - Reset a check to its default settings.

#### Global Commands
- `/ac help` - Shows all available anticheat commands.
- `/ac checks` - Shows the status of all checks (alerts and sounds).
- `/ac on|off` - Turns the entire anticheat system on or off.
- `/ac debug` - Toggles debug mode for developers.

### 🎭 Denicker Commands

- `/denick help` - Show available commands
- `/denick status` - Check if denicker is enabled
- `/denick toggle` - Enable/disable denicker
- `/denick failed` - Toggle showing failed denick attempts
- `/denick debug` - Toggle debug mode

### 📚 General

- `/help` or `/proxy` - Show all proxy commands

## Server Switching

The proxy makes it easy to switch between servers:

```
/server hypixel     # Switch to Hypixel
/server anticheat-test # Switch to the anticheat test server
/server play.example.com:25565  # Connect to custom server
```

When you switch servers, the proxy will:
1. Save your choice
2. Disconnect you with a message
3. Use the new server when you reconnect



### AntiCheat False Positives

- Use `/ac check <CheckName> toggle` to disable problematic checks

## Extending the Proxy

Create new plugins in the `scripts/` directory:

```javascript
module.exports = (proxyAPI) => {
    // Listen for server packets
    proxyAPI.on('serverPacket', (event) => {
        const { username, data, meta } = event;
        // Process packets
    });
    
    // Listen for client packets
    proxyAPI.on('clientPacket', (event) => {
        const { username, data, meta } = event;
        // Cancel packet: event.cancelled = true;
    });
    
    // Send chat messages
    proxyAPI.sendToClient(username, 'chat', {
        message: JSON.stringify({ text: 'Hello!' }),
        position: 0
    });
};
```

## Security Notes

- Keep your `auth-cache/` directory secure - it contains auth tokens
