const redis = require('./redis')

async function setRoomState(roomId, state) {
  await redis.hset(`room:${roomId}:state`, state)
}

async function getRoomState(roomId) {
  return redis.hgetall(`room:${roomId}:state`)
}

async function addPlayer(roomId, userId) {
  await redis.sadd(`room:${roomId}:players`, userId)
  await redis.set(`user:${userId}:session`, roomId)
}

async function removePlayer(roomId, userId) {
  await redis.srem(`room:${roomId}:players`, userId)
  await redis.del(`user:${userId}:session`)
}

async function getPlayerCount(roomId) {
  return redis.scard(`room:${roomId}:players`)
}

module.exports = { setRoomState, getRoomState, addPlayer, removePlayer, getPlayerCount }
