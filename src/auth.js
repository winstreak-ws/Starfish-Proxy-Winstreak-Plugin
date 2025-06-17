const mc = require('minecraft-protocol');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

class AuthManager {
    constructor(proxyManager, baseDir) {
        this.proxyManager = proxyManager;
        this.BASE_DIR = baseDir;
    }

    /**
     * Places a client in a temporary world to perform Microsoft authentication.
     * @param {mc.Client} client The player's client.
     */
    sendToAuthWorld(client) {
        this.proxyManager.waitingClient = client;

        const keepAliveInterval = setInterval(() => {
            if (client.state === mc.states.PLAY) {
                client.write('keep_alive', { keepAliveId: Math.floor(Math.random() * 2147483647) });
            }
        }, 15000);

        client.on('end', () => {
            clearInterval(keepAliveInterval);
            this.proxyManager.waitingClient = null;
        });

        client.write('login', {
            entityId: 1, gameMode: 2, dimension: 0, difficulty: 0,
            maxPlayers: 1, levelType: 'flat', reducedDebugInfo: false
        });
        client.write('position', { x: 0.5, y: 7, z: 0.5, yaw: 0, pitch: 0, flags: 0 });
        
        client.on('chat', (packet) => {
            if (packet.message.startsWith('/')) {
                this.proxyManager.commandHandler.handleProxyCommand(packet.message, client);
            }
        });

        this.initiateMicrosoftAuth(client);
    }

    /**
     * Initiates the Microsoft auth flow for a client in the waiting world.
     * @param {mc.Client} client The client to authenticate.
     */
    initiateMicrosoftAuth(client) {
        const username = client.username;
        const targetDisplay = this.proxyManager.config.targetPort === 25565 ? this.proxyManager.config.targetHost : `${this.proxyManager.config.targetHost}:${this.proxyManager.config.targetPort}`;

        const authMessages = [
            '§6========================================',
            '       §6S§eta§fr§bfi§3sh §5P§5roxy §e- Authentication',
            '§6========================================',
            `§7➤ §e§lConnecting with: §f${username}`,
            `§7➤ §7Target Server: §f${targetDisplay}`,
            `§7➤ §b§lCommands: §f/proxy help`,
            '§6========================================'
        ];
        this.proxyManager.sendChatMessage(client, authMessages.join('\n'));

        const authCachePath = path.join(this.BASE_DIR, 'auth_cache', username);
        if (!fs.existsSync(authCachePath)) {
            fs.mkdirSync(authCachePath, { recursive: true });
        }

        const forceRefresh = this.proxyManager.forceNextAuth;
        if (this.proxyManager.forceNextAuth) this.proxyManager.forceNextAuth = false;

        const authClient = mc.createClient({
            host: this.proxyManager.config.targetHost,
            port: this.proxyManager.config.targetPort,
            username: username,
            version: this.proxyManager.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: authCachePath,
            forceRefresh: forceRefresh,
            onMsaCode: (data) => {
                const url = `${data.verification_uri}?otc=${data.user_code}`;
                this.proxyManager.sendChatMessage(client, `§6Microsoft Auth Required!\n§7Visit ${url} if it does not open automatically.`);
                
                const platform = process.platform;
                const cmd = platform === 'darwin' ? `open "${url}"` : platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
                exec(cmd);
            }
        });
        
        authClient.on('session', () => {
            const realUsername = authClient.session.selectedProfile.name;
            console.log(`Authenticated as ${realUsername}.`);
            this.proxyManager.sendChatMessage(client, `§a✓ Authenticated as ${realUsername}`);
            this.proxyManager.authenticatedUsers.add(realUsername);
            authClient.end();

            this.proxyManager.restartServer(true, client, `§aAuthenticated as ${realUsername}. Please reconnect.`);
        });
        
        authClient.on('error', (err) => {
             this.proxyManager.sendChatMessage(client, `§cAuthentication failed: ${err.message}`);
             client.end('§cPlease check your connection or credentials and reconnect.');
        });
        
        authClient.on('end', () => {
             if (!this.proxyManager.authenticatedUsers.has(username)) {
                this.proxyManager.sendChatMessage(client, '§cAuthentication process ended unexpectedly.');
            }
        });
    }
}

module.exports = AuthManager;
