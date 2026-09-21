<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Models\AuditoriaModel;
use CodeIgniter\HTTP\IncomingRequest;

/**
 * Registro de acciones relevantes para trazabilidad (RF-61..RF-63, RNF-11).
 */
class AuditoriaService
{
    private AuditoriaModel $modelo;

    public function __construct(?AuditoriaModel $modelo = null)
    {
        $this->modelo = $modelo ?? model(AuditoriaModel::class);
    }

    /**
     * @param array<string, mixed> $detalle
     */
    public function registrar(?int $usuarioId, string $accion, string $entidad, ?int $entidadId = null, array $detalle = []): void
    {
        $ip = null;
        $request = service('request');
        if ($request instanceof IncomingRequest) {
            $ip = $request->getIPAddress();
        }

        $this->modelo->insert([
            'user_id'    => $usuarioId,
            'accion'     => $accion,
            'entidad'    => $entidad,
            'entidad_id' => $entidadId,
            'detalle'    => $detalle === [] ? null : json_encode($detalle, JSON_UNESCAPED_UNICODE),
            'ip'         => $ip,
        ]);
    }
}
