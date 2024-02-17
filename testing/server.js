// @ts-check
const Link = require('grenache-nodejs-link')
const { PeerRPCServer } = require('grenache-nodejs-http')

const link = new Link({
  grape: 'http://127.0.0.1:30001'
})
link.start()

const peer = new PeerRPCServer(link, {
  timeout: 300000
})
peer.init()

const service = peer.transport('server')
service.listen(1337)

link.startAnnouncing('rpc_test', service.port, {})

service.on('request', (rid, key, payload, handler) => {
  console.log(payload) // hello
  handler.reply(null, 'world')
})