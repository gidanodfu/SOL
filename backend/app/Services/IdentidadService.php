<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Libraries\Identidad;
use CodeIgniter\Database\BaseConnection;
use Throwable;

/**
 * Registro central de identidades reservadas (email, teléfono, RUC y DNI).
 *
 * La tabla `identidades_reservadas` tiene un índice único (tipo, valor): es la
 * barrera de concurrencia entre cuentas y solicitudes. Las comprobaciones sobre
 * las tablas de negocio cubren datos históricos/directos y permiten mensajes
 * específicos.
 */
class IdentidadService
{
    private const SQL_TELEFONO = "CASE
        WHEN CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 13
             AND LEFT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 4) = '0051'
            THEN RIGHT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 9)
        WHEN CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 11
             AND LEFT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 2) = '00'
            THEN RIGHT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 9)
        WHEN CHAR_LENGTH(REGEXP_REPLACE(telefono, '[^0-9]', '')) = 11
             AND LEFT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 2) = '51'
            THEN RIGHT(REGEXP_REPLACE(telefono, '[^0-9]', ''), 9)
        ELSE REGEXP_REPLACE(telefono, '[^0-9]', '')
    END";

    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    public static function valor(string $tipo, ?string $valor): ?string
    {
        return match ($tipo) {
            'email'    => Identidad::email($valor),
            'telefono' => Identidad::telefono($valor),
            'ruc'      => Identidad::ruc($valor) ?: null,
            'dni'      => Identidad::dni($valor) ?: null,
            default    => null,
        };
    }

    /** Detección de violación de índice único (MySQL 1062 / SQLSTATE 23000). */
    public static function esDuplicado(Throwable $e): bool
    {
        $mensaje = strtolower($e->getMessage());

        return str_contains($mensaje, 'duplicate entry')
            || (string) $e->getCode() === '1062'
            || (string) $e->getCode() === '23000';
    }

    /**
     * Comprueba la reserva y las tablas de negocio. No inserta nada.
     */
    public function exigirLibre(
        string $tipo,
        ?string $valor,
        ?int $userId = null,
        ?int $solicitudId = null,
    ): void {
        $valor = self::valor($tipo, $valor);
        if ($valor === null) {
            return;
        }

        $reserva = $this->reserva($tipo, $valor);
        if ($reserva !== null && ! $this->mismoDueno($reserva, $userId, $solicitudId)) {
            throw $this->conflicto($tipo, $reserva);
        }

        switch ($tipo) {
            case 'email':
                if ($this->existeEmailEnUsuarios($valor, $userId)) {
                    throw $this->conflicto('email');
                }
                if ($this->existeEmailEnSolicitudes($valor, $solicitudId)) {
                    throw $this->conflicto('email', ['estado' => 'solicitud']);
                }
                break;

            case 'telefono':
                if ($this->existeTelefonoEnUsuarios($valor, $userId)) {
                    throw $this->conflicto('telefono');
                }
                if ($this->existeTelefonoEnSolicitudes($valor, $solicitudId)) {
                    throw $this->conflicto('telefono', ['estado' => 'solicitud']);
                }
                break;

            case 'ruc':
                if ($this->existeRucEnEmpresas($valor, $userId) || $this->existeRucEnUsuarios($valor, $userId)) {
                    throw $this->conflicto('ruc');
                }
                if ($this->existeRucEnSolicitudes($valor, $solicitudId)) {
                    throw $this->conflicto('ruc', ['estado' => 'solicitud']);
                }
                break;

            case 'dni':
                if ($this->existeDniEnPostulantes($valor, $userId) || $this->existeDniEnUsuarios($valor, $userId)) {
                    throw $this->conflicto('dni');
                }
                break;
        }
    }

    /**
     * Reserva un valor para una cuenta o solicitud. Lanza 409 si ya pertenece a
     * otra cuenta/solicitud. La inserción es la operación atómica de concurrencia.
     */
    public function reservar(
        string $tipo,
        ?string $valor,
        ?int $userId = null,
        ?int $solicitudId = null,
        ?int $excluirSolicitudId = null,
    ): void {
        $valor = self::valor($tipo, $valor);
        if ($valor === null) {
            return;
        }

        $this->exigirLibre($tipo, $valor, $userId, $solicitudId ?? $excluirSolicitudId);

        $ahora = date('Y-m-d H:i:s');
        try {
            $this->db->table('identidades_reservadas')->insert([
                'tipo'         => $tipo,
                'valor'        => $valor,
                'user_id'      => $userId,
                'solicitud_id' => $solicitudId,
                'estado'       => $solicitudId !== null ? 'solicitud' : 'cuenta',
                'created_at'   => $ahora,
                'updated_at'   => $ahora,
            ]);
        } catch (Throwable $e) {
            // Otra petición ganó la carrera: el índice único rechazó la fila.
            $reserva = $this->reserva($tipo, $valor);
            if ($reserva !== null && $this->mismoDueno($reserva, $userId, $solicitudId)) {
                return;
            }
            if ($reserva !== null) {
                throw $this->conflicto($tipo, $reserva);
            }

            throw $e;
        }
    }

    /**
     * Reemplaza el email y teléfono de una cuenta respetando reservas ajenas.
     * Si el valor no cambió, no se toca (permite que cuentas históricas
     * conflictivas sigan operando sin reasignarles datos).
     */
    public function actualizarContacto(int $userId, ?string $email, ?string $telefono): void
    {
        $actual = $this->db->table('users')->select('email, telefono')->where('id', $userId)->get()->getRowArray() ?? [];
        $this->reemplazar('email', $userId, $actual['email'] ?? null, $email);
        $this->reemplazar('telefono', $userId, $actual['telefono'] ?? null, $telefono);
    }

    /**
     * Crea las reservas que falten para una cuenta existente sin modificar sus
     * datos ni reasignar identidades ajenas. Es una reconciliación idempotente
     * para fixtures y datos históricos; no sustituye la validación de alta.
     */
    public function reconciliarUsuario(int $userId): void
    {
        $usuario = $this->db->table('users')
            ->select('email, telefono')
            ->where('id', $userId)
            ->get()
            ->getRowArray();

        if ($usuario === null) {
            return;
        }

        foreach (['email', 'telefono'] as $tipo) {
            $valor = self::valor($tipo, $usuario[$tipo] ?? null);
            if ($valor === null) {
                continue;
            }

            try {
                // Si ya pertenece a esta cuenta, reservar() es un no-op. Si
                // pertenece a otra, se conserva la situación y se informa en el
                // diagnóstico; nunca se reasigna automáticamente.
                $this->reservar($tipo, $valor, $userId);
            } catch (ApiException) {
                continue;
            }
        }
    }

    /**
     * Reserva el DNI de un postulante (incluye cuentas Google que lo completan).
     */
    public function actualizarDocumento(int $userId, ?string $dni): void
    {
        $actual = $this->db->table('postulantes')->select('dni')->where('user_id', $userId)->get()->getRowArray() ?? [];
        $this->reemplazar('dni', $userId, $actual['dni'] ?? null, $dni);
    }

    /**
     * Convierte las reservas de una solicitud aprobada en reservas de su cuenta.
     *
     * @param array<string, string|null> $valores tipo => valor
     */
    public function transferirSolicitud(int $solicitudId, int $userId, array $valores): void
    {
        foreach ($valores as $tipo => $valor) {
            $valor = self::valor($tipo, $valor);
            if ($valor === null) {
                continue;
            }

            $reserva = $this->reserva($tipo, $valor);
            if ($reserva !== null && (int) ($reserva['solicitud_id'] ?? 0) === $solicitudId) {
                $this->db->table('identidades_reservadas')
                    ->where('id', $reserva['id'])
                    ->update([
                        'user_id'      => $userId,
                        'solicitud_id' => null,
                        'estado'       => 'cuenta',
                        'updated_at'   => date('Y-m-d H:i:s'),
                    ]);
                continue;
            }

            $this->reservar($tipo, $valor, $userId, null, $solicitudId);
        }
    }

    /**
     * Libera las reservas de una solicitud rechazada. No toca filas históricas
     * marcadas como conflicto.
     */
    public function liberarSolicitud(int $solicitudId): void
    {
        $this->db->table('identidades_reservadas')
            ->where('solicitud_id', $solicitudId)
            ->where('estado', 'solicitud')
            ->delete();
    }

    private function reemplazar(string $tipo, int $userId, ?string $actual, ?string $nuevo): void
    {
        $actual = self::valor($tipo, $actual);
        $nuevo  = self::valor($tipo, $nuevo);

        if ($actual === $nuevo) {
            return;
        }

        if ($nuevo !== null) {
            $this->reservar($tipo, $nuevo, $userId);
        }

        // Liberar únicamente el valor anterior. Borrar por user_id eliminaría
        // también la reserva nueva que se acaba de insertar y abriría una
        // ventana de concurrencia para duplicados.
        if ($actual !== null) {
            $this->db->table('identidades_reservadas')
                ->where('tipo', $tipo)
                ->where('user_id', $userId)
                ->where('valor', $actual)
                ->delete();
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function reserva(string $tipo, string $valor): ?array
    {
        return $this->db->table('identidades_reservadas')
            ->where('tipo', $tipo)
            ->where('valor', $valor)
            ->get()
            ->getRowArray() ?: null;
    }

    /**
     * @param array<string, mixed> $reserva
     */
    private function mismoDueno(array $reserva, ?int $userId, ?int $solicitudId): bool
    {
        if ($userId !== null && (int) ($reserva['user_id'] ?? 0) === $userId) {
            return true;
        }

        return $solicitudId !== null && (int) ($reserva['solicitud_id'] ?? 0) === $solicitudId;
    }

    private function existeEmailEnUsuarios(string $email, ?int $userId): bool
    {
        $sql = 'SELECT id FROM users WHERE LOWER(TRIM(email)) = ?';
        $params = [$email];
        if ($userId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $userId;
        }

        return $this->db->query($sql . ' LIMIT 1', $params)->getRow() !== null;
    }

    private function existeEmailEnSolicitudes(string $email, ?int $solicitudId): bool
    {
        $sql = "SELECT id FROM solicitudes_empresa WHERE estado = 'pendiente' AND LOWER(TRIM(email)) = ?";
        $params = [$email];
        if ($solicitudId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $solicitudId;
        }

        return $this->db->query($sql . ' LIMIT 1', $params)->getRow() !== null;
    }

    private function existeTelefonoEnUsuarios(string $telefono, ?int $userId): bool
    {
        $sql = 'SELECT id FROM users WHERE ' . self::SQL_TELEFONO . ' = ?';
        $params = [$telefono];
        if ($userId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $userId;
        }

        return $this->db->query($sql . ' LIMIT 1', $params)->getRow() !== null;
    }

    private function existeTelefonoEnSolicitudes(string $telefono, ?int $solicitudId): bool
    {
        $sql = "SELECT id FROM solicitudes_empresa WHERE estado = 'pendiente' AND " . self::SQL_TELEFONO . ' = ?';
        $params = [$telefono];
        if ($solicitudId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $solicitudId;
        }

        return $this->db->query($sql . ' LIMIT 1', $params)->getRow() !== null;
    }

    private function existeRucEnEmpresas(string $ruc, ?int $userId = null): bool
    {
        $builder = $this->db->table('empresas')->where('ruc', $ruc);
        if ($userId !== null) {
            $builder->where('user_id !=', $userId);
        }

        return $builder->countAllResults() > 0;
    }

    private function existeRucEnUsuarios(string $ruc, ?int $userId = null): bool
    {
        $builder = $this->db->table('users')->where('username', $ruc);
        if ($userId !== null) {
            $builder->where('id !=', $userId);
        }

        return $builder->countAllResults() > 0;
    }

    private function existeRucEnSolicitudes(string $ruc, ?int $solicitudId): bool
    {
        $builder = $this->db->table('solicitudes_empresa')
            ->where('ruc', $ruc)
            ->whereIn('estado', ['pendiente', 'aprobada']);
        if ($solicitudId !== null) {
            $builder->where('id !=', $solicitudId);
        }

        return $builder->countAllResults() > 0;
    }

    private function existeDniEnPostulantes(string $dni, ?int $userId): bool
    {
        $builder = $this->db->table('postulantes')->where('dni', $dni);
        if ($userId !== null) {
            $builder->where('user_id !=', $userId);
        }

        return $builder->countAllResults() > 0;
    }

    private function existeDniEnUsuarios(string $dni, ?int $userId): bool
    {
        $builder = $this->db->table('users')->where('username', $dni);
        if ($userId !== null) {
            $builder->where('id !=', $userId);
        }

        return $builder->countAllResults() > 0;
    }

    /**
     * @param array<string, mixed>|null $reserva
     */
    private function conflicto(string $tipo, ?array $reserva = null): ApiException
    {
        if (($reserva['estado'] ?? '') === 'solicitud') {
            $mensaje = match ($tipo) {
                'email' => 'Este correo electrónico ya está asociado a una solicitud de afiliación de empresa pendiente. No es necesario registrar otra solicitud.',
                'ruc'   => 'Ya existe una solicitud de afiliación para este RUC que está pendiente de revisión.',
                default => null,
            };

            if ($mensaje !== null) {
                return ApiException::conflicto($mensaje, [$tipo => $mensaje]);
            }
        }

        return $this->mensajeBase($tipo);
    }

    private function mensajeBase(string $tipo): ApiException
    {
        $mensaje = match ($tipo) {
            'email' => 'Este correo electrónico ya está asociado a una cuenta. Inicia sesión o utiliza la opción de recuperación correspondiente.',
            'telefono' => 'Este número de teléfono ya está asociado a otra cuenta y no puede utilizarse para este registro.',
            'ruc' => 'Este RUC ya está asociado a una empresa registrada. Verifica los datos o utiliza el acceso de la empresa existente.',
            'dni' => 'Este DNI ya está asociado a una cuenta. Verifica tus datos o utiliza el acceso de la cuenta existente.',
            default => 'Ya existe una cuenta o solicitud asociada a estos datos. Utiliza el procedimiento de acceso o activación correspondiente.',
        };

        return ApiException::conflicto(
            $mensaje,
            in_array($tipo, ['email', 'telefono', 'ruc', 'dni'], true) ? [$tipo => $mensaje] : [],
        );
    }
}
