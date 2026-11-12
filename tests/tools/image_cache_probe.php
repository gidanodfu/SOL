<?php

// SPDX-License-Identifier: MIT

use App\Services\StorageService;

/**
 * Mock de StorageService para probar la caché sin tocar Supabase.
 * Cuenta cada descarga externa en el archivo indicado.
 */
final class CacheProbeStorage extends StorageService
{
    public function __construct(
        private readonly string $cache,
        private readonly string $contador,
    ) {
        parent::__construct();
    }

    public function esSupabase(): bool
    {
        return true;
    }

    protected function raizCacheImagen(): string
    {
        return $this->cache;
    }

    protected function leerContenido(string $objectKey): ?string
    {
        // Amplía la ventana de carrera para que el test sea determinista.
        usleep(150_000);
        file_put_contents($this->contador, "1\n", FILE_APPEND | LOCK_EX);

        return 'contenido-sintetico';
    }
}
