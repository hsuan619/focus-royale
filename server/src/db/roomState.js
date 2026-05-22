const redis = require('./redis')

async function setRoomState(roomId, state) {
  await redis.hset(`room:${roomId}:state`, state)
}

async function getRoomState(roomId) {
  return redis.hgetall(`room:${roomId}:state`)
}

async function addPlayer(roomId, userId, name = '') {
  await redis.sadd(`room:${roomId}:players`, userId)
  await redis.hset(`room:${roomId}:names`, userId, name)
  await redis.set(`user:${userId}:session`, roomId)
}

async function removePlayer(roomId, userId) {
  await redis.srem(`room:${roomId}:players`, userId)
  await redis.hdel(`room:${roomId}:names`, userId)
  await redis.del(`user:${userId}:session`)
}

async function getPlayerList(roomId) {
  const [ids, names] = await Promise.all([
    redis.smembers(`room:${roomId}:players`),
    redis.hgetall(`room:${roomId}:names`),
  ])
  return ids.map(id => ({ userId: id, name: names?.[id] || 'PLAYER' }))
}

async function getPlayerCount(roomId) {
  return redis.scard(`room:${roomId}:players`)
}

async function deleteRoomState(roomId) {
  await redis.del(`room:${roomId}:state`, `room:${roomId}:players`, `room:${roomId}:names`)
}

module.exports = { setRoomState, getRoomState, addPlayer, removePlayer, getPlayerCount, getPlayerList, deleteRoomState }
