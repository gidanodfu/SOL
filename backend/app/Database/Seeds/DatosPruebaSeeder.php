<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

/**
 * Fixtures de pruebas (NUNCA usar en producción).
 *
 * Crea las cuentas y datos que consumen los smoke tests de `tests/smoke/`:
 * admin de prueba, empresa con RUC, postulante con DNI, una oferta publicada y
 * una postulación con su historial. Idempotente por identificador único
 * (username/ruc/dni/oferta).
 *
 * Uso: `php spark db:seed DatosPruebaSeeder` después de `SystemSeeder`.
 */
class DatosPruebaSeeder extends Seeder
{
    public function run(): void
    {
        $now = date('Y-m-d H:i:s');

        // ------------------------------------------------ admin de prueba
        $adminId = $this->usuarioId('admin');
        if ($adminId === null) {
            $this->db->table('users')->insert([
                'username'      => 'admin',
                'password_hash' => password_hash('Admin123!', PASSWORD_DEFAULT),
                'rol'           => 'admin',
                'proveedor'     => 'local',
                'nombres'       => 'Administrador',
                'apellidos'     => 'Municipal',
                'email'         => 'admin@mdjlo.gob.pe',
                'estado'        => 'activo',
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);
            $adminId = (int) $this->db->insertID();
        }

        // ------------------------------------------------ empresa de prueba
        $empresaUserId = $this->usuarioId('20601234567');
        if ($empresaUserId === null) {
            $this->db->table('users')->insert([
                'username'      => '20601234567',
                'password_hash' => password_hash('Empresa123!', PASSWORD_DEFAULT),
                'rol'           => 'empresa',
                'proveedor'     => 'local',
                'nombres'       => 'Constructora',
                'apellidos'     => 'Los Jardines SAC',
                'email'         => 'contacto@losjardines.pe',
                'estado'        => 'activo',
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);
            $empresaUserId = (int) $this->db->insertID();
        }

        $empresaId = $this->db->table('empresas')->where('ruc', '20601234567')->get()->getRowArray()['id'] ?? null;
        if ($empresaId === null) {
            $this->db->table('empresas')->insert([
                'user_id'               => $empresaUserId,
                'ruc'                   => '20601234567',
                'razon_social'          => 'Constructora Los Jardines SAC',
                'nombre_comercial'      => 'Los Jardines',
                'direccion'             => 'Av. Chiclayo 1200, JLO',
                'telefono'              => '074612345',
                'email'                 => 'contacto@losjardines.pe',
                'representante'         => 'Carlos Mendoza',
                'evaluacion_presencial' => 1,
                'estado'                => 'activo',
                'created_at'            => $now,
                'updated_at'            => $now,
            ]);
            $empresaId = (int) $this->db->insertID();
        }

        // --------------------------------------------- postulante de prueba
        $postulanteUserId = $this->usuarioId('12345678');
        if ($postulanteUserId === null) {
            $this->db->table('users')->insert([
                'username'      => '12345678',
                'password_hash' => password_hash('Postu123!', PASSWORD_DEFAULT),
                'rol'           => 'postulante',
                'proveedor'     => 'local',
                'nombres'       => 'Ana',
                'apellidos'     => 'Torres Rojas',
                'email'         => 'ana.torres@mail.com',
                'telefono'      => '987654321',
                'estado'        => 'activo',
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);
            $postulanteUserId = (int) $this->db->insertID();
        }

        $postulante = $this->db->table('postulantes')->where('dni', '12345678')->get()->getRowArray();
        if ($postulante === null) {
            $this->db->table('postulantes')->insert([
                'user_id'    => $postulanteUserId,
                'dni'        => '12345678',
                'nombres'    => 'Ana',
                'apellidos'  => 'Torres Rojas',
                'distrito'   => 'José Leonardo Ortiz',
                'telefono'   => '987654321',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $postulanteId = (int) $this->db->insertID();
        } else {
            $postulanteId = (int) $postulante['id'];
        }

        // ------------------------------------------- oferta + postulación
        $categoria = $this->db->table('categorias')->where('nombre', 'Construcción')->get()->getRowArray();

        $oferta = $this->db->table('ofertas')
            ->where('empresa_id', $empresaId)
            ->where('puesto', 'Operario de construcción')
            ->get()->getRowArray();

        if ($oferta === null) {
            $this->db->table('ofertas')->insert([
                'empresa_id'            => $empresaId,
                'categoria_id'          => $categoria['id'] ?? null,
                'puesto'                => 'Operario de construcción',
                'descripcion'           => 'Se requiere personal para obra civil en Chiclayo.',
                'funciones'             => 'Apoyo en obra, manejo de herramientas básicas.',
                'requisitos'            => 'Secundaria completa, experiencia mínima de 6 meses.',
                'experiencia_requerida' => '6 meses',
                'tipo_empleo'           => 'tiempo_completo',
                'ubicacion'             => 'Chiclayo, JLO',
                'remuneracion'          => 1130.00,
                'vacantes'              => 3,
                'fecha_publicacion'     => date('Y-m-d'),
                'fecha_cierre'          => date('Y-m-d', strtotime('+30 days')),
                'estado'                => 'publicada',
                'created_at'            => $now,
                'updated_at'            => $now,
            ]);
            $ofertaId = (int) $this->db->insertID();
        } else {
            $ofertaId = (int) $oferta['id'];
        }

        $postulacion = $this->db->table('postulaciones')
            ->where('postulante_id', $postulanteId)
            ->where('oferta_id', $ofertaId)
            ->where('activo', 1)
            ->get()->getRowArray();

        if ($postulacion === null) {
            $this->db->table('postulaciones')->insert([
                'postulante_id'     => $postulanteId,
                'oferta_id'         => $ofertaId,
                'empresa_id'        => $empresaId,
                'fecha_postulacion' => $now,
                'estado'            => 'pendiente',
                'activo'            => 1,
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);
            $postulacionId = (int) $this->db->insertID();

            $this->db->table('postulacion_historial')->insert([
                'postulacion_id'  => $postulacionId,
                'estado_anterior' => null,
                'estado_nuevo'    => 'pendiente',
                'usuario_id'      => $postulanteUserId,
                'created_at'      => $now,
            ]);
        }

        echo "DatosPruebaSeeder: fixtures de prueba listos (admin, empresa, postulante, oferta).\n";
    }

    private function usuarioId(string $username): ?int
    {
        $fila = $this->db->table('users')->where('username', $username)->get()->getRowArray();

        return $fila === null ? null : (int) $fila['id'];
    }
}
