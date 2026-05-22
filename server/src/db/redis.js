// Redis key 規範：
//   room:{roomId}:state     Hash  { status, playerCount, startAt, alpha, stake, totalPlayers }
//   room:{roomId}:players   Set   { userId, ... }
//   user:{userId}:session   String  roomId（玩家當前在哪個房間）

const Redis = require('ioredis')
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
module.exports = redis
