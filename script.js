// Game constants - Matching original swordbattle.io specifications
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const PLAYER_RADIUS = 100; // Original: 100 (was 25)
const SWORD_LENGTH = 70; // Adjusted proportionally (was 60)
const SWORD_WIDTH = 14; // Adjusted proportionally (was 12)
const PLAYER_SPEED = 12; // Original: 770 pixels/update (was 5, converting to game scale)
const SWORD_SWING_DURATION = 100; // Original: 0.1s (was 300ms)
const SWORD_DAMAGE = 10; // Original: 10 (was 20)
const PLAYER_MAX_HP = 80; // Original: 80 (was 100)
const KNOCKBACK_FORCE = 20; // Original: 200 force (was 15, scaling to 80hp base)
const DASH_SPEED = 15; // Speed multiplier during dash
const DASH_DURATION = 300; // How long dash lasts in ms
const DASH_COOLDOWN = 3000; // Cooldown between dashes

// Multiplayer settings
const MULTIPLAYER_ENABLED = true;
const SERVER_URL = window.location.protocol === 'https:' 
  ? `wss://${window.location.host}` 
  : `ws://${window.location.host}`;

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
  },
  isMultiplayer: false,
  wsConnection: null,
  playerId: null
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
    this.id = Date.now().toString() + Math.random();
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
    
    // Dash mechanics
    this.isDashing = false;
    this.dashStartTime = 0;
    this.lastDashTime = 0;
    
    // Swing cooldown for bots
    this.lastSwingTime = 0;
    this.swingCooldown = 500; // Minimum time between swings
    
    // Skin system with stat modifiers
    this.skin = 'warrior'; // Default skin
    this.skins = {
      'warrior': { name: 'Warrior', strength: 1.0, endurance: 1.0, speed: 1.0, cost: 0 },
      'brute': { name: 'Brute', strength: 1.3, endurance: 1.5, speed: 0.8, cost: 500 },
      'ninja': { name: 'Ninja', strength: 0.9, endurance: 0.8, speed: 1.4, cost: 500 },
      'tank': { name: 'Tank', strength: 0.8, endurance: 2.0, speed: 0.6, cost: 500 },
      'phantom': { name: 'Phantom', strength: 1.1, endurance: 0.7, speed: 1.3, cost: 750 }
    };
    this.updateSkinStats();
    this.coins = 0;
  }

  updateSkinStats() {
    const skinData = this.skins[this.skin];
    this.strengthMult = skinData.strength;
    this.enduranceMult = skinData.endurance;
    this.speedMult = skinData.speed;
  }

  setSkin(skinName) {
    if (this.skins[skinName]) {
      this.skin = skinName;
      this.updateSkinStats();
      return true;
    }
    return false;
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

    // Apply dash boost if dashing
    if (this.isDashing) {
      const elapsedDash = Date.now() - this.dashStartTime;
      if (elapsedDash < DASH_DURATION) {
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy) || 1;
        const dashMult = DASH_SPEED / PLAYER_SPEED;
        this.vx *= dashMult;
        this.vy *= dashMult;
      } else {
        this.isDashing = false;
      }
    }

    // Update position with world boundaries
    this.x += this.vx;
    this.y += this.vy;

    this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
    this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));

    // Handle collisions with other players
    this.handleCollisions();

    // Update swing animation
    if (this.isSwinging) {
      const elapsed = Date.now() - this.swingStartTime;
      if (elapsed > SWORD_SWING_DURATION) {
        this.isSwinging = false;
      }
    }

    // Handle respawn after death (auto-respawn bots after 5 seconds)
    if (this.eliminated && Date.now() - this.deathTime > 5000) {
      this.respawn();
    }
  }

  handleCollisions() {
    // Check collisions with all other players
    gameState.players.forEach(other => {
      if (other !== this && !this.eliminated && !other.eliminated) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = this.radius + other.radius;

        if (distance < minDistance) {
          // Collision detected - push players apart slightly
          const angle = Math.atan2(dy, dx);
          const overlap = minDistance - distance + 0.5; // Reduced overlap buffer

          // Push this player back
          this.x -= Math.cos(angle) * (overlap / 3); // Reduce push force
          this.y -= Math.sin(angle) * (overlap / 3);

          // Push other player back
          other.x += Math.cos(angle) * (overlap / 3);
          other.y += Math.sin(angle) * (overlap / 3);

          // Prevent pushing outside world boundaries
          this.x = Math.max(this.radius, Math.min(WORLD_WIDTH - this.radius, this.x));
          this.y = Math.max(this.radius, Math.min(WORLD_HEIGHT - this.radius, this.y));
          other.x = Math.max(other.radius, Math.min(WORLD_WIDTH - other.radius, other.x));
          other.y = Math.max(other.radius, Math.min(WORLD_HEIGHT - other.radius, other.y));
        }
      }
    });
  }

  swing() {
    if (!this.isSwinging && Date.now() - this.lastSwingTime > this.swingCooldown) {
      this.isSwinging = true;
      this.swingStartTime = Date.now();
      this.lastSwingTime = Date.now();
      this.checkSwordCollisions();
    }
  }

  dash() {
    if (!this.isDashing && Date.now() - this.lastDashTime > DASH_COOLDOWN) {
      this.isDashing = true;
      this.dashStartTime = Date.now();
      this.lastDashTime = Date.now();
    }
  }

  updateAI() {
    // AI behavior for non-local, non-eliminated players
    if (!this.isLocal && !this.eliminated) {
      // Apply separation force to avoid clumping
      let separationX = 0;
      let separationY = 0;
      let nearbyCount = 0;

      gameState.players.forEach(other => {
        if (other !== this && !other.eliminated) {
          const dx = other.x - this.x;
          const dy = other.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // If too close to another player, push away
          if (distance < 150) {
            separationX -= (dx / distance) * 2;
            separationY -= (dy / distance) * 2;
            nearbyCount++;
          }
        }
      });

      // Find nearest alive enemy
      let nearestEnemy = null;
      let nearestDistance = Infinity;

      gameState.players.forEach(other => {
        if (other !== this && !other.eliminated) {
          const dx = other.x - this.x;
          const dy = other.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestEnemy = other;
          }
        }
      });

      if (nearestEnemy) {
        // Chase enemy
        const dx = nearestEnemy.x - this.x;
        const dy = nearestEnemy.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minAttackDistance = this.radius + nearestEnemy.radius + SWORD_LENGTH + 10;

        if (distance > minAttackDistance) {
          // Chase if too far
          this.vx = (dx / distance) * PLAYER_SPEED * this.speedMult;
          this.vy = (dy / distance) * PLAYER_SPEED * this.speedMult;
        } else if (distance < this.radius + nearestEnemy.radius + 10) {
          // Only retreat if literally touching
          this.vx = -(dx / distance) * PLAYER_SPEED * this.speedMult;
          this.vy = -(dy / distance) * PLAYER_SPEED * this.speedMult;
        } else {
          // Strafe around enemy - stay in attack range
          if (Math.random() < 0.5) {
            this.vx = -(dy / distance) * PLAYER_SPEED * this.speedMult * 0.7;
            this.vy = (dx / distance) * PLAYER_SPEED * this.speedMult * 0.7;
          } else {
            this.vx = (dy / distance) * PLAYER_SPEED * this.speedMult * 0.7;
            this.vy = -(dx / distance) * PLAYER_SPEED * this.speedMult * 0.7;
          }
        }

        // Update angle to face enemy
        this.angle = Math.atan2(dy, dx);

        // Dash away if low on health
        if (this.hp < this.maxHp * 0.5 && Date.now() - this.lastDashTime > DASH_COOLDOWN) {
          this.dash();
        }

        // Attack if close enough - reduced spam frequency
        if (distance < minAttackDistance) {
          if (Math.random() < 0.05 * this.strengthMult) { // Reduced from 0.12
            this.swing();
          }
        }
      } else {
        // Patrol randomly if no enemies
        if (Math.random() < 0.02) {
          this.vx = (Math.random() - 0.5) * PLAYER_SPEED * this.speedMult;
          this.vy = (Math.random() - 0.5) * PLAYER_SPEED * this.speedMult;
        }
      }

      // Apply separation force
      if (nearbyCount > 0) {
        this.vx += separationX * 0.5;
        this.vy += separationY * 0.5;
      }
    }
  }

  checkSwordCollisions() {
    // Check collision with other players' BODIES only (not their swords)
    gameState.players.forEach(other => {
      if (other !== this && !other.eliminated && !other.isSwinging) {
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
    // Apply damage with strength multiplier
    const actualDamage = damage * attacker.strengthMult;
    this.hp -= actualDamage;
    
    // Apply knockback
    if (attacker) {
      const dx = this.x - attacker.x;
      const dy = this.y - attacker.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      
      this.vx = (dx / distance) * KNOCKBACK_FORCE;
      this.vy = (dy / distance) * KNOCKBACK_FORCE;
    }
    
    if (this.hp <= 0) {
      this.eliminate(attacker);
    }
  }

  eliminate(killer) {
    this.eliminated = true;
    this.deathTime = Date.now();
    this.eliminatedBy = killer;

    if (killer) {
      killer.kills++;
      // Give coins to killer
      const coinReward = 50 + (killer.kills * 10); // More coins for kill streaks
      killer.coins += coinReward;
      
      // Grow the killer
      killer.radius *= 1.1; // 10% growth per kill
      killer.maxHp += 20; // Extra HP for each kill
      killer.hp = killer.maxHp;

      if (killer.isLocal) {
        gameState.stats.kills++;
      }
    }

    if (this.isLocal) {
      gameState.stats.deaths++;
      // Lose coins on death (20% penalty)
      const coinLoss = Math.floor(this.coins * 0.2);
      this.coins = Math.max(0, this.coins - coinLoss);
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

    // Draw sword with skin color
    const swordX = screenX + Math.cos(this.angle) * (this.radius + SWORD_LENGTH / 2);
    const swordY = screenY + Math.sin(this.angle) * (this.radius + SWORD_LENGTH / 2);

    let swingAngle = 0;
    if (this.isSwinging) {
      const elapsed = Date.now() - this.swingStartTime;
      const progress = Math.min(elapsed / SWORD_SWING_DURATION, 1);
      // Create a smooth swing arc
      swingAngle = Math.sin(progress * Math.PI) * (Math.PI / 3);
    }

    // Get sword color based on skin
    const swordColors = {
      'warrior': { blade: '#FFD700', tip: '#FFA500' },
      'brute': { blade: '#FF6B6B', tip: '#CC0000' },
      'ninja': { blade: '#333333', tip: '#000000' },
      'tank': { blade: '#87CEEB', tip: '#4169E1' },
      'phantom': { blade: '#9370DB', tip: '#6A0DAD' }
    };
    const swordColor = swordColors[this.skin] || swordColors['warrior'];

    ctx.save();
    ctx.translate(swordX, swordY);
    ctx.rotate(this.angle + swingAngle);

    // Draw blade
    ctx.fillStyle = swordColor.blade;
    ctx.fillRect(-SWORD_WIDTH / 2, 0, SWORD_WIDTH, SWORD_LENGTH);

    // Sword tip
    ctx.fillStyle = swordColor.tip;
    ctx.beginPath();
    ctx.moveTo(-SWORD_WIDTH / 2, SWORD_LENGTH);
    ctx.lineTo(SWORD_WIDTH / 2, SWORD_LENGTH);
    ctx.lineTo(0, SWORD_LENGTH + 8);
    ctx.fill();

    ctx.restore();

    // Draw dash effect
    if (this.isDashing) {
      const elapsed = Date.now() - this.dashStartTime;
      const opacity = Math.max(0, 1 - (elapsed / DASH_DURATION));
      ctx.fillStyle = `rgba(0, 212, 255, ${opacity * 0.3})`;
      ctx.beginPath();
      ctx.arc(screenX, screenY, this.radius * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

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

// Show name modal on startup
function showNameModal() {
  const modal = document.getElementById('nameModal');
  const input = document.getElementById('nameInput');
  const confirmBtn = document.getElementById('nameConfirm');

  modal.classList.remove('hidden');
  input.focus();

  const handleConfirm = () => {
    const name = input.value.trim();
    if (name.length > 0 && name.length <= 20) {
      localStorage.setItem('playerName', name);
      modal.classList.add('hidden');
      initGame(name);
    } else {
      input.style.borderColor = '#ff006e';
      setTimeout(() => {
        input.style.borderColor = '#00d4ff';
      }, 500);
    }
  };

  confirmBtn.onclick = handleConfirm;
  input.onkeypress = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };
}

// Initialize game
function initGame(playerName = null) {
  // Get saved name or use provided name or generate random
  const savedName = playerName || localStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 10000)}`;
  
  // Create local player
  gameState.localPlayer = new Player(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, true, savedName);
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

  if (gameState.isMultiplayer) {
    // Send input to server
    sendInputToServer();
  } else {
    // Single-player: Simulate AI players
    gameState.players.forEach(player => {
      if (!player.isLocal) {
        // Update AI
        player.updateAI();
        // Update player
        player.update(keys);
      }
    });
  }

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
  document.getElementById('coins').textContent = gameState.localPlayer.coins;
  document.getElementById('skinDisplay').textContent = gameState.localPlayer.skins[gameState.localPlayer.skin].name;
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
    if (gameState.localPlayer && gameState.localPlayer.eliminated) {
      gameState.localPlayer.respawn();
      hideDeathScreen();
    } else if (gameState.localPlayer) {
      gameState.localPlayer.swing();
    }
  }

  // Dash on Shift
  if (e.key === 'Shift' && gameState.localPlayer) {
    e.preventDefault();
    gameState.localPlayer.dash();
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
  if (gameState.localPlayer) {
    if (gameState.localPlayer.eliminated) {
      gameState.localPlayer.respawn();
      hideDeathScreen();
    } else {
      gameState.localPlayer.swing();
    }
  }
});

// WebSocket connection for multiplayer
function initWebSocket() {
  if (!MULTIPLAYER_ENABLED) {
    console.log('Multiplayer disabled, starting single-player game');
    return;
  }

  try {
    gameState.wsConnection = new WebSocket(SERVER_URL);

    gameState.wsConnection.onopen = () => {
      console.log('Connected to multiplayer server');
      gameState.isMultiplayer = true;
    };

    gameState.wsConnection.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    };

    gameState.wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
      console.log('Falling back to single-player mode');
      gameState.isMultiplayer = false;
    };

    gameState.wsConnection.onclose = () => {
      console.log('Disconnected from server');
      gameState.isMultiplayer = false;
    };
  } catch (err) {
    console.error('Failed to connect to server:', err);
    console.log('Starting in single-player mode');
  }
}

function handleServerMessage(message) {
  switch (message.type) {
    case 'init':
      gameState.playerId = message.playerId;
      gameState.players = message.players.map(p => playerFromState(p));
      gameState.localPlayer = gameState.players.find(p => p.id === message.playerId);
      if (!gameState.localPlayer) {
        gameState.localPlayer = gameState.players[0];
        gameState.localPlayer.isLocal = true;
      }
      break;

    case 'gameState':
      // Update all players from server
      message.players.forEach(playerState => {
        let player = gameState.players.find(p => p.id === playerState.id);
        if (!player) {
          player = playerFromState(playerState);
          gameState.players.push(player);
        }
        updatePlayerFromState(player, playerState);
      });
      break;

    case 'playerJoined':
      if (!gameState.players.find(p => p.id === message.player.id)) {
        gameState.players.push(playerFromState(message.player));
      }
      break;

    case 'playerLeft':
      gameState.players = gameState.players.filter(p => p.id !== message.playerId);
      break;

    case 'playerEliminated':
      const eliminated = gameState.players.find(p => p.id === message.eliminatedId);
      const killer = gameState.players.find(p => p.id === message.killedById);
      if (eliminated && killer) {
        eliminated.eliminated = true;
        // Update killer's state from server
        if (message.killerState) {
          killer.kills = message.killerState.kills;
          killer.radius = message.killerState.radius;
          killer.maxHp = message.killerState.maxHp;
          killer.hp = message.killerState.hp;
        }
        if (eliminated.isLocal) {
          gameState.stats.deaths++;
          showDeathScreen();
        }
      }
      break;
  }
}

function playerFromState(state) {
  const player = new Player(state.x, state.y, false, state.name);
  Object.assign(player, state);
  player.isLocal = state.id === gameState.playerId;
  return player;
}

function updatePlayerFromState(player, state) {
  player.x = state.x;
  player.y = state.y;
  player.angle = state.angle;
  player.hp = state.hp;
  player.maxHp = state.maxHp;
  player.radius = state.radius;
  player.isSwinging = state.isSwinging;
  player.kills = state.kills;
  player.eliminated = state.eliminated;
}

function sendInputToServer() {
  if (!gameState.isMultiplayer || !gameState.wsConnection) return;

  const input = {
    left: keys['arrowleft'] || keys['a'],
    right: keys['arrowright'] || keys['d'],
    up: keys['arrowup'] || keys['w'],
    down: keys['arrowdown'] || keys['s'],
    angle: gameState.localPlayer?.angle || 0,
    swing: false
  };

  gameState.wsConnection.send(JSON.stringify({
    type: 'move',
    input: input
  }));
}

document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  // Show name modal first, which will call initGame when confirmed
  showNameModal();
});
