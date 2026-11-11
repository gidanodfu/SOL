#!/usr/bin/env php
<?php

// SPDX-License-Identifier: MIT

/**
 * Compara los registros de una base MySQL de origen con una MariaDB destino.
 * Es de solo lectura.
 *
 * Variables:
 *   SRC_DB_HOST, SRC_DB_PORT, SRC_DB_DATABASE, SRC_DB_USER, SRC_DB_PASSWORD
 *   DST_DB_HOST, DST_DB_PORT, DST_DB_DATABASE, DST_DB_USER, DST_DB_PASSWORD
 *   COMPARE_BATCH (por defecto 500)
 *   COMPARE_JSON_OUT, COMPARE_MD_OUT
 *
 * Uso:
 *   php tests/tools/compare_database_data.php
 *
 * Los JSON se comparan por estructura canonicalizada, no por bytes.
 */

$opciones = getopt('', ['help']);
if (isset($opciones['help'])) {
    fwrite(STDOUT, "Use SRC_DB_* y DST_DB_* para configurar las conexiones.\n");
    exit(0);
}

function envReq(string $prefijo, string $clave): string
{
    $valor = getenv($prefijo . $clave);
    if ($valor === false || $valor === '') {
        fwrite(STDERR, "ERROR: falta {$prefijo}{$clave}.\n");
        exit(2);
    }

    return $valor;
}

function conectar(string $prefijo): PDO
{
    $host = getenv($prefijo . 'DB_HOST') ?: '127.0.0.1';
    $port = getenv($prefijo . 'DB_PORT') ?: '3306';
    $db   = envReq($prefijo, 'DB_DATABASE');
    $user = envReq($prefijo, 'DB_USER');
    $pass = getenv($prefijo . 'DB_PASSWORD') ?: '';

    return new PDO(
        "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
    );
}

function quoteId(string $id): string
{
    return '`' . str_replace('`', '``', $id) . '`';
}

function canonicalDecimal(string $valor): string
{
    $valor = trim($valor);
    if (! preg_match('/^-?\d+(?:\.\d+)?$/', $valor)) {
        return $valor;
    }
    $negativo = str_starts_with($valor, '-');
    $valor = ltrim($valor, '-');
    if (str_contains($valor, '.')) {
        $valor = rtrim(rtrim($valor, '0'), '.');
    }
    if ($valor === '' || $valor === '0') {
        return '0';
    }

    return ($negativo ? '-' : '') . $valor;
}

function canonicalJson(mixed $valor): mixed
{
    if (is_array($valor)) {
        if (array_is_list($valor)) {
            return array_map('canonicalJson', $valor);
        }
        ksort($valor);

        return array_map('canonicalJson', $valor);
    }

    return $valor;
}

/**
 * @param array<string, string> $tipos columna => DATA_TYPE
 * @param array<string, true> $json columnas lógicas JSON
 */
function canonicalizarFila(array $fila, array $tipos, array $json): array
{
    $salida = [];
    foreach ($fila as $columna => $valor) {
        $tipo = strtolower($tipos[$columna] ?? 'varchar');

        if ($valor === null) {
            $salida[$columna] = ['t' => 'null'];
            continue;
        }

        if (isset($json[$columna])) {
            try {
                $decodificado = json_decode((string) $valor, true, 512, JSON_THROW_ON_ERROR);
                $salida[$columna] = ['t' => 'json', 'v' => canonicalJson($decodificado)];
            } catch (Throwable) {
                $salida[$columna] = ['t' => 'string', 'v' => (string) $valor];
            }
            continue;
        }

        if (in_array($tipo, ['int', 'integer', 'smallint', 'mediumint', 'bigint', 'tinyint'], true)) {
            $salida[$columna] = ['t' => 'int', 'v' => (int) $valor];
            continue;
        }

        if (in_array($tipo, ['decimal', 'numeric', 'float', 'double', 'real'], true)) {
            $salida[$columna] = ['t' => 'decimal', 'v' => canonicalDecimal((string) $valor)];
            continue;
        }

        if (in_array($tipo, ['blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary'], true)) {
            $salida[$columna] = ['t' => 'binary', 'v' => base64_encode((string) $valor)];
            continue;
        }

        $salida[$columna] = ['t' => 'string', 'v' => (string) $valor];
    }

    return $salida;
}

function hashFila(array $canonica): string
{
    return hash('sha256', json_encode($canonica, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
}

/**
 * @return array<string, string> columna => tipo
 */
function tiposColumnas(PDO $pdo, string $db, string $tabla): array
{
    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS '
        . 'WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    );
    $stmt->execute([$db, $tabla]);
    $tipos = [];
    foreach ($stmt->fetchAll() as $fila) {
        $tipos[$fila['COLUMN_NAME']] = $fila['DATA_TYPE'];
    }

    return $tipos;
}

function primaryKey(PDO $pdo, string $db, string $tabla): array
{
    $stmt = $pdo->prepare(
        'SELECT COLUMN_NAME, ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE '
        . "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' "
        . 'ORDER BY ORDINAL_POSITION',
    );
    $stmt->execute([$db, $tabla]);

    return array_column($stmt->fetchAll(), 'COLUMN_NAME');
}

function tablaExiste(PDO $pdo, string $db, string $tabla): bool
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?');
    $stmt->execute([$db, $tabla]);

    return (int) $stmt->fetchColumn() === 1;
}

$src = conectar('SRC_');
$dst = conectar('DST_');
$dbSrc = envReq('SRC_', 'DB_DATABASE');
$dbDst = envReq('DST_', 'DB_DATABASE');
$batch = max(1, (int) (getenv('COMPARE_BATCH') ?: 500));
$jsonOut = getenv('COMPARE_JSON_OUT') ?: '/tmp/sol-compare.json';
$mdOut = getenv('COMPARE_MD_OUT') ?: '/tmp/sol-compare.md';
$jsonCols = [];
foreach (explode(',', getenv('COMPARE_JSON_COLUMNS') ?: 'auditoria.detalle,identidades_reservadas.referencias') as $item) {
    $item = trim($item);
    if ($item !== '') {
        $jsonCols[$item] = true;
    }
}

$tablasSrc = array_column($src->query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ' . $src->quote($dbSrc)
    . " AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
)->fetchAll(), 'TABLE_NAME');
$tablasDst = array_column($dst->query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ' . $dst->quote($dbDst)
    . " AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
)->fetchAll(), 'TABLE_NAME');

$ignoradas = ['migrations'];
$tablas = array_values(array_diff($tablasSrc, $ignoradas));
$resultado = [
    'origen' => ['base' => $dbSrc, 'motor' => (string) $src->query('SELECT VERSION()')->fetchColumn()],
    'destino' => ['base' => $dbDst, 'motor' => (string) $dst->query('SELECT VERSION()')->fetchColumn()],
    'tablas' => [],
    'diferencias' => [],
    'resumen' => ['missing' => 0, 'extra' => 0, 'modified' => 0, 'tablas' => 0],
];

foreach ($tablas as $tabla) {
    if (! in_array($tabla, $tablasDst, true)) {
        $resultado['diferencias'][] = ['tabla' => $tabla, 'estado' => 'MISSING_TABLE'];
        $resultado['resumen']['missing']++;
        continue;
    }

    $pk = primaryKey($src, $dbSrc, $tabla);
    $tiposSrc = tiposColumnas($src, $dbSrc, $tabla);
    $tiposDst = tiposColumnas($dst, $dbDst, $tabla);
    $columnas = array_keys($tiposSrc);
    $faltanColumnas = array_values(array_diff($columnas, array_keys($tiposDst)));
    if ($faltanColumnas !== []) {
        $resultado['diferencias'][] = [
            'tabla' => $tabla,
            'estado' => 'MISSING_COLUMNS',
            'columnas' => $faltanColumnas,
        ];
        $resultado['resumen']['missing']++;
        continue;
    }

    if ($pk === []) {
        $resultado['diferencias'][] = ['tabla' => $tabla, 'estado' => 'SIN_CLAVE_PRIMARIA'];
        $resultado['resumen']['modified']++;
        continue;
    }

    $columnasSql = implode(', ', array_map('quoteId', $columnas));
    $orderBy = implode(', ', array_map('quoteId', $pk));

    $jsonTabla = [];
    foreach ($jsonCols as $claveJson => $_) {
        [$tablaJson, $columnaJson] = array_pad(explode('.', $claveJson, 2), 2, '');
        if ($tablaJson === $tabla && $columnaJson !== '') {
            $jsonTabla[$columnaJson] = true;
        }
    }

    $missing = 0;
    $extra = 0;
    $modified = 0;
    $filasOrigen = 0;
    $filasDestino = 0;
    $offset = 0;

    do {
        $limite = ' LIMIT ' . $batch . ' OFFSET ' . $offset;
        $filasSrc = $src->query("SELECT {$columnasSql} FROM " . quoteId($tabla) . " ORDER BY {$orderBy}{$limite}")->fetchAll();
        $filasDst = $dst->query("SELECT {$columnasSql} FROM " . quoteId($tabla) . " ORDER BY {$orderBy}{$limite}")->fetchAll();

        $mapaSrc = [];
        $mapaDst = [];
        foreach ($filasSrc as $fila) {
            $canonica = canonicalizarFila($fila, $tiposSrc, $jsonTabla);
            $clave = json_encode(array_intersect_key($canonica, array_flip($pk)), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $mapaSrc[$clave] = hashFila($canonica);
        }
        foreach ($filasDst as $fila) {
            $canonica = canonicalizarFila($fila, $tiposDst, $jsonTabla);
            $clave = json_encode(array_intersect_key($canonica, array_flip($pk)), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $mapaDst[$clave] = hashFila($canonica);
        }

        $filasOrigen += count($mapaSrc);
        $filasDestino += count($mapaDst);

        foreach ($mapaSrc as $clave => $hash) {
            if (! array_key_exists($clave, $mapaDst)) {
                $missing++;
                if (count($resultado['diferencias']) < 50) {
                    $resultado['diferencias'][] = ['tabla' => $tabla, 'estado' => 'MISSING_IN_MARIADB', 'pk' => $clave];
                }
            } elseif ($mapaDst[$clave] !== $hash) {
                $modified++;
                if (count($resultado['diferencias']) < 50) {
                    $resultado['diferencias'][] = ['tabla' => $tabla, 'estado' => 'MODIFIED', 'pk' => $clave];
                }
            }
        }
        foreach ($mapaDst as $clave => $hash) {
            if (! array_key_exists($clave, $mapaSrc)) {
                $extra++;
                if (count($resultado['diferencias']) < 50) {
                    $resultado['diferencias'][] = ['tabla' => $tabla, 'estado' => 'EXTRA_IN_MARIADB', 'pk' => $clave];
                }
            }
        }

        $offset += $batch;
        $paginaVacia = $filasSrc === [] && $filasDst === [];
    } while (! $paginaVacia);

    $resultado['tablas'][] = [
        'tabla' => $tabla,
        'filas_origen' => $filasOrigen,
        'filas_destino' => $filasDestino,
        'identical' => $filasOrigen - $missing - $modified,
        'missing' => $missing,
        'extra' => $extra,
        'modified' => $modified,
        'pk' => $pk,
        'columnas' => count($columnas),
    ];
    $resultado['resumen']['missing'] += $missing;
    $resultado['resumen']['extra'] += $extra;
    $resultado['resumen']['modified'] += $modified;
    $resultado['resumen']['tablas']++;
}

$resultado['ok'] = $resultado['resumen']['missing'] === 0
    && $resultado['resumen']['extra'] === 0
    && $resultado['resumen']['modified'] === 0;

file_put_contents($jsonOut, json_encode($resultado, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n");

$lineas = [
    '# Comparación de datos MySQL → MariaDB',
    '',
    '- Origen: `' . $resultado['origen']['base'] . '` (' . $resultado['origen']['motor'] . ')',
    '- Destino: `' . $resultado['destino']['base'] . '` (' . $resultado['destino']['motor'] . ')',
    '- Tablas comparadas: ' . $resultado['resumen']['tablas'],
    '- Registros faltantes: ' . $resultado['resumen']['missing'],
    '- Registros extra: ' . $resultado['resumen']['extra'],
    '- Registros modificados: ' . $resultado['resumen']['modified'],
    '',
    '| Tabla | Filas origen | Filas destino | Idénticas | Faltantes | Extra | Modificadas |',
    '|---|---:|---:|---:|---:|---:|---:|',
];
foreach ($resultado['tablas'] as $fila) {
    $lineas[] = '| ' . $fila['tabla'] . ' | ' . $fila['filas_origen'] . ' | ' . $fila['filas_destino']
        . ' | ' . $fila['identical'] . ' | ' . $fila['missing'] . ' | ' . $fila['extra']
        . ' | ' . $fila['modified'] . ' |';
}
if ($resultado['diferencias'] !== []) {
    $lineas[] = '';
    $lineas[] = '## Diferencias (muestra)';
    $lineas[] = '';
    foreach ($resultado['diferencias'] as $diferencia) {
        $lineas[] = '- `' . $diferencia['tabla'] . '`: ' . $diferencia['estado']
            . (isset($diferencia['pk']) ? ' pk=' . $diferencia['pk'] : '')
            . (isset($diferencia['columnas']) ? ' columnas=' . implode(',', $diferencia['columnas']) : '');
    }
}
file_put_contents($mdOut, implode("\n", $lineas) . "\n");

echo "Origen: {$dbSrc} ({$resultado['origen']['motor']})\n";
echo "Destino: {$dbDst} ({$resultado['destino']['motor']})\n";
printf(
    "Tablas=%d faltantes=%d extra=%d modificados=%d\n",
    $resultado['resumen']['tablas'],
    $resultado['resumen']['missing'],
    $resultado['resumen']['extra'],
    $resultado['resumen']['modified'],
);
echo 'JSON: ' . $jsonOut . "\n";
echo 'Markdown: ' . $mdOut . "\n";

exit($resultado['ok'] ? 0 : 1);
