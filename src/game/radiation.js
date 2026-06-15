import { TILE_SIZE, RADIATION } from './constants.js';

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

export class ContaminationCalculator {
  static addContamination(currentLevel, oreType, cargo, leadShieldingLevel) {
    if (leadShieldingLevel > 0) return currentLevel;

    if (oreType === 'uranium') {
      const totalOtherOres = Object.entries(cargo)
        .filter(([type, count]) => type !== 'uranium' && count > 0)
        .reduce((sum, [, count]) => sum + count, 0);
      if (totalOtherOres > 0) {
        return Math.min(1, currentLevel + RADIATION.CARGO_CONTAMINATION_RATE);
      }
    } else if (cargo.uranium > 0) {
      return Math.min(1, currentLevel + RADIATION.CARGO_CONTAMINATION_RATE);
    }

    return currentLevel;
  }

  static growContamination(currentLevel, cargo, leadShieldingLevel, dt) {
    if (leadShieldingLevel > 0) return currentLevel;
    if (cargo.uranium <= 0) return currentLevel;
    
    const totalOres = Object.values(cargo).reduce((sum, count) => sum + count, 0);
    if (totalOres <= 0) return currentLevel;

    const uraniumRatio = cargo.uranium / totalOres;
    const growthAmount = RADIATION.CARGO_CONTAMINATION_GROWTH_RATE * uraniumRatio * dt;
    
    return Math.min(1, currentLevel + growthAmount);
  }

  static calcOreValuePenalty(baseValue, contaminationLevel, leadShieldingLevel) {
    if (leadShieldingLevel > 0) return baseValue;
    const factor = 1 - contaminationLevel * 0.5;
    return Math.floor(baseValue * factor);
  }

  static calcCargoDps(contaminationLevel, leadShieldingLevel) {
    if (leadShieldingLevel > 0) return 0;
    const ratio = RADIATION.CARGO_MIN_RATIO + contaminationLevel * (1 - RADIATION.CARGO_MIN_RATIO);
    return RADIATION.CARGO_BASE_DPS * ratio;
  }
}

export class EnemyMutator {
  static tryMutate(enemy) {
    if (enemy.mutated) return;
    if (Math.random() >= RADIATION.ENEMY_MUTATION_CHANCE) return;

    enemy.mutated = true;
    enemy.health = enemy.maxHealth * RADIATION.ENEMY_MUTATE_HEALTH_MULT;
    enemy.maxHealth = enemy.maxHealth * RADIATION.ENEMY_MUTATE_HEALTH_MULT;
    enemy.damage = enemy.damage * RADIATION.ENEMY_MUTATE_DAMAGE_MULT;
    enemy.speed = enemy.speed * RADIATION.ENEMY_MUTATE_SPEED_MULT;
    enemy.gold = Math.floor(enemy.gold * RADIATION.ENEMY_MUTATE_GOLD_MULT);
    enemy.color = '#00FF00';
  }

  static applyFieldDamage(enemy, intensity) {
    const damage = RADIATION.DAMAGE_PER_TICK * intensity * RADIATION.ENEMY_DAMAGE_MULTIPLIER;
    enemy.health -= damage;
    enemy.damageFlash = 0.2;
    EnemyMutator.tryMutate(enemy);
  }
}

export class RadiationManager {
  constructor() {
    this.fields = [];
  }

  spawnField(x, y) {
    this.fields.push(new RadiationField(x, y));
  }

  update(dt, player, onDamage, enemies = null) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const field = this.fields[i];
      if (!field.update(dt)) {
        this.fields.splice(i, 1);
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
              EnemyMutator.applyFieldDamage(enemy, enemyIntensity);
            }
          }
        }
      }
    }
  }

  applyCargoRadiation(dt, player) {
    if (player.cargo.uranium <= 0 || player.leadShieldingLevel > 0) return 0;

    player.contaminationLevel = ContaminationCalculator.growContamination(
      player.contaminationLevel,
      player.cargo,
      player.leadShieldingLevel,
      dt
    );

    const dps = ContaminationCalculator.calcCargoDps(
      player.contaminationLevel,
      player.leadShieldingLevel
    );
    const damage = dps * dt;
    player.takeRadiationDamage(damage);
    return damage;
  }

  shouldWarnLeak(contaminationLevel) {
    return contaminationLevel > RADIATION.CARGO_LEAK_WARN_THRESHOLD;
  }

  clear() {
    this.fields = [];
  }

  render(ctx, worldToScreen) {
    for (const field of this.fields) {
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
  }
}
