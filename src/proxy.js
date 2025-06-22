const mc = require('minecraft-protocol');
const path = require('path');
const fs = require('fs');

const { PlayerSession } = require('./session');
const { CommandHandler } = require('./command-handler');
const { PluginAPI } = require('./plugin-api');
const { Storage } = require('./storage');

const PROXY_VERSION = '1.8.9';
const PROXY_PORT = 25565;
const PROXY_PREFIX = '§6S§eta§fr§bfi§3sh§r';

class MinecraftProxy {
    constructor() {
        this.PROXY_PREFIX = PROXY_PREFIX;
        this.storage = new Storage(path.join(this.getBaseDir(), 'data'));
        this.config = this.storage.loadConfig();
        this.pluginAPI = new PluginAPI(this);
        this.commandHandler = new CommandHandler(this);

        this.server = null;
        this.currentPlayer = null;
        this.loginAttempts = new Map();
        
        this.initializeProxy();
    }

    getBaseDir() {
        return process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
    }

    initializeProxy() {
        this.registerProxyCommands();
        this.pluginAPI.loadPlugins();
        this.createServer();
    }
    
    createServer() {
        this.server = mc.createServer({
            'online-mode': true,
            version: PROXY_VERSION,
            port: this.config.proxyPort || PROXY_PORT,
            keepAlive: false,
            motd: this.generateMOTD(),
            maxPlayers: 1,
            beforeLogin: (client) => {
                if (client.protocolVersion !== 47) {
                    client.end(`§cPlease connect using ${PROXY_VERSION}`);
                }
            }
        });
        
        this.server.on('login', (client) => this.handleLogin(client));
        this.server.on('listening', () => {
            console.log(`Proxy server listening on port ${this.config.proxyPort || PROXY_PORT}`);
            console.log(`Target server: ${this.getTargetDisplay()}`);
                });
    }
    
    handleLogin(client) {
        if (this.currentPlayer) {
            client.end('§cProxy is already in use.');
            return;
        }
        
        if (this.checkRateLimit(client.username)) {
            client.end('§cPlease wait 20 seconds before reconnecting (Microsoft rate limit).');
            return;
                    }
        
        client.on('end', () => {
            console.log(`Client ${client.username} disconnected`);
            if (this.currentPlayer) {
                this.currentPlayer.disconnect('Client disconnected from proxy.');
            }
        });
        
        client.on('error', (err) => {
            console.log(`Client ${client.username} error: ${err.message}`);
            if (this.currentPlayer) {
                this.currentPlayer.disconnect(`Client error: ${err.message}`);
            }
        });
        
        this.currentPlayer = new PlayerSession(this, client);
    }

    checkRateLimit(username) {
        const now = Date.now();
        const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: 0 };
        
        if (now - attempts.lastAttempt > 20000) attempts.count = 0;
        if (attempts.count >= 2 && now - attempts.lastAttempt < 20000) return true;
        
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

    registerProxyCommands() {
        this.commandHandler.register('proxy', (registry) => {
            const { command } = registry;
            
            command('server')
                .description('List and switch servers')
                .argument('target', { optional: true })
                .handler((ctx) => this.handleServerCommand(ctx));
            
            command('addserver')
                .description('Add a server to the list')
                .argument('name')
                .argument('hostport')
                .handler((ctx) => this.handleAddServerCommand(ctx));
            
            command('removeserver')
                .description('Remove a server from the list')
                .argument('name')
                .handler((ctx) => this.handleRemoveServerCommand(ctx));
            
            command('reauth')
                .description('Force re-authentication')
                .handler((ctx) => this.handleReauthCommand(ctx));
            
            command('plugins')
                .description('List loaded plugins')
                .handler((ctx) => this.handlePluginsCommand(ctx));
        });
    }
    
    handleServerCommand(ctx) {
        if (!ctx.args.target) {
            const chat = ctx.createChat();
            chat.text('--- Available Servers ---', ctx.THEME.primary).newline();
            chat.text('Current: ', ctx.THEME.secondary)
                .text(this.getTargetDisplay(), ctx.THEME.success).newline().newline();
            
            Object.entries(this.config.servers).forEach(([name, server]) => {
                chat.button(`[${name}]`, `/proxy server ${name}`, `Switch to ${name}`, 'run_command', ctx.THEME.accent)
                    .space()
                    .text(`${server.host}:${server.port}`, ctx.THEME.muted)
                    .newline();
            });
            chat.send();
        } else {
            this.switchServer(ctx.args.target, ctx);
        }
    }
    
    handleAddServerCommand(ctx) {
        const { name, hostport } = ctx.args;
        const [host, port] = hostport.split(':');
        if (!host || !port) {
            return ctx.sendError('Invalid format. Use: /proxy addserver <name> <host>:<port>');
        }
        
        this.config.servers[name] = { host, port: parseInt(port) };
        this.storage.saveConfig(this.config);
        ctx.sendSuccess(`Added server '${name}' (${hostport})`);
    }
    
    handleRemoveServerCommand(ctx) {
        const { name } = ctx.args;
        if (!this.config.servers[name]) {
            return ctx.sendError(`Server '${name}' not found`);
        }
        
        delete this.config.servers[name];
        this.storage.saveConfig(this.config);
        ctx.sendSuccess(`Removed server '${name}'`);
    }
    
    handleReauthCommand(ctx) {
        if (!this.currentPlayer) {
            return ctx.sendError('You are not connected to a server');
        }
        
        const authPath = path.join(this.getBaseDir(), 'auth_cache', this.currentPlayer.username);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        
        this.currentPlayer.forceReauth = true;
        ctx.sendSuccess('Authentication cache cleared. Reconnect to re-authenticate.');
    }
    
    handlePluginsCommand(ctx) {
        const plugins = this.pluginAPI.getLoadedPlugins();
        if (plugins.length === 0) {
            return ctx.send('§7No plugins loaded.');
        }
        
        const chat = ctx.createChat();
        chat.text('--- Loaded Plugins ---', ctx.THEME.primary).newline();
        
        plugins.forEach(plugin => {
            const status = plugin.enabled ? '§aEnabled' : '§cDisabled';
            const official = plugin.official ? ' §6[Official]' : '';
            chat.text(`${plugin.displayName} `, ctx.THEME.secondary)
                .text(`§7(/${plugin.name}) `, ctx.THEME.muted)
                .text(status)
                .text(official)
                .newline();
        });
        chat.send();
    }

    switchServer(target, ctx = null) {
        const serverInfo = this.parseServerTarget(target);
        if (!serverInfo) {
            if (ctx) {
                ctx.sendError('Invalid server target');
            } else {
                this.sendMessage(this.currentPlayer?.client, '§cInvalid server target');
            }
            return;
        }

        this.config.targetHost = serverInfo.host;
        this.config.targetPort = serverInfo.port;
        this.storage.saveConfig(this.config);
        this.server.motd = this.generateMOTD();
        
        if (ctx) {
            ctx.sendSuccess(`Switched to ${target}. Please reconnect.`);
        }
        
        this.kickPlayer(`§aSwitched to ${target}. Please reconnect.`);
    }

    parseServerTarget(target) {
        if (this.config.servers[target]) {
            return this.config.servers[target];
        }
        const [host, port] = target.split(':');
        return { host, port: parseInt(port) || 25565 };
    }

    generateMOTD() {
        const pluginCount = this.pluginAPI.getLoadedPlugins().length;
        const pluginText = pluginCount > 0 ? `${pluginCount} Plugin${pluginCount > 1 ? 's' : ''}` : 'No Plugins';
        return `${PROXY_PREFIX} §5Proxy§r §8| ${pluginText}\n§7Target: §e${this.getTargetDisplay()}`;
    }

    getTargetDisplay() {
        const port = this.config.targetPort || 25565;
        return port === 25565 ? this.config.targetHost : `${this.config.targetHost}:${port}`;
    }
    
    sendMessage(client, message) {
        if (!client || client.state !== mc.states.PLAY) return;
        const isJson = typeof message === 'string' && message.trim().startsWith('{');
        client.write('chat', {
            message: isJson ? message : JSON.stringify({ text: message }),
            position: 0,
            sender: '0'
        });
    }

    kickPlayer(reason) {
        if (this.currentPlayer) {
            this.currentPlayer.disconnect(reason);
        }
    }
    
    clearSession() {
        this.currentPlayer = null;
    }
}

const proxy = new MinecraftProxy();
