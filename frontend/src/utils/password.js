// SPDX-License-Identifier: MIT
export const passwordRules = (password) => [
  ['longitud', 'Al menos 8 caracteres', [...password].length >= 8],
  ['letra', 'Al menos una letra', /\p{L}/u.test(password)],
  ['numero', 'Al menos un número', /\p{N}/u.test(password)],
  ['simbolo', 'Al menos un símbolo especial', /[^\p{L}\p{N}]/u.test(password)],
];

export const passwordCumple = (password) => passwordRules(password).every(([, , cumple]) => cumple);
