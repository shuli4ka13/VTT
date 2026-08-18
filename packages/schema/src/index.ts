// Публичный вход пакета: схемы мира и контракты клиент ↔ сервер.
// Пространства имён разведены, чтобы `world.system` и `api.session`
// читались на месте вызова без гадания, что откуда.

export * as world from './world.ts';
export * as api from './api.ts';

export type {
  SlotRef, RefSide, Tag, Field, FieldValue, DiceTerm, DieConstant,
  SystemConstant, RangeTable, RollEditOp, RollEdit, Modifier, Param,
  Step, Trigger, Effect,
  Activation, DurationKind, Stacking, Binding, RecordKind, System,
  StoredValue, WornEffect, Sheet, CompendiumRecord, Compendium, World,
} from './world.ts';

export type {
  LoginRequest, Session, PublishSystemRequest, SystemSummary, PublishedSystem,
  PublishCompendiumRequest, CompendiumSummary, PublishedCompendium,
  PublishRequest, WorldSummary, CreateRoomRequest,
  RoomSummary, RoomState, ActIntent, RoomDelta, ServerMessage, ClientMessage,
} from './api.ts';
