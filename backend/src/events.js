const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(1000);

function publish(topic, payload) {
  bus.emit(topic, payload);
}

function subscribe(topic, handler) {
  bus.on(topic, handler);
  return () => bus.off(topic, handler);
}

module.exports = { publish, subscribe };
