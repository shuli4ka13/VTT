import { useWorld } from '../../store/world.ts';
import { Button } from '../../ui/primitives.tsx';
import { PIECES, bringPiece, donorOf } from '@vtt/engine/model/pieces';

export function Starters() {
  const system = useWorld(s => s.system);
  const editSystem = useWorld(s => s.editSystem);
  const pieces = PIECES.filter(piece => donorOf(piece) && bringPiece(system, piece).added.length);
  if (!pieces.length) return null;

  return (
    <div className="inline inline--tight">
      {pieces.map(piece => (
        <Button
          key={piece.id}
          size="sm"
          title={piece.hint}
          onClick={() => editSystem(draft => { Object.assign(draft, bringPiece(draft, piece).system); })}
        >
          {piece.label}
        </Button>
      ))}
    </div>
  );
}
