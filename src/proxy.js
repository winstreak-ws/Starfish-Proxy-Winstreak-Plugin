/**
 * @fileoverview This file implements a single-player Minecraft proxy with Microsoft authentication,
 * a plugin system, and dynamic server switching capabilities.
 */

const mc = require('minecraft-protocol');
const EventEmitter = require('events');
const path = require('path');
const fs =require('fs');

const AuthManager = require('./auth');
const CommandHandler = require('./command-handler');
const PluginManager = require('./plugin-manager');

const PROXY_VERSION = '1.8.9';
const PROXY_NAME = '§6S§eta§fr§bfi§3sh §5Proxy§r'; // Configurable proxy display name
const PROXY_PREFIX = '§6S§eta§fr§bfi§3sh'; // Configurable chat prefix for alerts

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
    // For pkg, the base directory is where the executable is.
    // For node, it's the parent directory of /src
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


/**
 * Plugin API for the Minecraft proxy
 * 
 * Event System:
 * - 'clientPacketMonitor' / 'serverPacketMonitor': Passive monitoring (zero latency impact)
 * - 'clientPacketIntercept' / 'serverPacketIntercept': Can cancel packets (slight latency impact)
 * - 'clientPacket' / 'serverPacket': Legacy events (same as intercept, for backward compatibility)
 * 
 * For maximum performance, use Monitor events unless you need to cancel/modify packets.
 */
class ProxyAPI extends EventEmitter {
    constructor(proxyManager) {
        super();
        this.proxyManager = proxyManager;
    }
    
    get currentPlayer() {
        return this.proxyManager.currentPlayer;
    }

    get proxyName() {
        return PROXY_NAME;
    }

    get proxyPrefix() {
        return PROXY_PREFIX;
    }

    sendToClient(metaName, data) {
        if (!this.currentPlayer?.client) return false;
            this.currentPlayer.client.write(metaName, data);
            return true;
    }

    sendToServer(metaName, data) {
        if (!this.currentPlayer?.targetClient) return false;
            this.currentPlayer.targetClient.write(metaName, data);
            return true;
    }

    sendChatMessage(message) {
        if (!this.currentPlayer?.client) return false;
        return this.proxyManager.sendChatMessage(this.currentPlayer.client, message);
    }

    registerPlugin(pluginInfo) {
        return this.proxyManager.pluginManager.registerPlugin(pluginInfo);
    }
    
    setPluginEnabled(pluginName, enabled) {
        return this.proxyManager.pluginManager.setPluginEnabled(pluginName, enabled);
    }
    
    isPluginEnabled(pluginName) {
        return this.proxyManager.pluginManager.isPluginEnabled(pluginName);
    }
    
    getAllPluginStates() {
        return this.proxyManager.pluginManager.getAllPluginStates();
    }
    
    getLoadedPlugins() {
        return this.proxyManager.pluginManager.getLoadedPlugins();
    }


    /**
     * Override emit to filter events for disabled plugins
     */
    emit(eventName, ...args) {
        const listeners = this.listeners(eventName);
        
        const enabledListeners = this.proxyManager.pluginManager.filterEnabledListeners(listeners);
        
        enabledListeners.forEach(listener => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`Error in event listener:`, error);
            }
        });
        
        return this.listenerCount(eventName) > 0;
    }


    /**
     * Register commands for a plugin/module
     * @param {string} moduleName - The module name  
     * @param {object} commands - Commands object
     */
    registerCommands(moduleName, commands) {
        this.proxyManager.commandHandler.register(moduleName, commands);
    }

    kickPlayer(reason) {
        this.proxyManager.kickPlayer(reason);
    }
}


class ProxyManager {
    constructor() {
        this.config = loadConfig();
        this.proxyAPI = new ProxyAPI(this);
        this.authManager = new AuthManager(this, BASE_DIR);
        this.commandHandler = new CommandHandler(this);
        this.pluginManager = new PluginManager(this, this.proxyAPI, BASE_DIR);

        this.server = null;
        this.currentPlayer = null;
        this.waitingClient = null;
        this.isRestarting = false;
        this.authenticatedUsers = new Set();
        this.forceNextAuth = false;
        
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
     * Registers built-in proxy commands
     */
    registerProxyCommands() {
        this.commandHandler.register('proxy', {
            server: {
                description: 'List and switch servers',
                usage: '[name|host:port]',
                handler: (client, args) => {
                    if (args.length === 0) {
                        this.showServerList(client);
                    } else {
                        this.switchServer(client, args[0]);
                    }
                }
            },

            addserver: {
                description: 'Add a server to the list',
                usage: '<name> <host:port>',
                validate: [
                    /^[a-zA-Z0-9_-]+$/,
                    /^[a-zA-Z0-9.-]+:\d+$/
                ],
                handler: (client, args) => {
                    this.addServer(client, args[0], args[1]);
                }
            },

            removeserver: {
                description: 'Remove a server from the list',
                usage: '<name>',
                validate: /^[a-zA-Z0-9_-]+$/,
                handler: (client, args) => {
                    this.removeServer(client, args[0]);
                }
            },

            reauth: {
                description: 'Force re-authentication with Microsoft',
                handler: (client, args) => {
                    this.clearAuthAndRestart(client);
                }
            },

            plugins: {
                description: 'List all plugins and their status',
                handler: (client, args) => {
                    const pluginStates = this.proxyAPI.getAllPluginStates();
                    
                    if (pluginStates.length === 0) {
                        this.sendChatMessage(client, '§7No plugins loaded.');
                        return;
                    }
                    
                    let message = '§6========= Plugins ========\n';
                    for (const plugin of pluginStates) {
                        const status = plugin.enabled ? '§aEnabled' : '§cDisabled';
                        message += `§e${plugin.displayName}: ${status}\n`;
                    }
                    message += '§6========================';
                    
                    this.sendChatMessage(client, message);
                }
            }
        });
    }


    showServerList(client) {
        const current = `${this.config.targetHost}:${this.config.targetPort}`;
        let serverList = '§6Available Servers:\n';
        serverList += `§7Current: §a${current}\n\n`;
        
        Object.entries(this.config.servers).forEach(([name, server]) => {
            serverList += `§e${name} §7- §f${server.host}:${server.port}\n`;
        });
        
        this.sendChatMessage(client, serverList + '\n§7Usage: §f/proxy server <name|host:port>');
    }

    switchServer(client, target) {
        const { host, port } = this.parseServerTarget(target);
        
        this.config.targetHost = host;
        this.config.targetPort = port;
        this.saveConfig(this.config);
        
        this.sendChatMessage(client, `§aServer changed to §f${host}:${port}.`);
        
        if (this.currentPlayer) {
            this.restartServer(true, this.currentPlayer.client, '§aSwitching servers. Please reconnect.');
        }
    }

    parseServerTarget(target) {
        if (this.config.servers[target]) {
            return this.config.servers[target];
        }
        
        const [host, port] = target.split(':');
        return { host, port: parseInt(port) || 25565 };
    }

    addServer(client, name, hostPort) {
        const [host, port] = hostPort.split(':');
        this.config.servers[name] = { host, port: parseInt(port) || 25565 };
        this.saveConfig(this.config);
        this.sendChatMessage(client, `§aAdded server §f${name} (${host}:${port || 25565})`);
    }

    removeServer(client, name) {
        if (!this.config.servers[name]) {
            this.sendChatMessage(client, `§cServer §f${name} §cnot found.`);
            return;
        }
        
        delete this.config.servers[name];
        this.saveConfig(this.config);
        this.sendChatMessage(client, `§aRemoved server §f${name}`);
    }

    clearAuthAndRestart(client) {
        const username = client.username;
        this.authenticatedUsers.delete(username);
        this.forceNextAuth = true;
        
        this.clearAuthCache(username);
        this.sendChatMessage(client, '§aAuthentication cache cleared. The proxy will restart.');
        this.restartServer(false, client, '§aPlease reconnect to re-authenticate.');
    }

    clearAuthCache(username) {
        const authCachePath = path.join(BASE_DIR, 'auth_cache', username);
        if (!fs.existsSync(authCachePath)) return;
        fs.rmSync(authCachePath, { recursive: true, force: true });
        console.log(`Cleared auth cache for ${username}.`);
    }

    
    /**
     * Starts the proxy server, initially in offline mode for authentication.
     */
    start() {
        this.createServer(false);
        const target = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        console.log(`Default target: ${target}`);
    }

    
    /**
     * Creates and configures a minecraft-protocol server instance.
     * @param {boolean} onlineMode Whether to start the server in online mode.
     */
    createServer(onlineMode) {
        const motdStatus = onlineMode ? '§aAuthenticated' : '§7Pending Auth';
        const motd = this.generateMOTD(motdStatus);

        const serverConfig = {
            'online-mode': onlineMode,
            version: this.config.version,
            port: this.config.proxyPort,
            keepAlive: false,
            motd,
            maxPlayers: 1
        };

        this.server = mc.createServer(serverConfig);
        this.server.on('login', this.handlePlayerLogin.bind(this));
        this.server.on('error', (err) => console.error(`Proxy server error:`, err));
        this.server.on('listening', () => {
            console.log(`Server is now running in ${onlineMode ? 'online' : 'offline'} mode.`);
            this.isRestarting = false;
        });
    }

    
    /**
     * Restarts the proxy server, switching its online mode.
     * Kicks any connected player with a message to reconnect.
     * @param {boolean} newOnlineMode The desired online mode for the new server.
     * @param {mc.Client} [clientToKick] The specific client to kick.
     * @param {string} [kickMessage] The message to send to the client being kicked.
     */
    restartServer(newOnlineMode, clientToKick = null, kickMessage = '§eProxy is restarting. Please reconnect.') {
        if (this.isRestarting) return;
        this.isRestarting = true;
        
        console.log(`Restarting server.`);

        const client = clientToKick || this.currentPlayer?.client || this.waitingClient;

        if (this.currentPlayer) this.currentPlayer = null;
        if (this.waitingClient) this.waitingClient = null;

        if (client && client.state !== mc.states.DISCONNECTED) {
            client.end(kickMessage);
        }
    
        if (this.currentPlayer) this.currentPlayer = null;
        if (this.waitingClient) this.waitingClient = null;
        
        if (!this.server) {
            this.createServer(newOnlineMode);
            return;
        }
        
        this.server.close();
        this.server = null;
        setTimeout(() => this.createServer(newOnlineMode), 250);
    }

    
    /**
     * Generates the MOTD string based on loaded plugins and server status.
     * @param {string} statusText The current status text (e.g., Authenticated).
     * @returns {string} The formatted MOTD.
     */
    generateMOTD(statusText) {
        const pluginCount = this.proxyAPI.getLoadedPlugins().length;
        const pluginText = pluginCount > 0 ? `${pluginCount} Plugin${pluginCount > 1 ? 's' : ''}` : 'No Plugins';
        const targetDisplay = this.config.targetPort === 25565 ? this.config.targetHost : `${this.config.targetHost}:${this.config.targetPort}`;
        return `§6S§eta§fr§bfi§3sh §5Proxy§r §8| ${pluginText}\n§7Connected to: §e${targetDisplay} §8| ${statusText}`;
    }


    /**
     * Handles the login process for a connecting player.
     * @param {mc.Client} client The client object for the connecting player.
     */
    handlePlayerLogin(client) {
        if (this.isRestarting) {
            client.end('§cProxy is restarting, please reconnect in a moment...');
            return;
        }

        if (this.currentPlayer || this.waitingClient) {
            client.end('§cProxy is already in use.');
            return;
        }

        console.log(`Player ${client.username} connected.`);

        const isAuthenticated = this.authenticatedUsers.has(client.username);
        const isOnlineMode = this.server.options['online-mode'];

        if (isOnlineMode) {
            if (isAuthenticated) {
                this.connectToTarget(client);
            } else {
                console.log(`New user ${client.username} detected. Clearing old sessions and restarting for authentication.`);
                this.authenticatedUsers.clear();
                this.restartServer(false, client, `§ePlease reconnect to authenticate account: ${client.username}`);
            }
        } else {
            this.authManager.sendToAuthWorld(client);
        }
    }


    /**
     * Connects an authenticated player to the target server.
     * @param {mc.Client} client The player's client.
     */
    connectToTarget(client) {
        console.log(`Connecting ${client.username} to ${this.config.targetHost}`);

        const authCachePath = path.join(BASE_DIR, 'auth_cache', client.username);

        const targetClient = mc.createClient({
            host: this.config.targetHost,
            port: this.config.targetPort,
            username: client.username,
            version: this.config.version,
            auth: 'microsoft',
            hideErrors: false,
            profilesFolder: authCachePath
        });

        this.currentPlayer = {
            username: client.username,
            client,
            targetClient,
            entityId: null,
            joinTime: Date.now()
        };
        
        this.setupPacketForwarding();
    }


    /**
     * Sets up the two-way forwarding of packets between the client and target server.
     */
    setupPacketForwarding() {
        const { client, targetClient, username } = this.currentPlayer;
        
        let forwardingSetup = false;
        let cleanupDone = false;
    
        const doFinalCleanup = () => {
            if (cleanupDone) return;
            cleanupDone = true;
            
            if (this.currentPlayer) {
                this.proxyAPI.emit('playerLeave', { username, player: this.currentPlayer });
                this.currentPlayer = null;
            }
        };

        client.on('end', (reason) => {
            console.log(`Player ${username} disconnected.`);
            if (targetClient && targetClient.state !== mc.states.DISCONNECTED) {
                targetClient.end('Client disconnected');
            }
            doFinalCleanup();
        });
        
        client.on('error', (err) => {
            console.log(`Player ${username} disconnected.`);
            if (targetClient && targetClient.state !== mc.states.DISCONNECTED) {
                targetClient.end('Client error');
            }
            doFinalCleanup();
        });

        targetClient.on('end', (reason) => {
            if (client && client.state !== mc.states.DISCONNECTED) {
                client.end('Server disconnected');
            }
            doFinalCleanup();
        });
        
        targetClient.on('error', (err) => {
            if (client && client.state !== mc.states.DISCONNECTED) {
                client.end('Server error');
            }
            doFinalCleanup();
        });
        
        targetClient.on('login', (packet) => {
            console.log(`Joined ${this.config.targetHost} as ${username}.`);
            
            this.currentPlayer.entityId = packet.entityId;
            client.write('login', packet);
            this.proxyAPI.emit('playerJoin', { username, player: this.currentPlayer });
            
            if (!forwardingSetup) {
                forwardingSetup = true;
                
                client.on('packet', (data, meta) => {
                    if (meta.name === 'chat' && this.commandHandler.handleCommand(data.message, client)) {
                        return;
                    }
                    

                    const passiveEvent = { username, player: this.currentPlayer, data, meta };
                    this.proxyAPI.emit('clientPacketMonitor', passiveEvent);
                    
                    const interceptEvent = { username, player: this.currentPlayer, data, meta, cancelled: false };
                    this.proxyAPI.emit('clientPacketIntercept', interceptEvent);
                    
                    if (!interceptEvent.cancelled) {
                        targetClient.write(meta.name, data);
                    }
                });

                targetClient.on('packet', (data, meta) => {

                    const passiveEvent = { username, player: this.currentPlayer, data, meta };
                    this.proxyAPI.emit('serverPacketMonitor', passiveEvent);
                    
                    const interceptEvent = { username, player: this.currentPlayer, data, meta, cancelled: false };
                    this.proxyAPI.emit('serverPacketIntercept', interceptEvent);
                    
                    if (!interceptEvent.cancelled) {
                        client.write(meta.name, data);
                    }
                });
            }
        });
    }

    /**
     * Sends a formatted chat message to a client.
     * @param {mc.Client} client The recipient client.
     * @param {string} message The message to send.
     */
    sendChatMessage(client, message) {
        if (!client || client.state !== mc.states.PLAY) return;
        client.write('chat', {
        message: JSON.stringify({ text: message }),
        position: 0,
            sender: '0'
    });
    }


    /**
     * Kicks the current player or a specified client.
     * @param {string} reason The reason for kicking.
     */
    kickPlayer(reason) {
        const target = this.currentPlayer?.client;
        target.end(reason);
    }
}


const proxyManager = new ProxyManager();
proxyManager.start();
