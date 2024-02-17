// @ts-check
class OrderBook {
  constructor() {
    this.buyOrders = {}; // Sorted in descending order by price
    this.sellOrders = {}; // Sorted in ascending order by price
    this.filledOrders = {}; // Stores all filled orders
    this.matchedOrdersQueue = {}; // Stores all matched orders per order
    this.currentlyProcessing = {}; // map of currently processing orders
  }

  // Add an order to the order book
  addOrder(order) {
    if (!(order.item in this.buyOrders)) {
      this.buyOrders[order.item] = [];
      this.sellOrders[order.item] = [];
    }

    if (order.type === 'buy') {
      this.buyOrders[order.item].push(order);
      this.buyOrders[order.item].sort((a, b) => b.price - a.price);
    } else {
      this.sellOrders[order.item].push(order);
      this.sellOrders[order.item].sort((a, b) => a.price - b.price);
    }

    // Match the orders in the current exchange itself
    this.matchOrders(order.item);

    const unfilledOrder = order.type === 'buy' ? 
      this.buyOrders[order.item].find(ele => ele.id === order.id) : 
      this.sellOrders[order.item].find(ele => ele.id === order.id);
    
    return unfilledOrder;
  }

  findMatchingOrders(item, price, type) {
    if (type === 'buy' && this.sellOrders[item]) {
      return this.sellOrders[item].filter(order => order.price <= price);
    } else if (this.buyOrders[item]) {
      return this.buyOrders[item].filter(order => order.price >= price);
    } else {
      return [];
    }
  }

  getUnFilledOrder(orderId) {
    for (const item in this.buyOrders) {
      const order = this.buyOrders[item].find(ele => ele.id === orderId);
      if (order) {
        return order;
      }
    }

    for (const item in this.sellOrders) {
      const order = this.sellOrders[item].find(ele => ele.id === orderId);
      if (order) {
        return order;
      }
    }

    return null;
  }

  // Match the orders in the order book with fill any possible matches
  matchOrders(item) {
    while (this.buyOrders[item].length > 0 && this.sellOrders[item].length > 0) {
      const buyOrder = this.buyOrders[item][0];
      const sellOrder = this.sellOrders[item][0];

      // If the highest buy order is greater than or equal to the lowest sell order, we have a match
      if (buyOrder.price >= sellOrder.price && !buyOrder.isProcessing && !sellOrder.isProcessing) {
        console.log(`Order ${buyOrder.id} matches with order ${sellOrder.id}`);

        // Update the quantities
        const quantityTraded = Math.min(buyOrder.quantity, sellOrder.quantity);
        buyOrder.quantity -= quantityTraded;
        sellOrder.quantity -= quantityTraded;
        buyOrder.filledQuantity += quantityTraded;
        sellOrder.filledQuantity += quantityTraded;

        // Add the matched orders to the order objects
        buyOrder.matchedOrders.push({ id: sellOrder.id, quantity: quantityTraded, peerId: sellOrder.peerId });
        sellOrder.matchedOrders.push({ id: buyOrder.id, quantity: quantityTraded, peerId: buyOrder.peerId });

        // If an order's quantity reaches 0, remove it from the order book
        if (buyOrder.quantity === 0) {
          this.addToFilledOrder(this.buyOrders[item].shift());
        }
        
        if (sellOrder.quantity === 0) {
          this.addToFilledOrder(this.sellOrders[item].shift());
        }
      } else {
        // If no match is found, break the loop
        break;
      }
    }
  }

  removeOrder(order) {
    if (order.type === 'buy') {
      this.buyOrders[order.item] = this.buyOrders[order.item].filter(ele => ele.id !== order.id);
    } else {
      this.sellOrders[order.item] = this.sellOrders[order.item].filter(ele => ele.id !== order.id);
    }
  }

  addToFilledOrder(order) {
    console.log(`Adding order ${order.id} to filled orders`, order);

    if (!(order.item in this.filledOrders)) {
      this.filledOrders[order.item] = [];
    }

    this.filledOrders[order.item].push(order);
  }

  retrieveOrderbook() {
    return {
      buyOrders: this.buyOrders,
      sellOrders: this.sellOrders,
      filledOrders: this.filledOrders,
      matchedOrdersQueue: this.matchedOrdersQueue,
    };
  }

  addMatchingOrdersToQueue(orderId, matchingOrders) {
    if (!(orderId in this.matchedOrdersQueue)) {
      this.matchedOrdersQueue[orderId] = [];
    }

    this.matchedOrdersQueue[orderId].push(...matchingOrders);
    console.log(`Added matching orders to queue for order ${orderId}`, this.matchedOrdersQueue[orderId]);
  }
}

module.exports = OrderBook;
