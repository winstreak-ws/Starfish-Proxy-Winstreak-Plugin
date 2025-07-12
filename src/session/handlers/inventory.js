class InventoryHandler {
    constructor(gameState) {
        this.gameState = gameState;
    }

    handleHeldItemSlot(data) {
        this.gameState.inventory.heldItemSlot = data.slotId;
    }

    handleSetSlot(data) {
        if (data.windowId === 0 && data.slot >= 0 && data.slot < 46) {
            this.gameState.inventory.slots[data.slot] = data.item;
        }
    }

    handleWindowItems(data) {
        if (data.windowId === 0) {
            this.gameState.inventory.slots = data.items.slice(0, 46);
        }
    }
}

module.exports = InventoryHandler;