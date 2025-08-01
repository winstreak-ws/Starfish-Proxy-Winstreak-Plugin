module.exports = {
    client: {
        window_click: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'client.windowClick',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    windowId: data.windowId,
                    slot: data.slot,
                    mouseButton: data.mouseButton,
                    action: data.action,
                    mode: data.mode,
                    item: data.item
                })
            }
        },
        close_window: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'client.closeWindow',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    windowId: data.windowId
                })
            }
        },
        held_item_slot: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'client.heldItemChange',
                extractor: (data, session) => ({
                    player: session._createCurrentPlayerObject(),
                    slot: data.slotId
                })
            }
        },
        creative_inventory_action: {
            safe: false
        },
        enchant_item: {
            safe: false
        }
    },
    server: {
        set_slot: {
            safe: true,
            updatesState: true,
            eventMapping: {
                name: 'inventory.setSlot',
                extractor: (data) => ({
                    windowId: data.windowId,
                    slot: data.slot,
                    item: data.item
                })
            }
        },
        window_items: {
            safe: true,
            updatesState: true,
            eventMapping: {
                name: 'inventory.setItems',
                extractor: (data) => ({
                    windowId: data.windowId,
                    items: data.items
                })
            }
        },
        open_window: {
            safe: true,
            updatesState: true,
            eventMapping: {
                name: 'inventory.open',
                extractor: (data) => ({
                    windowId: data.windowId,
                    windowType: data.inventoryType,
                    windowTitle: data.windowTitle,
                    slotCount: data.slotCount
                })
            }
        },
        close_window: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'inventory.close',
                extractor: (data) => ({
                    windowId: data.windowId
                })
            }
        },
        transaction: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'inventory.transaction',
                extractor: (data) => ({
                    windowId: data.windowId,
                    action: data.action,
                    accepted: data.accepted
                })
            }
        },
        held_item_slot: {
            safe: false,
            updatesState: true,
            eventMapping: {
                name: 'server.heldItemChange',
                extractor: (data) => ({
                    slot: data.slot
                })
            }
        }
    }
};