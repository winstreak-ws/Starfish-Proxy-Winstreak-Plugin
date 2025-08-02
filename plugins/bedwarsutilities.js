module.exports = (api) => {
    api.metadata({
        name: 'bedwarsutilities',
        displayName: 'Bedwars Utilities',
        prefix: '§eBW',
        version: '1.0.0',
        author: 'Hexze',
        description: 'Various utilities for the Bedwars gamemode',
    });

    const bedwarsWho = new BedwarsWho(api);
    
    const configSchema = [
        {
            label: 'Auto Who Settings',
            description: 'Configure when to automatically run /who command.',
            defaults: { 
                enabled: true,
                delay: 1000
            },
            settings: [
                {
                    type: 'toggle',
                    key: 'enabled',
                    text: ['OFF', 'ON'],
                    description: 'Enable or disable automatic /who command on Bedwars game start.'
                },
                {
                    type: 'cycle',
                    key: 'delay',
                    description: 'Delay in milliseconds before running /who command.',
                    displayLabel: 'Delay',
                    values: [
                        { text: '0ms', value: 0 },
                        { text: '500ms', value: 500 },
                        { text: '1000ms', value: 1000 },
                        { text: '2000ms', value: 2000 }
                    ]
                }
            ]
        }
    ];

    api.initializeConfig(configSchema);

    api.configSchema(configSchema);

    api.commands((registry) => {
    });
    
    bedwarsWho.registerHandlers();
    return bedwarsWho;
};

class BedwarsWho {
    constructor(api) {
        this.api = api;
        this.PLUGIN_PREFIX = this.api.getPrefix();
        this.gameStarted = false;
    }

    registerHandlers() {
        this.api.on('chat', this.onChat.bind(this));
        this.api.on('world.change', this.onWorldChange.bind(this));
    }

    onWorldChange(event) {
        this.gameStarted = false;
    }

    onChat(event) {
        if (!this.api.config.get('enabled')) {
            return;
        }

        const message = event.message;

        if (this.isBedwarsStartMessage(message)) {
            this.handleGameStart();
        }
    }

    isBedwarsStartMessage(message) {
        const cleanMessage = message.replace(/§[0-9a-fk-or]/g, '');
        return cleanMessage.includes('Bed Wars') && 
               cleanMessage.includes('Protect your bed and destroy the enemy beds') &&
               cleanMessage.includes('▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬');
    }

    handleGameStart() {
        if (this.gameStarted) {
            return;
        }

        this.gameStarted = true;
        
        const delay = this.api.config.get('delay');
        
        setTimeout(() => {
            this.runWhoCommand();
        }, delay);
    }

    runWhoCommand() {
        this.api.chat('/who');
        this.api.debugLog('Automatically ran /who command for Bedwars game');
    }
}