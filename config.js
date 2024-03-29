module.exports = {
  defaults: {
    broadcastKey: 'common',
    announceInterval: 1000,
    requestOptions: {
      timeout: 5000
    }
  },
  grapes: {
    host: '127.0.0.1',
    ports: [
      {
        dht: 20001,
        api: 30001
      },
      {
        dht: 20002,
        api: 30002
      },
      {
        dht: 20003,
        api: 30003
      }
    ]
  }
}