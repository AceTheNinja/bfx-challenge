const Link = require('grenache-nodejs-link');
const { PeerRPCClient, PeerRPCServer } = require('grenache-nodejs-http');
const { writeFileSync } = require('fs');

const Exchange = require('./exchange.js');
const PORT = process.argv[2] || 1337;

const link = new Link({
  grape: 'http://127.0.0.1:30001'
})
link.start()

const exchangeInstance = new Exchange(link, PORT);
exchangeInstance.init();

// Testing the exchange
setTimeout(() => {

  if (process.argv[3] === '1') {
    exchangeInstance.placeOrder({
      body: {
        item: 'BTC',
        type: 'buy',
        unitPrice: 1000,
        quantity: 1,
      }
    });

    setInterval(() => {
      const orderbook = exchangeInstance.orderbook.retrieveOrderbook();
      writeFileSync('orderbook-1.json', JSON.stringify(orderbook, null, 2));
    }, 2000);
  }

  if (process.argv[3] === '2') {
    exchangeInstance.placeOrder({
      body: {
        item: 'BTC',
        type: 'buy',
        unitPrice: 1000,
        quantity: 1,
      }
    });

    setInterval(() => {
      const orderbook = exchangeInstance.orderbook.retrieveOrderbook();
      writeFileSync('orderbook-2.json', JSON.stringify(orderbook, null, 2));
    }, 2000);
  }

  if (process.argv[3] === '3') {
    exchangeInstance.placeOrder({
      body: {
        item: 'BTC',
        type: 'sell',
        unitPrice: 1000,
        quantity: 2,
      }
    });

    setInterval(() => {
      const orderbook = exchangeInstance.orderbook.retrieveOrderbook();
      writeFileSync('orderbook-3.json', JSON.stringify(orderbook, null, 2));
    }, 2000);
  }

}, 5000);