<?php

// SPDX-License-Identifier: MIT

namespace App\Database\Migrations;

use App\Libraries\Identidad;
use CodeIgniter\Database\Migration;

/**
 * Registro único de identidades de cuenta y solicitudes.
 *
 * No modifica ni fusiona cuentas históricas. Los valores duplicados se registran
 * como `estado='conflicto'` con referencias por id; las cuentas existentes siguen
 * funcionando y cualquier alta/edición nueva queda bloqueada hasta resolverlos.
 */
class CrearIdentidadesReservadas extends Migration
{
    public function up(): void
    {
        $this->forge->addField([
            'id'           => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'auto_increment' => true],
            'tipo'         => ['type' => 'ENUM', 'constraint' => ['email', 'telefono', 'ruc', 'dni']],
            'valor'        => ['type' => 'VARCHAR', 'constraint' => 190],
            'user_id'      => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'solicitud_id' => ['type' => 'INT', 'constraint' => 10, 'unsigned' => true, 'null' => true],
            'estado'       => ['type' => 'ENUM', 'constraint' => ['cuenta', 'solicitud', 'conflicto'], 'default' => 'cuenta'],
            'referencias'  => ['type' => 'JSON', 'null' => true],
            'created_at'   => ['type' => 'DATETIME', 'null' => true],
            'updated_at'   => ['type' => 'DATETIME', 'null' => true],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->addKey(['tipo', 'valor'], false, true);
        $this->forge->addKey('user_id');
        $this->forge->addKey('solicitud_id');
        $this->forge->addForeignKey('user_id', 'users', 'id', 'CASCADE', 'CASCADE');
        $this->forge->addForeignKey('solicitud_id', 'solicitudes_empresa', 'id', 'CASCADE', 'CASCADE');
        $this->forge->createTable('identidades_reservadas', true);

        $this->backfill();

        // RUC activo de solicitudes: impide dos solicitudes pendientes/aprobadas
        // para el mismo RUC incluso con peticiones simultáneas.
        if (! $this->db->fieldExists('ruc_reservado', 'solicitudes_empresa')) {
            $this->db->query(
                "ALTER TABLE solicitudes_empresa
                 ADD COLUMN ruc_reservado CHAR(11)
                 GENERATED ALWAYS AS (CASE WHEN estado IN ('pendiente','aprobada') THEN ruc ELSE NULL END) STORED"
            );
        }

        $duplicado = $this->db->query(
            "SELECT ruc FROM solicitudes_empresa
             WHERE estado IN ('pendiente','aprobada')
             GROUP BY ruc HAVING COUNT(*) > 1 LIMIT 1"
        )->getRow();

        if ($duplicado === null && ! $this->indiceExiste('solicitudes_empresa', 'uq_solicitud_ruc_activa')) {
            $this->db->query('ALTER TABLE solicitudes_empresa ADD UNIQUE KEY uq_solicitud_ruc_activa (ruc_reservado)');
        } elseif ($duplicado !== null) {
            echo "Identidades: no se creó uq_solicitud_ruc_activa; hay RUC duplicados activos.\n";
        }

        $conflictos = (int) $this->db->table('identidades_reservadas')->where('estado', 'conflicto')->countAllResults();
        echo 'Identidades: ' . (int) $this->db->table('identidades_reservadas')->countAllResults()
            . " reservas registradas, {$conflictos} conflictos históricos documentados.\n";
    }

    public function down(): void
    {
        if ($this->indiceExiste('solicitudes_empresa', 'uq_solicitud_ruc_activa')) {
            $this->db->query('ALTER TABLE solicitudes_empresa DROP INDEX uq_solicitud_ruc_activa');
        }
        if ($this->db->fieldExists('ruc_reservado', 'solicitudes_empresa')) {
            $this->forge->dropColumn('solicitudes_empresa', 'ruc_reservado');
        }
        $this->forge->dropTable('identidades_reservadas', true);
    }

    private function backfill(): void
    {
        $usuarios = $this->db->table('users')->select('id, email, telefono')->get()->getResultArray();

        $grupos = ['email' => [], 'telefono' => []];
        foreach ($usuarios as $usuario) {
            $email = Identidad::email($usuario['email'] ?? null);
            if ($email !== null) {
                $grupos['email'][$email][] = (int) $usuario['id'];
            }
            $telefono = Identidad::telefono($usuario['telefono'] ?? null);
            if ($telefono !== null) {
                $grupos['telefono'][$telefono][] = (int) $usuario['id'];
            }
        }

        foreach ($grupos as $tipo => $valores) {
            foreach ($valores as $valor => $ids) {
                if (count($ids) === 1) {
                    $this->upsert($tipo, $valor, $ids[0], null, 'cuenta', null);
                } else {
                    $this->upsert($tipo, $valor, null, null, 'conflicto', ['users' => $ids]);
                }
            }
        }

        foreach ($this->db->table('empresas')->select('ruc, user_id')->get()->getResultArray() as $empresa) {
            $ruc = Identidad::ruc($empresa['ruc'] ?? null);
            if ($ruc !== '') {
                $this->upsert('ruc', $ruc, (int) $empresa['user_id'], null, 'cuenta', null);
            }
        }

        foreach ($this->db->table('postulantes')->select('dni, user_id')->get()->getResultArray() as $postulante) {
            $dni = Identidad::dni($postulante['dni'] ?? null);
            if ($dni !== '') {
                $this->upsert('dni', $dni, (int) $postulante['user_id'], null, 'cuenta', null);
            }
        }

        // Solicitudes pendientes: reservan RUC, correo y teléfono.
        foreach ($this->db->table('solicitudes_empresa')
            ->select('id, ruc, email, telefono')
            ->where('estado', 'pendiente')
            ->get()->getResultArray() as $solicitud) {
            $this->reservarSolicitud($solicitud);
        }

        // Aprobadas sin cuenta creada: se documentan como conflicto para no
        // reutilizar sus datos hasta una resolución administrativa explícita.
        $huerfanas = $this->db->query(
            "SELECT s.id, s.ruc, s.email, s.telefono
             FROM solicitudes_empresa s
             LEFT JOIN empresas e ON e.ruc = s.ruc
             WHERE s.estado = 'aprobada' AND e.id IS NULL"
        )->getResultArray();

        foreach ($huerfanas as $solicitud) {
            foreach (['ruc' => $solicitud['ruc'], 'email' => $solicitud['email'], 'telefono' => $solicitud['telefono']] as $tipo => $valor) {
                $valor = $this->normalizar($tipo, $valor);
                if ($valor !== null) {
                    $this->upsert($tipo, $valor, null, null, 'conflicto', [
                        'solicitudes' => [(int) $solicitud['id']],
                        'motivo'      => 'solicitud_aprobada_sin_cuenta',
                    ]);
                }
            }
        }
    }

    /**
     * @param array<string, mixed> $solicitud
     */
    private function reservarSolicitud(array $solicitud): void
    {
        foreach (['ruc' => $solicitud['ruc'], 'email' => $solicitud['email'], 'telefono' => $solicitud['telefono']] as $tipo => $valor) {
            $valor = $this->normalizar($tipo, $valor);
            if ($valor !== null) {
                $this->upsert($tipo, $valor, null, (int) $solicitud['id'], 'solicitud', null);
            }
        }
    }

    private function normalizar(string $tipo, mixed $valor): ?string
    {
        return match ($tipo) {
            'email'    => Identidad::email(is_string($valor) ? $valor : null),
            'telefono' => Identidad::telefono(is_string($valor) ? $valor : null),
            'ruc'      => Identidad::ruc(is_string($valor) ? $valor : null) ?: null,
            'dni'      => Identidad::dni(is_string($valor) ? $valor : null) ?: null,
            default    => null,
        };
    }

    /**
     * Inserta una reserva o la convierte en conflicto si el valor ya existe.
     *
     * @param array<string, mixed>|null $referencias
     */
    private function upsert(
        string $tipo,
        string $valor,
        ?int $userId,
        ?int $solicitudId,
        string $estado,
        ?array $referencias,
    ): void {
        $existente = $this->db->table('identidades_reservadas')
            ->where('tipo', $tipo)
            ->where('valor', $valor)
            ->get()
            ->getRowArray();

        if ($existente === null) {
            $this->db->table('identidades_reservadas')->insert([
                'tipo'         => $tipo,
                'valor'        => $valor,
                'user_id'      => $userId,
                'solicitud_id' => $solicitudId,
                'estado'       => $estado,
                'referencias'  => $referencias === null ? null : json_encode($referencias, JSON_UNESCAPED_UNICODE),
                'created_at'   => date('Y-m-d H:i:s'),
                'updated_at'   => date('Y-m-d H:i:s'),
            ]);

            return;
        }

        $refs = json_decode((string) ($existente['referencias'] ?? ''), true);
        $refs = is_array($refs) ? $refs : [];
        if ($referencias !== null) {
            foreach ($referencias as $clave => $dato) {
                if (is_array($dato)) {
                    $refs[$clave] = array_values(array_unique(array_merge($refs[$clave] ?? [], $dato)));
                } else {
                    $refs[$clave] = $dato;
                }
            }
        }

        $mismoDueno = ($userId !== null && (int) ($existente['user_id'] ?? 0) === $userId)
            || ($solicitudId !== null && (int) ($existente['solicitud_id'] ?? 0) === $solicitudId);

        if ($estado === 'conflicto' || $existente['estado'] === 'conflicto' || ! $mismoDueno) {
            $this->db->table('identidades_reservadas')->where('id', $existente['id'])->update([
                'user_id'      => null,
                'solicitud_id' => null,
                'estado'       => 'conflicto',
                'referencias'  => $refs === [] ? null : json_encode($refs, JSON_UNESCAPED_UNICODE),
                'updated_at'   => date('Y-m-d H:i:s'),
            ]);
        }
    }

    private function indiceExiste(string $tabla, string $indice): bool
    {
        $fila = $this->db->query(
            'SELECT 1 FROM information_schema.statistics
             WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
            [$tabla, $indice],
        )->getRow();

        return $fila !== null;
    }
}

