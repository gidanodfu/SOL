<?php

namespace Config;

use CodeIgniter\Config\BaseService;

/**
 * Services Configuration file.
 *
 * Services are simply other classes/libraries that the system uses
 * to do its job. This is used by CodeIgniter to allow the core of the
 * framework to be swapped out easily without affecting the usage within
 * the rest of your application.
 *
 * This file holds any application-specific services, or service overrides
 * that you might need. An example has been included with the general
 * method format you should use for your service methods. For more examples,
 * see the core Services file at system/Config/Services.php.
 */
class Services extends BaseService
{
    /**
     * Emisión/verificación de JWT. Singleton compartido por filtro y servicios.
     */
    public static function jwtService(bool $getShared = true): \App\Services\JwtService
    {
        if ($getShared) {
            return static::getSharedInstance('jwtService');
        }

        return new \App\Services\JwtService();
    }

    /**
     * Usuario autenticado en la petición actual (fuente de verdad: MySQL).
     * Singleton por request: lo llena JwtAuthFilter y lo leen los controllers.
     */
    public static function guard(bool $getShared = true): \App\Services\JwtGuard
    {
        if ($getShared) {
            return static::getSharedInstance('guard');
        }

        return new \App\Services\JwtGuard();
    }
}
