/**
 * @fileoverview This file implements a single-player Minecraft proxy with Microsoft authentication,
 * a plugin system, and dynamic server switching capabilities.
 */

const mc = require('minecraft-protocol');
const path = require('path');
const fs =require('fs');

const { PlayerSession } = require('./session');
const CommandHandler = require('./command-system');
const { PluginManager, PluginAPI, PROXY_NAME } = require('./plugin-system');

const PROXY_VERSION = '1.8.9';

const DEFAULT_CONFIG = {
    proxyPort: 25565,
    targetHost: 'mc.hypixel.net',
    targetPort: 25565,
    version: PROXY_VERSION,
    servers: {
        'hypixel': { host: 'mc.hypixel.net', port: 25565 },
        'ac-test': { host: 'anticheat-test.com', port: 25565 }
    }
};


/**
 * Determines the base directory of the application, supporting both packaged executables and node scripts.
 * @returns {string} The base directory path.
 */
function getBaseDirectory() {
    return process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
}

const BASE_DIR = getBaseDirectory();
const CONFIG_FILE = path.join(BASE_DIR, 'proxy-config.json');


/**
 * Loads configuration from a JSON file, falling back to defaults.
 * @returns {object} The loaded configuration.
 */
function loadConfig() {
    let config = { ...DEFAULT_CONFIG };
    if (fs.existsSync(CONFIG_FILE)) {
    try {
            const loadedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        Object.assign(config, loadedConfig);
        console.log('Loaded configuration from proxy-config.json');
    } catch (err) {
            console.error('Failed to load config, using defaults:', err.message);
    }
}
    return config;
}


class ProxyManager {
    constructor() {
        this.config = loadConfig();
        this.proxyAPI = new PluginAPI(this);
        this.commandHandler = new CommandHandler(this);
        this.pluginManager = new PluginManager(this, this.proxyAPI, BASE_DIR);
        this.BASE_DIR = BASE_DIR;

        this.server = null;
        this.currentPlayer = null;
        this.forceNextAuth = false;
        this.loginAttempts = new Map();
        
        this.registerProxyCommands();
        this.pluginManager.loadPlugins();
    }

    
    /**
     * Saves the current configuration to its file.
     * @param {object} config The configuration object to save.
     */
    saveConfig(config) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    }


    /**
     * Registers built-in proxy commands using the new fluent command handler.
     */
    registerProxyCommands() {
        this.commandHandler.register('proxy', (registry) => {
            const { command, THEME } = registry;

            command('server')
                .description('List and switch servers.')
                .argument('target', { optional: true, description: 'Server name or host:port to connect to.' })
                .handler((ctx) => {
                    if (!ctx.args.target) {
                        const chat = ctx.createChat();
                        const current = `${this.config.targetHost}:${this.config.targetPort}`;

                        chat.text('--- Available Servers ---', THEME.header).newline();
                        chat.text('Current: ', THEME.secondary).text(current, THEME.success).newline().newline();

                        Object.entries(this.config.servers).forEach(([name, server]) => {
                            chat.button(`${THEME.accent}[${name}]`, `/proxy server ${name}`, `Click to switch to ${name}`)
                                .space()
                                .text(`${server.host}:${server.port}`, THEME.muted)
                                .newline();
                        });
                        chat.send();
                    } else {
                        this.switchServer(ctx.args.target);
                    }
                });

            command('addserver')
                .description('Add a server to the list.')
                .argument('name', { description: 'A short name for the server.' })
                .argument('hostport', { description: 'The server address as host:port.' })
                .handler((ctx) => {
                    const { name, hostport } = ctx.args;
                    const [host, port] = hostport.split(':');
                    if (!host || !port) {
                        return ctx.sendError('Invalid format. Use <name> <host>:<port>');
                    }
                    this.config.servers[name] = { host, port: parseInt(port) };
                    this.saveConfig(this.config);
                    ctx.sendSuccess(`Added server '${name}' (${hostport})`);
                });

            command('removeserver')
                .description('Remove a server from the list.')
                .argument('name', { description: 'The name of the server to remove.' })
                .handler((ctx) => {
                    const { name } = ctx.args;
                    if (!this.config.servers[name]) {
                        return ctx.sendError(`Server '${name}' not found.`);
                    }
                    delete this.config.servers[name];
                    this.saveConfig(this.config);
                    ctx.sendSuccess(`Removed server '${name}'.`);
                });

            command('reauth')
                .description('Force re-authentication on next login.')
                .handler((ctx) => {
                    if (!this.currentPlayer) {
                        return ctx.sendError('You are not connected to a server.');
                    }
                    this.forceNextAuth = true;
                    const username = this.currentPlayer.username;
                    const authCachePath = path.join(BASE_DIR, 'auth_cache', username);
                    if (fs.existsSync(authCachePath)) {
                        fs.rmSync(authCachePath, { recursive: true, force: true });
                        console.log(`Cleared auth cache for ${username}.`);
                    }
                    ctx.sendSuccess('Auth cache cleared. Reconnect to re-authenticate.');
                });

            command('plugins')
                .description('List all loaded plugins and their status.')
                .handler((ctx) => {
                    const pluginStates = this.proxyAPI.getAllPluginStates();
                    if (pluginStates.length === 0) {
                        return ctx.send(`${THEME.muted}No plugins loaded.`);
                    }
                    const chat = ctx.createChat();
                    chat.text('--- Plugins ---', THEME.header).newline();
                    for (const plugin of pluginStates) {
                        const status = plugin.enabled ? `${THEME.success}Enabled` : `${THEME.error}Disabled`;
                        chat.text(`${plugin.displayName}§r: `, THEME.secondary)
                            .text(status)
                            .newline();
                    }
                    chat.send();
                });
        });
    }

    checkRateLimit(username) {
        const now = Date.now();
        const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
        
        if (now - attempts.lastAttempt > 20000) {
            attempts.count = 0;
        }
        
        if (attempts.count >= 2) {
            const timeSinceLastAttempt = now - attempts.lastAttempt;
            if (timeSinceLastAttempt < 20000) {
                return true;
            }
        }
        
        attempts.count++;
        attempts.lastAttempt = now;
        this.loginAttempts.set(username, attempts);
        
        for (const [user, data] of this.loginAttempts.entries()) {
            if (now - data.lastAttempt > 60000) {
                this.loginAttempts.delete(user);
            }
        }
        
        return false;
    }


    switchServer(target) {
        if (!this.currentPlayer) return;

        const serverInfo = this.parseServerTarget(target);
        if (!serverInfo) {
            this.sendChatMessage(this.currentPlayer.client, `§cInvalid server target: ${target}`);
            return;
        }

        const username = this.currentPlayer.username;
        if (this.checkRateLimit(username)) {
            this.sendChatMessage(this.currentPlayer.client, `§cYou will be rate limited by Microsoft for 20 seconds. Please wait before switching servers.`);
            return;
        }

        this.config.targetHost = serverInfo.host;
        this.config.targetPort = serverInfo.port;
        this.saveConfig(this.config);
        this.updateServerMOTD();
        
        let displayName = target;
        if (this.config.servers[target]) {
            displayName = target;
        } else {
            displayName = `${serverInfo.host}:${serverInfo.port}`;
        }
        
        this.kickPlayer(`§aSwitched to ${displayName}; please reconnect.`);
    }

    parseServerTarget(target) {
        if (this.config.servers[target]) {
            return this.config.servers[target];
        }
        
        const [host, port] = target.split(':');
        return { host, port: parseInt(port) || 25565 };
    }

    
    /**
     * Starts the proxy server.
     */
    start() {
        this.createServer();
        const target = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        console.log(`Default target: ${target}`);
    }

    
    /**
     * Creates and configures the minecraft-protocol server instance.
     */
    createServer() {
        const motd = this.generateMOTD();

        const serverConfig = {
            'online-mode': true,
            version: this.config.version,
            port: this.config.proxyPort,
            keepAlive: false,
            motd,
            maxPlayers: 1,
            beforeLogin: (client) => {
                if (client.protocolVersion !== 47) {
                    console.log(`[LOGIN][REJECT] ${client.socket.remoteAddress}:${client.socket.remotePort} tried ${client.protocolVersion}`);
                    client.end(`§cPlease connect using ${PROXY_VERSION}`);
                }
            }
        };

        this.server = mc.createServer(serverConfig);
        this.server.on('login', this.handlePlayerLogin.bind(this));
        this.server.on('error', (err) => console.error(`Proxy server error:`, err));
        this.server.on('listening', () => {
            console.log(`Server is running in online mode.`);
        });
    }

    /**
     * Updates the server's MOTD to reflect current configuration
     */
    updateServerMOTD() {
        if (this.server) {
            this.server.motd = this.generateMOTD();
        }
    }

    /**
     * Generates the MOTD string based on loaded plugins and server status.
     * @returns {string} The formatted MOTD.
     */
    generateMOTD() {
        const pluginCount = this.proxyAPI.getLoadedPlugins().length;
        const pluginText = pluginCount > 0 ? `${pluginCount} Plugin${pluginCount > 1 ? 's' : ''}` : 'No Plugins';
        const targetDisplay = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        return `${PROXY_NAME} §8| ${pluginText}\n§7Connected to: §e${targetDisplay}`;
    }


    /**
     * Handles the login process for a connecting player.
     * @param {mc.Client} client The client object for the connecting player.
     */
    handlePlayerLogin(client) {
        if (this.currentPlayer) {
            client.end('§cProxy is already in use.');
            return;
        }
        this.currentPlayer = new PlayerSession(this, client);
    }

    clearSession() {
        if (this.currentPlayer) {
            console.log(`Session cleared for ${this.currentPlayer.username}.`);
            this.currentPlayer = null;
        }
    }


    /**
     * Sends a chat message to a client.
     * @param {object} client The client to send the message to.
     * @param {string} message The message to send.
     */
    sendChatMessage(client, message) {
        if (!client || client.state !== mc.states.PLAY) return;
        const isJson = typeof message === 'string' && message.trim().startsWith('{');
        const jsonPayload = isJson ? message : JSON.stringify({ text: message });
        client.write('chat', {
            message: jsonPayload,
            position: 0,
            sender: '0'
        });
    }

    getJoinState() {
        return this.currentPlayer ? this.currentPlayer.gameState.getSnapshot() : null;
    }

    /**
     * Kicks the current player or a specified client.
     * @param {string} reason The reason for kicking.
     */
    kickPlayer(reason) {
        if (this.currentPlayer) {
            this.currentPlayer.end(reason);
        }
    }
}


const proxyManager = new ProxyManager();
proxyManager.start();
