<?php

namespace App\Controllers\Api;

use App\Models\CategoriaModel;

/**
 * Catálogo de categorías laborales para formularios de ofertas. Disponible para
 * cualquier rol autenticado (no es dato sensible).
 */
class CategoriasController extends BaseApiController
{
    public function index()
    {
        return $this->ok((new CategoriaModel())->activas(), 'Categorías laborales.');
    }
}
