const { WebSocketServer } = require('ws')
const { createServer } = require('http')

function generateId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

const games = new Map()
const clients = new Map()

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  const clientId = generateId()
  clients.set(clientId, {
    ws,
    gameId: null,
    playerName: null,
    isHost: false,
  })

  console.log(`Client ${clientId} connected`)

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      handleMessage(clientId, message)
    } catch (err) {
      console.error('Invalid message format:', err)
    }
  })

  ws.on('close', () => {
    console.log(`Client ${clientId} disconnected`)
    handleDisconnect(clientId)
  })

  ws.on('error', (err) => {
    console.error(`WebSocket error for client ${clientId}:`, err)
  })
})

function handleMessage(clientId, message) {
  const client = clients.get(clientId)
  if (!client) return

  switch (message.type) {
    case 'create_game':
      createGame(clientId, message.playerName)
      break
    case 'join_game':
      joinGame(clientId, message.gameId, message.playerName)
      break
    case 'update_game':
      updateGame(clientId, message.updates)
      break
    case 'typing':
      broadcastTyping(clientId, message.typing)
      break
    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong' }))
      break
  }
}

function createGame(clientId, playerName) {
  const client = clients.get(clientId)
  if (!client) return

  const gameId = generateId()
  const game = {
    game_id: gameId,
    player1_name: playerName,
    player2_name: null,
    current_question: '',
    question_number: 0,
    player1_answer: '',
    player2_answer: '',
    answers_revealed: false,
    game_phase: 'waiting',
    scores: { player1: 0, player2: 0 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  games.set(gameId, game)
  client.gameId = gameId
  client.playerName = playerName
  client.isHost = true

  client.ws.send(
    JSON.stringify({
      type: 'game_created',
      game,
      isHost: true,
    })
  )

  console.log(`Game ${gameId} created by ${playerName}`)
}

function joinGame(clientId, gameId, playerName) {
  const client = clients.get(clientId)
  const game = games.get(gameId)

  if (!client || !game) {
    client?.ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }))
    return
  }

  if (game.player2_name) {
    client.ws.send(JSON.stringify({ type: 'error', message: 'Game is full' }))
    return
  }

  game.player2_name = playerName
  game.game_phase = 'question'
  game.updated_at = new Date().toISOString()

  client.gameId = gameId
  client.playerName = playerName
  client.isHost = false

  broadcastToGame(gameId, {
    type: 'game_updated',
    game,
  })

  console.log(`${playerName} joined game ${gameId}`)
}

function updateGame(clientId, updates) {
  const client = clients.get(clientId)
  if (!client || !client.gameId) return

  const game = games.get(client.gameId)
  if (!game) return

  Object.assign(game, updates, {
    updated_at: new Date().toISOString(),
  })

  broadcastToGame(client.gameId, {
    type: 'game_updated',
    game,
  })

  console.log(`Game ${client.gameId} updated:`, updates)
}

function broadcastTyping(clientId, typing) {
  const client = clients.get(clientId)
  if (!client || !client.gameId) return

  broadcastToGame(
    client.gameId,
    {
      type: 'player_typing',
      playerName: client.playerName,
      typing,
    },
    clientId
  )
}

function broadcastToGame(gameId, message, excludeClientId = null) {
  clients.forEach((client, id) => {
    if (client.gameId === gameId && id !== excludeClientId) {
      try {
        client.ws.send(JSON.stringify(message))
      } catch (err) {
        console.error(`Failed to send to client ${id}:`, err)
      }
    }
  })
}

function handleDisconnect(clientId) {
  const client = clients.get(clientId)
  if (client && client.gameId) {
    broadcastToGame(
      client.gameId,
      {
        type: 'player_disconnected',
        playerName: client.playerName,
      },
      clientId
    )
  }
  clients.delete(clientId)
}

// Start server
const PORT = 8080
server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`)
})
