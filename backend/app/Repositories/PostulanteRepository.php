<?php

namespace App\Repositories;

use CodeIgniter\Database\BaseConnection;

/**
 * Perfil de un postulante (RF-19/RF-35): datos personales y CV vigente.
 */
class PostulanteRepository
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    /**
     * @return array<string, mixed>
     */
    public function perfilCompleto(int $postulanteId): array
    {
        $postulante = $this->db->table('postulantes p')
            ->select('p.*, u.username, u.email, u.telefono AS user_telefono')
            ->join('users u', 'u.id = p.user_id')
            ->where('p.id', $postulanteId)
            ->get()
            ->getRowArray();

        if ($postulante === null) {
            return [];
        }

        $postulante['cv'] = $this->db->table('cvs')
            ->where('postulante_id', $postulanteId)
            ->where('activo', 1)
            ->orderBy('version', 'DESC')
            ->limit(1)
            ->get()
            ->getRowArray();

        return $postulante;
    }

    /**
     * Requisitos mínimos para poder postular (RF-19 ajustado): datos básicos de
     * contacto presentes y un CV vigente cargado.
     *
     * @return array{datos_basicos: bool, tiene_cv: bool, faltantes: list<string>, completo: bool}
     */
    public function completitud(int $postulanteId): array
    {
        $perfil = $this->db->table('postulantes p')
            ->select('p.*, u.email, u.telefono AS user_telefono')
            ->join('users u', 'u.id = p.user_id')
            ->where('p.id', $postulanteId)
            ->get()
            ->getRowArray();

        if ($perfil === null) {
            return [
                'datos_basicos' => false,
                'tiene_cv'      => false,
                'faltantes'     => ['correo', 'teléfono', 'fecha de nacimiento', 'dirección', 'curriculum vitae (CV)'],
                'completo'      => false,
            ];
        }

        $faltantesBasicos = [];
        if (empty($perfil['email'])) {
            $faltantesBasicos[] = 'correo';
        }
        $telefono = $perfil['telefono'] ?? $perfil['user_telefono'];
        if (empty($telefono)) {
            $faltantesBasicos[] = 'teléfono';
        }
        if (empty($perfil['fecha_nacimiento'])) {
            $faltantesBasicos[] = 'fecha de nacimiento';
        }
        if (empty($perfil['direccion'])) {
            $faltantesBasicos[] = 'dirección';
        }

        $tieneCv = $this->db->table('cvs')
            ->where('postulante_id', $postulanteId)
            ->where('activo', 1)
            ->countAllResults() > 0;

        $faltantes = $faltantesBasicos;
        if (! $tieneCv) {
            $faltantes[] = 'curriculum vitae (CV)';
        }

        return [
            'datos_basicos' => $faltantesBasicos === [],
            'tiene_cv'      => $tieneCv,
            'faltantes'     => $faltantes,
            'completo'      => $faltantesBasicos === [] && $tieneCv,
        ];
    }

    /**
     * Id de usuario (`users.id`) del postulante. El historial de postulación y la
     * auditoría referencian `users`, no `postulantes` (son secuencias distintas).
     */
    public function usuarioIdDe(int $postulanteId): ?int
    {
        $fila = $this->db->table('postulantes')->select('user_id')->where('id', $postulanteId)->get()->getRowArray();

        return $fila === null ? null : (int) $fila['user_id'];
    }
}
