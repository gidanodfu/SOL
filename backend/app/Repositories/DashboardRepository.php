<?php

// SPDX-License-Identifier: MIT

namespace App\Repositories;

use CodeIgniter\Database\BaseConnection;

/**
 * Indicadores para dashboards (RF-52..RF-60). Métricas de gestión de empleo, no
 * solo conteo de registros; los rangos de fecha son opcionales (RF-60).
 */
class DashboardRepository
{
    private BaseConnection $db;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db = $db ?? db_connect();
    }

    /**
     * @return array<string, mixed>
     */
    public function administrador(?string $desde = null, ?string $hasta = null): array
    {
        $empresas    = $this->db->table('empresas')->select("COUNT(*) total, SUM(estado = 'activo') activas")->get()->getRowArray();
        $postulantes = $this->db->table('users')->where('rol', 'postulante')->where('estado', 'activo')->countAllResults();

        $ofertas = array_fill_keys(['borrador', 'publicada', 'cerrada'], 0);
        foreach ($this->db->table('ofertas')->select('estado, COUNT(*) n')->groupBy('estado')->get()->getResultArray() as $fila) {
            $ofertas[$fila['estado']] = (int) $fila['n'];
        }

        $postulaciones = array_fill_keys(['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'], 0);
        $builder = $this->db->table('postulaciones')->select('estado, COUNT(*) n')->where('activo', 1);
        if ($desde) {
            $builder->where('fecha_postulacion >=', $desde . ' 00:00:00');
        }
        if ($hasta) {
            $builder->where('fecha_postulacion <=', $hasta . ' 23:59:59');
        }
        foreach ($builder->groupBy('estado')->get()->getResultArray() as $fila) {
            $postulaciones[$fila['estado']] = (int) $fila['n'];
        }

        $contrataciones = $this->db->table('contrataciones')->select('COUNT(*) total');
        if ($desde) {
            $contrataciones->where('fecha_contratacion >=', $desde);
        }
        if ($hasta) {
            $contrataciones->where('fecha_contratacion <=', $hasta);
        }
        $totalContrataciones = (int) $contrataciones->get()->getRowArray()['total'];

        // Empresas con procesos de selección en el rango (RF-57).
        $empresasConProcesos = $this->db->table('postulaciones');
        if ($desde) {
            $empresasConProcesos->where('fecha_postulacion >=', $desde . ' 00:00:00');
        }
        if ($hasta) {
            $empresasConProcesos->where('fecha_postulacion <=', $hasta . ' 23:59:59');
        }
        $empresasConProcesos->whereIn('estado', ['en_revision', 'preseleccionado', 'contactado', 'seleccionado']);

        $seleccionados = $postulaciones['seleccionado'];
        $totalPostulaciones = array_sum($postulaciones);

        return [
            'empresas' => [
                'total'  => (int) $empresas['total'],
                'activas' => (int) $empresas['activas'],
            ],
            'postulantes_activos' => (int) $postulantes,
            'ofertas'       => $ofertas,
            'postulaciones' => $postulaciones,
            'contrataciones' => $totalContrataciones,
            // Indicadores de efectividad (RF-57/58/59/60).
            'empresas_con_procesos' => (int) $empresasConProcesos->select('COUNT(DISTINCT empresa_id) n')->get()->getRowArray()['n'],
            'seleccionados' => $seleccionados,
            'tasa_seleccion'      => $totalPostulaciones > 0 ? round($seleccionados / $totalPostulaciones * 100, 1) : 0,
            'tasa_contratacion'   => $seleccionados > 0 ? round($totalContrataciones / $seleccionados * 100, 1) : 0,
            'tiempo_promedio_contacto_dias'  => $this->tiempoPromedio('contactado', $desde, $hasta),
            'tiempo_promedio_seleccion_dias' => $this->tiempoPromedio('seleccionado', $desde, $hasta),
            // Serie mensual para el gráfico de actividad (últimos 6 meses o el rango).
            'actividad_mensual' => $this->postulacionesPorMes($desde, $hasta),
        ];
    }

    /**
     * Postulaciones activas por mes para el gráfico de actividad (RF-60). Sin
     * rango usa los últimos 6 meses (incluido el actual); con rango, los meses
     * comprendidos entre desde y hasta (se rellenan los meses sin datos con 0).
     *
     * @return list<array{mes: string, etiqueta: string, total: int}>
     */
    private function postulacionesPorMes(?string $desde, ?string $hasta): array
    {
        if ($desde === null || $hasta === null) {
            $hoy   = new \DateTimeImmutable('now');
            $hasta = $hoy->format('Y-m-d');
            $desde = $hoy->modify('-5 months')->format('Y-m-01');
        }

        $inicio = (new \DateTimeImmutable($desde))->modify('first day of this month')->setTime(0, 0);
        $fin    = (new \DateTimeImmutable($hasta))->setTime(0, 0);

        $meses = [];
        $cursor = $inicio;
        while ($cursor <= $fin) {
            $meses[$cursor->format('Y-m')] = 0;
            $cursor = $cursor->modify('+1 month');
        }

        $builder = $this->db->table('postulaciones')
            ->select("DATE_FORMAT(fecha_postulacion, '%Y-%m') AS mes, COUNT(*) AS n")
            ->where('activo', 1);
        if ($desde !== null) {
            $builder->where('fecha_postulacion >=', $desde . ' 00:00:00');
        }
        if ($hasta !== null) {
            $builder->where('fecha_postulacion <=', $hasta . ' 23:59:59');
        }
        foreach ($builder->groupBy('mes')->get()->getResultArray() as $fila) {
            $mes = $fila['mes'];
            if (isset($meses[$mes])) {
                $meses[$mes] = (int) $fila['n'];
            }
        }

        $abreviado = [1 => 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        $resultado = [];
        foreach ($meses as $mes => $total) {
            $resultado[] = [
                'mes'      => $mes,
                'etiqueta' => $abreviado[(int) mb_substr($mes, 5, 2)],
                'total'    => $total,
            ];
        }

        return $resultado;
    }

    /**
     * Días promedio entre la postulación y la primera vez que la postulación
     * alcanzó el estado indicado (RF-59), dentro del rango opcional.
     */
    private function tiempoPromedio(string $estado, ?string $desde, ?string $hasta): ?float
    {
        $builder = $this->db->table('postulaciones p')
            ->select('AVG(TIMESTAMPDIFF(DAY, p.fecha_postulacion, h.primer_evento)) AS dias')
            ->join('(SELECT postulacion_id, MIN(created_at) primer_evento
                     FROM postulacion_historial WHERE estado_nuevo = "' . $estado . '"
                     GROUP BY postulacion_id) h', 'h.postulacion_id = p.id', 'INNER');

        if ($desde) {
            $builder->where('p.fecha_postulacion >=', $desde . ' 00:00:00');
        }
        if ($hasta) {
            $builder->where('p.fecha_postulacion <=', $hasta . ' 23:59:59');
        }

        $fila = $builder->get()->getRowArray();

        return $fila['dias'] !== null ? round((float) $fila['dias'], 1) : null;
    }

    /**
     * @return array<string, mixed>
     */
    public function empresa(int $empresaId): array
    {
        $ofertas = array_fill_keys(['borrador', 'publicada', 'cerrada'], 0);
        foreach ($this->db->table('ofertas')->where('empresa_id', $empresaId)
            ->select('estado, COUNT(*) n')->groupBy('estado')->get()->getResultArray() as $fila) {
            $ofertas[$fila['estado']] = (int) $fila['n'];
        }

        $postulaciones = array_fill_keys(['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'], 0);
        foreach ($this->db->table('postulaciones')->where('empresa_id', $empresaId)->where('activo', 1)
            ->select('estado, COUNT(*) n')->groupBy('estado')->get()->getResultArray() as $fila) {
            $postulaciones[$fila['estado']] = (int) $fila['n'];
        }

        $pendientesRecientes = $this->db->table('postulaciones p')
            ->select('p.id, p.estado, p.fecha_postulacion, of.puesto,
                      po.dni, po.nombres, po.apellidos')
            ->join('ofertas of', 'of.id = p.oferta_id')
            ->join('postulantes po', 'po.id = p.postulante_id')
            ->where('p.empresa_id', $empresaId)
            ->where('p.estado', 'pendiente')
            ->where('p.activo', 1)
            ->orderBy('p.fecha_postulacion', 'DESC')
            ->limit(10)
            ->get()
            ->getResultArray();

        return [
            'ofertas'            => $ofertas,
            'postulaciones'      => $postulaciones,
            'pendientes_recientes' => $pendientesRecientes,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function postulante(int $postulanteId): array
    {
        $postulaciones = array_fill_keys(['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'], 0);
        foreach ($this->db->table('postulaciones')->where('postulante_id', $postulanteId)->where('activo', 1)
            ->select('estado, COUNT(*) n')->groupBy('estado')->get()->getResultArray() as $fila) {
            $postulaciones[$fila['estado']] = (int) $fila['n'];
        }

        $conCv = (bool) $this->db->table('cvs')->where('postulante_id', $postulanteId)->where('activo', 1)->countAllResults();

        return [
            'postulaciones' => $postulaciones,
            'total_postulaciones' => array_sum($postulaciones),
            'con_cv' => $conCv,
        ];
    }
}
