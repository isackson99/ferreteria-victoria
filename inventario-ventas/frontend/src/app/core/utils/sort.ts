export type SortDir = 'asc' | 'desc' | null;
export interface SortState { col: string; dir: SortDir; }

export const SORT_NONE: SortState = { col: '', dir: null };

export function nextSort(state: SortState, col: string): SortState {
  if (state.col !== col) return { col, dir: 'asc' };
  if (state.dir === 'asc') return { col, dir: 'desc' };
  return { col: '', dir: null };
}

export function sortArr<T>(arr: T[], state: SortState): T[] {
  if (!state.dir || !state.col) return arr;
  return [...arr].sort((a, b) => {
    const va = (a as any)[state.col];
    const vb = (b as any)[state.col];
    if (va !== vb && !isNaN(Number(va)) && !isNaN(Number(vb))) {
      return state.dir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
    }
    const sa = String(va ?? '').toLowerCase();
    const sb = String(vb ?? '').toLowerCase();
    const cmp = sa.localeCompare(sb, 'es');
    return state.dir === 'asc' ? cmp : -cmp;
  });
}

export function sortIcon(state: SortState, col: string): string {
  if (state.col !== col || !state.dir) return '↕';
  return state.dir === 'asc' ? '↑' : '↓';
}

export function isActive(state: SortState, col: string): boolean {
  return state.col === col && !!state.dir;
}
