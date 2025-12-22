const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer((req, res) => {
  // Serve static files
  let filePath = '.' + req.url;
  if (filePath === './') filePath = './index.html';

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + err.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// Store active players
const players = new Map();

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_RADIUS = 25;
const SWORD_LENGTH = 60;
const PLAYER_SPEED = 5;
const SWORD_SWING_DURATION = 300;
const SWORD_DAMAGE = 20;
const PLAYER_MAX_HP = 100;

class GamePlayer {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.x = Math.random() * (WORLD_WIDTH - 200) + 100;
    this.y = Math.random() * (WORLD_HEIGHT - 200) + 100;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.radius = PLAYER_RADIUS;
    this.isSwinging = false;
    this.swingStartTime = 0;
    this.kills = 0;
    this.eliminated = false;
    this.eliminatedBy = null;
    this.color = this.getRandomColor();
    this.lastUpdate = Date.now();
  }

  getRandomColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B988', '#52D273'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  update(inputData) {
    if (!this.eliminated) {
      // Update velocity based on input
      this.vx = 0;
      this.vy = 0;

      if (inputData.left) this.vx = -PLAYER_SPEED;
      if (inputData.right) this.vx = PLAYER_SPEED;
      if (inputData.up) this.vy = -PLAYER_SPEED;
      if (inputData.down) this.vy = PLAYER_SPEED;

      // Normalize diagonal movement
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed > PLAYER_SPEED) {
        this.vx = (this.vx / speed) * PLAYER_SPEED;
        this.vy = (this.vy / speed) * PLAYER_SPEED;
      }

      // Update angle
      this.angle = inputData.angle || this.angle;

      // Update position
      this.x += this.vx;
      this.y += this.vy;

      // Boundary checking
      this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
      this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));

      // Handle sword swing
      if (inputData.swing && !this.isSwinging) {
        this.isSwinging = true;
        this.swingStartTime = Date.now();
      }

      // Update swing state
      if (this.isSwinging && Date.now() - this.swingStartTime > SWORD_SWING_DURATION) {
        this.isSwinging = false;
      }
    }
  }

  addKill() {
    this.kills++;
    // Grow with each kill
    this.radius *= 1.1;
    this.maxHp += 20;
    this.hp = this.maxHp;
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      angle: this.angle,
      hp: this.hp,
      maxHp: this.maxHp,
      radius: this.radius,
      isSwinging: this.isSwinging,
      kills: this.kills,
      eliminated: this.eliminated,
      color: this.color
    };
  }
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  const playerId = Date.now().toString();
  const playerName = `Player${Math.floor(Math.random() * 10000)}`;
  const player = new GamePlayer(playerId, playerName);

  players.set(playerId, { ws, player });

  console.log(`Player connected: ${playerName} (${playerId})`);

  // Send initial state to new player
  ws.send(JSON.stringify({
    type: 'init',
    playerId: playerId,
    playerName: playerName,
    players: Array.from(players.values()).map(p => p.player.getState())
  }));

  // Broadcast new player to all others
  broadcast({
    type: 'playerJoined',
    player: player.getState()
  }, playerId);

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'move') {
        player.update(message.input);
      } else if (message.type === 'swing') {
        player.isSwinging = true;
        player.swingStartTime = Date.now();
        checkSwordCollisions(player);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    players.delete(playerId);
    console.log(`Player disconnected: ${playerName}`);

    broadcast({
      type: 'playerLeft',
      playerId: playerId
    });
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// Game loop - broadcast updates
setInterval(() => {
  const state = Array.from(players.values()).map(p => p.player.getState());

  // Broadcast to all clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'gameState',
        players: state
      }));
    }
  });
}, 1000 / 60); // 60 FPS

function checkSwordCollisions(attacker) {
  players.forEach((entry) => {
    const defender = entry.player;
    if (defender.id !== attacker.id && !defender.eliminated) {
      const dx = defender.x - attacker.x;
      const dy = defender.y - attacker.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < attacker.radius + SWORD_LENGTH) {
        const angleToOther = Math.atan2(dy, dx);
        const angleDiff = Math.abs(angleToOther - attacker.angle);

        if (angleDiff < Math.PI / 4 || angleDiff > (2 * Math.PI - Math.PI / 4)) {
          defender.hp -= SWORD_DAMAGE;
          if (defender.hp <= 0) {
            defender.eliminated = true;
            defender.eliminatedBy = attacker.id;
            attacker.addKill();

            broadcast({
              type: 'playerEliminated',
              eliminatedId: defender.id,
              killedById: attacker.id,
              killerState: attacker.getState()
            });
          }
        }
      }
    }
  });
}

function broadcast(message, excludeId = null) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
