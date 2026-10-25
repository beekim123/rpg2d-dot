export interface Point { x: number; y: number }
export type Rating = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type AstralType = 'close' | 'remote' | 'auto' | 'swarm' | 'set' | 'field';
export type ActionWeight = 'light' | 'normal' | 'heavy';
export type DamageTarget = 'body' | 'astral';
export interface StarChart { pow: number; spd: number; rch: number; end: number; prc: number; pot: number }

export interface BattleActor {
  id: string;
  team: 'player' | 'enemy';
  order: number;
  body: Point;
  astral: Point | null;
  kind: AstralType;
  mode: 'manifested' | 'recalled' | 'extinguished';
  hp: number;
  maxHp: number;
  will: number;
  maxWill: number;
  shield: number;
  chart: StarChart;
  reach: number;
  readyAt: number;
  skillIds?: string[];
  lampMarks?: number;
}

export interface BattleSkill {
  id: string;
  cost: number;
  power: number;
  range: number;
  weight: ActionWeight;
  effect: 'damage' | 'heal' | 'shield';
  lampMarks?: number;
  consumeMarks?: boolean;
  knockback?: number;
}

export interface DamageInput {
  power: number;
  attackerPower: number;
  defenderEndurance: number;
  distance: number;
  reach: number;
  target: DamageTarget;
  recalled?: boolean;
  openingMultiplier?: number;
}

export interface SharedDamageResult { actor: BattleActor; damage: number; absorbed: number }
