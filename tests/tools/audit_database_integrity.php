#!/usr/bin/env php
<?php

// SPDX-License-Identifier: MIT

/**
 * Auditoría de integridad de la base SOL. No modifica datos.
 *
 * Uso:
 *   php tests/tools/audit_database_integrity.php [--json=ruta]
 *
 * Lee la conexión de DB_HOST, DB_PORT, DB_DATABASE, DB_USER y DB_PASSWORD.
 * Devuelve código 1 si encuentra cualquier error de integridad.
 */

$opciones = getopt('', ['json:', 'help']);
if (isset($opciones['help'])) {
    fwrite(STDOUT, "Uso: php audit_database_integrity.php [--json=ruta]\n");
    exit(0);
}

$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3306';
$name = getenv('DB_DATABASE') ?: '';
$user = getenv('DB_USER') ?: '';
$pass = getenv('DB_PASSWORD') ?: '';

if ($name === '' || $user === '') {
    fwrite(STDERR, "ERROR: faltan DB_DATABASE o DB_USER en el entorno.\n");
    exit(2);
}

try {
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4",
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
    );
} catch (Throwable $e) {
    fwrite(STDERR, 'ERROR de conexión: ' . $e->getMessage() . "\n");
    exit(2);
}

$errores = [];
$avisos = [];
$resultados = [];

/**
 * @param array<int, mixed> $muestra
 */
function registrar(array $resultados, string $nombre, bool $ok, string $detalle, array $muestra = [], bool $aviso = false): array
{
    global $errores, $avisos;

    $estado = $ok ? 'OK' : ($aviso ? 'WARN' : 'FAIL');
    if (! $ok && ! $aviso) {
        $errores[] = $nombre . ': ' . $detalle;
    }
    if (! $ok && $aviso) {
        $avisos[] = $nombre . ': ' . $detalle;
    }

    $resultados[] = [
        'estado'  => $estado,
        'control' => $nombre,
        'detalle' => $detalle,
        'muestra' => $muestra,
    ];

    return $resultados;
}

function q(PDO $pdo, string $sql): array
{
    return $pdo->query($sql)->fetchAll();
}

function escalar(PDO $pdo, string $sql): mixed
{
    return $pdo->query($sql)->fetchColumn();
}

function tabla(?string $tabla): string
{
    return $tabla === null ? '' : '`' . str_replace('`', '``', $tabla) . '`';
}

$version = (string) escalar($pdo, 'SELECT VERSION()');
$esMaria = stripos($version, 'MariaDB') !== false;
$resultados = registrar(
    $resultados,
    'Motor',
    true,
    $version . ($esMaria ? ' (MariaDB)' : ' (MySQL)'),
);

$schema = (string) escalar($pdo, 'SELECT DATABASE()');
$dbInfo = q($pdo, 'SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ' . $pdo->quote($schema))[0] ?? [];
$resultados = registrar(
    $resultados,
    'Charset de la base',
    (($dbInfo['DEFAULT_CHARACTER_SET_NAME'] ?? '') === 'utf8mb4'),
    json_encode($dbInfo, JSON_UNESCAPED_UNICODE),
);

$tablasObligatorias = [
    'users', 'user_refresh_tokens', 'activaciones', 'ui_preferences', 'auditoria',
    'identidades_reservadas', 'empresas', 'postulantes', 'solicitudes_empresa',
    'categorias', 'ofertas', 'ofertas_habilidades', 'postulaciones',
    'postulacion_historial', 'contrataciones', 'cvs', 'cv_activos',
    'formacion_academica', 'experiencia_laboral', 'habilidades',
    'cursos_certificaciones', 'actividades', 'oportunidades', 'atenciones',
    'rate_limit_contadores', 'oportunidades_fecha_publicacion_legado',
    'cv_cuotas_mensuales_legado', 'migrations',
];
$existentes = array_column(q($pdo,
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
), 'TABLE_NAME');
$faltantes = array_values(array_diff($tablasObligatorias, $existentes));
$resultados = registrar(
    $resultados,
    'Tablas obligatorias',
    $faltantes === [],
    $faltantes === [] ? count($tablasObligatorias) . ' tablas presentes' : 'faltan: ' . implode(', ', $faltantes),
    $faltantes,
);

$tablasMalCollation = q($pdo,
    'SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES '
    . 'WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
    . " AND TABLE_TYPE = 'BASE TABLE' AND TABLE_COLLATION IS NOT NULL "
    . " AND TABLE_COLLATION NOT IN ('utf8mb4_general_ci')"
);
$resultados = registrar(
    $resultados,
    'Collation de tablas',
    $tablasMalCollation === [],
    $tablasMalCollation === [] ? 'todas utf8mb4_general_ci' : 'tablas con otra collation',
    $tablasMalCollation,
);

$columnasMalCollation = q($pdo,
    'SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME FROM information_schema.COLUMNS '
    . 'WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
    . " AND COLLATION_NAME IS NOT NULL AND COLLATION_NAME NOT IN ('utf8mb4_general_ci','utf8mb4_bin')"
);
$resultados = registrar(
    $resultados,
    'Collation de columnas',
    $columnasMalCollation === [],
    $columnasMalCollation === [] ? 'solo utf8mb4_general_ci/utf8mb4_bin' : 'columnas con collation inesperada',
    $columnasMalCollation,
);

// Columnas generadas y su tipo.
$generadas = q($pdo,
    'SELECT TABLE_NAME, COLUMN_NAME, EXTRA, GENERATION_EXPRESSION FROM information_schema.COLUMNS '
    . 'WHERE TABLE_SCHEMA = ' . $pdo->quote($schema) . " AND GENERATION_EXPRESSION <> ''"
);
$porColumna = [];
foreach ($generadas as $fila) {
    $porColumna[$fila['TABLE_NAME'] . '.' . $fila['COLUMN_NAME']] = $fila;
}
foreach ([
    'solicitudes_empresa.ruc_reservado' => 'STORED',
    'postulaciones.postulacion_unica' => 'VIRTUAL',
] as $clave => $tipo) {
    $fila = $porColumna[$clave] ?? null;
    $resultados = registrar(
        $resultados,
        'Columna generada ' . $clave,
        $fila !== null && str_contains(strtoupper((string) $fila['EXTRA']), $tipo),
        $fila === null ? 'no existe' : (string) $fila['EXTRA'],
        $fila === null ? [] : [$fila],
    );
}

// Índices únicos críticos.
$indices = q($pdo,
    'SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUMNAS '
    . 'FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
    . ' AND NON_UNIQUE = 0 GROUP BY TABLE_NAME, INDEX_NAME'
);
$mapaIndices = [];
foreach ($indices as $fila) {
    $mapaIndices[$fila['TABLE_NAME'] . '.' . $fila['INDEX_NAME']] = $fila['COLUMNAS'];
}
foreach ([
    'solicitudes_empresa.uq_solicitud_ruc_activa' => 'ruc_reservado',
    'postulaciones.uq_postulacion_activa' => 'postulacion_unica',
    'contrataciones.postulacion_id' => 'postulacion_id',
    'identidades_reservadas.tipo_valor' => 'tipo,valor',
    'cv_activos.PRIMARY' => 'postulante_id',
    'cv_activos.uq_cv_activo_cv' => 'cv_id',
] as $clave => $columnas) {
    $resultados = registrar(
        $resultados,
        'Índice único ' . $clave,
        ($mapaIndices[$clave] ?? '') === $columnas,
        'columnas=' . ($mapaIndices[$clave] ?? 'ausente'),
    );
}

// JSON lógico: tipo físico, restricciones y validez de los datos.
$columnasJson = [
    ['tabla' => 'auditoria', 'columna' => 'detalle'],
    ['tabla' => 'identidades_reservadas', 'columna' => 'referencias'],
];
$checks = q($pdo,
    "SELECT CONSTRAINT_NAME, TABLE_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
    . 'WHERE CONSTRAINT_SCHEMA = ' . $pdo->quote($schema)
);
$checksJson = [];
foreach ($checks as $check) {
    $checksJson[$check['TABLE_NAME'] . '.' . $check['CONSTRAINT_NAME']] = $check['CHECK_CLAUSE'];
}
foreach ($columnasJson as $col) {
    $tipoCol = q($pdo,
        'SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
        . ' AND TABLE_NAME = ' . $pdo->quote($col['tabla'])
        . ' AND COLUMN_NAME = ' . $pdo->quote($col['columna'])
    )[0]['DATA_TYPE'] ?? '';
    $tipoOk = $tipoCol === 'json' || ($esMaria && $tipoCol === 'longtext');
    $resultados = registrar(
        $resultados,
        'Tipo JSON ' . $col['tabla'] . '.' . $col['columna'],
        $tipoOk,
        'tipo=' . ($tipoCol ?: 'ausente'),
    );

    $checkOk = ! $esMaria || isset($checksJson[$col['tabla'] . '.' . $col['columna']]);
    $resultados = registrar(
        $resultados,
        'CHECK JSON ' . $col['tabla'] . '.' . $col['columna'],
        $checkOk,
        $checkOk ? 'json_valid presente' : 'sin CHECK json_valid',
    );

    $invalidos = (int) escalar($pdo,
        'SELECT COUNT(*) FROM ' . tabla($col['tabla'])
        . ' WHERE ' . tabla($col['columna']) . ' IS NOT NULL AND JSON_VALID(' . tabla($col['columna']) . ') = 0'
    );
    $resultados = registrar(
        $resultados,
        'JSON válido ' . $col['tabla'] . '.' . $col['columna'],
        $invalidos === 0,
        $invalidos . ' registro(s) con JSON inválido',
    );
}

// Valores de columnas generadas.
$malRuc = (int) escalar($pdo,
    "SELECT COUNT(*) FROM solicitudes_empresa WHERE "
    . "((estado IN ('pendiente','aprobada') AND (ruc_reservado IS NULL OR ruc_reservado <> RTRIM(ruc))) "
    . "OR (estado NOT IN ('pendiente','aprobada') AND ruc_reservado IS NOT NULL))"
);
$resultados = registrar($resultados, 'Valores ruc_reservado', $malRuc === 0, $malRuc . ' inconsistente(s)');

$malPostulacion = (int) escalar($pdo,
    "SELECT COUNT(*) FROM postulaciones WHERE "
    . "((activo = 1 AND (postulacion_unica IS NULL OR postulacion_unica <> CONCAT(postulante_id, '-', oferta_id))) "
    . "OR (activo <> 1 AND postulacion_unica IS NOT NULL))"
);
$resultados = registrar($resultados, 'Valores postulacion_unica', $malPostulacion === 0, $malPostulacion . ' inconsistente(s)');

// Claves foráneas descubiertas y huérfanos (soporta compuestas y nullable).
$fks = q($pdo,
    'SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, ORDINAL_POSITION '
    . 'FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
    . ' AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION'
);
$grupos = [];
foreach ($fks as $fk) {
    $grupos[$fk['TABLE_NAME'] . '.' . $fk['CONSTRAINT_NAME']][] = $fk;
}
$huerfanosTotal = 0;
foreach ($grupos as $clave => $partes) {
    $hijo = $partes[0]['TABLE_NAME'];
    $padre = $partes[0]['REFERENCED_TABLE_NAME'];
    $joins = [];
    $noNulos = [];
    foreach ($partes as $parte) {
        $joins[] = 'c.' . tabla($parte['COLUMN_NAME']) . ' = p.' . tabla($parte['REFERENCED_COLUMN_NAME']);
        $noNulos[] = 'c.' . tabla($parte['COLUMN_NAME']) . ' IS NOT NULL';
    }
    $sql = 'SELECT COUNT(*) FROM ' . tabla($hijo) . ' c LEFT JOIN ' . tabla($padre) . ' p ON '
        . implode(' AND ', $joins) . ' WHERE (' . implode(' AND ', $noNulos) . ') AND p.'
        . tabla($partes[0]['REFERENCED_COLUMN_NAME']) . ' IS NULL';
    $n = (int) escalar($pdo, $sql);
    $huerfanosTotal += $n;
    if ($n > 0) {
        $pks = array_column(q($pdo,
            'SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ' . $pdo->quote($schema)
            . " AND TABLE_NAME = " . $pdo->quote($hijo) . " AND CONSTRAINT_NAME = 'PRIMARY'"
        ), 'COLUMN_NAME');
        $pk = $pks[0] ?? 'id';
        $muestra = q($pdo,
            'SELECT c.' . tabla($pk) . ' AS id FROM ' . tabla($hijo) . ' c LEFT JOIN ' . tabla($padre)
            . ' p ON ' . implode(' AND ', $joins) . ' WHERE (' . implode(' AND ', $noNulos) . ') AND p.'
            . tabla($partes[0]['REFERENCED_COLUMN_NAME']) . ' IS NULL LIMIT 5'
        );
        $resultados = registrar($resultados, 'FK ' . $clave, false, $n . ' huérfano(s)', $muestra);
    }
}
$resultados = registrar(
    $resultados,
    'Integridad referencial',
    $huerfanosTotal === 0,
    count($grupos) . ' FK(s), ' . $huerfanosTotal . ' huérfano(s)',
);

// Datos críticos mínimos.
$controles = [
    'Usuarios sin username' => "SELECT COUNT(*) FROM users WHERE username IS NULL OR TRIM(username) = ''",
    'Empresas sin RUC' => "SELECT COUNT(*) FROM empresas WHERE ruc IS NULL OR CHAR_LENGTH(ruc) NOT IN (11)",
    'Documentos de postulante inválidos' => "SELECT COUNT(*) FROM postulantes WHERE "
        . "(tipo_documento = 'DNI' AND (dni IS NULL OR CHAR_LENGTH(dni) <> 8)) "
        . "OR (tipo_documento = 'CE' AND (dni IS NULL OR CHAR_LENGTH(dni) NOT BETWEEN 9 AND 12)) "
        . "OR (dni IS NOT NULL AND CHAR_LENGTH(dni) > 20)",
    'Migrations sin versión' => "SELECT COUNT(*) FROM migrations WHERE version IS NULL OR version = ''",
];
foreach ($controles as $nombre => $sql) {
    $n = (int) escalar($pdo, $sql);
    $resultados = registrar($resultados, $nombre, $n === 0, $n . ' registro(s) inválido(s)');
}

// Informe.
$ancho = 78;
echo str_repeat('=', $ancho) . "\n";
echo "AUDITORÍA DE INTEGRIDAD SOL\n";
echo 'Base: ' . $schema . ' · Motor: ' . $version . "\n";
echo str_repeat('=', $ancho) . "\n";
foreach ($resultados as $r) {
    printf("%-4s %-55s %s\n", $r['estado'], $r['control'], $r['detalle']);
}
echo str_repeat('-', $ancho) . "\n";
printf("Resultado: %d control(es), %d error(es), %d aviso(s)\n", count($resultados), count($errores), count($avisos));

$resumen = [
    'base' => $schema,
    'motor' => $version,
    'resultados' => $resultados,
    'errores' => $errores,
    'avisos' => $avisos,
    'ok' => $errores === [],
];
if (isset($opciones['json']) && is_string($opciones['json']) && $opciones['json'] !== '') {
    file_put_contents($opciones['json'], json_encode($resumen, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    echo 'JSON: ' . $opciones['json'] . "\n";
}

exit($errores === [] ? 0 : 1);
