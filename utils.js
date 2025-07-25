function createRoom(socket, { name }) {
  const roomId = uuidv4();
  const playerId = uuidv4();
  rooms.set(roomId, {
    players: new Map([[socket, { name, answer: null }]]),
    question: null,
    status: "waiting_for_player",
  });
  clients.set(socket, { roomId, name });
  socket.send(JSON.stringify({ type: "room_created", payload: { roomId, name } }));
}

function joinRoom(socket, { roomId, name }) {
  const room = rooms.get(roomId);
  if (!room || room.players.size >= 2) {
    return socket.send(JSON.stringify({ type: "error", payload: "Room full or not found" }));
  }

  room.players.set(socket, { name, answer: null });
  clients.set(socket, { roomId, name });

  broadcastToRoom(roomId, "room_joined", { players: [...room.players.values()] });
}

function askQuestion(socket, { question }) {
  const { roomId } = clients.get(socket) || {};
  const room = rooms.get(roomId);
  if (!room) return;

  room.question = question;
  room.status = "waiting_for_answers";
  for (const player of room.players.keys()) {
    player.send(JSON.stringify({ type: "question", payload: { question } }));
  }
}

function submitAnswer(socket, { answer }) {
  const { roomId, name } = clients.get(socket) || {};
  const room = rooms.get(roomId);
  if (!room) return;

  const playerData = room.players.get(socket);
  if (!playerData) return;
  playerData.answer = answer;

  // Check if all players answered
  const allAnswered = [...room.players.values()].every(p => p.answer !== null);
  if (allAnswered) {
    const answers = [...room.players.entries()].map(([sock, p]) => ({
      name: p.name,
      answer: p.answer
    }));
    broadcastToRoom(roomId, "reveal_answers", { answers });
    for (const player of room.players.values()) {
      player.answer = null;
    }
    room.status = "waiting_for_question";
  }
}
