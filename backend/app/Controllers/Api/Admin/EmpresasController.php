<?php

namespace App\Controllers\Api\Admin;

use App\Controllers\Api\BaseApiController;
use App\Services\EmpresaService;

/**
 * Registro y administración municipal de empresas (RF-08..RF-17). Las empresas
 * nunca se registran solas (RN-01); el RUC es el usuario por defecto (RF-12).
 */
class EmpresasController extends BaseApiController
{
    public function index()
    {
        $filtros = array_filter([
            'estado' => $this->request->getGet('estado'),
            'q'      => $this->request->getGet('q'),
        ], static fn ($v) => $v !== null && $v !== '');

        // Tope de paginación: evita listados desmedidos desde el cliente.
        $limite = min(200, max(1, (int) ($this->request->getGet('limite') ?: 100)));
        $offset = max(0, (int) ($this->request->getGet('offset') ?: 0));

        return $this->ok((new EmpresaService())->listar($filtros, $limite, $offset), 'Lista de empresas.');
    }

    public function show($id)
    {
        return $this->ok((new EmpresaService())->obtener((int) $id), 'Detalle de la empresa.');
    }

    public function store()
    {
        $servicio = new EmpresaService();
        $id = $servicio->crear(service('guard')->id(), $this->cuerpo());

        return $this->creado(['id' => $id], 'Empresa registrada. Las credenciales de acceso corresponden a la Municipalidad entregarlas.');
    }

    public function update($id)
    {
        (new EmpresaService())->actualizar(service('guard')->id(), (int) $id, $this->cuerpo());

        return $this->sinContenido('Empresa actualizada correctamente.');
    }

    public function estado($id)
    {
        $cuerpo = $this->cuerpo();
        (new EmpresaService())->cambiarEstado(service('guard')->id(), (int) $id, (string) ($cuerpo['estado'] ?? ''));

        return $this->sinContenido('Estado de la empresa actualizado.');
    }

    public function resetPassword($id)
    {
        $cuerpo = $this->cuerpo();
        (new EmpresaService())->resetearContrasena(service('guard')->id(), (int) $id, (string) ($cuerpo['password'] ?? ''));

        return $this->sinContenido('Contraseña restablecida. Entregue la nueva credencial a la empresa.');
    }
}
