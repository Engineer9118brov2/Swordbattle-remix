// Game constants
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_RADIUS = 25;
const SWORD_LENGTH = 60;
const SWORD_WIDTH = 12;
const PLAYER_SPEED = 5;
const SWORD_SWING_DURATION = 300;
const SWORD_DAMAGE = 20;
const PLAYER_MAX_HP = 100;

// Game state
const gameState = {
  players: [],
  localPlayer: null,
  camera: { x: 0, y: 0 },
  leaderboard: [],
  gameActive: true,
  stats: {
    kills: 0,
    deaths: 0,
    score: 0
  }
};

// Input handling
const keys = {};
let mouseX = 0;
let mouseY = 0;

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Player class
class Player {
  constructor(x, y, isLocal = false, name = null, color = null) {
    this.x = x;
    this.y = y;
    this.isLocal = isLocal;
    this.name = name || `Player${Math.floor(Math.random() * 10000)}`;
    this.color = color || this.getRandomColor();
    this.radius = PLAYER_RADIUS;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.isSwinging = false;
    this.swingStartTime = 0;
    this.kills = 0;
    this.eliminated = false;
    this.eliminatedBy = null;
    this.deathTime = 0;
  }

  getRandomColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B988', '#52D273'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  update(inputKeys) {
    if (this.isLocal && !this.eliminated) {
      // Update velocity based on input
      this.vx = 0;
      this.vy = 0;

      if (inputKeys['arrowleft'] || inputKeys['a']) this.vx = -PLAYER_SPEED;
      if (inputKeys['arrowright'] || inputKeys['d']) this.vx = PLAYER_SPEED;
      if (inputKeys['arrowup'] || inputKeys['w']) this.vy = -PLAYER_SPEED;
      if (inputKeys['arrowdown'] || inputKeys['s']) this.vy = PLAYER_SPEED;

      // Normalize diagonal movement
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (speed > PLAYER_SPEED) {
        this.vx = (this.vx / speed) * PLAYER_SPEED;
        this.vy = (this.vy / speed) * PLAYER_SPEED;
      }

      // Update angle to face mouse
      const dx = mouseX + gameState.camera.x - this.x;
      const dy = mouseY + gameState.camera.y - this.y;
      this.angle = Math.atan2(dy, dx);
    }

    // Update position with world boundaries
    this.x += this.vx;
    this.y += this.vy;

    this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));

    // Update swing animation
    if (this.isSwinging) {
      const elapsed = Date.now() - this.swingStartTime;
      if (elapsed > SWORD_SWING_DURATION) {
        this.isSwinging = false;
      }
    }

    // Handle respawn after death
    if (this.eliminated && Date.now() - this.deathTime > 3000) {
      this.respawn();
    }
  }

  swing() {
    if (!this.isSwinging) {
      this.isSwinging = true;
      this.swingStartTime = Date.now();
      this.checkSwordCollisions();
    }
  }

  checkSwordCollisions() {
    // Check collision with other players
    gameState.players.forEach(other => {
      if (other !== this && !other.eliminated) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if other player is within sword range
        if (distance < PLAYER_RADIUS + SWORD_LENGTH) {
          // Check if player is in sword direction
          const angleToOther = Math.atan2(dy, dx);
          const angleDiff = Math.abs(angleToOther - this.angle);

          // Allow 45 degree swing arc
          if (angleDiff < Math.PI / 4 || angleDiff > (2 * Math.PI - Math.PI / 4)) {
            other.takeDamage(SWORD_DAMAGE, this);
          }
        }
      }
    });
  }

  takeDamage(damage, attacker) {
    this.hp -= damage;
    if (this.hp <= 0) {
      this.eliminate(attacker);
    }
  }

  eliminate(killer) {
    this.eliminated = true;
    this.deathTime = Date.now();
    this.eliminatedBy = killer;

    if (killer && killer.isLocal) {
      gameState.stats.kills++;
      killer.kills++;
    }

    if (this.isLocal) {
      gameState.stats.deaths++;
      showDeathScreen();
    }
  }

  respawn() {
    // Random spawn location
    this.x = Math.random() * (WORLD_WIDTH - 200) + 100;
    this.y = Math.random() * (WORLD_HEIGHT - 200) + 100;
    this.hp = this.maxHp;
    this.eliminated = false;
    this.eliminatedBy = null;
    if (this.isLocal) {
      hideDeathScreen();
    }
  }

  draw(ctx, offsetX, offsetY) {
    const screenX = this.x - offsetX;
    const screenY = this.y - offsetY;

    // Draw player body
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = this.eliminated ? '#444' : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw health bar
    if (!this.eliminated) {
      const barWidth = this.radius * 2;
      const barHeight = 4;
      const hpPercent = this.hp / this.maxHp;

      ctx.fillStyle = '#333';
      ctx.fillRect(screenX - barWidth / 2, screenY - this.radius - 12, barWidth, barHeight);

      ctx.fillStyle = hpPercent > 0.5 ? '#00FF00' : hpPercent > 0.25 ? '#FFD700' : '#FF0000';
      ctx.fillRect(screenX - barWidth / 2, screenY - this.radius - 12, barWidth * hpPercent, barHeight);
    }

    // Draw sword
    const swordX = screenX + Math.cos(this.angle) * (this.radius + SWORD_LENGTH / 2);
    const swordY = screenY + Math.sin(this.angle) * (this.radius + SWORD_LENGTH / 2);

    let swingAngle = 0;
    if (this.isSwinging) {
      const elapsed = Date.now() - this.swingStartTime;
      const progress = Math.min(elapsed / SWORD_SWING_DURATION, 1);
      // Create a smooth swing arc
      swingAngle = Math.sin(progress * Math.PI) * (Math.PI / 3);
    }

    ctx.save();
    ctx.translate(swordX, swordY);
    ctx.rotate(this.angle + swingAngle);

    ctx.fillStyle = '#FFD700';
    ctx.fillRect(-SWORD_WIDTH / 2, 0, SWORD_WIDTH, SWORD_LENGTH);

    // Sword tip
    ctx.fillStyle = '#FFA500';
    ctx.beginPath();
    ctx.moveTo(-SWORD_WIDTH / 2, SWORD_LENGTH);
    ctx.lineTo(SWORD_WIDTH / 2, SWORD_LENGTH);
    ctx.lineTo(0, SWORD_LENGTH + 8);
    ctx.fill();

    ctx.restore();

    // Draw player name
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, screenX, screenY + this.radius + 15);

    // Highlight local player
    if (this.isLocal) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screenX, screenY, this.radius + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// Initialize game
function initGame() {
  // Create local player
  gameState.localPlayer = new Player(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, true, 'You');
  gameState.players.push(gameState.localPlayer);

  // Create AI players for simulation
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * (WORLD_WIDTH - 200) + 100;
    const y = Math.random() * (WORLD_HEIGHT - 200) + 100;
    gameState.players.push(new Player(x, y, false, `Player${i + 1}`));
  }

  // Start game loop
  gameLoop();
}

// Game loop
function gameLoop() {
  // Update local player
  gameState.localPlayer.update(keys);

  // Simulate AI players
  gameState.players.forEach(player => {
    if (!player.isLocal) {
      // Simple AI movement
      if (Math.random() < 0.02) {
        player.vx = (Math.random() - 0.5) * PLAYER_SPEED * 2;
        player.vy = (Math.random() - 0.5) * PLAYER_SPEED * 2;
      }

      // Random sword swing
      if (Math.random() < 0.01 && !player.eliminated) {
        player.swing();
      }

      player.update(keys);
    }
  });

  // Update camera to follow local player
  updateCamera();

  // Update leaderboard
  updateLeaderboard();

  // Draw game
  draw();

  requestAnimationFrame(gameLoop);
}

function updateCamera() {
  const targetX = gameState.localPlayer.x - canvas.width / 2;
  const targetY = gameState.localPlayer.y - canvas.height / 2;

  // Smooth camera follow
  gameState.camera.x += (targetX - gameState.camera.x) * 0.1;
  gameState.camera.y += (targetY - gameState.camera.y) * 0.1;

  // Constrain camera to world
  gameState.camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, gameState.camera.x));
  gameState.camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, gameState.camera.y));
}

function updateLeaderboard() {
  // Sort players by kills
  const sorted = [...gameState.players]
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 5);

  const list = document.getElementById('leaderboardList');
  list.innerHTML = sorted
    .map((p, i) => `<li>${i + 1}. ${p.name} (${p.kills})</li>`)
    .join('');

  // Update stats
  document.getElementById('kills').textContent = gameState.stats.kills;
  document.getElementById('deaths').textContent = gameState.stats.deaths;
  document.getElementById('score').textContent = gameState.stats.kills * 10 - gameState.stats.deaths;
}

function draw() {
  const offsetX = gameState.camera.x;
  const offsetY = gameState.camera.y;

  // Clear canvas
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  drawGrid(offsetX, offsetY);

  // Draw all players
  gameState.players.forEach(player => {
    player.draw(ctx, offsetX, offsetY);
  });

  // Draw world boundaries
  drawWorldBoundaries(offsetX, offsetY);
}

function drawGrid(offsetX, offsetY) {
  const gridSize = 100;
  const startX = Math.floor(offsetX / gridSize) * gridSize;
  const startY = Math.floor(offsetY / gridSize) * gridSize;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  for (let x = startX; x < offsetX + canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x - offsetX, 0);
    ctx.lineTo(x - offsetX, canvas.height);
    ctx.stroke();
  }

  for (let y = startY; y < offsetY + canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y - offsetY);
    ctx.lineTo(canvas.width, y - offsetY);
    ctx.stroke();
  }
}

function drawWorldBoundaries(offsetX, offsetY) {
  ctx.strokeStyle = '#FF0000';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);

  ctx.strokeRect(-offsetX, -offsetY, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.setLineDash([]);
}

function showDeathScreen() {
  document.getElementById('deathScreen').classList.remove('hidden');
  gameState.gameActive = false;
}

function hideDeathScreen() {
  document.getElementById('deathScreen').classList.add('hidden');
  gameState.gameActive = true;
}

// Event listeners
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;

  if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    if (gameState.localPlayer.eliminated) {
      gameState.localPlayer.respawn();
    } else {
      gameState.localPlayer.swing();
    }
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

document.addEventListener('click', () => {
  if (gameState.localPlayer.eliminated) {
    gameState.localPlayer.respawn();
  } else {
    gameState.localPlayer.swing();
  }
});

document.addEventListener('DOMContentLoaded', initGame);
