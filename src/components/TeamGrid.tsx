import { battleSpecies, willMegaEvolve, type ChampionsSet } from '../data/set';
import { TYPE_COLOR } from '../data/dex';
import { spreadRemaining } from '../data/stats';
import { Sprite } from './ui';

/**
 * Os seis slots do time, todos visiveis de uma vez.
 *
 * Uma lista vertical mostra um Pokemon por vez e esconde o resto atras da
 * rolagem — mas time de VGC se avalia como conjunto, e a pergunta constante e
 * "o que eu ja tenho aqui?". A grade responde isso de relance.
 *
 * Cada slot carrega so o que se le a distancia: sprite, nome, tipos e os avisos
 * que exigem acao (sem golpes, SP sobrando). O detalhe fica no card do
 * selecionado, logo abaixo.
 */
export default function TeamGrid({
  membros,
  selecionado,
  tamanhoMaximo,
  onSelecionar,
  onAdicionar,
}: {
  membros: ChampionsSet[];
  selecionado: string | null;
  tamanhoMaximo: number;
  onSelecionar: (uid: string) => void;
  onAdicionar: () => void;
}) {
  const vazios = Math.max(0, tamanhoMaximo - membros.length);

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {membros.map((m) => {
        const species = battleSpecies(m);
        if (!species) return null;
        const ativo = m.uid === selecionado;
        const semGolpes = m.moves.length === 0;
        const spLivres = spreadRemaining(m.sp);

        return (
          <button
            key={m.uid}
            onClick={() => onSelecionar(m.uid)}
            aria-pressed={ativo}
            className={`relative flex flex-col items-center gap-0.5 rounded-xl border p-1.5 transition active:scale-[0.97] ${
              ativo ? 'border-accent bg-accent/10' : 'border-ink-700 bg-ink-850'
            }`}
          >
            <Sprite species={species} size={48} />
            <span className="w-full truncate text-center text-[11px] leading-tight text-ink-100">
              {species.name}
            </span>

            <span className="flex gap-0.5">
              {(species.types as readonly string[]).map((t) => (
                <span
                  key={t}
                  title={t}
                  className="h-1.5 w-4 rounded-full"
                  style={{ background: TYPE_COLOR[t] ?? '#6b7896' }}
                />
              ))}
            </span>

            {willMegaEvolve(m) && (
              <span className="absolute top-1 right-1 rounded bg-accent px-1 text-[8px] font-bold text-ink-950">
                M
              </span>
            )}
            {(semGolpes || spLivres > 0) && (
              <span
                className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-warn"
                title={semGolpes ? 'sem golpes' : `${spLivres} SP sobrando`}
              />
            )}
          </button>
        );
      })}

      {Array.from({ length: vazios }).map((_, i) => (
        <button
          key={`vazio-${i}`}
          onClick={onAdicionar}
          className="flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-700 text-ink-600 transition active:scale-[0.97] active:border-ink-600"
        >
          <span className="text-xl leading-none">+</span>
          <span className="text-[10px]">Adicionar</span>
        </button>
      ))}
    </div>
  );
}
