<?php

// SPDX-License-Identifier: MIT

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\OportunidadModel;
use App\Validation\Validador;

/**
 * Difusión de oportunidades externas (RF-48..RF-51): Empleos Perú, MYPE locales
 * y otras fuentes. Cada oportunidad identifica su fuente.
 *
 * Tres conceptos independientes:
 * - `activo`: ocultación administrativa.
 * - `fecha_publicacion`: fecha editorial desde la que puede mostrarse.
 * - `estado` / `estado_efectivo`: ciclo de vida (programado, en_curso,
 *   finalizado, cancelado). El estado efectivo se deriva por fecha en
 *   America/Lima y nunca se persiste.
 */
class OportunidadService
{
    public const FUENTES = ['empleos_peru', 'mype_local', 'otro'];

    public const MODALIDADES = ['presencial', 'virtual', 'mixta'];

    public const ESTADOS = ['programado', 'en_curso', 'finalizado', 'cancelado'];

    public const CODIGO_FINALIZADA = 'OPPORTUNITY_ALREADY_FINALIZED';

    private const TRANSICIONES = [
        'programado' => ['en_curso', 'finalizado', 'cancelado'],
        'en_curso'   => ['finalizado', 'cancelado'],
        'cancelado'  => ['programado'],
        'finalizado' => [],
    ];

    private const CAMPOS_EDITABLES = [
        'fuente', 'empresa_id', 'titulo', 'descripcion', 'enlace', 'fecha_publicacion',
        'fecha_inicio', 'fecha_fin', 'modalidad',
    ];

    private OportunidadModel $oportunidades;

    private HtmlSanitizer $html;

    public function __construct(?OportunidadModel $oportunidades = null, ?HtmlSanitizer $html = null)
    {
        $this->oportunidades = $oportunidades ?? model(OportunidadModel::class);
        $this->html          = $html ?? new HtmlSanitizer();
    }

    /**
     * @param array<string, mixed> $filtros
     *
     * @return list<array<string, mixed>>
     */
    public function listar(array $filtros): array
    {
        $builder = $this->oportunidades->db->table('oportunidades o')
            ->select('o.*, e.razon_social, e.ruc')
            ->join('empresas e', 'e.id = o.empresa_id', 'LEFT');

        if (! empty($filtros['fuente'])) {
            $builder->where('o.fuente', $filtros['fuente']);
        }
        if (isset($filtros['activo']) && $filtros['activo'] !== '') {
            $builder->where('o.activo', (int) $filtros['activo']);
        }

        $filas = $builder->orderBy('o.created_at', 'DESC')->limit(300)->get()->getResultArray();
        $filas = array_map([$this, 'presentar'], $filas);

        if (! empty($filtros['estado'])) {
            // El filtro administrativo usa el estado efectivo: una oportunidad
            // programada con fecha de fin alcanzada aparece en Finalizadas.
            $filas = array_values(array_filter(
                $filas,
                static fn (array $fila): bool => $fila['estado_efectivo'] === $filtros['estado'],
            ));
        }

        return $filas;
    }

    /**
     * Oportunidades activas, ya liberadas editorialmente y no finalizadas ni
     * canceladas. No hay cron: la visibilidad se calcula al leer.
     *
     * @return list<array<string, mixed>>
     */
    public function publicas(): array
    {
        $filas = $this->oportunidades->db->table('oportunidades o')
            ->select('o.*, e.razon_social')
            ->join('empresas e', 'e.id = o.empresa_id', 'LEFT')
            ->where('o.activo', 1)
            ->where('o.fecha_publicacion <=', self::hoy())
            ->whereNotIn('o.estado', ['finalizado', 'cancelado'])
            // El límite es inclusivo: al alcanzar exactamente fecha_fin ya no
            // se publica. Sin fecha de fin no se inventa un vencimiento.
            ->groupStart()
                ->where('o.fecha_fin IS NULL')
                ->orWhere('o.fecha_fin >', self::ahora())
            ->groupEnd()
            ->orderBy('o.created_at', 'DESC')
            ->limit(200)
            ->get()
            ->getResultArray();

        return array_map([$this, 'presentar'], $filas);
    }

    /**
     * Añade los campos derivados que consume el frontend. No altera el estado
     * persistido ni mezcla publicación con ciclo de vida.
     *
     * @param array<string, mixed> $fila
     *
     * @return array<string, mixed>
     */
    private function presentar(array $fila): array
    {
        $fila['estado_efectivo']  = self::estadoEfectivo($fila);
        $fila['puede_modificarse'] = self::puedeModificarse($fila);
        $fila['estado_publicacion'] = $this->estadoPublicacion($fila);

        return $fila;
    }

    /**
     * Estado editorial derivado (no se persiste): oculta si está desactivada;
     * programada si su fecha aún no llega o si un registro heredado no tiene
     * fecha editorial (la lectura pública también lo excluye); visible si ya
     * puede mostrarse.
     *
     * @param array<string, mixed> $fila
     */
    private function estadoPublicacion(array $fila): string
    {
        $fecha = $fila['fecha_publicacion'] ?? null;
        $texto = $fecha !== null ? substr((string) $fecha, 0, 10) : '';

        if (((int) ($fila['activo'] ?? 0)) === 0) {
            return 'oculta';
        }

        return $texto === '' || $texto > self::hoy() ? 'programada' : 'visible';
    }

    /**
     * @param array<string, mixed> $datos
     */
    public function crear(array $datos): int
    {
        $datos = $this->validar($datos, true);
        // Una oportunidad nueva nace activa y programada; la activación y las
        // transiciones se gestionan por sus endpoints dedicados.
        $datos['activo'] = 1;
        $datos['estado'] = 'programado';

        if (! $this->oportunidades->insert($datos)) {
            throw ApiException::conflicto('No se pudo registrar la oportunidad.');
        }

        return (int) $this->oportunidades->getInsertID();
    }

    /**
     * Actualiza solo los campos enviados. Así una petición parcial (contrato
     * histórico) conserva lo que no envía y un registro heredado sin
     * programación no recibe fechas inventadas.
     *
     * @param array<string, mixed> $datos
     */
    public function actualizar(int $id, array $datos): void
    {
        $db = $this->oportunidades->db;
        $db->transBegin();

        try {
            $oportunidad = $this->exigirBloqueada($id);
            $this->exigirModificable($oportunidad);

            $entrada   = array_intersect_key($datos, array_flip(self::CAMPOS_EDITABLES));
            $combinado = array_merge($oportunidad, $entrada);
            $limpio    = $this->validar($combinado, false, $oportunidad, $entrada);

            // Reevalúa el vencimiento dentro de la transacción: la fecha de fin
            // pudo alcanzarse mientras se validaban los datos.
            $this->exigirModificable($oportunidad);

            if ($limpio !== [] && ! $this->oportunidades->update($id, $limpio)) {
                throw ApiException::conflicto('No se pudo actualizar la oportunidad.');
            }

            if (! $db->transStatus()) {
                throw ApiException::conflicto('No se pudo actualizar la oportunidad.');
            }

            $db->transCommit();
        } catch (\Throwable $e) {
            $db->transRollback();

            throw $e;
        }
    }

    public function cambiarActivacion(int $id, bool $activo): void
    {
        $db = $this->oportunidades->db;
        $db->transBegin();

        try {
            $oportunidad = $this->exigirBloqueada($id);
            $this->exigirModificable($oportunidad);
            // Reevalúa justo antes de persistir por si el fin se alcanzó
            // durante la transacción.
            $this->exigirModificable($oportunidad);

            if (! $this->oportunidades->update($id, ['activo' => (int) $activo])) {
                throw ApiException::conflicto('No se pudo actualizar la oportunidad.');
            }

            if (! $db->transStatus()) {
                throw ApiException::conflicto('No se pudo actualizar la oportunidad.');
            }

            $db->transCommit();
        } catch (\Throwable $e) {
            $db->transRollback();

            throw $e;
        }
    }

    public function cambiarEstado(int $id, string $estado): void
    {
        $db = $this->oportunidades->db;
        $db->transBegin();

        try {
            $oportunidad = $this->exigirBloqueada($id);
            $this->exigirModificable($oportunidad);

            $actual    = (string) ($oportunidad['estado'] ?? 'programado');
            $permitidos = self::TRANSICIONES[$actual] ?? [];

            if (! in_array($estado, $permitidos, true)) {
                throw ApiException::conflicto("No puede pasar de \"{$actual}\" a \"{$estado}\".");
            }

            // Reevalúa justo antes de persistir para no finalizar/cancelar una
            // oportunidad cuyo fin se alcanzó durante la petición.
            $this->exigirModificable($oportunidad);

            if (! $this->oportunidades->update($id, ['estado' => $estado])) {
                throw ApiException::conflicto('No se pudo actualizar el estado de la oportunidad.');
            }

            if (! $db->transStatus()) {
                throw ApiException::conflicto('No se pudo actualizar el estado de la oportunidad.');
            }

            $db->transCommit();
        } catch (\Throwable $e) {
            $db->transRollback();

            throw $e;
        }
    }

    /**
     * `estado_efectivo` deriva el estado sin reescribir el ENUM. Los estados
     * manuales terminales o cancelados no se alteran.
     *
     * @param array<string, mixed> $fila
     */
    public static function estadoEfectivo(array $fila, ?string $ahora = null): string
    {
        $estado = (string) ($fila['estado'] ?? 'programado');
        if ($estado === '') {
            $estado = 'programado';
        }

        if (! in_array($estado, ['programado', 'en_curso'], true)) {
            return $estado;
        }

        if (self::fechaAlcanzada($fila['fecha_fin'] ?? null, $ahora)) {
            return 'finalizado';
        }

        if (self::fechaAlcanzada($fila['fecha_inicio'] ?? null, $ahora)) {
            return 'en_curso';
        }

        return 'programado';
    }

    /**
     * Una oportunidad finalizada —por acción administrativa o por fecha de fin
     * alcanzada— es inmutable. La cancelación conserva su reapertura mientras
     * no haya llegado la fecha de fin.
     *
     * @param array<string, mixed> $oportunidad
     */
    public static function puedeModificarse(array $oportunidad, ?string $ahora = null): bool
    {
        if ((string) ($oportunidad['estado'] ?? '') === 'finalizado') {
            return false;
        }

        return ! self::fechaAlcanzada($oportunidad['fecha_fin'] ?? null, $ahora);
    }

    /**
     * @param array<string, mixed> $oportunidad
     */
    public function exigirModificable(array $oportunidad): void
    {
        if (! self::puedeModificarse($oportunidad)) {
            throw new ApiException(
                'La oportunidad ya ha finalizado y no puede modificarse.',
                409,
                [],
                0,
                [],
                self::CODIGO_FINALIZADA,
            );
        }
    }

    private static function fechaAlcanzada(?string $fecha, ?string $ahora = null): bool
    {
        $fecha = $fecha !== null ? trim($fecha) : '';
        if ($fecha === '') {
            return false;
        }

        $zona = self::zonaHoraria();
        try {
            $objetivo   = new \DateTimeImmutable($fecha, $zona);
            $referencia = $ahora !== null
                ? new \DateTimeImmutable($ahora, $zona)
                : new \DateTimeImmutable('now', $zona);
        } catch (\Throwable) {
            // Una fecha corrupta no debe seguir publicando la oportunidad.
            return true;
        }

        return $referencia >= $objetivo;
    }

    private static function ahora(): string
    {
        return (new \DateTimeImmutable('now', self::zonaHoraria()))->format('Y-m-d H:i:s');
    }

    private static function hoy(): string
    {
        return (new \DateTimeImmutable('now', self::zonaHoraria()))->format('Y-m-d');
    }

    private static function zonaHoraria(): \DateTimeZone
    {
        $configurada = config('App')->appTimezone ?? date_default_timezone_get();

        try {
            return new \DateTimeZone($configurada);
        } catch (\Throwable) {
            return new \DateTimeZone(date_default_timezone_get());
        }
    }

    /**
     * Valida y normaliza los campos. Devuelve solo los campos que deben
     * persistirse. En edición, `$entrada` contiene las claves enviadas: los
     * campos ausentes se conservan y no se inventan valores.
     *
     * @param array<string, mixed>      $datos
     * @param array<string, mixed>|null $existente
     * @param array<string, mixed>|null $entrada
     *
     * @return array<string, mixed>
     */
    protected function validar(array $datos, bool $esCreacion = false, ?array $existente = null, ?array $entrada = null): array
    {
        $errores = [];
        $limpio  = [];

        $proporcionado = static function (string $campo) use ($esCreacion, $entrada): bool {
            return $esCreacion || ($entrada !== null && array_key_exists($campo, $entrada));
        };

        if ($proporcionado('fuente')) {
            $fuente = is_scalar($datos['fuente'] ?? null) ? trim((string) $datos['fuente']) : '';
            if (! in_array($fuente, self::FUENTES, true)) {
                $errores['fuente'] = 'Selecciona una fuente válida.';
            } else {
                $limpio['fuente'] = $fuente;
            }
        }

        if ($proporcionado('titulo')) {
            $titulo = is_scalar($datos['titulo'] ?? null) ? trim((string) $datos['titulo']) : '';
            if ($titulo === '') {
                $errores['titulo'] = 'El título de la oportunidad es obligatorio.';
            } elseif (mb_strlen($titulo) > 200) {
                $errores['titulo'] = 'El título no debe superar 200 caracteres.';
            } else {
                $limpio['titulo'] = $titulo;
            }
        }

        if ($proporcionado('enlace')) {
            $enlace = is_scalar($datos['enlace'] ?? null) ? trim((string) $datos['enlace']) : '';
            if ($enlace === '') {
                if ($esCreacion) {
                    $errores['enlace'] = 'Introduce una URL válida.';
                } else {
                    // En edición una cadena vacía limpia el enlace; el contrato
                    // histórico permitía no enviarlo.
                    $limpio['enlace'] = null;
                }
            } elseif (mb_strlen($enlace) > 300 || ! $this->esUrlSegura($enlace)) {
                $errores['enlace'] = 'Introduce una URL válida.';
            } else {
                $limpio['enlace'] = $enlace;
            }
        }

        if ($proporcionado('fecha_publicacion')) {
            $fecha = is_scalar($datos['fecha_publicacion'] ?? null) ? trim((string) $datos['fecha_publicacion']) : '';
            if ($fecha === '') {
                if ($esCreacion) {
                    $errores['fecha_publicacion'] = 'La fecha de publicación es obligatoria.';
                }
                // En edición, vacío significa "conservar la existente".
            } elseif (! Validador::esFecha($fecha)) {
                $errores['fecha_publicacion'] = 'La fecha de publicación no es válida.';
            } else {
                $limpio['fecha_publicacion'] = $fecha;
            }
        }

        if ($proporcionado('descripcion')) {
            $entradaDescripcion = $datos['descripcion'] ?? null;
            if (! is_string($entradaDescripcion)) {
                $entradaDescripcion = null;
            }

            $descripcion = null;
            $errorDesc   = null;
            try {
                $descripcion = $this->html->limpiar($entradaDescripcion);
            } catch (\Throwable) {
                // Entrada desproporcionada: validación, no error 500.
                $errorDesc = 'La descripción de la oportunidad es demasiado larga.';
            }

            if ($errorDesc !== null) {
                $errores['descripcion'] = $errorDesc;
            } elseif ($descripcion === null) {
                $errores['descripcion'] = 'La descripción de la oportunidad es obligatoria.';
            } elseif (Validador::longitudTexto($descripcion) > 10000) {
                $errores['descripcion'] = 'La descripción de la oportunidad no debe superar 10.000 caracteres de texto.';
            } else {
                $limpio['descripcion'] = $descripcion;
            }
        }

        // La programación se exige al crear, cuando el registro ya la tenía o
        // cuando el cliente envía al menos un valor de programación. Así un
        // registro histórico incompleto puede editarse sin inventar fechas.
        $programacionExistente = $existente !== null
            && trim((string) ($existente['fecha_inicio'] ?? '')) !== ''
            && trim((string) ($existente['fecha_fin'] ?? '')) !== ''
            && trim((string) ($existente['modalidad'] ?? '')) !== '';

        $programacionEnviada = false;
        if ($entrada !== null) {
            foreach (['fecha_inicio', 'fecha_fin', 'modalidad'] as $campo) {
                $valor = $entrada[$campo] ?? null;
                if (array_key_exists($campo, $entrada) && is_scalar($valor) && trim((string) $valor) !== '') {
                    $programacionEnviada = true;
                    break;
                }
            }
        }

        $exigeProgramacion = $esCreacion || $programacionExistente || $programacionEnviada;

        if ($exigeProgramacion) {
            $inicio       = is_scalar($datos['fecha_inicio'] ?? null) ? trim((string) $datos['fecha_inicio']) : '';
            $inicioValido = $inicio !== '' && $this->esFechaHoraCompleta($inicio);

            if ($inicio === '') {
                $errores['fecha_inicio'] = 'Indica la fecha y hora de inicio.';
            } elseif (! $inicioValido) {
                $errores['fecha_inicio'] = 'Indica una fecha y hora de inicio válidas.';
            }

            $fin       = is_scalar($datos['fecha_fin'] ?? null) ? trim((string) $datos['fecha_fin']) : '';
            $finValido = $fin !== '' && $this->esFechaHoraCompleta($fin);

            if ($fin === '') {
                $errores['fecha_fin'] = 'Indica la fecha y hora de finalización.';
            } elseif (! $finValido) {
                $errores['fecha_fin'] = 'Indica una fecha y hora de finalización válidas.';
            } elseif ($inicioValido && strtotime($this->normalizarFechaHora($fin)) < strtotime($this->normalizarFechaHora($inicio))) {
                // Igualdad permitida: una oportunidad puede iniciar y terminar
                // en el mismo instante.
                $errores['fecha_fin'] = 'La fecha de finalización no puede ser anterior a la fecha de inicio.';
            }

            $modalidad = is_scalar($datos['modalidad'] ?? null) ? trim((string) $datos['modalidad']) : '';
            if ($modalidad === '') {
                $errores['modalidad'] = 'Selecciona una modalidad.';
            } elseif (! in_array($modalidad, self::MODALIDADES, true)) {
                $errores['modalidad'] = 'Selecciona una modalidad válida.';
            }

            if (! isset($errores['fecha_inicio'])) {
                $limpio['fecha_inicio'] = $this->normalizarFechaHora($inicio);
            }
            if (! isset($errores['fecha_fin'])) {
                $limpio['fecha_fin'] = $this->normalizarFechaHora($fin);
            }
            if (! isset($errores['modalidad'])) {
                $limpio['modalidad'] = $modalidad;
            }
        }

        if ($esCreacion || ($entrada !== null && array_key_exists('empresa_id', $entrada))) {
            $empresaId = $datos['empresa_id'] ?? null;
            if ($empresaId !== null && $empresaId !== '') {
                $empresaTexto = is_scalar($empresaId) ? trim((string) $empresaId) : '';
                if ($empresaTexto === '' || preg_match('/^\d+$/', $empresaTexto) !== 1) {
                    $errores['empresa_id'] = 'La empresa indicada no existe.';
                } else {
                    $existe = $this->oportunidades->db->table('empresas')
                        ->where('id', (int) $empresaTexto)
                        ->countAllResults();
                    if (! $existe) {
                        $errores['empresa_id'] = 'La empresa indicada no existe.';
                    } else {
                        $limpio['empresa_id'] = (int) $empresaTexto;
                    }
                }
            } else {
                $limpio['empresa_id'] = null;
            }
        }

        if ($errores !== []) {
            throw ApiException::validacion('Existen campos que requieren atención.', array_values($errores), $errores);
        }

        return $limpio;
    }

    private function esFechaHoraCompleta(string $valor): bool
    {
        $normalizada = str_replace('T', ' ', trim($valor));

        return preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/', $normalizada) === 1
            && Validador::esFechaHora($normalizada);
    }

    private function normalizarFechaHora(string $valor): string
    {
        $normalizada = str_replace('T', ' ', trim($valor));

        return (new \DateTimeImmutable($normalizada, self::zonaHoraria()))->format('Y-m-d H:i:s');
    }

    private function esUrlSegura(string $url): bool
    {
        $esquema = strtolower((string) parse_url($url, PHP_URL_SCHEME));

        return in_array($esquema, ['http', 'https'], true)
            && filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    /**
     * @return array<string, mixed>
     */
    private function exigirBloqueada(int $id): array
    {
        $fila = $this->oportunidades->db
            ->query('SELECT * FROM oportunidades WHERE id = ? FOR UPDATE', [$id])
            ->getRowArray();

        if ($fila === null) {
            throw ApiException::noEncontrado('La oportunidad no existe.');
        }

        return $fila;
    }
}
