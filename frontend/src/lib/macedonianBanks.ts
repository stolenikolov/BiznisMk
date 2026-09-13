/**
 * Banks licensed in North Macedonia, for the account form's dropdown.
 *
 * Kept on the frontend as plain data on purpose: the backend accepts any bank
 * name string, so this list can be corrected without a migration or a deploy
 * of the API. Institutions that merged away are deliberately absent —
 * Охридска банка went into Шпаркасе, and Поштенска банка no longer operates.
 *
 * Verify against the National Bank's register before relying on it for
 * anything official; bank names change with ownership.
 */
export const MACEDONIAN_BANKS = [
  'Комерцијална банка АД Скопје',
  'Стопанска банка АД Скопје',
  'НЛБ Банка АД Скопје',
  'Халкбанк АД Скопје',
  'Шпаркасе Банка Македонија АД Скопје',
  'УНИБанка АД Скопје',
  'ПроКредит Банка АД Скопје',
  'Централна кооперативна банка АД Скопје',
  'Силк Роуд Банка АД Скопје',
  'ТТК Банка АД Скопје',
  'Стопанска банка АД Битола',
  'Развојна банка на Северна Македонија АД Скопје',
] as const;

/** Sentinel for "not in the list" — swaps the select for a free-text input. */
export const OTHER_BANK = '__other__';
