<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;

/**
 * Fuente única de los perfiles municipales y sus permisos.
 *
 * El rol principal sigue siendo `admin` para conservar `rol:admin` en las rutas
 * municipales. Este servicio distingue las facultades del personal municipal y
 * es consultado por el filtro `permiso` y por la respuesta de sesión.
 */
class AutorizacionMunicipalService
{
    public const ADMIN = 'admin';

    public const MODERADOR = 'moderador';

    public const SOLO_LECTURA = 'solo_lectura';

    /**
     * Matriz central de permisos. Los nombres son estables y se exponen al
     * frontend en la sesión para que la interfaz no invente reglas paralelas.
     *
     * @var array<string, list<string>>
     */
    private const PERMISOS = [
        // Consulta de los módulos municipales.
        'municipal.lectura' => [self::ADMIN, self::MODERADOR, self::SOLO_LECTURA],

        // Administración de cuentas y permisos.
        'usuarios' => [self::ADMIN],

        // Alta, edición, estado y clave de empresas.
        'empresas' => [self::ADMIN],

        // Aprobar/rechazar/reenviar solicitudes y generar enlaces de activación.
        'solicitudes' => [self::ADMIN, self::MODERADOR],

        // Revisión municipal de ofertas.
        'ofertas' => [self::ADMIN, self::MODERADOR],

        // Actividades, imágenes y estados.
        'actividades' => [self::ADMIN, self::MODERADOR],

        // Difusión de oportunidades.
        'oportunidades' => [self::ADMIN, self::MODERADOR],

        // Exportaciones PDF y Excel.
        'reportes' => [self::ADMIN, self::MODERADOR],

        // CSV: exportación masiva reservada a ADMIN.
        'reportes_csv' => [self::ADMIN],
    ];

    /**
     * @return list<string>
     */
    public static function perfiles(): array
    {
        return [self::ADMIN, self::MODERADOR, self::SOLO_LECTURA];
    }

    /**
     * Permisos efectivos de un perfil. Un perfil nulo o inválido no recibe
     * permisos municipales.
     *
     * @return list<string>
     */
    public static function permisosDe(?string $perfil): array
    {
        if ($perfil === null || ! in_array($perfil, self::perfiles(), true)) {
            return [];
        }

        $permisos = [];
        foreach (self::PERMISOS as $permiso => $perfiles) {
            if (in_array($perfil, $perfiles, true)) {
                $permisos[] = $permiso;
            }
        }

        return $permisos;
    }

    public function perfil(): ?string
    {
        return service('guard')->perfilMunicipal();
    }

    public function permite(string $permiso): bool
    {
        $perfil = $this->perfil();

        return $perfil !== null
            && in_array($perfil, self::PERMISOS[$permiso] ?? [], true);
    }

    public function exigir(string $permiso): void
    {
        if (! $this->permite($permiso)) {
            throw ApiException::prohibido('Su perfil municipal no permite realizar esta operación.');
        }
    }
}
