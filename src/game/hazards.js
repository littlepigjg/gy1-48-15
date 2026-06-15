import { TILE_SIZE, TILE_TYPES, RADIATION } from './constants.js';

export class PoisonGasCloud {
  constructor(x, y, tileX, tileY, index = 0, total = 5) {
    const angle = (index / total) * Math.PI * 2;
    const spread = TILE_SIZE * 1.5;
    this.x = x + Math.cos(angle) * spread * (0.3 + Math.random() * 0.7);
    this.y = y + Math.sin(angle) * spread * (0.3 + Math.random() * 0.7);
    this.tileX = tileX;
    this.tileY = tileY;
    this.vx = Math.cos(angle) * 0.4 + (Math.random() - 0.5) * 0.2;
    this.vy = -0.2 - Math.random() * 0.15;
    this.size = TILE_SIZE * (0.9 + Math.random() * 0.3);
    this.life = 500 + Math.random() * 300;
    this.maxLife = 800;
    this.pulsePhase = Math.random() * Math.PI * 2;
  }

  update(dt, world) {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.005;
    if (this.vy > 0.2) this.vy = 0.2;

    const newTileX = Math.floor(this.x / TILE_SIZE);
    const newTileY = Math.floor(this.y / TILE_SIZE);
    if (world.isSolid(newTileX, newTileY)) {
      this.vx = -this.vx * 0.5;
      this.vy = -this.vy * 0.3;
      this.x += this.vx * 5;
      this.y += this.vy * 5;
    }
    this.tileX = newTileX;
    this.tileY = newTileY;

    if (Math.random() < 0.002) {
      this.vx += (Math.random() - 0.5) * 0.2;
    }

    this.life -= dt * 60;
    this.pulsePhase += dt * 2;
    return this.life > 0;
  }

  getDamageRadius() {
    return this.size * 0.6;
  }

  isAlive() {
    return this.life > 0;
  }
}

export class RadiationField {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.tileX = Math.floor(x / TILE_SIZE);
    this.tileY = Math.floor(y / TILE_SIZE);
    this.radius = RADIATION.RADIUS * TILE_SIZE;
    this.maxLife = RADIATION.FIELD_DURATION;
    this.life = this.maxLife;
    this.pulsePhase = Math.random() * Math.PI * 2;
    this.damageTimer = 0;
  }

  update(dt) {
    this.life -= dt;
    this.pulsePhase += dt * 3;
    this.damageTimer += dt;
    return this.life > 0;
  }

  shouldDamage() {
    if (this.damageTimer >= RADIATION.TICK_INTERVAL) {
      this.damageTimer = 0;
      return true;
    }
    return false;
  }

  getDamageIntensity(entityX, entityY) {
    const dx = entityX - this.x;
    const dy = entityY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.radius) return 0;
    return 1 - dist / this.radius;
  }

  isAlive() {
    return this.life > 0;
  }
}

export class HazardManager {
  constructor() {
    this.poisonClouds = [];
    this.radiationFields = [];
    this.collapseWarnings = [];
    this.damageTimer = 0;
    this.damageInterval = 0.6;
    this.maxDamagePerTick = 3;
  }

  spawnPoisonClouds(x, y, count = 5) {
    count = Math.min(count, 5);
    for (let i = 0; i < count; i++) {
      this.poisonClouds.push(new PoisonGasCloud(
        x, y,
        Math.floor(x / TILE_SIZE),
        Math.floor(y / TILE_SIZE),
        i, count
      ));
    }
  }

  spawnRadiationField(x, y) {
    this.radiationFields.push(new RadiationField(x, y));
  }

  addCollapseWarning(tileX, tileY) {
    this.collapseWarnings.push({
      tileX,
      tileY,
      timer: 60,
      phase: 0
    });
  }

  update(dt, world, player, onDamage, enemies = null) {
    const clouds = this.poisonClouds;

    for (let i = clouds.length - 1; i >= 0; i--) {
      const cloud = clouds[i];

      let repelX = 0;
      let repelY = 0;
      for (let j = 0; j < clouds.length; j++) {
        if (i === j) continue;
        const other = clouds[j];
        const dx = cloud.x - other.x;
        const dy = cloud.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = TILE_SIZE * 0.8;
        if (dist < minDist && dist > 0.1) {
          const force = (minDist - dist) / minDist * 0.3;
          repelX += (dx / dist) * force;
          repelY += (dy / dist) * force;
        }
      }
      cloud.vx += repelX;
      cloud.vy += repelY;

      const maxSpeed = 0.8;
      const speed = Math.sqrt(cloud.vx * cloud.vx + cloud.vy * cloud.vy);
      if (speed > maxSpeed) {
        cloud.vx = (cloud.vx / speed) * maxSpeed;
        cloud.vy = (cloud.vy / speed) * maxSpeed;
      }

      if (!cloud.update(dt, world)) {
        clouds.splice(i, 1);
        continue;
      }
    }

    for (let i = this.radiationFields.length - 1; i >= 0; i--) {
      const field = this.radiationFields[i];
      if (!field.update(dt)) {
        this.radiationFields.splice(i, 1);
        continue;
      }

      if (field.shouldDamage()) {
        const playerIntensity = field.getDamageIntensity(player.x, player.y);
        if (playerIntensity > 0) {
          const damage = RADIATION.DAMAGE_PER_TICK * playerIntensity;
          onDamage('radiation', damage);
        }

        if (enemies) {
          for (const enemy of enemies) {
            const enemyIntensity = field.getDamageIntensity(enemy.x, enemy.y);
            if (enemyIntensity > 0) {
              const damage = RADIATION.DAMAGE_PER_TICK * enemyIntensity * 1.5;
              enemy.health -= damage;
              enemy.damageFlash = 0.2;
              
              if (Math.random() < 0.02 && !enemy.mutated) {
                enemy.mutated = true;
                enemy.health = enemy.maxHealth * 1.5;
                enemy.maxHealth = enemy.maxHealth * 1.5;
                enemy.damage = enemy.damage * 1.3;
                enemy.speed = enemy.speed * 1.2;
                enemy.gold = Math.floor(enemy.gold * 1.5);
                enemy.color = '#00FF00';
              }
            }
          }
        }
      }
    }

    this.damageTimer += dt;
    if (this.damageTimer >= this.damageInterval) {
      this.damageTimer = 0;

      let totalIntensity = 0;
      for (const cloud of clouds) {
        const dx = player.x - cloud.x;
        const dy = player.y - cloud.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < cloud.getDamageRadius()) {
          const intensity = 1 - dist / cloud.getDamageRadius();
          totalIntensity += intensity;
        }
      }

      if (totalIntensity > 0) {
        const damage = Math.min(this.maxDamagePerTick, totalIntensity * 2);
        if (damage > 0.1) {
          onDamage('poison', damage);
        }
      }
    }

    for (let i = this.collapseWarnings.length - 1; i >= 0; i--) {
      const w = this.collapseWarnings[i];
      w.timer -= dt * 60;
      w.phase += dt * 10;
      if (w.timer <= 0) {
        this.collapseWarnings.splice(i, 1);
      }
    }
  }

  getTotalPoisonDamage(dt = 0) {
    return this.poisonClouds.length > 0 ? 0.5 * dt : 0;
  }

  render(ctx, worldToScreen) {
    for (const field of this.radiationFields) {
      const screen = worldToScreen(field.x, field.y);
      const alpha = Math.min(0.35, (field.life / field.maxLife) * 0.4);
      const pulse = 1 + Math.sin(field.pulsePhase) * 0.15;
      const size = field.radius * pulse;

      const gradient = ctx.createRadialGradient(
        screen.x, screen.y, 0,
        screen.x, screen.y, size
      );
      gradient.addColorStop(0, `rgba(57, 255, 20, ${alpha})`);
      gradient.addColorStop(0.4, `rgba(0, 255, 0, ${alpha * 0.7})`);
      gradient.addColorStop(0.7, `rgba(127, 255, 0, ${alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(0, 255, 0, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = alpha * 1.5;
      for (let i = 0; i < 3; i++) {
        const ringPhase = (field.pulsePhase + i * Math.PI * 0.66) % (Math.PI * 2);
        const ringSize = size * (0.3 + (ringPhase / (Math.PI * 2)) * 0.7);
        ctx.strokeStyle = `rgba(57, 255, 20, ${alpha * (1 - ringPhase / (Math.PI * 2))})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, ringSize, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = alpha * 2;
      ctx.fillStyle = '#39FF14';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      const symbolY = screen.y - size * 0.3 + Math.sin(field.pulsePhase * 2) * 5;
      ctx.fillText('☢', screen.x, symbolY);
      ctx.restore();
    }

    for (const cloud of this.poisonClouds) {
      const screen = worldToScreen(cloud.x, cloud.y);
      const alpha = Math.min(0.5, (cloud.life / cloud.maxLife) * 0.6);
      const pulse = 1 + Math.sin(cloud.pulsePhase) * 0.1;
      const size = cloud.size * pulse;

      const gradient = ctx.createRadialGradient(
        screen.x, screen.y, 0,
        screen.x, screen.y, size / 2
      );
      gradient.addColorStop(0, `rgba(124, 252, 0, ${alpha})`);
      gradient.addColorStop(0.5, `rgba(144, 238, 144, ${alpha * 0.6})`);
      gradient.addColorStop(1, `rgba(50, 205, 50, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const w of this.collapseWarnings) {
      const screen = worldToScreen(w.tileX * TILE_SIZE, w.tileY * TILE_SIZE);
      const alpha = Math.min(1, w.timer / 30) * (0.5 + Math.sin(w.phase) * 0.5);

      ctx.strokeStyle = `rgba(255, 0, 0, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(screen.x + 2, screen.y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

      ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠', screen.x + TILE_SIZE / 2, screen.y + TILE_SIZE / 2 + 6);
    }
  }

  clear() {
    this.poisonClouds = [];
    this.radiationFields = [];
    this.collapseWarnings = [];
  }
}
