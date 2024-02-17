// @ts-check
const { PeerRPCClient, PeerRPCServer } = require('grenache-nodejs-http');
const { v4: uuid } = require('uuid');

const Order = require('./models/order.js');
const Orderbook = require('./models/orderbook.js');

const messageType = Object.freeze({
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_MATCHED: 'ORDER_MATCHED',
  ORDER_FILLED: 'ORDER_FILLED',
  FILL_ORDER: 'FILL_ORDER',
});

const BROADCAST_KEY = 'broadcast'

class Exchange {
  constructor(link, port) {
    this.peerId = uuid();
    this.link = link;
    this.servicePort = parseInt(port);
    this.orderbook = new Orderbook();
  }

  init() {
    this.server = new PeerRPCServer(this.link, {})
    this.server.init()

    this.serverSvc = this.server.transport('server')
    this.serverSvc.listen(this.servicePort);
    this.serverSvc.on('request', this.onRequest.bind(this));


    this.client = new PeerRPCClient(this.link, {})
    this.client.init()

    this.startAnnouncing();
    this.processOrderQueue();
  }

  // Start announcing the services
  startAnnouncing() {
    this.link.startAnnouncing(BROADCAST_KEY, this.servicePort, {});
    this.link.startAnnouncing(this.peerId, this.servicePort, {});
  }

  // Place an order
  placeOrder(payload) {
    const orderId = uuid();
    const order = new Order(
      orderId,
      payload.body.item,
      payload.body.type,
      payload.body.unitPrice,
      payload.body.quantity,
      this.peerId,
    );

    const unfilledOrder = this.orderbook.addOrder(order);

    // if the order is already filled, we don't need to broadcast it
    if (!unfilledOrder) {
      return;
    }

    const broadcastMessagePayload = {
      messageType: messageType['ORDER_PLACED'],
      source: this.peerId,
      body: unfilledOrder
    }

    this.client.map(BROADCAST_KEY, broadcastMessagePayload, {}, (err, data) => {
      if (err) {
        console.error(err);
        return;
      }

      console.log('Unfulfilled order broadcasted', unfilledOrder);
    });
  }

  onRequest(rid, serviceName, payload, handler) {
    console.log('Received request', rid, serviceName, payload);

    // If the order is placed by the current peer, we don't need to process it
    if (this.peerId === payload.source) {
      return;
    }

    switch (serviceName) {
      case BROADCAST_KEY:
        this.onBroadcast(rid, payload, handler);
        break;
      case this.peerId:
        this.onDM(rid, payload, handler);
        break;
      default:
        break;
    }
  }

  onBroadcast(rid, payload, handler) {
    switch (payload.messageType) {
      case messageType['ORDER_PLACED']:
        this.onNewOrder(payload.body, handler);
        break;
      default:
        break;
    }
  }

  onNewOrder(order, handler) {
    handler.reply(null, {});
    // find matching orders to fill the broadcasted order
    const matchingOrders = this.orderbook.findMatchingOrders(order.item, order.price, order.type);
    if (matchingOrders.length === 0) {
      return;
    }

    // send the matched orders to the peer
    const payload = {
      messageType: messageType['ORDER_MATCHED'],
      source: this.peerId,
      body: {
        orderId: order.id,
        matchingOrders
      }
    }

    this.client.request(order.peerId, payload, {}, (err, data) => {
      if (err) {
        console.error(err);
      }
    });
  }

  onDM(rid, payload, handler) {
    switch (payload.messageType) {
      case messageType['ORDER_MATCHED']:
        this.onOrderMatched(payload.body, handler);
        break;
      case messageType['FILL_ORDER']:
        this.onFillOrder(payload.body, handler);
        break;
      default:
        break;
    }
  }

  onOrderMatched({ orderId, matchingOrders }, handler) {
    handler.reply(null, {});

    const order = this.orderbook.getUnFilledOrder(orderId);

    console.log('Order matched', orderId, order, matchingOrders);

    // if the order is already filled, we don't need to process it
    if (!order) {
      return;
    }

    // push the matched orders to a queue in orderbook
    this.orderbook.addMatchingOrdersToQueue(orderId, matchingOrders);
  }

  processOrderQueue() {
    setInterval(() => {
      const ordersToBeProcessed = Object.keys(this.orderbook.matchedOrdersQueue);
      if (ordersToBeProcessed.length === 0) {
        return;
      }

      ordersToBeProcessed.forEach(orderId => {
        this.processMatchedOrders(orderId);
      });
    }, 10000);
  }

  requestPeer(peerId, payload) {
    return new Promise((resolve, reject) => {
      this.client.request(peerId, payload, {}, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(data);
      });
    });
  }

  async processMatchedOrders(orderId) {
    if (this.orderbook.currentlyProcessing[orderId]) return;

    const order = this.orderbook.getUnFilledOrder(orderId);

    // if the order is already filled, we don't need to process it
    if (!order) {
      delete this.orderbook.matchedOrdersQueue[orderId];
      return;
    }

    this.orderbook.currentlyProcessing[orderId] = true;

    console.log('Processing matched orders', orderId, order, this.orderbook.matchedOrdersQueue[orderId])

    const matchingOrders = this.orderbook.matchedOrdersQueue[orderId];

    // iterate over the matching orders, fill the order with the peer and add it to the orderbook
    for (let i = 0; i < matchingOrders.length; i++) {
      if (order.quantity === 0) {
        delete this.orderbook.matchedOrdersQueue[orderId];
        break;
      }

      const matchingOrder = matchingOrders[i];
      const payload = {
        messageType: messageType['FILL_ORDER'],
        source: this.peerId,
        body: {
          order,
          matchingOrderId: matchingOrder.id,
        }
      }

      try {
        const data = await this.requestPeer(matchingOrder.peerId, payload);

        // set a matched key to filter matched orders later
        matchingOrder.matched = true;

        // update order
        order.quantity -= data.body.quantityTraded;
        order.filledQuantity += data.body.quantityTraded;
        order.matchedOrders.push({ id: matchingOrder.id, quantity: data.body.quantityTraded, peerId: matchingOrder.peerId });

        // if the order is filled, we don't need to process it
        if (order.quantity === 0) {
          this.orderbook.addToFilledOrder(order);
          this.orderbook.removeOrder(order);
          delete this.orderbook.matchedOrdersQueue[orderId];
          break;
        }
      } catch (err) {
        console.error(err);

        // if the order is discarded, we don't need to process it
        matchingOrder.isDiscarded = true;
      }
    }

    delete this.orderbook.matchedOrdersQueue[orderId];

    this.orderbook.currentlyProcessing[orderId] = false;
  }

  onFillOrder({ order, matchingOrderId }, handler) {
    console.log('Filling order', order, matchingOrderId);
    const matchingOrder = this.orderbook.getUnFilledOrder(matchingOrderId);

    // if the order is already filled, we don't need to process it
    if (!matchingOrder) {
      handler.reply('Matched order is already filled', {});
      return;
    }

    this.orderbook.currentlyProcessing[matchingOrder.id] = true;

    // fill the order
    const quantityTraded = Math.min(matchingOrder.quantity, order.quantity);
    matchingOrder.quantity -= quantityTraded;
    matchingOrder.filledQuantity += quantityTraded;
    matchingOrder.matchedOrders.push({ id: order.id, quantity: order.quantity, peerId: order.peerId });

    // if the order is filled, we don't need to process it
    if (matchingOrder.quantity === 0) {
      delete this.orderbook.matchedOrdersQueue[matchingOrderId];
    }

    this.orderbook.currentlyProcessing[matchingOrder.id] = false;

    console.log('Order filled', matchingOrderId, matchingOrder);

    if (matchingOrder.quantity === 0) {
      this.orderbook.addToFilledOrder(matchingOrder);
      this.orderbook.removeOrder(matchingOrder);
    }

    handler.reply(null, {
      messageType: messageType['ORDER_FILLED'],
      source: this.peerId,
      body: {
        filledOrderId: matchingOrderId,
        orderId: order.id,
        quantityTraded,
      }
    });
  }
}

module.exports = Exchange;