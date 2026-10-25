import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/sr6-audit'

CLUSTERS = {
    '1-ataka': 'shoot melee_strike defend strike_damage take_damage reload dodge_ready block_ready full_defense act_dodge act_block act_full_defense cover blast_damage throw_blast launch_blast detonate implant_blast',
    '2-deistviya-preimushestvo': 'spend_action gain_edge spend_edge reroll_failures push_edge round_edge turn_actions edge_reroll_one edge_bump edge_init edge_plus_hit edge_bonus_вкус edge_bonus_обоняние edge_bonus_слух edge_bonus_зрение edge_bonus_осязание scene_start second_wind shrug_off battle_start battle_end glitch critical_glitch',
    '3-sostoyaniya': 'prone shocked dazed chilled fatigued frightened unconscious bleeding dead knock_out bleed_out die come_to burning immobilized petrified blinded poisoned corroded wet nauseated beatdown insecurity_shaken insecurity_check',
    '4-matrica': 'matrix_hurt dumpshock dumpshocked link_lock matrix_access matrix_drain convergence device_bricked matrix_check matrix_spike matrix_tarpit matrix_hack matrix_stat_cut ic_attack',
    '5-magiya': 'spell_drain cast_spell heal_spell boost_spell stop_spell sp_increase_attribute sp_armor summon_spirit ritual_cast',
    '6-tehnomant': 'fading form_infusion form_diffusion form_channel cast_form cast_form_attr compile_sprite sprite_trap sprite_storm sprite_diagnostics sprite_power_use',
    '7-transport-toksiny-suschestva': 'drive_check intoxicate drug_crashes dg_alcohol dg_alcohol_take dg_jazz dg_jazz_take dg_long_way dg_zubrila dg_kamikaze dg_nitro creature_template',
}

world = json.load(open(os.path.join(ROOT, 'samples', 'shadowrun.world.json')))
system = world['system']
effects = system['effects']


def ex(value):
    if isinstance(value, dict) and 'expr' in value:
        return value['expr']
    return json.dumps(value, ensure_ascii=False)


def line(step, depth):
    kind = step['type']
    pad = '  ' * depth
    if kind == 'branch':
        return pad + 'ЕСЛИ ' + ex(step.get('if'))
    if kind == 'orElse':
        return pad[:-2] + 'ИНАЧЕ' + (' ЕСЛИ ' + ex(step['if']) if step.get('if') else '')
    if kind == 'stop':
        return pad + 'СТОП ' + ex(step.get('note'))
    if kind == 'emit':
        args = ', '.join(f'{k}={ex(v)}' for k, v in (step.get('args') or {}).items())
        return pad + f"ВЫЗОВ {step.get('id', '')}={ex(step.get('effect')) if isinstance(step.get('effect'), dict) else step.get('effect')}({args})"
    if kind == 'roll':
        body = ('кинуть ' + str(step.get('die', '')) + ' x' + ex(step.get('count'))) if step.get('die') else ex(step.get('fixed'))
        by = f" by {ex(step['by'])}" if step.get('by') else ''
        tags = f" метки {json.dumps(step['tags'], ensure_ascii=False)}" if step.get('tags') else ''
        return pad + f"ЧИСЛО {step.get('id', '')} = {body}{by}{tags}"
    if kind == 'apply':
        return pad + f"ИЗМЕНИТЬ {ex(step.get('target'))} {step.get('direction', '-=')} {ex(step.get('value'))}"
    if kind == 'check':
        return pad + f"ПРОВЕРКА {step.get('id', '')}: {ex(step.get('value'))} против {ex(step.get('versus'))}"
    if kind == 'each':
        return pad + f"ДЛЯ КАЖДОГО {step.get('of') or step.get('rows')}"
    if kind == 'status':
        return pad + f"НАЛОЖИТЬ {ex(step.get('effect'))} на {ex(step.get('to'))}"
    return pad + kind + ' ' + json.dumps({k: v for k, v in step.items() if k != 'type'}, ensure_ascii=False)


def chain(steps):
    out = []
    depth = 1
    for step in steps:
        if step['type'] == 'end':
            depth -= 1
            continue
        if step['type'] == 'orElse':
            out.append(line(step, depth))
            continue
        out.append(line(step, depth))
        if step['type'] == 'branch':
            depth += 1
    return out


def show(key):
    effect = effects[key]
    out = [f"### {key} «{effect.get('label')}» activation={effect.get('activation')}"]
    params = []
    for p in effect.get('params', []):
        params.append(f"{p['key']}:{p.get('kind', 'number')}{'*' if p.get('many') else ''}"
                      f"{' role=' + p['role'] if p.get('role') else ''}{' ask' if p.get('ask') else ''}{' from=' + p['from'] if p.get('from') else ''}")
    out.append('входы: ' + '; '.join(params))
    if effect.get('returns'):
        out.append('итоги: ' + '; '.join(f"{r['key']}={ex(r.get('expr'))}" for r in effect['returns']))
    for part in ('cost', 'steps'):
        if effect.get(part):
            out.append(f'-- {part}')
            out.extend(chain(effect[part]))
    for handler in effect.get('on', []):
        out.append(f"-- когда {handler.get('on')} если {ex(handler.get('if'))}")
        out.extend(chain(handler.get('steps', [])))
    rest = {k: effect[k] for k in ('modifiers', 'duration', 'grants', 'attach', 'detach', 'bond', 'reapply', 'tags') if k in effect}
    if rest:
        out.append('-- правки/срок/выдача ' + json.dumps(rest, ensure_ascii=False, indent=1))
    return '\n'.join(out) + '\n'


os.makedirs(OUT, exist_ok=True)
covered = set()
for name, ids in CLUSTERS.items():
    keys = ids.split()
    covered |= set(keys)
    open(os.path.join(OUT, f'dump-{name}.txt'), 'w').write('\n'.join(show(k) for k in keys))
left = sorted(set(effects) - covered)
if left:
    open(os.path.join(OUT, 'dump-other-effects.txt'), 'w').write('\n'.join(show(k) for k in left))

lines = []
for key, table in system['tables'].items():
    lines.append(f"## {key} «{table.get('label', '')}» shape={table.get('shape', 'rows')} owner={table.get('owner', '-')} extends={table.get('extends', '')} use={table.get('use', '')}")
    for column in table.get('columns', []):
        lines.append('  col ' + json.dumps({k: column[k] for k in column if k in ('key', 'label', 'kind', 'from', 'many', 'expr', 'default', 'min', 'max', 'title', 'stages')}, ensure_ascii=False))
    rows = table.get('rows', [])
    if rows:
        lines.append(f'  rows {len(rows)}: ' + json.dumps(rows[:4], ensure_ascii=False)[:1200])
    for part in ('bindings', 'grants', 'modifiers'):
        if table.get(part):
            lines.append(f'  {part}: ' + json.dumps(table[part], ensure_ascii=False)[:1500])
open(os.path.join(OUT, 'dump-tables.txt'), 'w').write('\n'.join(lines))
open(os.path.join(OUT, 'dump-sheet-types.txt'), 'w').write(json.dumps(system.get('sheets', {}), ensure_ascii=False, indent=1))
open(os.path.join(OUT, 'dump-records.txt'), 'w').write('\n'.join(json.dumps(r, ensure_ascii=False) for r in world['compendium']['records']))
open(os.path.join(OUT, 'dump-blocks-initiative-grants.txt'), 'w').write(json.dumps({k: system[k] for k in ('initiative', 'grants', 'roll_edits', 'groups', 'constants') if k in system}, ensure_ascii=False, indent=1))
print(OUT, 'эффектов вне частей:', len(left))
