async function authenticate(request, reply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

module.exports = { authenticate }
