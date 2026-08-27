/**
 * Executa tarefas com um teto de concorrencia.
 *
 * Buscar dezenas de detalhes em fila deixa o app parado somando latencias;
 * disparar todos de uma vez derruba a rede do celular e faz a API achar que
 * esta sendo atacada. Um punhado por vez resolve os dois lados.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onEach?: (result: R, item: T, done: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done++;
      onEach?.(results[i], items[i], done);
    }
  });

  await Promise.all(runners);
  return results;
}
