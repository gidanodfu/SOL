// SPDX-License-Identifier: MIT
import { passwordRules } from '../utils/password';

export default function PasswordRequirements({ password, confirmacion, intento = false }) {
  const reglas = passwordRules(password);
  if (confirmacion !== undefined) reglas.push(['coinciden', 'Las contraseñas coinciden', Boolean(password && confirmacion && password === confirmacion)]);
  const valido = reglas.every(([, , cumple]) => cumple);
  const mensajeError = !reglas.slice(0, 4).every(([, , cumple]) => cumple)
    ? 'La contraseña es insegura. Utiliza una contraseña más fuerte y completa los requisitos indicados.'
    : 'Las contraseñas no coinciden. Revisa la confirmación.';

  return (
    <div className="password-requisitos" aria-live="polite">
      <ul>
        {reglas.map(([id, texto, cumple]) => (
          <li key={id} className={cumple ? 'cumple' : intento ? 'incumple' : ''}>
            <span className="password-requisito-circulo" aria-hidden="true">{cumple ? '✓' : ''}</span>
            {texto}
          </li>
        ))}
      </ul>
      {valido ? (
        <p className="password-requisitos-ok">La contraseña cumple los requisitos de seguridad. Puedes continuar.</p>
      ) : intento ? (
        <p className="password-requisitos-error">{mensajeError}</p>
      ) : null}
    </div>
  );
}
