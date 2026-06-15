import { describe, it, expect, beforeEach } from 'vitest';
import { RadiationField, RadiationManager, ContaminationCalculator, EnemyMutator } from '../src/game/radiation.js';
import { TILE_SIZE, RADIATION } from '../src/game/constants.js';

describe('RadiationField', () => {
  it('应该正确初始化位置和属性', () => {
    const x = 800;
    const y = 1200;
    const field = new RadiationField(x, y);
    
    expect(field.x).toBe(x);
    expect(field.y).toBe(y);
    expect(field.radius).toBe(RADIATION.RADIUS * TILE_SIZE);
    expect(field.life).toBe(RADIATION.FIELD_DURATION);
    expect(field.maxLife).toBe(RADIATION.FIELD_DURATION);
  });

  it('update应该减少生命值', () => {
    const field = new RadiationField(400, 600);
    const startLife = field.life;
    field.update(1);
    expect(field.life).toBeLessThan(startLife);
  });

  it('生命耗尽后isAlive返回false', () => {
    const field = new RadiationField(400, 600);
    field.life = 0.1;
    const alive = field.update(1);
    expect(alive).toBe(false);
    expect(field.isAlive()).toBe(false);
  });

  it('shouldDamage在适当时间间隔返回true', () => {
    const field = new RadiationField(400, 600);
    
    expect(field.shouldDamage()).toBe(false);
    
    for (let i = 0; i < Math.ceil(RADIATION.TICK_INTERVAL / 0.1) + 1; i++) {
      field.update(0.1);
    }
    
    expect(field.shouldDamage()).toBe(true);
  });

  it('getDamageIntensity随距离衰减', () => {
    const field = new RadiationField(400, 600);
    
    const centerIntensity = field.getDamageIntensity(400, 600);
    expect(centerIntensity).toBeCloseTo(1, 1);
    
    const edgeIntensity = field.getDamageIntensity(400 + field.radius * 0.5, 600);
    expect(edgeIntensity).toBeGreaterThan(0);
    expect(edgeIntensity).toBeLessThan(1);
    
    const outsideIntensity = field.getDamageIntensity(400 + field.radius + 10, 600);
    expect(outsideIntensity).toBe(0);
  });
});

describe('ContaminationCalculator', () => {
  it('有铅衬时不增加污染', () => {
    const cargo = { coal: 5, uranium: 0 };
    const result = ContaminationCalculator.addContamination(0, 'uranium', cargo, 1);
    expect(result).toBe(0);
  });

  it('拾取铀矿石且有其他矿石时增加污染', () => {
    const cargo = { coal: 5, uranium: 0 };
    const result = ContaminationCalculator.addContamination(0, 'uranium', cargo, 0);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('拾取铀矿石但没有其他矿石时不增加污染', () => {
    const cargo = { coal: 0, uranium: 0 };
    const result = ContaminationCalculator.addContamination(0, 'uranium', cargo, 0);
    expect(result).toBe(0);
  });

  it('已有铀矿石时拾取其他矿石增加污染', () => {
    const cargo = { coal: 0, uranium: 3 };
    const result = ContaminationCalculator.addContamination(0, 'coal', cargo, 0);
    expect(result).toBeGreaterThan(0);
  });

  it('污染值不会超过1', () => {
    const cargo = { coal: 5, uranium: 0 };
    let level = 0;
    for (let i = 0; i < 20; i++) {
      level = ContaminationCalculator.addContamination(level, 'uranium', cargo, 0);
    }
    expect(level).toBeLessThanOrEqual(1);
  });

  it('calcOreValuePenalty有铅衬时返回原值', () => {
    expect(ContaminationCalculator.calcOreValuePenalty(100, 0.5, 1)).toBe(100);
  });

  it('calcOreValuePenalty无铅衬时根据污染降低价值', () => {
    const full = ContaminationCalculator.calcOreValuePenalty(100, 0, 0);
    const half = ContaminationCalculator.calcOreValuePenalty(100, 0.5, 0);
    const max = ContaminationCalculator.calcOreValuePenalty(100, 1.0, 0);
    expect(full).toBe(100);
    expect(half).toBeLessThan(full);
    expect(max).toBeLessThan(half);
  });

  it('calcCargoDps无铅衬且有铀矿时根据污染渐进计算DPS', () => {
    const lowContam = ContaminationCalculator.calcCargoDps(0.05, 0);
    const midContam = ContaminationCalculator.calcCargoDps(0.5, 0);
    const highContam = ContaminationCalculator.calcCargoDps(1.0, 0);

    expect(lowContam).toBeGreaterThan(0);
    expect(midContam).toBeGreaterThan(lowContam);
    expect(highContam).toBeGreaterThan(midContam);
    expect(highContam).toBeCloseTo(RADIATION.CARGO_BASE_DPS, 1);
  });

  it('calcCargoDps有铅衬时返回0', () => {
    expect(ContaminationCalculator.calcCargoDps(0.5, 1)).toBe(0);
  });

  it('低污染时DPS非常低', () => {
    const dps = ContaminationCalculator.calcCargoDps(0, 0);
    const minExpected = RADIATION.CARGO_BASE_DPS * RADIATION.CARGO_MIN_RATIO;
    expect(dps).toBeCloseTo(minExpected, 2);
  });
});

describe('EnemyMutator', () => {
  it('已变异的敌人不会再变异', () => {
    const enemy = { mutated: true, maxHealth: 100, damage: 10, speed: 2, gold: 10 };
    EnemyMutator.tryMutate(enemy);
    expect(enemy.maxHealth).toBe(100);
  });

  it('变异后属性增强', () => {
    const origRandom = Math.random;
    Math.random = () => 0;

    const enemy = {
      mutated: false,
      health: 50,
      maxHealth: 100,
      damage: 10,
      speed: 2,
      gold: 10,
      color: '#8B4513'
    };
    EnemyMutator.tryMutate(enemy);

    Math.random = origRandom;

    expect(enemy.mutated).toBe(true);
    expect(enemy.maxHealth).toBe(100 * RADIATION.ENEMY_MUTATE_HEALTH_MULT);
    expect(enemy.damage).toBe(10 * RADIATION.ENEMY_MUTATE_DAMAGE_MULT);
    expect(enemy.speed).toBe(2 * RADIATION.ENEMY_MUTATE_SPEED_MULT);
    expect(enemy.gold).toBe(Math.floor(10 * RADIATION.ENEMY_MUTATE_GOLD_MULT));
    expect(enemy.color).toBe('#00FF00');
  });

  it('applyFieldDamage对敌人造成伤害', () => {
    const enemy = {
      mutated: false,
      health: 100,
      maxHealth: 100,
      damage: 10,
      speed: 2,
      gold: 10,
      damageFlash: 0
    };
    EnemyMutator.applyFieldDamage(enemy, 0.5);
    expect(enemy.health).toBeLessThan(100);
    expect(enemy.damageFlash).toBeGreaterThan(0);
  });
});

describe('RadiationManager', () => {
  let rm;
  let mockPlayer;
  let damageEvents;

  beforeEach(() => {
    rm = new RadiationManager();
    mockPlayer = { x: 400, y: 600, health: 100 };
    damageEvents = [];
  });

  it('初始fields应该为空', () => {
    expect(rm.fields.length).toBe(0);
  });

  it('spawnField创建辐射场', () => {
    rm.spawnField(400, 600);
    expect(rm.fields.length).toBe(1);
    expect(rm.fields[0] instanceof RadiationField).toBe(true);
  });

  it('玩家在辐射场中会受到辐射伤害', () => {
    rm.spawnField(mockPlayer.x, mockPlayer.y);
    const startHealth = mockPlayer.health;

    for (let i = 0; i < Math.ceil(RADIATION.TICK_INTERVAL / 0.1) + 2; i++) {
      rm.update(0.1, mockPlayer, (type, dmg) => {
        damageEvents.push({ type, dmg });
        mockPlayer.health -= dmg;
      }, []);
    }

    const radiationEvents = damageEvents.filter(e => e.type === 'radiation');
    expect(radiationEvents.length).toBeGreaterThan(0);
    expect(mockPlayer.health).toBeLessThan(startHealth);
  });

  it('敌人在辐射场中会受到伤害并可能变异', () => {
    rm.spawnField(mockPlayer.x, mockPlayer.y);
    const mockEnemies = [{
      x: mockPlayer.x,
      y: mockPlayer.y,
      health: 100,
      maxHealth: 100,
      damage: 10,
      speed: 2,
      gold: 10,
      color: '#8B4513',
      mutated: false,
      damageFlash: 0
    }];

    for (let i = 0; i < Math.ceil(RADIATION.TICK_INTERVAL / 0.1) + 2; i++) {
      rm.update(0.1, mockPlayer, () => {}, mockEnemies);
    }

    expect(mockEnemies[0].health).toBeLessThan(100);
  });

  it('update会清理过期的辐射场', () => {
    rm.spawnField(400, 600);
    expect(rm.fields.length).toBe(1);
    rm.fields[0].life = 0.1;

    rm.update(1, mockPlayer, () => {}, []);

    expect(rm.fields.length).toBe(0);
  });

  it('applyCargoRadiation无铀矿时不造成伤害', () => {
    mockPlayer.cargo = { uranium: 0 };
    mockPlayer.leadShieldingLevel = 0;
    mockPlayer.contaminationLevel = 0;
    mockPlayer.takeRadiationDamage = () => {};

    const damage = rm.applyCargoRadiation(1, mockPlayer);
    expect(damage).toBe(0);
  });

  it('applyCargoRadiation有铀矿无铅衬时造成渐进伤害', () => {
    let totalDamage = 0;
    mockPlayer.cargo = { uranium: 3 };
    mockPlayer.leadShieldingLevel = 0;
    mockPlayer.contaminationLevel = 0.5;
    mockPlayer.takeRadiationDamage = (dmg) => { totalDamage = dmg; };

    const damage = rm.applyCargoRadiation(1, mockPlayer);
    expect(damage).toBeGreaterThan(0);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it('applyCargoRadiation有铅衬时不造成伤害', () => {
    mockPlayer.cargo = { uranium: 3 };
    mockPlayer.leadShieldingLevel = 1;
    mockPlayer.contaminationLevel = 0.5;
    mockPlayer.takeRadiationDamage = () => {};

    const damage = rm.applyCargoRadiation(1, mockPlayer);
    expect(damage).toBe(0);
  });

  it('货仓辐射伤害随污染等级增加', () => {
    const lowDamage = ContaminationCalculator.calcCargoDps(0.1, 0);
    const highDamage = ContaminationCalculator.calcCargoDps(0.9, 0);
    expect(highDamage).toBeGreaterThan(lowDamage * 3);
  });

  it('shouldWarnLeak在污染超过阈值时返回true', () => {
    expect(rm.shouldWarnLeak(0.1)).toBe(false);
    expect(rm.shouldWarnLeak(0.5)).toBe(true);
  });

  it('clear会清空辐射场', () => {
    rm.spawnField(400, 600);
    expect(rm.fields.length).toBe(1);

    rm.clear();
    expect(rm.fields.length).toBe(0);
  });
});
