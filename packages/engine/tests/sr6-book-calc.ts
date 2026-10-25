export type Mode = 'ОВ' | 'КО' | 'ДО' | 'НО'
export type Range = 'вплотную' | 'близкая' | 'средняя' | 'дальняя' | 'экстремальная'
export interface Fighter { body: number; agility: number; reaction: number; intuition: number; willpower: number; skill: number; armor: number; physical: number; stun: number; edge: number }
export interface Weapon { ar: Record<Range, number | null>; dv: number; stun: boolean; modes: Mode[]; ammo: number; melee: boolean }
export interface Attack { attacker: Fighter; defender: Fighter; weapon: Weapon; mode: Mode; range: Range; dice: { attack: number[]; defense: number[]; resist: number[] } }
export interface Outcome { refused: string | null; attackHits: number; defenseHits: number; net: number; hit: boolean; ar: number; dr: number; edgeTo: 'attacker' | 'defender' | null; dv: number; resistHits: number; damage: number; physical: number; stun: number; overflowToPhysical: number; prone: boolean; ammoLeft: number; woundModifier: number; glitch: boolean; criticalGlitch: boolean }

const MODE_ROUNDS: Record<Mode, number> = { 'ОВ': 1, 'КО': 2, 'ДО': 4, 'НО': 10 }
const MODE_AR: Record<Mode, number> = { 'ОВ': 0, 'КО': -2, 'ДО': -4, 'НО': -6 }
const MODE_DV: Record<Mode, number> = { 'ОВ': 0, 'КО': 1, 'ДО': 2, 'НО': 0 }

export function physicalMonitor(f: Fighter): number {
  return Math.ceil(f.body / 2) + 8
}

export function stunMonitor(f: Fighter): number {
  return Math.ceil(f.willpower / 2) + 8
}

export function woundModifier(physical: number, stun: number): number {
  return -(Math.floor(Math.max(0, physical) / 3) + Math.floor(Math.max(0, stun) / 3))
}

export function hits(dice: number[]): number {
  return dice.filter(d => d >= 5).length
}

export function isGlitch(dice: number[]): boolean {
  return dice.filter(d => d === 1).length > dice.length / 2
}

export function defenseRating(f: Fighter): number {
  return f.body + f.armor
}

export function attackPool(f: Fighter): number {
  return Math.max(0, f.skill + f.agility + woundModifier(f.physical, f.stun))
}

export function defensePool(f: Fighter): number {
  return Math.max(0, f.reaction + f.intuition + woundModifier(f.physical, f.stun))
}

export function resistPool(f: Fighter): number {
  return Math.max(0, f.body)
}

export function edgeFor(ar: number, dr: number): 'attacker' | 'defender' | null {
  if (ar - dr >= 4) return 'attacker'
  if (dr - ar >= 4) return 'defender'
  return null
}

interface Firing { refused: string | null; arMod: number; dvMod: number; rounds: number }

function firing(w: Weapon, mode: Mode): Firing {
  if (w.melee) return { refused: null, arMod: 0, dvMod: 0, rounds: 0 }
  if (mode !== 'ОВ' && !w.modes.includes(mode)) return { refused: `у оружия нет режима ${mode}`, arMod: 0, dvMod: 0, rounds: 0 }
  const need = MODE_ROUNDS[mode]
  if (w.ammo <= 0) return { refused: 'нет патронов', arMod: 0, dvMod: 0, rounds: 0 }
  if (w.ammo >= need) return { refused: null, arMod: MODE_AR[mode], dvMod: MODE_DV[mode], rounds: need }
  if (mode === 'ДО') {
    const n = w.ammo
    return { refused: null, arMod: -n, dvMod: n >= 2 ? 1 : 0, rounds: n }
  }
  return { refused: `для режима ${mode} нужно ${need} патронов, есть ${w.ammo}; правило «Недостаточно патронов» в книге дано только для ДО`, arMod: 0, dvMod: 0, rounds: 0 }
}

export function resolveAttack(a: Attack): Outcome {
  const { attacker, defender, weapon, mode, range, dice } = a
  const dr = defenseRating(defender)
  const base: Outcome = {
    refused: null, attackHits: 0, defenseHits: 0, net: 0, hit: false, ar: 0, dr, edgeTo: null, dv: 0,
    resistHits: 0, damage: 0, physical: defender.physical, stun: defender.stun, overflowToPhysical: 0, prone: false,
    ammoLeft: weapon.ammo, woundModifier: woundModifier(defender.physical, defender.stun), glitch: false, criticalGlitch: false,
  }
  const baseAr = weapon.ar[range]
  if (baseAr === null || baseAr === undefined) return { ...base, refused: `на дистанции «${range}» у оружия нет значения атаки` }
  const f = firing(weapon, mode)
  if (f.refused) return { ...base, ar: baseAr, refused: f.refused }
  const ar = baseAr + f.arMod
  const dvBase = weapon.dv + f.dvMod
  const withAr = { ...base, ar, edgeTo: edgeFor(ar, dr) }
  const aPool = attackPool(attacker)
  const dPool = defensePool(defender)
  if (dice.attack.length !== aPool) return { ...withAr, refused: `костей атаки ${dice.attack.length}, а набор ${aPool}` }
  if (dice.defense.length !== dPool) return { ...withAr, refused: `костей защиты ${dice.defense.length}, а набор ${dPool}` }
  const attackHits = hits(dice.attack)
  const defenseHits = hits(dice.defense)
  const glitch = isGlitch(dice.attack)
  const criticalGlitch = glitch && attackHits === 0
  const hit = attackHits >= defenseHits
  const ammoLeft = weapon.melee ? weapon.ammo : weapon.ammo - f.rounds
  const rolled = { ...withAr, attackHits, defenseHits, glitch, criticalGlitch, ammoLeft, hit, net: hit ? attackHits - defenseHits : 0 }
  if (!hit) return rolled
  const dv = dvBase + rolled.net
  const rPool = resistPool(defender)
  if (dice.resist.length !== rPool) return { ...withAr, refused: `костей сопротивления ${dice.resist.length}, а набор ${rPool}` }
  const resistHits = hits(dice.resist)
  const damage = Math.max(0, dv - resistHits)
  const pMax = physicalMonitor(defender)
  const sMax = stunMonitor(defender)
  let physical = defender.physical
  let stun = defender.stun
  let overflowToPhysical = 0
  if (weapon.stun) {
    const total = stun + damage
    if (total > sMax) {
      overflowToPhysical = total - sMax
      stun = sMax
    } else {
      stun = total
    }
    physical += overflowToPhysical
  } else {
    physical += damage
  }
  physical = Math.min(physical, pMax)
  return {
    ...rolled, dv, resistHits, damage, physical, stun, overflowToPhysical,
    prone: damage > defender.body,
    woundModifier: woundModifier(physical, stun),
  }
}
