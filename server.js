/**
 * Slimey's Battle Royale — WebSocket Server
 * Run with: node server.js
 * Requires: npm install socket.io express
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 2000,
  pingTimeout: 5000,
});

// Serve the game HTML from the same folder
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ===================== CONSTANTS =====================
const MAX_PLAYERS_PER_LOBBY = 35;
const LOBBY_START_COUNTDOWN = 5; // seconds after enough players ready
const MIN_READY_TO_START = 3;
const MAP_W = 5000, MAP_H = 5000;

// Storm config (server is authoritative)
const STORM_CONFIG = {
  startRadius: MAP_W * 0.7,
  startTargetRadius: MAP_W * 0.45,
  shrinkRate: 12,
  baseDamage: 8,
  phaseDuration: 30,
  minPhaseDuration: 15,
  radiusShrinkPerPhase: MAP_W * 0.08,
  minRadius: 200,
  damageIncreasePerPhase: 2,
  maxDamage: 25,
};

// ===================== LOBBY STORE =====================
// lobbies: { [lobbyId]: LobbyState }
const lobbies = {};

// Pre-defined server rooms (matching client SERVER_DEFS)
const SERVER_ROOMS = [
    { id: 'official-na-east-1', name: 'Official NA-East #1', region: 'NA-EAST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'official-na-east-2', name: 'Official NA-East #2', region: 'NA-EAST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'official-na-west-1', name: 'Official NA-West #1', region: 'NA-WEST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'official-eu-west-1', name: 'Official EU-West #1', region: 'EU-WEST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'official-eu-west-2', name: 'Official EU-West #2', region: 'EU-WEST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'official-asia-1',    name: 'Official Asia-Pacific', region: 'ASIA',  maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'ranked-na-east-1',   name: 'Ranked Competitive',  region: 'NA-EAST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'custom-slimewars',   name: 'SLIME WARS Custom #4', region: 'NA-EAST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'custom-scrim',       name: 'Pro Scrim Practice',  region: 'EU-WEST', maxP: MAX_PLAYERS_PER_LOBBY },
    { id: 'custom-nostorm',     name: 'Chill Zone No-Storm', region: 'NA-WEST', maxP: MAX_PLAYERS_PER_LOBBY },
    {id:'custom-nostorm',name:'No Storm (Forest)',region:'NA-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'custom-nostorm2',name:'No Storm (Snow)',region:'EU-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'custom-bigteams',name:'Big Teams Forest',region:'NA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'desert-na-east-1',name:'Desert Dunes NA East',region:'NA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'desert-na-west-1',name:'Desert Dunes NA West',region:'NA-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'desert-eu-west-1',name:'Desert Dunes EU West',region:'EU-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'desert-asia-1',name:'Desert Dunes Asia',region:'ASIA',playerCount:0,maxP:35,gameActive:false},
    {id:'desert-sa-east-1',name:'Desert Dunes SA East',region:'SA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'fruit-na-east-1',name:'Fruit City NA East',region:'NA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'fruit-na-west-1',name:'Fruit City NA West',region:'NA-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'fruit-eu-west-1',name:'Fruit City EU West',region:'EU-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'fruit-asia-1',name:'Fruit City Asia',region:'ASIA',playerCount:0,maxP:35,gameActive:false},
    {id:'fruit-sa-east-1',name:'Fruit City SA East',region:'SA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'candy-na-east-1',name:'Candy Kingdom NA East',region:'NA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'candy-na-west-1',name:'Candy Kingdom NA West',region:'NA-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'candy-eu-west-1',name:'Candy Kingdom EU West',region:'EU-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'candy-asia-1',name:'Candy Kingdom Asia',region:'ASIA',playerCount:0,maxP:35,gameActive:false},
    {id:'candy-sa-east-1',name:'Candy Kingdom SA East',region:'SA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'zombie-na-east-1',name:'Slime City Ruins NA East',region:'NA-EAST',playerCount:0,maxP:35,gameActive:false},
    {id:'zombie-na-west-1',name:'Slime City Ruins NA West',region:'NA-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'zombie-eu-west-1',name:'Slime City Ruins EU West',region:'EU-WEST',playerCount:0,maxP:35,gameActive:false},
    {id:'zombie-asia-1',name:'Slime City Ruins Asia',region:'ASIA',playerCount:0,maxP:35,gameActive:false},
    {id:'zombie-sa-east-1',name:'Slime City Ruins SA East',region:'SA-EAST',playerCount:0,maxP:35,gameActive:false},
];

// Init all lobby slots
SERVER_ROOMS.forEach(room => {
  lobbies[room.id] = createLobby(room);
});

function createLobby(room) {
  return {
    id: room.id,
    name: room.name,
    region: room.region,
    maxP: room.maxP,
    players: {},
    enemies: [],       // Add this line to track zombies
    gameActive: false,
    countdown: null,
    storm: null,
    stormInterval: null,
  };
}

function getLobbyInfo(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return null;
  return {
    id: lobby.id,
    name: lobby.name,
    region: lobby.region,
    playerCount: Object.keys(lobby.players).length,
    maxP: lobby.maxP,
    gameActive: lobby.gameActive,
  };
}

function getAllLobbiesInfo() {
  return Object.values(lobbies).map(l => ({
    id: l.id,
    name: l.name,
    region: l.region,
    playerCount: Object.keys(l.players).length,
    maxP: l.maxP,
    gameActive: l.gameActive,
  }));
}

function getTotalOnline() {
  return Object.values(lobbies).reduce((sum, l) => sum + Object.keys(l.players).length, 0);
}

// ===================== STORM ENGINE (server-side) =====================
function createStorm() {
  return {
    centerX: MAP_W / 2,
    centerY: MAP_H / 2,
    radius: STORM_CONFIG.startRadius,
    targetRadius: STORM_CONFIG.startTargetRadius,
    damagePerSec: STORM_CONFIG.baseDamage,
    phase: 1,
    phaseTimer: 0,
    phaseDuration: STORM_CONFIG.phaseDuration,
    nextCenterX: MAP_W / 2,
    nextCenterY: MAP_H / 2,
  };
}

function tickStorm(storm, dt) {
  storm.phaseTimer += dt;

  // Smoothly shrink
  if (storm.radius > storm.targetRadius) {
    storm.radius = Math.max(storm.targetRadius, storm.radius - STORM_CONFIG.shrinkRate * dt);
  }
  // Move center
  storm.centerX += (storm.nextCenterX - storm.centerX) * dt * 0.1;
  storm.centerY += (storm.nextCenterY - storm.centerY) * dt * 0.1;

  // Phase transition
  if (storm.phaseTimer >= storm.phaseDuration) {
    storm.phaseTimer = 0;
    storm.phase++;
    storm.phaseDuration = Math.max(STORM_CONFIG.minPhaseDuration, storm.phaseDuration - 5);
    storm.targetRadius = Math.max(STORM_CONFIG.minRadius, storm.targetRadius - STORM_CONFIG.radiusShrinkPerPhase);
    storm.nextCenterX = MAP_W * 0.3 + Math.random() * MAP_W * 0.4;
    storm.nextCenterY = MAP_H * 0.3 + Math.random() * MAP_H * 0.4;
    storm.damagePerSec = Math.min(STORM_CONFIG.maxDamage, storm.damagePerSec + STORM_CONFIG.damageIncreasePerPhase);
    return { phaseChanged: true };
  }
  return { phaseChanged: false };
}

function startStorm(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;
  lobby.storm = createStorm();
  let last = Date.now();

  lobby.stormInterval = setInterval(() => {
    if (!lobby.gameActive) { clearInterval(lobby.stormInterval); return; }
    const now = Date.now();
    const dt = (now - last) / 1000;
    last = now;

    const { phaseChanged } = tickStorm(lobby.storm, dt);

    // Broadcast storm state to all players in lobby
    io.to(lobbyId).emit('stormUpdate', {
      centerX: lobby.storm.centerX,
      centerY: lobby.storm.centerY,
      radius: lobby.storm.radius,
      targetRadius: lobby.storm.targetRadius,
      phase: lobby.storm.phase,
      phaseDuration: lobby.storm.phaseDuration,
      phaseTimer: lobby.storm.phaseTimer,
      damagePerSec: lobby.storm.damagePerSec,
      phaseChanged,
    });

    // Apply storm damage to players outside the zone
    const s = lobby.storm;
    Object.entries(lobby.players).forEach(([sid, p]) => {
      if (!p.alive) return;
      const dist = Math.hypot(p.x - s.centerX, p.y - s.centerY);
      if (dist > s.radius) {
        p.hp -= s.damagePerSec * dt;
        if (p.hp <= 0) {
          p.hp = 0;
          p.alive = false;
          io.to(sid).emit('youDied', { reason: 'storm' });
          io.to(lobbyId).emit('playerEliminated', { id: sid, name: p.name, killedBy: 'Storm' });
          checkWinCondition(lobbyId);
        } else {
          // Send damage tick to the individual player
          io.to(sid).emit('stormDamage', { amount: s.damagePerSec * dt, hp: p.hp });
        }
      }
    });
  }, 100); // tick every 100ms
}

function stopStorm(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (lobby && lobby.stormInterval) {
    clearInterval(lobby.stormInterval);
    lobby.stormInterval = null;
  }
}

// ===================== WIN CONDITION =====================
function checkWinCondition(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby || !lobby.gameActive) return;
  const alive = Object.values(lobby.players).filter(p => p.alive);
  if (alive.length <= 1) {
    const winner = alive[0];
    io.to(lobbyId).emit('gameOver', {
      winnerId: winner ? winner.id : null,
      winnerName: winner ? winner.name : 'Nobody',
      results: buildResults(lobby),
    });
    endGame(lobbyId);
  }
}

function buildResults(lobby) {
  return Object.values(lobby.players)
    .sort((a, b) => (b.eliminatedAt || 0) - (a.eliminatedAt || 0) || (b.kills || 0) - (a.kills || 0))
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      kills: p.kills || 0,
      placement: i + 1,
      eliminatedAt: p.eliminatedAt || null,
    }));
}

function endGame(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;
  lobby.gameActive = false;
  stopStorm(lobbyId);
  // Reset player states for next game
  Object.values(lobby.players).forEach(p => {
    p.alive = false;
    p.hp = 100;
    p.shield = 0;
    p.ready = false;
    p.kills = 0;
    p.eliminatedAt = null;
  });
  console.log(`[${lobbyId}] Game ended.`);
}

// ===================== SOCKET EVENTS =====================
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ---- GET SERVER LIST ----
  socket.on('getServerList', () => {
    socket.emit('serverList', getAllLobbiesInfo());
    socket.emit('onlineCount', getTotalOnline());
  });

  // ---- JOIN LOBBY ----
  socket.on('joinLobby', ({ lobbyId, playerName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) return socket.emit('error', { msg: 'Lobby not found' });
    if (Object.keys(lobby.players).length >= lobby.maxP) return socket.emit('error', { msg: 'Lobby is full' });

    // Leave any previous lobby
    if (socket.data.lobbyId) leaveCurrentLobby(socket);

    socket.join(lobbyId);
    socket.data.lobbyId = lobbyId;
    socket.data.name = playerName;

    const playerData = {
      id: socket.id,
      name: playerName,
      x: MAP_W / 2, y: MAP_H / 2,
      hp: 100, shield: 0,
      alive: false,
      ready: false,
      kills: 0,
      eliminatedAt: null,
      color: randomColor(),
      level: Math.floor(Math.random() * 200) + 1,
    };
    lobby.players[socket.id] = playerData;

    // Tell the joining player the full lobby state
    socket.emit('joinedLobby', {
      lobbyId,
      yourId: socket.id,
      players: lobby.players,
      gameActive: lobby.gameActive,
    });

    // Tell everyone else
    socket.to(lobbyId).emit('playerJoined', playerData);

    // Broadcast updated lobby chat message
    io.to(lobbyId).emit('lobbyMessage', { type: 'system', text: `${playerName} joined the lobby` });

    // Update server list for everyone
    io.emit('serverListUpdate', { id: lobbyId, playerCount: Object.keys(lobby.players).length });

    console.log(`[${lobbyId}] ${playerName} (${socket.id}) joined. Players: ${Object.keys(lobby.players).length}`);
  });

  // ---- PLAYER READY ----
  socket.on('setReady', ({ ready }) => {
    const lobby = getLobbyForSocket(socket);
    if (!lobby) return;
    const p = lobby.players[socket.id];
    if (!p) return;
    p.ready = ready;
    io.to(socket.data.lobbyId).emit('playerReady', { id: socket.id, ready });
    io.to(socket.data.lobbyId).emit('lobbyMessage', { type: 'system', text: `${p.name} ${ready ? 'is ready!' : 'is not ready'}` });
    checkLobbyStart(socket.data.lobbyId);
  });

  // ---- LOBBY CHAT ----
  socket.on('lobbyChatMessage', ({ text }) => {
    const lobby = getLobbyForSocket(socket);
    if (!lobby) return;
    const p = lobby.players[socket.id];
    if (!p) return;
    const sanitized = String(text).slice(0, 120);
    io.to(socket.data.lobbyId).emit('lobbyMessage', {
      type: 'player',
      id: socket.id,
      name: p.name,
      color: p.color,
      text: sanitized,
    });
  });

  // ---- PLAYER POSITION UPDATE (in-game) ----
  // Broadcast to all others in lobby — server trusts client position for now
  socket.on('playerUpdate', (data) => {
    const lobby = getLobbyForSocket(socket);
    if (!lobby || !lobby.gameActive) return;
    const p = lobby.players[socket.id];
    if (!p || !p.alive) return;

    // Update server-side state
    p.x = data.x ?? p.x;
    p.y = data.y ?? p.y;
    p.hp = data.hp ?? p.hp;
    p.shield = data.shield ?? p.shield;
    p.angle = data.angle ?? p.angle;
    p.activeWeapon = data.activeWeapon ?? p.activeWeapon;

    // Relay to other players
    socket.to(socket.data.lobbyId).emit('remotePlayerUpdate', {
      id: socket.id,
      x: p.x, y: p.y,
      hp: p.hp, shield: p.shield,
      angle: p.angle,
      activeWeapon: p.activeWeapon,
    });
  });

  // ---- BULLET FIRED ----
  socket.on('bulletFired', (data) => {
    const lobby = getLobbyForSocket(socket);
    if (!lobby || !lobby.gameActive) return;
    // Relay bullet to all other players
    socket.to(socket.data.lobbyId).emit('remoteBullet', {
      ...data,
      ownerId: socket.id,
      ownerName: socket.data.name,
    });
  });

  // ---- HIT REPORT (client reports a hit, server validates loosely) ----
  socket.on('reportHit', ({ targetId, damage, weaponKey }) => {
    const lobby = getLobbyForSocket(socket);
    if (!lobby || !lobby.gameActive) return;
    const target = lobby.players[targetId];
    const attacker = lobby.players[socket.id];
    if (!target || !target.alive || !attacker || !attacker.alive) return;

    // Basic anti-cheat: attacker must be within reasonable range
    const dist = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    const MAX_RANGE = 1400; // sniper max range
    if (dist > MAX_RANGE) return; // reject out-of-range hits

    // Clamp damage to weapon max
    const WEAPON_MAX_DAMAGE = { pistol:25, ar:20, shotgun:108, sniper:120, smg:14, rocket:80, minigun:12 };
    const maxDmg = WEAPON_MAX_DAMAGE[weaponKey] || 30;
    const clampedDmg = Math.min(damage, maxDmg);

    // Apply damage server-side
    let absorbed = 0;
    if (target.shield > 0) {
      absorbed = Math.min(target.shield, clampedDmg);
      target.shield -= absorbed;
    }
    target.hp -= (clampedDmg - absorbed);

    // Tell the target they were hit
    io.to(targetId).emit('youWereHit', {
      attackerId: socket.id,
      attackerName: attacker.name,
      damage: clampedDmg,
      absorbed,
      hp: target.hp,
      shield: target.shield,
    });

    // Confirm hit to shooter (for feedback)
    socket.emit('hitConfirmed', { targetId, damage: clampedDmg, hp: target.hp });

    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.eliminatedAt = Date.now();
      attacker.kills = (attacker.kills || 0) + 1;

      io.to(targetId).emit('youDied', { reason: 'player', killerId: socket.id, killerName: attacker.name });
      io.to(socket.data.lobbyId).emit('playerEliminated', {
        id: targetId,
        name: target.name,
        killedBy: attacker.name,
        killerScore: attacker.kills,
      });
      checkWinCondition(socket.data.lobbyId);
    }
  });

  // ---- IN-GAME CHAT ----
  socket.on('gameChat', ({ text }) => {
    const lobby = getLobbyForSocket(socket);
    if (!lobby) return;
    const p = lobby.players[socket.id];
    if (!p) return;
    io.to(socket.data.lobbyId).emit('gameChatMessage', {
      name: p.name,
      color: p.color,
      text: String(text).slice(0, 100),
    });
  });

  // ---- DISCONNECT ----
  socket.on('disconnect', () => {
    leaveCurrentLobby(socket);
    console.log(`[disconnect] ${socket.id}`);
  });
});

// ===================== LOBBY HELPERS =====================

function spawnZombieNearPlayer(playerId, lobbyId) {
  const lobby = lobbies[lobbyId];
  const player = lobby.players[playerId];

  if (player && player.alive) {
    const zombie = {
      id: Math.random().toString(36).substr(2, 9), // Simple ID generator
      x: player.x, 
      y: player.y,
      hp: 50,
      targetId: playerId
    };
    
    lobby.enemies.push(zombie);
    io.to(lobbyId).emit('enemySpawned', zombie);
  }
}

function getLobbyForSocket(socket) {
  const id = socket.data.lobbyId;
  return id ? lobbies[id] : null;
}
function leaveCurrentLobby(socket) {
  const lobbyId = socket.data.lobbyId;
  if (!lobbyId) return;
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const p = lobby.players[socket.id];
  delete lobby.players[socket.id];
  socket.leave(lobbyId);
  socket.data.lobbyId = null;

  if (p) {
    io.to(lobbyId).emit('playerLeft', { id: socket.id, name: p.name });
    io.to(lobbyId).emit('lobbyMessage', { type: 'system', text: `${p.name} left the lobby` });
  }

  // If game is active and only 1 player left, end game
  if (lobby.gameActive) checkWinCondition(lobbyId);

  io.emit('serverListUpdate', { id: lobbyId, playerCount: Object.keys(lobby.players).length });
}

function checkLobbyStart(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby || lobby.gameActive || lobby.countdown) return;
  const players = Object.values(lobby.players);
  const readyCount = players.filter(p => p.ready).length;
  if (readyCount >= MIN_READY_TO_START || players.length >= lobby.maxP) {
    startLobbyCountdown(lobbyId);
  }
}

function startLobbyCountdown(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby || lobby.countdown) return;
  let count = LOBBY_START_COUNTDOWN;
  io.to(lobbyId).emit('lobbyCountdown', { count });
  io.to(lobbyId).emit('lobbyMessage', { type: 'system', text: `Match starting in ${count} seconds!` });

  lobby.countdown = setInterval(() => {
    count--;
    io.to(lobbyId).emit('lobbyCountdown', { count });
    if (count <= 0) {
      clearInterval(lobby.countdown);
      lobby.countdown = null;
      startGame(lobbyId);
    }
  }, 1000);
}

function startGame(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;
  lobby.gameActive = true;

  // Reset enemies list for the new game
  lobby.enemies = [];

  const players = Object.values(lobby.players);
  players.forEach((p, i) => {
    p.alive = true;
    p.hp = 100;
    p.shield = 0;
    p.kills = 0;
    p.eliminatedAt = null;
    p.ready = false;
    
    // Existing spawn logic: spread players in a ring
    const angle = (i / players.length) * Math.PI * 2;
    p.x = MAP_W / 2 + Math.cos(angle) * 800 + (Math.random() - 0.5) * 300;
    p.y = MAP_H / 2 + Math.sin(angle) * 800 + (Math.random() - 0.5) * 300;

    // ADDED: Spawn a zombie at this player's exact POV/coordinates
    spawnZombieNearPlayer(p.id, lobbyId);
  });

  // Tell all players the game is starting
  io.to(lobbyId).emit('gameStarting', {
    players: lobby.players,
    enemies: lobby.enemies, // Include the initial zombies in the start packet
    mapSeed: Math.floor(Math.random() * 99999),
  });

  // Start the server-side storm
  startStorm(lobbyId);
  console.log(`[${lobbyId}] Game started with ${players.length} players and initial zombies.`);
}

  // Assign spawn positions spread across the map
  const players = Object.values(lobby.players);
  players.forEach((p, i) => {
    p.alive = true;
    p.hp = 100;
    p.shield = 0;
    p.kills = 0;
    p.eliminatedAt = null;
    p.ready = false;
    // Spread spawns in a ring
    const angle = (i / players.length) * Math.PI * 2;
    p.x = MAP_W / 2 + Math.cos(angle) * 800 + (Math.random() - 0.5) * 300;
    p.y = MAP_H / 2 + Math.sin(angle) * 800 + (Math.random() - 0.5) * 300;
  });

  // Tell all players the game is starting with spawn positions
  io.to(lobbyId).emit('gameStarting', {
    players: lobby.players,
    mapSeed: Math.floor(Math.random() * 99999), // clients use same seed to generate same map
  });

  // Start the server-side storm
  startStorm(lobbyId);
  console.log(`[${lobbyId}] Game started with ${players.length} players.`);
}

function randomColor() {
  const colors = ['#e74c3c','#9b59b6','#1abc9c','#e67e22','#f39c12','#3498db','#2ecc71','#e91e63','#ff5722','#00bcd4'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ===================== START SERVER =====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🟢 Slimey's Battle Royale server running on port ${PORT}`);
  console.log(`   Open: http://localhost:${PORT}`);
  console.log(`   Lobbies: ${SERVER_ROOMS.length} active\n`);
});
