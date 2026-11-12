#!/usr/bin/env php
<?php

// SPDX-License-Identifier: MIT

/**
 * Benchmark reproducible de endpoints de SOL.
 *
 * - Crea ofertas sintéticas en la base indicada por DB_* (nunca en producción).
 * - Mide latencia y número de consultas por solicitud usando `Server-Timing`
 *   (requiere PERF_DIAGNOSTICS=1 o la cabecera X-Perf-Diagnostics: 1).
 * - Compara escalas (10 y 100 ofertas) y falla con --assert si el listado de la
 *   empresa vuelve a crecer con el número de ofertas (N+1).
 * - Elimina todos los datos sintéticos al terminar.
 *
 * Uso:
 *   php tests/tools/perf_benchmark.php [--assert] [--json=ruta] [--muestras=30] [--max-consultas=6]
 *
 * Variables: DB_*, PERF_BASE_URL, PERF_EMPRESA_USER, PERF_EMPRESA_PASS,
 *            PERF_ADMIN_USER, PERF_ADMIN_PASS.
 */

$opciones = getopt('', ['assert', 'json:', 'muestras:', 'max-consultas:', 'help']);
if (isset($opciones['help'])) {
    fwrite(STDOUT, "Uso: php perf_benchmark.php [--assert] [--json=ruta] [--muestras=30]\n");
    exit(0);
}

$assert   = isset($opciones['assert']);
$jsonRuta = $opciones['json'] ?? null;
$muestras = max(3, (int) ($opciones['muestras'] ?? 30));
$maxConsultas = max(1, (int) ($opciones['max-consultas'] ?? (getenv('PERF_MAX_CONSULTAS') ?: 6)));
$base     = rtrim(getenv('PERF_BASE_URL') ?: 'http://127.0.0.1:8080', '/');
$escala   = ((int) (getenv('PERF_SCALE') ?: 100)) >= 100 ? [10, 100] : [1, 10];

$empresaUser = getenv('PERF_EMPRESA_USER') ?: '20601234567';
$empresaPass = getenv('PERF_EMPRESA_PASS') ?: 'Empresa123!';
$adminUser   = getenv('PERF_ADMIN_USER') ?: 'admin';
$adminPass   = getenv('PERF_ADMIN_PASS') ?: 'Admin123!';

$db = conectar();
$empresaId = valor($db, 'SELECT id FROM empresas WHERE ruc = ?', [$empresaUser]);
if ($empresaId === null) {
    fwrite(STDERR, "ERROR: no existe la empresa de prueba {$empresaUser}.\n");
    exit(2);
}
$categoriaId = valor($db, 'SELECT id FROM categorias ORDER BY id LIMIT 1', []);

$tokenEmpresa   = login($base, $empresaUser, $empresaPass);
$tokenAdmin     = login($base, $adminUser, $adminPass);
$tokenPostulante = login($base, getenv('PERF_POSTULANTE_USER') ?: '12345678', getenv('PERF_POSTULANTE_PASS') ?: 'Postu123!');
$ofertaPublica  = (int) (valor($db, "SELECT id FROM ofertas WHERE estado = 'publicada' ORDER BY id LIMIT 1", []) ?? 0);

$endpoints = [
    'GET /api/empresa/ofertas'      => ['/api/empresa/ofertas', $tokenEmpresa, $muestras],
    'GET /api/empresa/postulaciones' => ['/api/empresa/postulaciones', $tokenEmpresa, 5],
    'GET /api/empresa/contrataciones' => ['/api/empresa/contrataciones', $tokenEmpresa, 5],
    'GET /api/admin/ofertas'        => ['/api/admin/ofertas', $tokenAdmin, 5],
    'GET /api/admin/empresas'       => ['/api/admin/empresas', $tokenAdmin, 5],
    'GET /api/admin/dashboard'      => ['/api/admin/dashboard', $tokenAdmin, 5],
    'GET /api/admin/empleabilidad'  => ['/api/admin/empleabilidad', $tokenAdmin, 5],
    'GET /api/postulante/postulaciones' => ['/api/postulante/postulaciones', $tokenPostulante, 5],
    'GET /api/postulante/perfil'    => ['/api/postulante/perfil', $tokenPostulante, 5],
    'GET /api/ofertas'              => ['/api/ofertas', null, 5],
    'GET /api/actividades'          => ['/api/actividades', null, 5],
    'GET /api/oportunidades'        => ['/api/oportunidades', null, 5],
    'GET /api/categorias'           => ['/api/categorias', null, 5],
];

if ($ofertaPublica > 0) {
    $endpoints['GET /api/ofertas/{id}'] = ['/api/ofertas/' . $ofertaPublica, null, 5];
}

$resultado = [
    'generado_en' => gmdate('c'),
    'base_url'    => $base,
    'escalas'     => $escala,
    'endpoints'   => [],
];

try {
    foreach ($escala as $n) {
        $ids = sembrar($db, (int) $empresaId, (int) $categoriaId, $n);
        fwrite(STDERR, "Escala {$n}: {$n} ofertas sintéticas.\n");

        foreach ($endpoints as $nombre => [$ruta, $token, $repeticiones]) {
            $resultado['endpoints'][$nombre][(string) $n] = medir($base . $ruta, $token, $repeticiones);
        }

        limpiar($db, $ids);
    }
} finally {
    // Best effort: no dejar sintéticos si una medición falla.
    limpiar($db, pendientes($db, (int) $empresaId));
}

$listado = $resultado['endpoints']['GET /api/empresa/ofertas'];
$sql10   = $listado[(string) $escala[0]]['sql_consultas']['mediana'];
$sql100  = $listado[(string) $escala[1]]['sql_consultas']['mediana'];
$resultado['resumen'] = [
    'ofertas_escala_baja'            => $escala[0],
    'ofertas_escala_alta'            => $escala[1],
    'sql_consultas_escala_baja'      => $sql10,
    'sql_consultas_escala_alta'      => $sql100,
    'crecimiento_consultas'          => $sql100 - $sql10,
    'presupuesto_consultas'          => $maxConsultas,
    'n_plus_uno_detectado'           => $sql100 > $sql10,
    'excede_presupuesto'             => $sql100 > $maxConsultas,
];

$json = json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($jsonRuta !== null) {
    @mkdir(dirname($jsonRuta), 0775, true);
    file_put_contents($jsonRuta, $json . "\n");
}
fwrite(STDOUT, $json . "\n");

if ($assert && $sql100 > $sql10) {
    fwrite(STDERR, "FAIL: las consultas crecen con el número de ofertas ({$sql10} → {$sql100}).\n");
    exit(1);
}
if ($assert && $sql100 > $maxConsultas) {
    fwrite(STDERR, "FAIL: el listado usa {$sql100} consultas y excede el presupuesto de {$maxConsultas}.\n");
    exit(1);
}

exit(0);

function conectar(): PDO
{
    $host = getenv('DB_HOST') ?: '127.0.0.1';
    $port = getenv('DB_PORT') ?: '3306';
    $name = getenv('DB_DATABASE') ?: '';
    $user = getenv('DB_USER') ?: '';
    $pass = getenv('DB_PASSWORD') ?: '';
    if ($name === '' || $user === '') {
        fwrite(STDERR, "ERROR: faltan DB_DATABASE o DB_USER.\n");
        exit(2);
    }

    try {
        return new PDO(
            "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
            $user,
            $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
        );
    } catch (Throwable $e) {
        fwrite(STDERR, 'ERROR de conexión: ' . $e->getMessage() . "\n");
        exit(2);
    }
}

/** @param list<mixed> $parametros */
function valor(PDO $db, string $sql, array $parametros): mixed
{
    $stmt = $db->prepare($sql);
    $stmt->execute($parametros);
    $fila = $stmt->fetch();

    return $fila === false ? null : reset($fila);
}

/**
 * @return list<int>
 */
function sembrar(PDO $db, int $empresaId, int $categoriaId, int $n): array
{
    $ahora = date('Y-m-d H:i:s');
    $hoy   = date('Y-m-d');
    $ids   = [];

    $db->beginTransaction();
    try {
        $oferta = $db->prepare(
            'INSERT INTO ofertas (empresa_id, categoria_id, puesto, descripcion, estado, fecha_publicacion, fecha_cierre, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $habilidad = $db->prepare('INSERT INTO ofertas_habilidades (oferta_id, habilidad) VALUES (?, ?)');

        for ($i = 1; $i <= $n; $i++) {
            $oferta->execute([
                $empresaId,
                $categoriaId ?: null,
                'Perf probe ' . $i,
                'Oferta sintética de benchmark.',
                'publicada',
                $hoy,
                '2099-12-31',
                $ahora,
                $ahora,
            ]);
            $id = (int) $db->lastInsertId();
            $ids[] = $id;
            foreach (['Excel', 'SQL', 'Atención al cliente'] as $texto) {
                $habilidad->execute([$id, $texto]);
            }
        }

        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }

    return $ids;
}

/**
 * @param list<int> $ids
 */
function limpiar(PDO $db, array $ids): void
{
    if ($ids === []) {
        return;
    }
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $db->prepare("DELETE FROM ofertas_habilidades WHERE oferta_id IN ({$marcas})")->execute($ids);
    $db->prepare("DELETE FROM ofertas WHERE id IN ({$marcas})")->execute($ids);
}

/**
 * @return list<int>
 */
function pendientes(PDO $db, int $empresaId): array
{
    $stmt = $db->prepare("SELECT id FROM ofertas WHERE empresa_id = ? AND puesto LIKE 'Perf probe %'");
    $stmt->execute([$empresaId]);

    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function login(string $base, string $usuario, string $password): string
{
    $respuesta = solicitar($base . '/api/auth/login', null, 'POST', json_encode([
        'username' => $usuario,
        'password' => $password,
    ]));
    $datos = json_decode($respuesta['cuerpo'], true);
    $token = $datos['data']['access_token'] ?? null;
    if (! is_string($token) || $token === '') {
        fwrite(STDERR, "ERROR: login falló para {$usuario}.\n");
        exit(2);
    }

    return $token;
}

/**
 * @return array{latencia_ms: array<string, float>, sql_consultas: array<string, int>, muestras: int, server_timing: list<string>}
 */
function medir(string $url, ?string $token, int $repeticiones): array
{
    $latencias = [];
    $consultas = [];
    $timings   = [];

    // Calentamiento: no se registra.
    for ($i = 0; $i < 2; $i++) {
        solicitar($url, $token);
    }

    for ($i = 0; $i < $repeticiones; $i++) {
        $inicio = microtime(true);
        $r = solicitar($url, $token);
        $latencias[] = (microtime(true) - $inicio) * 1000;

        $timing = $r['headers']['server-timing'] ?? '';
        if ($timing !== '') {
            $timings[] = $timing;
        }
        if (preg_match('/sql-count;desc="(\d+)"/', $timing, $m) === 1) {
            $consultas[] = (int) $m[1];
        }
    }

    return [
        'latencia_ms'   => resumen($latencias),
        'sql_consultas' => resumenEnteros($consultas ?: [0]),
        'muestras'      => $repeticiones,
        'server_timing' => array_values(array_unique($timings)),
    ];
}

/**
 * @return array{mediana: float, p95: float, minimo: float, maximo: float}
 */
function resumen(array $valores): array
{
    sort($valores);
    $n = count($valores);

    return [
        'mediana' => round(percentil($valores, 50), 2),
        'p95'     => round(percentil($valores, 95), 2),
        'minimo'  => round($valores[0], 2),
        'maximo'  => round($valores[$n - 1], 2),
    ];
}

/**
 * @return array{mediana: int, p95: int, minimo: int, maximo: int}
 */
function resumenEnteros(array $valores): array
{
    sort($valores);
    $n = count($valores);

    return [
        'mediana' => (int) round(percentil($valores, 50)),
        'p95'     => (int) round(percentil($valores, 95)),
        'minimo'  => (int) $valores[0],
        'maximo'  => (int) $valores[$n - 1],
    ];
}

function percentil(array $ordenados, float $p): float
{
    $indice = (int) ceil(($p / 100) * count($ordenados)) - 1;

    return (float) $ordenados[max(0, min($indice, count($ordenados) - 1))];
}

/**
 * @return array{cuerpo: string, headers: array<string, string>}
 */
function solicitar(string $url, ?string $token, string $metodo = 'GET', ?string $cuerpo = null): array
{
    $ch = curl_init($url);
    $headers = ['Accept: application/json', 'X-Perf-Diagnostics: 1'];
    if ($token !== null) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    if ($cuerpo !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $metodo,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 30,
    ]);
    if ($cuerpo !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $cuerpo);
    }

    $cabeceras = [];
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, static function ($recurso, string $linea) use (&$cabeceras): int {
        $partes = explode(':', $linea, 2);
        if (count($partes) === 2) {
            $cabeceras[strtolower(trim($partes[0]))] = trim($partes[1]);
        }

        return strlen($linea);
    });

    $respuesta = curl_exec($ch);
    $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error  = curl_error($ch);
    $crudo  = (string) $respuesta;
    curl_close($ch);

    if ($respuesta === false || $error !== '') {
        fwrite(STDERR, "ERROR HTTP {$url}: {$error}\n");
        exit(2);
    }
    if ($codigo >= 400) {
        fwrite(STDERR, "ERROR HTTP {$url}: estado {$codigo}\n");
        exit(2);
    }

    return ['cuerpo' => $crudo, 'headers' => $cabeceras];
}
