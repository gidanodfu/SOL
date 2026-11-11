#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# Compatibilidad específica de MariaDB: versión, motor, columnas generadas,
# índices únicos, JSON y restricciones críticas del modelo de SOL.
set -u
cd "$(dirname "$0")/../../backend" || exit 1

php <<'PHP'
<?php

$fallos = 0;

function check(string $nombre, bool $ok, string $detalle = ''): void
{
    global $fallos;

    if ($ok) {
        echo "OK   {$nombre}\n";

        return;
    }

    $fallos++;
    echo 'FAIL ' . $nombre . ($detalle !== '' ? ' — ' . $detalle : '') . "\n";
}

$pdo = new PDO(
    'mysql:host=' . getenv('DB_HOST') . ';port=' . getenv('DB_PORT') . ';dbname=' . getenv('DB_DATABASE') . ';charset=utf8mb4',
    (string) getenv('DB_USER'),
    (string) getenv('DB_PASSWORD'),
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$db = (string) getenv('DB_DATABASE');

$version = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
check('MariaDB 11.4 en ejecución', str_starts_with($version, '11.4.'), $version);

$motores = $pdo->query(
    "SELECT table_name, engine FROM information_schema.tables
     WHERE table_schema = " . $pdo->quote($db) . "
       AND table_name IN ('users','empresas','solicitudes_empresa','postulaciones','contrataciones','cv_activos')",
)->fetchAll(PDO::FETCH_KEY_PAIR);
check(
    'tablas críticas usan InnoDB',
    count($motores) === 6 && array_unique(array_values($motores)) === ['InnoDB'],
    json_encode($motores),
);

$generadas = $pdo->query(
    "SELECT table_name, column_name, extra FROM information_schema.columns
     WHERE table_schema = " . $pdo->quote($db) . "
       AND column_name IN ('ruc_reservado','postulacion_unica')",
)->fetchAll(PDO::FETCH_ASSOC);
$porColumna = [];
foreach ($generadas as $fila) {
    $porColumna[$fila['column_name']] = $fila;
}
check(
    'ruc_reservado es columna STORED generada',
    isset($porColumna['ruc_reservado']) && str_contains($porColumna['ruc_reservado']['extra'], 'STORED GENERATED'),
);
check(
    'postulacion_unica es columna VIRTUAL generada',
    isset($porColumna['postulacion_unica']) && str_contains($porColumna['postulacion_unica']['extra'], 'VIRTUAL GENERATED'),
);

$indices = $pdo->query(
    "SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
     FROM information_schema.statistics
     WHERE table_schema = " . $pdo->quote($db) . " AND non_unique = 0
     GROUP BY table_name, index_name",
)->fetchAll(PDO::FETCH_ASSOC);
$indice = [];
foreach ($indices as $fila) {
    $indice[$fila['table_name'] . '.' . $fila['index_name']] = $fila['cols'];
}
check('índice único de RUC activo', ($indice['solicitudes_empresa.uq_solicitud_ruc_activa'] ?? '') === 'ruc_reservado');
check('índice único de postulación activa', ($indice['postulaciones.uq_postulacion_activa'] ?? '') === 'postulacion_unica');
check('postulación única por contratación', ($indice['contrataciones.postulacion_id'] ?? '') === 'postulacion_id');
check('identidad global única por tipo/valor', ($indice['identidades_reservadas.tipo_valor'] ?? '') === 'tipo,valor');
check('un CV activo por postulante', ($indice['cv_activos.PRIMARY'] ?? '') === 'postulante_id');
check('un CV distinto por postulante', ($indice['cv_activos.uq_cv_activo_cv'] ?? '') === 'cv_id');

$checksJson = (int) $pdo->query(
    "SELECT COUNT(*) FROM information_schema.check_constraints
     WHERE constraint_schema = " . $pdo->quote($db) . "
       AND constraint_name IN ('detalle','referencias')",
)->fetchColumn();
check('columnas JSON con json_valid', $checksJson >= 2, 'checks=' . $checksJson);

$pdo->beginTransaction();
try {
    $pdo->exec("INSERT INTO solicitudes_empresa (ruc, razon_social, email, representante, estado)
                VALUES ('20999999991', 'Compat A', 'a@example.test', 'A', 'pendiente')");
    check('solicitud activa válida se inserta', true);

    $duplicado = false;
    try {
        $pdo->exec("INSERT INTO solicitudes_empresa (ruc, razon_social, email, representante, estado)
                    VALUES ('20999999991', 'Compat B', 'b@example.test', 'B', 'pendiente')");
    } catch (PDOException $e) {
        $duplicado = $e->getCode() === '23000';
    }
    check('RUC activo duplicado se rechaza', $duplicado);

    $pdo->exec("INSERT INTO solicitudes_empresa (ruc, razon_social, email, representante, estado)
                VALUES ('20999999991', 'Compat C', 'c@example.test', 'C', 'rechazada')");
    check('RUC histórico puede repetirse tras rechazo', true);
} finally {
    $pdo->rollBack();
}

$pdo->beginTransaction();
try {
    $base = $pdo->query('SELECT * FROM postulaciones WHERE activo = 1 ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if ($base === false) {
        check('postulación base disponible para concurrencia', false);
    } else {
        $pdo->prepare(
            'INSERT INTO postulaciones (postulante_id, oferta_id, empresa_id, fecha_postulacion, estado, activo)
             VALUES (?, ?, ?, ?, ?, 1)',
        )->execute([
            $base['postulante_id'],
            $base['oferta_id'],
            $base['empresa_id'],
            $base['fecha_postulacion'],
            $base['estado'],
        ]);
        check('postulación activa duplicada se rechaza', false);
    }
} catch (PDOException $e) {
    check('postulación activa duplicada se rechaza', $e->getCode() === '23000');
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}

$pdo->beginTransaction();
try {
    $pdo->exec("INSERT INTO identidades_reservadas (tipo, valor, estado) VALUES ('dni', '99999999', 'cuenta')");
    try {
        $pdo->exec("INSERT INTO identidades_reservadas (tipo, valor, estado) VALUES ('dni', '99999999', 'conflicto')");
        check('identidad duplicada se rechaza', false);
    } catch (PDOException $e) {
        check('identidad duplicada se rechaza', $e->getCode() === '23000');
    }
} finally {
    $pdo->rollBack();
}

$pdo->beginTransaction();
try {
    $pdo->exec("INSERT INTO auditoria (user_id, accion, entidad, entidad_id, detalle, created_at)
                VALUES (NULL, 'compat', 'test', 1, '{\"ok\":true}', NOW())");
    check('JSON válido aceptado', true);

    $rechazado = false;
    try {
        $pdo->exec("INSERT INTO auditoria (user_id, accion, entidad, entidad_id, detalle, created_at)
                    VALUES (NULL, 'compat', 'test', 1, 'no-json', NOW())");
    } catch (PDOException $e) {
        $rechazado = $e->getCode() === '23000';
    }
    check('JSON inválido rechazado', $rechazado);
} finally {
    $pdo->rollBack();
}

$pdo->beginTransaction();
try {
    $documentos = [
        ['texto' => 'José Leonardo Ortiz', 'numero' => 123, 'bool' => true, 'nulo' => null, 'vacio' => ''],
        ['lista' => [1, 2, ['anidado' => 'ñandú']]],
        ['niveles' => ['a' => ['b' => ['c' => ['d' => 'valor']]]]],
    ];
    $insertar = $pdo->prepare(
        "INSERT INTO auditoria (user_id, accion, entidad, entidad_id, detalle, created_at)
         VALUES (NULL, 'compat_json', 'test', 1, ?, NOW())",
    );
    $ids = [];
    foreach ($documentos as $documento) {
        $insertar->execute([json_encode($documento, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
        $ids[] = (int) $pdo->lastInsertId();
    }

    $equivalente = true;
    foreach ($documentos as $indice => $documento) {
        $json = $pdo->query('SELECT detalle FROM auditoria WHERE id = ' . $ids[$indice])->fetchColumn();
        $decodificado = json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
        if ($decodificado !== $documento) {
            $equivalente = false;
        }
    }
    check('JSON anidado, UTF-8, nulos y booleanos equivalente', $equivalente);

    $referencias = ['origen' => 'prueba', 'anidado' => ['a' => 1], 'utf8' => 'Chiclayo ñ'];
    $pdo->prepare(
        "INSERT INTO identidades_reservadas (tipo, valor, estado, referencias)
         VALUES ('email', 'compat-json@example.test', 'cuenta', ?)",
    )->execute([json_encode($referencias, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
    $idReserva = (int) $pdo->lastInsertId();
    $leidas = json_decode((string) $pdo->query(
        'SELECT referencias FROM identidades_reservadas WHERE id = ' . $idReserva,
    )->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
    $leidas['agregado'] = ['ok' => true];
    $pdo->prepare('UPDATE identidades_reservadas SET referencias = ? WHERE id = ?')
        ->execute([json_encode($leidas, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $idReserva]);
    $recuperadas = json_decode((string) $pdo->query(
        'SELECT referencias FROM identidades_reservadas WHERE id = ' . $idReserva,
    )->fetchColumn(), true, 512, JSON_THROW_ON_ERROR);
    check('referencias JSON conservan datos al actualizar', $recuperadas === $leidas);
} finally {
    $pdo->rollBack();
}

$pdo->beginTransaction();
try {
    $base = $pdo->query('SELECT * FROM postulaciones WHERE activo = 1 ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC);
    if ($base === false) {
        check('postulación activa disponible para probar columnas generadas', false);
    } else {
        $id = (int) $base['id'];
        $esperado = $base['postulante_id'] . '-' . $base['oferta_id'];

        $pdo->exec('UPDATE postulaciones SET activo = 0 WHERE id = ' . $id);
        $inactiva = $pdo->query('SELECT postulacion_unica FROM postulaciones WHERE id = ' . $id)->fetchColumn();
        check('postulacion_unica se anula al desactivar', $inactiva === null);

        $pdo->exec('UPDATE postulaciones SET activo = 1 WHERE id = ' . $id);
        $activa = $pdo->query('SELECT postulacion_unica FROM postulaciones WHERE id = ' . $id)->fetchColumn();
        check('postulacion_unica se regenera al reactivar', $activa === $esperado);
    }
} finally {
    $pdo->rollBack();
}

$pdo->beginTransaction();
try {
    $pdo->exec("INSERT INTO solicitudes_empresa (ruc, razon_social, email, representante, estado)
                VALUES ('20999999993', 'Compat D', 'd@example.test', 'D', 'pendiente')");
    $idSolicitud = (int) $pdo->lastInsertId();

    $reservado = $pdo->query(
        'SELECT ruc_reservado FROM solicitudes_empresa WHERE id = ' . $idSolicitud,
    )->fetchColumn();
    check('ruc_reservado coincide con el RUC activo', $reservado === '20999999993');

    $pdo->exec("UPDATE solicitudes_empresa SET estado = 'rechazada' WHERE id = " . $idSolicitud);
    $liberado = $pdo->query(
        'SELECT ruc_reservado FROM solicitudes_empresa WHERE id = ' . $idSolicitud,
    )->fetchColumn();
    check('ruc_reservado se libera al rechazar', $liberado === null);

    $pdo->exec("INSERT INTO solicitudes_empresa (ruc, razon_social, email, representante, estado)
                VALUES ('20999999993', 'Compat E', 'e@example.test', 'E', 'pendiente')");
    check('RUC puede reutilizarse tras el rechazo', true);

    $duplicado = false;
    try {
        $pdo->exec("INSERT INTO solicitudes_empresa (ruc, razon_social, email, representante, estado)
                    VALUES ('20999999993', 'Compat F', 'f@example.test', 'F', 'pendiente')");
    } catch (PDOException $e) {
        $duplicado = $e->getCode() === '23000';
    }
    check('RUC activo duplicado se rechaza tras reutilización', $duplicado);
} finally {
    $pdo->rollBack();
}

if ($fallos > 0) {
    echo "Compatibilidad MariaDB con {$fallos} fallo(s).\n";
    exit(1);
}

echo "Compatibilidad MariaDB: OK\n";
PHP
