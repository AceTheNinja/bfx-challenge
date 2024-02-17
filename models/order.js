class Order {
  constructor(id, item, type, price, quantity, peerId) {
    this.id = id;
    this.item = item;
    this.type = type; // 'buy' or 'sell'
    this.price = price;
    this.peerId = peerId;
    this.quantity = quantity; // This will now represent the remaining quantity
    this.originalQuantity = quantity; // This will represent the original quantity
    this.filledQuantity = 0; // This will represent the filled quantity
    this.matchedOrders = [];
  }
}

module.exports = Order;
