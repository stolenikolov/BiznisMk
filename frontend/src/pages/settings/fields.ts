/** A cleared text field means "none". */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The fields of `draft` that differ from what is saved — the patch a settings
 * card sends, and, when empty, the reason its save button stays disabled.
 */
export function changedFields<T extends object, K extends keyof T>(saved: T, draft: Pick<T, K>): Partial<Pick<T, K>> {
  const patch: Partial<Pick<T, K>> = {};
  for (const key of Object.keys(draft) as K[]) {
    if (draft[key] !== saved[key]) patch[key] = draft[key];
  }
  return patch;
}
