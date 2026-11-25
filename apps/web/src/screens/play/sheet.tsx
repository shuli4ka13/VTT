import { claimWords, blockLabel, blockNames, blockOf, NO_BLOCK, availableActions, recordsOf, isItem, sheetKinds, sheetKindOf, shownOn, recordKindOf, fieldsFor, livesOn, isGroup, sharedOf, isDesk as atDesk, fieldsOf, itemCells, blockOfList, pagesOf, SHEET_LIST_KEYS } from '@vtt/engine';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRoom } from '../../store/room.ts';
import { tableSocket } from '../../api/socket.ts';
import { useReader } from '../../engine/use-calc.ts';
import { maySheet, mayField, seesField } from '../../engine/rights.ts';
import { Columns, List, ListItem } from '../../ui/layout.tsx';
import { Card, CardHead, DangerButton, Empty, Fold, Chip, Input, Button, Field, Select } from '../../ui/primitives.tsx';
import { SheetView } from '../../sheet/sheet-view.tsx';
import { recordDetails } from '../../sheet/record-view.tsx';
import { useSession } from '../../store/session.ts';
import { Lobby } from './lobby.tsx';
import { useShownRoom, LangSwitch } from './shown.tsx';
import { Hanging } from './hanging.tsx';
import type { Sheet, System, RoomState, Owned, CompendiumRecord, SheetList } from '@vtt/schema';
import { ThingsList, ThingLine } from '../../sheet/things-list.tsx';
import { FieldCell } from '../../sheet/field-cell.tsx';
import { useT } from '../../i18n/play.ts';

export function SheetScreen() {
  const t = useT('play');
  const room = useShownRoom();
  const mySheetId = useRoom(s => s.mySheetId);
  const pickSheet = useRoom(s => s.pickSheet);
  const [newName, setNewName] = useState('');
  const [newOf, setNewOf] = useState('');

  if (!room) return <Lobby />;

  const sheet = room.sheets.find(s => s.id === mySheetId) ?? null;

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    tableSocket.createSheet(room.id, name, newOf || undefined);
    setNewName('');
  };
  const kinds = sheetKinds(room.system as System);
  const rest = sheet && !atDesk(sheet) ? sideLists(room.system as System, !isGroup(sheet, room.sheets)) : [];

  return (
    <Columns
      left={{
        head: t('sheet.tableSheets'),
        tools: <LangSwitch />,
        body: (
          <>
            {room.sheets.length === 0
              ? <Empty
                  title={t('sheet.none')}
                  hint={t('sheet.noneHint')}
                />
              : (
                <List>
                  {room.sheets.map(item => (
                    <ListItem
                      key={item.id}
                      name={item.name ?? item.id}
                      meta={atDesk(item) ? t('sheet.shared') : isGroup(item, room.sheets) ? t('sheet.group') : sheetKindOf(room.system as System, item)?.label ?? t('sheet.badge.sheet')}
                      active={item.id === mySheetId}
                      onClick={() => pickSheet(item.id)}
                    />
                  ))}
                </List>
              )}
            <div className="stack stack--tight">
              <Input value={newName} onChange={setNewName} placeholder={t('sheet.newName')}
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) create(); }} />
              {kinds.length ? (
                <Select
                  value={newOf}
                  options={[['', t('sheet.noKind')], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
                  onChange={setNewOf}
                />
              ) : null}
              <Button size="sm" wide onClick={create} disabled={!newName.trim()}>{t('sheet.add')}</Button>
            </div>
          </>
        ),
      }}
      main={{
        body: sheet
          ? <SheetBody key={sheet.id} room={room} sheet={sheet} />
          : <Empty title={t('sheet.pickLeft')} hint={t('sheet.pickLeftHint')} />,
      }}
      right={sheet && !atDesk(sheet) && rest.length ? { head: t('sheet.side'), body: <SidePanel room={room} sheet={sheet} lists={rest} /> } : undefined}
    />
  );
}

function SheetBody({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const t = useT('play');
  const ts = useT('sheet');
  const [editing, setEditing] = useState(false);
  const me = useSession(s => s.userId);
  const isDesk = atDesk(sheet);
  const asGroup = !isDesk && isGroup(sheet, room.sheets);
  const shared = useMemo(() => sharedOf(room.system as System, room.sheets), [room.system, room.sheets]);
  const system = room.system as System;
  const scope = isDesk ? 'desk' : asGroup ? 'group' : 'sheet';
  const every = useMemo(() => fieldsFor(system, scope), [system, scope]);
  const fields = useMemo(() => every.filter(field => seesField(room, me, sheet.id, field)), [every, room, me, sheet.id]);
  const reader = useReader(system, sheet, room.compendium, isDesk || asGroup ? null : shared, isDesk ? 'desk' : undefined);
  const kinds = sheetKinds(room.system as System);
  const kind = sheetKindOf(room.system as System, sheet);
  const hasGroups = fieldsOf(system).some(field => livesOn(field) === 'group');
  const only = kind?.blocks?.length ? fields.filter(shownOn(system, sheet)).map(f => f.tag) : undefined;
  const editable = maySheet(room, me, sheet.id);
  const mine = room.members.find(m => m.userId === me);
  const mayDrop = !isDesk && (mine?.role === 'gm' || mine?.sheetId === sheet.id);
  const [claims, setClaims] = useState<string[]>([]);
  const claimable = useMemo(() => claimWords(system), [system]);
  const [second, setSecond] = useState('');
  const [versus, setVersus] = useState('');
  const pairs = useMemo(() => pairFields(system), [system]);
  const openRolls = useMemo(() => fieldsOf(system).some(openRoll), [system]);
  const [at, setAt] = useState<string | null>(null);
  const paged = !isDesk && !asGroup && pagesOf(system).length > 0;
  const own = !isDesk && !asGroup;
  const inBlock = (list: SheetList) => own && blockOfList(system, list) !== undefined;
  const pieces = useSheetPieces(room, sheet);

  return (
    <>
      {isDesk ? <span className="faint">{t('sheet.deskNote')}</span> : (
        <div className="inline">
          <ClaimRow room={room} sheet={sheet} />
          <span className="spacer" />
          {editable ? (
            <Button size="sm" variant={editing ? 'primary' : undefined} title={ts('shift.editHint')} onClick={() => setEditing(!editing)}>
              {editing ? ts('shift.done') : ts('shift.edit')}
            </Button>
          ) : null}
          {mayDrop ? <DangerButton size="sm" onConfirm={() => tableSocket.dropSheet(room.id, sheet.id)}>{t('sheet.drop')}</DangerButton> : null}
        </div>
      )}
      {!isDesk && editable && (claimable.length || pairs.length || openRolls) ? (
        <div className="inline inline--tight roll-claims">
          {claimable.length ? <span className="faint">{t('sheet.claimsFor')}</span> : null}
          {claimable.map(([key, label]) => (
            <Chip key={key} active={claims.includes(key)} onClick={() => setClaims(claims.includes(key) ? claims.filter(one => one !== key) : [...claims, key])}>{label}</Chip>
          ))}
          {pairs.length ? (
            <>
              <span className="faint">{t('sheet.second')}</span>
              <Select value={second} options={[['', t('sheet.same')], ...pairs.map(field => [field.tag, field.label ?? field.tag] as const)] as never} onChange={setSecond} />
            </>
          ) : null}
          {openRolls ? (
            <>
              <span className="faint">{t('sheet.difficulty')}</span>
              <Input type="number" value={versus} onChange={setVersus} />
            </>
          ) : null}
        </div>
      ) : null}
      {!isDesk && !asGroup && hasGroups && mine?.role === 'gm' ? (
        <Field label={t('sheet.groupLabel')}>
          <Select
            value={sheet.group ?? ''}
            options={[['', t('sheet.noGroup')], ...room.sheets
              .filter(other => other.id !== sheet.id && !atDesk(other) && !other.group)
              .map(other => [other.id, other.name ?? other.id] as const)] as never}
            onChange={next => tableSocket.setSheetGroup(room.id, sheet.id, next || null)}
          />
        </Field>
      ) : null}
      {!isDesk && kinds.length && editable ? (
        <Field label={t('sheet.kind')}>
          <Select
            value={sheet.of ?? ''}
            options={[['', t('sheet.noKind')], ...kinds.map(([key, k]) => [key, k.label ?? key] as const)] as never}
            onChange={next => tableSocket.setSheetKind(room.id, sheet.id, next || null)}
          />
        </Field>
      ) : null}
      {!isDesk && !inBlock('hanging') ? pieces.hangingNow : null}
      <SheetView
        system={system}
        fields={fields}
        sheet={sheet}
        reader={reader}
        only={only}
        {...(paged ? { pages: { at, onAt: setAt } } : {})}
        {...(own ? { lists: pieces.bare } : {})}
        badge={isDesk ? t('sheet.badge.desk') : kind?.label ?? t('sheet.badge.sheet')}
        onChange={editable ? (tag, value) => tableSocket.setValue(room.id, sheet.id, tag, value) : undefined}
        onShift={editable ? (tag, by) => tableSocket.shiftValue(room.id, sheet.id, tag, by) : undefined}
        mayEdit={tag => mayField(room, me, sheet.id, tag)}
        editing={editing}
        onRoll={tag => {
          const rolled = fieldsOf(system).find(field => field.tag === tag);
          const pair = rolled?.roll?.pair === true && second !== '' ? second : undefined;
          const named = rolled !== undefined && openRoll(rolled) && versus.trim() !== '' && Number.isFinite(Number(versus)) ? Number(versus) : undefined;
          tableSocket.rollField(room.id, sheet.id, tag, useRoom.getState().secret && room.members.some(m => m.userId === useSession.getState().userId && m.role === 'gm'), claims, pair, named);
          setClaims([]);
          setSecond('');
          setVersus('');
        }}
      />
    </>
  );
}

function ClaimRow({ room, sheet }: { room: RoomState; sheet: Sheet }) {
  const t = useT('play');
  const userId = useSession(s => s.userId);
  const me = room.members.find(m => m.userId === userId);
  const holder = room.members.find(m => m.sheetId === sheet.id);
  if (me?.role === 'gm') {
    return holder
      ? <span className="faint">{t('sheet.claim.playing', { name: holder.name })}</span>
      : <span className="faint">{t('sheet.claim.unclaimed')}</span>;
  }
  if (holder && holder.userId === userId) {
    return (
      <div className="inline inline--tight">
        <Chip active>{t('sheet.claim.yours')}</Chip>
        <Button size="sm" variant="ghost" onClick={() => tableSocket.claimSheet(room.id, null)}>{t('sheet.claim.release')}</Button>
      </div>
    );
  }
  if (holder) return <span className="faint">{t('sheet.claim.playingOnly', { name: holder.name })}</span>;
  return (
    <div className="inline inline--tight">
      <span className="faint">{t('sheet.claim.free')}</span>
      <Button size="sm" onClick={() => tableSocket.claimSheet(room.id, sheet.id)}>{t('sheet.claim.take')}</Button>
    </div>
  );
}

function actionsOf(sheet: Sheet, room: RoomState): { id: string; label: string }[] {
  try {
    return availableActions(sheet, { system: room.system, compendium: room.compendium });
  } catch {
    return [];
  }
}

function shelvesOf<T extends CompendiumRecord>(system: System, items: readonly T[], query: string): [string, T[]][] {
  const needle = query.trim().toLocaleLowerCase('ru');
  const order = blockNames(system);
  const shelves = new Map<string, T[]>();
  for (const item of items) {
    if (needle && !(item.label ?? item.id).toLocaleLowerCase('ru').includes(needle)) continue;
    const block = blockOf(system, recordKindOf(system, item.table)) ?? NO_BLOCK;
    shelves.set(block, [...(shelves.get(block) ?? []), item]);
  }
  const at = (block: string) => (block === NO_BLOCK ? Infinity : order.indexOf(block) < 0 ? order.length : order.indexOf(block));
  return [...shelves].sort(([a], [b]) => at(a) - at(b));
}

const sideLists = (system: System, own: boolean): SheetList[] =>
  SHEET_LIST_KEYS.filter(list => !own || blockOfList(system, list) === undefined);

function SidePanel({ room, sheet, lists }: { room: RoomState; sheet: Sheet; lists: SheetList[] }) {
  const pieces = useSheetPieces(room, sheet);
  return (
    <>
      {lists.includes('actions') ? pieces.actions : null}
      {lists.includes('things') ? pieces.things : null}
      {lists.includes('hanging') ? pieces.hangable : null}
    </>
  );
}

function useSheetPieces(room: RoomState, sheet: Sheet): { hangingNow: ReactNode; hangable: ReactNode; hanging: ReactNode; things: ReactNode; actions: ReactNode; bare: Record<SheetList, ReactNode> } {
  const t = useT('play');
  const me = useSession(s => s.userId);
  const [query, setQuery] = useState('');
  const available = actionsOf(sheet, room);

  const system = room.system as System;
  const records = recordsOf(room.compendium);
  const owned = (id: string) => (sheet.has ?? []).find(entry => entry.of === id);
  const copies = (id: string) => (sheet.has ?? []).filter(entry => entry.of === id);
  const keyOf = (entry: { of: string; id?: string }) => entry.id ?? entry.of;
  const labelOf = (key: string) => {
    const entry = (sheet.has ?? []).find(one => keyOf(one) === key);
    const record = entry ? records.find(one => one.id === entry.of) : undefined;
    const same = entry ? copies(entry.of) : [];
    return `${record?.label ?? key}${same.length > 1 ? ` №${same.indexOf(entry!) + 1}` : ''}`;
  };
  const inside = (key: string): Set<string> => {
    const out = new Set([key]);
    for (let grew = true; grew;) {
      grew = false;
      for (const one of sheet.has ?? []) if (one.in && out.has(one.in) && !out.has(keyOf(one))) { out.add(keyOf(one)); grew = true; }
    }
    return out;
  };
  const belong = (id: string, entry: { of: string; id?: string }, change: { on: boolean; off?: boolean; in?: string | null }) =>
    tableSocket.setBelonging(room.id, sheet.id, 'has', id, change.on, change.off, { inst: keyOf(entry), ...(change.in !== undefined ? { in: change.in } : {}) });
  const wornOf = (id: string) => (sheet.effects ?? []).find(e => e.effectId === id);

  const toggle = (list: 'has' | 'effects', id: string, on: boolean, off?: boolean) =>
    tableSocket.setBelonging(room.id, sheet.id, list, id, on, off);

  const items = records.filter(record => isItem(system, record));
  const actions = records.filter(record => !isItem(system, record));
  const carried = items.filter(item => owned(item.id)).length;
  const known = actions.filter(action => owned(action.id)).length;
  const shared = useMemo(() => sharedOf(system, room.sheets), [system, room.sheets]);
  const reader = useReader(system, sheet, room.compendium, isGroup(sheet, room.sheets) ? null : shared);
  const itemDetails = (item: (typeof items)[number], entry: Owned): string =>
    recordDetails(item, system, room.compendium, { entry, ...(reader.measure ? { count: reader.measure } : {}) })
      .map(line => `${line.label}: ${line.value}`).join(' · ');

  const add = (id: string) => (copies(id).length
    ? tableSocket.setBelonging(room.id, sheet.id, 'has', id, true, false, { add: true })
    : toggle('has', id, true));
  const hints = useMemo(() => new Map(records.filter(record => isItem(system, record))
    .map(item => [item.id, recordDetails(item, system, room.compendium).map(line => `${line.label}: ${line.value}`).join(' · ')])), [records, system, room.compendium]);
  const found = query.trim() !== '';
  const shelves = shelvesOf(system, items, query);

  const hangable = Object.entries(room.system.effects)
    .filter(([, effect]) => (effect.activation ?? 'manual') !== 'manual');

  const editable = maySheet(room, me, sheet.id);

  const hangingNow = (sheet.effects ?? []).length ? (
    <Card>
      <CardHead title={t('sheet.hangingNow')} />
      <Hanging
        room={room} sheet={sheet}
        {...(editable ? { onRemove: entry => tableSocket.setBelonging(room.id, sheet.id, 'effects', entry.effectId, false) } : {})}
      />
    </Card>
  ) : null;
  const hangFold = editable ? (
      <Fold title={t('sheet.hang')} count={hangable.length}>
        {hangable.length === 0
          ? <span className="faint">{t('sheet.noHangable')}</span>
          : (
            <div className="inline inline--tight">
              {hangable.filter(([id]) => !wornOf(id)).map(([id, effect]) => (
                <Chip key={id} onClick={() => toggle('effects', id, true)}>{effect.label ?? id}</Chip>
              ))}
            </div>
          )}
      </Fold>
    ) : null;
  const hanging = hangingNow || hangFold ? <>{hangingNow}{hangFold}</> : null;
  const thingsKinds = (system.blocks ?? []).find(block => block.list === 'things')?.kinds;
  const thingsBody = (
    <>
        {items.length === 0
          ? <span className="faint">{t('sheet.noItems')}</span>
          : (
            <div className="stack stack--tight">
              <ThingsList system={system} kinds={thingsKinds} records={items.filter(item => copies(item.id).length)} row={item => copies(item.id).map((entry, at) => {
                const hosts = (sheet.has ?? []).filter(one => !inside(keyOf(entry)).has(keyOf(one)));
                const cells = itemCells(system, room.compendium, sheet, keyOf(entry));
                const may = cells.length > 0 && mayField(room, me, sheet.id, cells[0]!.tag);
                return (
                  <ThingLine key={keyOf(entry)} label={labelOf(keyOf(entry))} active={!entry.off} details={itemDetails(item, entry)}
                    more={may ? (
                      <Fold title={t('sheet.values')} count={cells.length}>
                        <div className="stack stack--tight">
                          {cells.map(cell => (
                            <FieldCell
                              key={cell.tag} field={cell.field} system={system} sheet={sheet}
                              reader={{ ...reader, storedOf: () => cell.value }}
                              editing
                              onChange={(tag, value) => tableSocket.setValue(room.id, sheet.id, tag, value)}
                            />
                          ))}
                        </div>
                      </Fold>
                    ) : null}
                    actions={<>
                      <Chip onClick={() => belong(item.id, entry, { on: true, off: !entry.off })}>{entry.off ? t('sheet.bag') : t('sheet.worn')}</Chip>
                      <Chip onClick={() => belong(item.id, entry, { on: false })}>{t('sheet.dropItem')}</Chip>
                      {at === 0 ? <Chip onClick={() => add(item.id)}>{t('sheet.another')}</Chip> : null}
                      {hosts.length ? (
                        <Select
                          value={entry.in ?? ''}
                          options={[['', t('sheet.standsAlone')], ...hosts.map(one => [keyOf(one), t('sheet.inside', { name: labelOf(keyOf(one)) })] as const)] as never}
                          onChange={next => belong(item.id, entry, { on: true, off: Boolean(entry.off), in: next || null })}
                        />
                      ) : null}
                    </>} />
                );
              })} />
              <span className="field__label">{t('sheet.addItem')}</span>
              <Input value={query} onChange={setQuery} placeholder={t('sheet.findByName')} />
              {shelves.length === 0
                ? <span className="faint">{t('sheet.nothingFound')}</span>
                : shelves.map(([block, list]) => (
                  <Fold key={`${block}${found ? ' ·' : ''}`} title={blockLabel(room.system, block)} count={list.length} open={found}>
                    <div className="inline inline--tight">
                      {list.map(item => (
                        <Chip key={item.id} active={copies(item.id).length > 0} title={hints.get(item.id) || undefined} onClick={() => add(item.id)}>
                          {item.label ?? item.id}
                        </Chip>
                      ))}
                    </div>
                  </Fold>
                ))}
            </div>
          )}
    </>
  );
  const things = <Fold title={t('sheet.gear')} count={carried}>{thingsBody}</Fold>;
  const actionsList = (
    <>
      <Fold title={t('sheet.apply')} count={available.length} open>
        {available.length === 0
          ? <span className="faint">{t('sheet.nothingToApply')}</span>
          : available.map(action => (
            <Card key={action.id} tone="flat">
              <span className="nowrap" title={t('sheet.appliesAtTable')}>{action.label}</span>
            </Card>
          ))}
      </Fold>

      <Fold title={t('sheet.known')} count={known}>
        {actions.length === 0
          ? <span className="faint">{t('sheet.noActions')}</span>
          : (
            <div className="inline inline--tight">
              {actions.map(action => (
                <Chip
                  key={action.id}
                  active={Boolean(owned(action.id))}
                  onClick={() => toggle('has', action.id, !owned(action.id))}
                >
                  {action.label ?? action.id}
                </Chip>
              ))}
            </div>
          )}
      </Fold>
    </>
  );
  const bare = {
    hanging: (
      <>
        {(sheet.effects ?? []).length
          ? <Hanging room={room} sheet={sheet} {...(editable ? { onRemove: entry => tableSocket.setBelonging(room.id, sheet.id, 'effects', entry.effectId, false) } : {})} />
          : <span className="faint">{t('hanging.none')}</span>}
        {hangFold}
      </>
    ),
    things: thingsBody,
    actions: actionsList,
  };
  return { hangingNow, hangable: hangFold, hanging, things, actions: actionsList, bare };
}

export function pairFields(system: System) {
  return fieldsOf(system).filter(field => field.roll?.pair === true);
}

export function openRoll(field: { roll?: { threshold?: unknown; under?: unknown } }): boolean {
  return field.roll !== undefined && field.roll.threshold === undefined && !field.roll.under;
}
