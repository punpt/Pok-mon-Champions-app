import { useCallback } from 'react';
import { useMetaStore } from '../store/metaStore';
import { useTeamStore } from '../store/teamStore';
import { presumedSetCached } from '../engine/presume';

/**
 * Acrescenta um Pokemon ao time ja preenchido com o set mais jogado do ladder:
 * ability, item, nature, distribuicao de Stat Points e os golpes mais comuns.
 *
 * Comecar de um slot vazio obriga a montar tudo do zero antes de qualquer
 * analise fazer sentido — e um set em branco faz o motor de ameacas concluir
 * que voce nao revida nada. Tudo continua editavel; isto e so o ponto de
 * partida.
 */
export function useAddFromMeta(): (speciesId: string) => Promise<void> {
  const addPreparedMember = useTeamStore((s) => s.addPreparedMember);
  const enrich = useMetaStore((s) => s.enrich);

  return useCallback(
    async (speciesId: string) => {
      if (!speciesId) return;
      // Busca o detalhe antes: sem ele o set sai derivado do movepool.
      await enrich(speciesId);
      const entry = useMetaStore.getState().entry(speciesId);
      const presumed = await presumedSetCached(speciesId, entry);
      addPreparedMember(presumed.set);
    },
    [addPreparedMember, enrich],
  );
}
