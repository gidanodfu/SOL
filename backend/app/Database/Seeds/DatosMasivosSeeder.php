<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;

/**
 * Datos masivos ficticios para pruebas (NUNCA usar en producción).
 *
 * Requiere haber ejecutado primero los seeds base sobre un esquema recién migrado:
 *   php spark migrate:refresh --all -f
 *   php spark db:seed SystemSeeder
 *   php spark db:seed DatosPruebaSeeder
 * Luego: php spark db:seed DatosMasivosSeeder
 *
 * Genera: 20 empresas, 20 usuarios administrativos, 100 postulantes (88 con
 * contacto completo y 12 incompletos para probar el guard de postular), 60
 * ofertas con habilidades, ~500 postulaciones con historial coherente y ~45
 * contrataciones sobre postulaciones seleccionadas. Fechas distribuidas en los
 * últimos 12 meses. Los CV se suben aparte por el flujo real de la API:
 *   bash scripts/seed_cvs_masivos.sh
 *
 * Este seeder escribe backend/writable/masivos_manifest.json con las cuentas y
 * los datos de perfil/CV ficticios para ese script (archivo gitignored).
 * Contraseñas ficticias con el mismo hash que SystemSeeder (RN-06).
 */
class DatosMasivosSeeder extends Seeder
{
    private const PASSWORD_POSTULANTE = 'Postu123!';
    private const PASSWORD_EMPRESA    = 'Empresa123!';
    private const PASSWORD_ADMIN      = 'Admin123!';

    public function run(): void
    {
        $existentes = (int) $this->db->table('empresas')->countAllResults();
        if ($existentes > 1) {
            echo "DatosMasivosSeeder: ya hay {$existentes} empresas. Ejecute primero:\n";
            echo "  php spark migrate:refresh --all -f && php spark db:seed SystemSeeder && php spark db:seed DatosPruebaSeeder\n";

            return;
        }

        mt_srand(20260909);

        $now       = date('Y-m-d H:i:s');
        $hoy       = new \DateTimeImmutable('today');
        $hace12m   = $hoy->modify('-12 months');
        $hash      = static fn (string $p): string => password_hash($p, PASSWORD_DEFAULT);

        // ------------------------------------------------------- pool de datos
        $nombresF = ['María','Carmen','Rosa','Lucía','Ana','Milagros','Fiorella','Stefany','Karla','Paola','Yuliana','Diana','Carla','Elena','Maribel','Ruth','Sara','Lizeth','Verónica','Jazmín','Mónica','Patricia','Silvia','Claudia','Jessica','Sandra','Tatiana','Brenda','Katherine','Nataly','Daniela','Flor','Lourdes','Gianella','Miluska'];
        $nombresM = ['Juan','Carlos','Luis','José','Pedro','Miguel','Jorge','Marco','Oscar','Raúl','Manuel','Alberto','Víctor','Eduardo','Hugo','Walter','César','Renzo','Bryan','Frank','Giancarlo','Jhordan','Anderson','Cristhian','Diego','Fernando','Kevin','Paul','Roberto','Segundo','Wilmer','Yerson','Abel','Jhony','Martín'];
        $apellidos = ['Torres','Rojas','Ramírez','Flores','Sánchez','Vásquez','Castillo','Ramos','Chávez','Vargas','Castro','García','Mendoza','Díaz','Cruz','Salazar','Cubas','Lozano','Aguilar','Reyes','Cieza','Campos','Silva','Montenegro','Paredes','Vega','Zapata','Chuquihuanga','Delgado','Santamaría','Coronel','Bances','Millones','Idrogo','Pisfil','Neciosup','Llatas','Cabrejos','Serrepe','Alarcón','Baldera','Chirinos','Farfán','Pérez'];
        $distritos = ['José Leonardo Ortiz','Chiclayo','La Victoria','Pimentel','Monsefú','Reque','Pomalca','Picsi','Tumán','Lambayeque','Ferreñafe','Santa Rosa','Ciudad Eten','San José','Zaña','Cayaltí','Oyotún','Chongoyape','Illimo','Túcume','Mórrope','Puerto Eten'];
        $calles    = ['Av. Los Incas','Av. Balta','Av. Sáenz Peña','Av. Chiclayo','Av. Grau','Av. Augusto B. Leguía','Av. Santa Victoria','Calle 7 de Enero','Calle Elías Aguirre','Calle San Martín','Jr. Bolívar','Jr. Huascar','Jr. Manuel Pardo','Pasaje Los Girasoles','Urb. Santa Rosa','Urb. La Victoria','Urb. Los Parques','Calle La Unión','Av. Miguel Grau','Jr. 28 de Julio','Urb. El Porvenir','Calle Las Magnolias','Urb. Santa Elena','Av. Pedro Ruiz'];
        $profesionesCv = ['Operario de producción','Asistente administrativo','Cajero','Vendedor','Chofer','Cocinero','Ayudante de cocina','Técnico en mantenimiento','Agente de seguridad','Digitador','Atención al cliente','Almacenero','Repartidor','Peón de construcción','Electricista','Mecánico','Recepcionista','Limpieza','Jardinería','Ayudante de campo','Estibador','Guía turístico','Operador de maquinaria','Teleoperador','Auxiliar contable','Practicante de ingeniería','Supervisor de tienda','Analista de soporte','Ayudante de reparto','Promotor de ventas'];

        // ------------------------------------------------ helpers de fechas
        $entre = static function (\DateTimeImmutable $a, \DateTimeImmutable $b): \DateTimeImmutable {
            if ($a > $b) { [$a, $b] = [$b, $a]; }
            $dias = (int) $a->diff($b)->days;
            if ($dias <= 0) { return $a; }
            return $a->modify('+' . mt_rand(0, $dias) . ' days');
        };
        $dt = static fn (\DateTimeImmutable $d, string $hora): string => $d->format('Y-m-d') . ' ' . $hora;

        // ------------------------------------------------------- 20 admins
        for ($i = 1; $i <= 20; ++$i) {
            $nombre = $nombresF[array_rand($nombresF)] . ' ' . $nombresM[array_rand($nombresM)];
            $this->db->table('users')->insert([
                'username'      => sprintf('muni%02d', $i),
                'password_hash' => $hash(self::PASSWORD_ADMIN),
                'rol'           => 'admin',
                'nombres'       => $nombre,
                'apellidos'     => $apellidos[array_rand($apellidos)] . ' ' . $apellidos[array_rand($apellidos)],
                'email'         => sprintf('muni%02d@mdjlo-ficticio.pe', $i),
                'telefono'      => '97' . str_pad((string) mt_rand(100000, 999999), 6, '0', STR_PAD_LEFT),
                'estado'        => 'activo',
                'created_at'    => $dt($entre($hace12m, $hoy), sprintf('%02d:%02d:00', mt_rand(8, 18), mt_rand(0, 59))),
                'updated_at'    => $now,
            ]);
        }

        // ------------------------------------------------------- 20 empresas
        $razones = ['Constructora Andina del Norte SAC','Agroexportadora Santa Rosa SA','Textiles Lambayeque SAC','Inversiones San Martín SAC','Corporación Alimentaria del Sol SAC','Transportes del Norte EIRL','TecnoSoluciones Perú SAC','Grupo Pesquero Mar Azul SA','Industrias Chiclayo SAC','Servicios Generales Virgen de la Paz EIRL','Comercializadora Valle Verde SA','Clínica Santa María del Norte SAC','Ferretería y Maquinarias JLO SAC','Empresa Agroindustrial La Calera SA','Logística Express Lambayeque SAC','Restaurantes Tradición Norteña SAC','Seguridad y Vigilancia Centinela SAC','Educación y Capacitación Formar Perú SAC','Hotel & Turismo Sol y Mar SA','Manufacturas El Sol de Chiclayo SAC'];
        $sectores = ['construcción y obras civiles','agroexportación de frutas y hortalizas','confección textil','inversión inmobiliaria','elaboración de alimentos','transporte de carga y pasajeros','servicios de tecnología e informática','pesca y comercialización de productos hidrobiológicos','fabricación de productos de plástico y metalmecánica','servicios generales y limpieza','comercialización de productos agrícolas','servicios de salud privada','venta de ferretería y maquinarias','agroindustria de caña y derivados','servicios logísticos y de distribución','restaurantes y servicios gastronómicos','servicios de seguridad privada','institutos y capacitación técnica','hotelería y turismo','manufactura de muebles y acabados'];
        $representantes = ['Ing. Carlos Sandoval','Sra. Luisa Farro','Sr. Pedro Ausejo','Lic. Mónica Chafloque','Ing. Roberto Zevallos','Sr. Elmer Guzmán','Ing. Karen Villegas','Sr. Jorge Bances','Sra. Eliana Puican','Sr. Wilfredo Tarrillo','Ing. Patricia Suclupe','Dr. Marco Santisteban','Sr. Antonio Cumpa','Ing. Lucía Nuñez','Sr. Fredy Quiroz','Sra. Milagros Gamarra','Cmte. Jorge Ruiz','Lic. Rosa Chero','Sr. Humberto León','Ing. Yesenia Palacios'];

        $empresaIds = [];   // id interno del bucle 1..20
        $empresaUserId = [];
        $rucUsados = ['20601234567' => true];  // el del seed base
        for ($i = 0; $i < 20; ++$i) {
            do {
                $ruc = '20' . str_pad((string) mt_rand(10000000, 999999999), 9, '0', STR_PAD_LEFT);
            } while (isset($rucUsados[$ruc]));
            $rucUsados[$ruc] = true;

            $estado = ($i >= 18) ? 'inactivo' : 'activo';
            $usuarioId = null;
            $this->db->table('users')->insert([
                'username'      => $ruc,
                'password_hash' => $hash(self::PASSWORD_EMPRESA),
                'rol'           => 'empresa',
                'nombres'       => $razones[$i],
                'apellidos'     => ' ',
                'email'         => $ruc . '@empresa-ficticia.pe',
                'telefono'      => '07' . mt_rand(400000, 799999),
                'estado'        => $estado,
                'created_at'    => $dt($entre($hace12m, $hoy), sprintf('%02d:%02d:00', mt_rand(8, 18), mt_rand(0, 59))),
                'updated_at'    => $now,
            ]);
            $usuarioId = (int) $this->db->insertID();

            $this->db->table('empresas')->insert([
                'user_id'               => $usuarioId,
                'ruc'                   => $ruc,
                'razon_social'          => $razones[$i],
                'nombre_comercial'      => strtok($razones[$i], ' ') ?? $razones[$i],
                'direccion'             => $calles[array_rand($calles)] . ' ' . mt_rand(100, 3000) . ', ' . $distritos[array_rand($distritos)],
                'telefono'              => '07' . mt_rand(400000, 799999),
                'email'                 => $ruc . '@empresa-ficticia.pe',
                'representante'         => $representantes[$i],
                'info_adicional'        => 'Empresa ficticia del rubro de ' . $sectores[$i] . ', creada exclusivamente para pruebas.',
                'evaluacion_presencial' => 1,
                'estado'                => $estado,
                'created_at'            => $dt($entre($hace12m, $hoy), sprintf('%02d:%02d:00', mt_rand(8, 18), mt_rand(0, 59))),
                'updated_at'            => $now,
            ]);
            $empresaIds[]   = (int) $this->db->insertID();
            $empresaUserId[] = $usuarioId;
        }
        // La empresa del seed base (Constructora) también entra al reparto de ofertas.
        array_unshift($empresaIds, 1);
        array_unshift($empresaUserId, 2);

        // ------------------------------------------------------- 100 postulantes
        $dniUsados   = ['12345678' => true];
        $completos   = [];   // índice => dni (para CV)
        $incompletos = [];
        $postulanteIds = [];
        $postulanteUserId = [];
        $fechasNac = static function (): string {
            $anio = mt_rand(1978, 2005);

            return sprintf('%04d-%02d-%02d', $anio, mt_rand(1, 12), mt_rand(1, 28));
        };
        for ($i = 0; $i < 100; ++$i) {
            do {
                $dni = (string) mt_rand(40000000, 79999999);
            } while (isset($dniUsados[$dni]));
            $dniUsados[$dni] = true;

            $genero = mt_rand(0, 1);
            $nombres = $genero === 0 ? $nombresF[array_rand($nombresF)] : $nombresM[array_rand($nombresM)];
            $apellido1 = $apellidos[array_rand($apellidos)];
            $apellido2 = $apellidos[array_rand($apellidos)];
            $completo = ($i < 88);   // 12 incompletos para probar guard/UI

            $this->db->table('users')->insert([
                'username'      => $dni,
                'password_hash' => $hash(self::PASSWORD_POSTULANTE),
                'rol'           => 'postulante',
                'nombres'       => $nombres,
                'apellidos'     => $apellido1 . ' ' . $apellido2,
                'email'         => strtolower($nombres . '.' . $apellido1) . $i . '@correo-ficticio.pe',
                'telefono'      => '9' . mt_rand(10000000, 99999999),
                'estado'        => 'activo',
                'created_at'    => $dt($entre($hace12m, $hoy), sprintf('%02d:%02d:00', mt_rand(6, 22), mt_rand(0, 59))),
                'updated_at'    => $now,
            ]);
            $userId = (int) $this->db->insertID();

            $this->db->table('postulantes')->insert([
                'user_id'          => $userId,
                'dni'              => $dni,
                'nombres'          => $nombres,
                'apellidos'        => $apellido1 . ' ' . $apellido2,
                'fecha_nacimiento' => $completo ? $fechasNac() : null,
                'direccion'        => $completo ? $calles[array_rand($calles)] . ' ' . mt_rand(100, 4000) . ', ' . $distritos[array_rand($distritos)] : null,
                'distrito'         => $distritos[array_rand($distritos)],
                'telefono'         => '9' . mt_rand(10000000, 99999999),
                'created_at'       => $dt($entre($hace12m, $hoy), sprintf('%02d:%02d:00', mt_rand(6, 22), mt_rand(0, 59))),
                'updated_at'       => $now,
            ]);
            $postulanteIds[]   = (int) $this->db->insertID();
            $postulanteUserId[] = $userId;

            if ($completo) {
                $completos[$i] = [
                    'dni' => $dni, 'nombres' => $nombres . ' ' . $apellido1 . ' ' . $apellido2,
                    'profesion' => $profesionesCv[array_rand($profesionesCv)],
                ];
            } else {
                $incompletos[] = $dni;
            }
        }

        // ------------------------------------------------------- 60 ofertas
        $puestosPorCategoria = [
            1 => ['Asistente administrativo','Analista contable','Practicante de administración','Secretaria de gerencia','Auxiliar de archivo'],
            2 => ['Vendedor de mostrador','Promotor de ventas','Ejecutivo comercial','Cajero de tienda','Atención al cliente'],
            3 => ['Operario de construcción','Maestro de obra','Ayudante de albañil','Encofrador','Oficial de carpintería'],
            4 => ['Cocinero','Ayudante de cocina','Azafata','Barista','Cajero de restaurante'],
            5 => ['Almacenero','Operario de despacho','Conductor de reparto','Montacarguista','Analista de inventarios'],
            6 => ['Enfermero(a)','Técnico en laboratorio','Recepcionista de clínica','Farmacéutico auxiliar','Asistente de nutrición'],
            7 => ['Soporte técnico TI','Desarrollador junior','Analista de datos','Operador de sistemas','Técnico en redes'],
            8 => ['Operario de producción','Soldador','Operador de máquina','Control de calidad','Mecánico industrial'],
            9 => ['Personal de limpieza','Agente de seguridad','Jardinería y mantenimiento','Atención al ciudadano','Mensajero'],
            10 => ['Chofer de carga','Operador de montacarga','Conductor interprovincial','Ayudante de tráiler','Lava y engrase'],
        ];
        $habilidadesPool = ['Excel','Word','PowerPoint','Internet','Redes sociales','Atención al cliente','Trabajo en equipo','Comunicación efectiva','Puntualidad','Responsabilidad','Manejo de caja','Facturación electrónica','Conducción de vehículos','Manejo de montacargas','Soldadura básica','Lectura de planos','Cocina criolla','Manipulación de alimentos','Inglés básico','Inglés intermedio','Ofimática','Soporte técnico','Ensamblaje','Control de calidad','Inventarios','Almacén','Distribución','Diseño gráfico','Contabilidad básica','Tributación','Limpieza industrial','Seguridad industrial','Primeros auxilios','Liderazgo','Ventas','Negociación','Logística','Digitación','Archivo y documentación','Mecánica básica','Electricidad básica','Maquinaria pesada','Conducción de motos','Atención de pacientes','Marketing digital'];
        $tipos = ['tiempo_completo','medio_tiempo','por_horas','practicas','freelance','remoto'];

        $ofertaEstado = function (int $i): string {
            if ($i < 35) { return 'publicada'; }
            if ($i < 55) { return 'cerrada'; }

            return 'borrador';
        };

        $ofertasHabilidades = [];
        $ofertaIds = [];
        $ofertaEmpresa = [];
        $ofertaInfo = [];   // id => ['estado','empresa_id','fecha_cierre','fecha_publicacion','puesto','remuneracion']
        for ($i = 0; $i < 60; ++$i) {
            $estado = $ofertaEstado($i);
            $empresaIndex = $i % count($empresaIds);
            $empresaId = $empresaIds[$empresaIndex];
            $categoriaId = mt_rand(1, 10);
            $puestoLista = $puestosPorCategoria[$categoriaId];
            $puesto = $puestoLista[array_rand($puestoLista)] . ' ' . ($i % 5 === 0 ? ' (turno mañana)' : ($i % 7 === 0 ? ' (turno noche)' : ''));

            // Fechas coherentes por estado, distribuidas en 12 meses.
            $fechaPublicacion = null;
            $fechaCierre = null;
            if ($estado === 'publicada') {
                $fechaPublicacion = $entre($hoy->modify('-4 months'), $hoy->modify('-1 day'))->format('Y-m-d');
                $fechaCierre = $hoy->modify('+' . mt_rand(7, 60) . ' days')->format('Y-m-d');
            } elseif ($estado === 'cerrada') {
                $fechaPublicacion = $entre($hace12m, $hoy->modify('-3 months'))->format('Y-m-d');
                $fechaCierre = $hoy->modify('-' . mt_rand(5, 90) . ' days')->format('Y-m-d');
                if ($fechaCierre <= $fechaPublicacion) { $fechaCierre = (new \DateTimeImmutable($fechaPublicacion))->modify('+15 days')->format('Y-m-d'); }
            } elseif ($estado === 'borrador') {
                $fechaPublicacion = null;
                $fechaCierre = $hoy->modify('+' . mt_rand(15, 45) . ' days')->format('Y-m-d');
            }

            $remuneracion = mt_rand(1025, 8500) + (mt_rand(0, 1) ? .50 : .00);
            $creado = $fechaPublicacion
                ? (new \DateTimeImmutable($fechaPublicacion))->modify('-' . mt_rand(0, 10) . ' days')
                : $entre($hace12m, $hoy);

            $this->db->table('ofertas')->insert([
                'empresa_id'            => $empresaId,
                'categoria_id'          => $categoriaId,
                'puesto'                => $puesto,
                'descripcion'           => 'Puesto ficticio para pruebas: ' . $puesto . '. Empresa ' . ($empresaIndex + 1) . ' del dataset masivo.',
                'funciones'             => 'Funciones propias del puesto según el rubro; horario y coordinación acorde a la empresa.',
                'requisitos'            => 'Experiencia comprobable y disposición para trabajar en equipo. ' . ($categoriaId >= 7 ? 'Conocimientos técnicos del área.' : 'Capacitación cubierta por la empresa.'),
                'formacion_requerida'   => ['Primaria completa','Secundaria completa','Técnico incompleto','Técnico completo','Universitario incompleto','Universitario completo'][mt_rand(0, 5)],
                'experiencia_requerida' => ['Sin experiencia','6 meses','1 año','2 años','3-4 años','Más de 5 años'][mt_rand(0, 5)],
                'tipo_empleo'           => $tipos[array_rand($tipos)],
                'ubicacion'             => $distritos[array_rand($distritos)],
                'remuneracion'          => $remuneracion,
                'vacantes'              => mt_rand(1, 8),
                'fecha_publicacion'     => $fechaPublicacion,
                'fecha_cierre'          => $fechaCierre,
                'estado'                => $estado,
                'created_at'            => $dt($creado, sprintf('%02d:%02d:00', mt_rand(8, 18), mt_rand(0, 59))),
                'updated_at'            => $now,
            ]);
            $ofertaId = (int) $this->db->insertID();
            $ofertaIds[] = $ofertaId;
            $ofertaEmpresa[$ofertaId] = $empresaId;
            $ofertaInfo[$ofertaId] = [
                'estado' => $estado, 'empresa_id' => $empresaId, 'fecha_cierre' => $fechaCierre,
                'fecha_publicacion' => $fechaPublicacion, 'puesto' => $puesto, 'remuneracion' => $remuneracion,
            ];

            $nHabilidades = mt_rand(2, 6);
            $skills = (array) array_rand($habilidadesPool, $nHabilidades);
            foreach ($skills as $k) {
                $ofertasHabilidades[] = ['oferta_id' => $ofertaId, 'habilidad' => $habilidadesPool[$k]];
            }
        }
        foreach (array_chunk($ofertasHabilidades, 300) as $lote) {
            $this->db->table('ofertas_habilidades')->insertBatch($lote);
        }

        // ------------------------------------------------------- 500 postulaciones
        $publicables = array_filter($ofertaInfo, static fn ($o) => in_array($o['estado'], ['publicada', 'cerrada'], true));
        $publicablesIds = array_keys($publicables);
        // Índices pesados: 15 ofertas "calientes" (18-26 post.), 20 medias (5-12), resto (1-3).
        $plan = [];
        $hot = min(15, count($publicables));
        $medium = min(20, count($publicables) - $hot);
        for ($j = 0; $j < count($publicables); ++$j) {
            $plan[$j] = $j < $hot ? mt_rand(18, 26) : ($j < $hot + $medium ? mt_rand(5, 12) : mt_rand(1, 3));
        }
        // Ajustar para sumar exactamente 500.
        $totalPlan = array_sum($plan);
        $k = 0;
        while ($totalPlan < 500) { ++$plan[$k % count($plan)]; ++$totalPlan; ++$k; }
        while ($totalPlan > 500) {
            $r = array_rand($plan);
            if ($plan[$r] > 1) { --$plan[$r]; --$totalPlan; } else { $plan[$r] = 0; --$totalPlan; }
        }

        $estados = ['pendiente', 'en_revision', 'preseleccionado', 'contactado', 'seleccionado', 'no_seleccionado'];
        $usados = [];   // postulanteId-ofertaId activos
        $historial = [];
        $contratos = [];
        $postulacionIds = [];

        $insertarPostulacion = function (int $postulanteIdx, int $ofertaId, string $estado, bool $activo, \DateTimeImmutable $fecha, int &$postId) use (&$usados, &$historial, &$contratos, &$postulacionIds, $postulanteIds, $postulanteUserId, $empresaUserId, $ofertaInfo): void {
            $clave = $postulanteIds[$postulanteIdx] . '-' . $ofertaId;
            $postId = 0;
            $this->db->table('postulaciones')->insert([
                'postulante_id' => $postulanteIds[$postulanteIdx],
                'oferta_id'     => $ofertaId,
                'empresa_id'    => $ofertaInfo[$ofertaId]['empresa_id'],
                'fecha_postulacion' => $fecha->format('Y-m-d H:i:s'),
                'estado'        => $estado,
                'activo'        => $activo ? 1 : 0,
                'created_at'    => $fecha->format('Y-m-d H:i:s'),
                'updated_at'    => $fecha->format('Y-m-d H:i:s'),
            ]);
            $postId = (int) $this->db->insertID();
            $postulacionIds[] = $postId;

            if (! $activo) { return; }
            $usados[$clave] = true;

            // Historial: alta + transiciones según el estado final.
            $historial[] = ['postulacion_id' => $postId, 'estado_anterior' => null, 'estado_nuevo' => 'pendiente', 'usuario_id' => $postulanteUserId[$postulanteIdx], 'created_at' => $fecha->format('Y-m-d H:i:s')];
            $pasos = [
                'pendiente' => [],
                'en_revision' => ['en_revision'],
                'preseleccionado' => ['en_revision', 'preseleccionado'],
                'contactado' => ['en_revision', 'preseleccionado', 'contactado'],
                'seleccionado' => ['en_revision', 'preseleccionado', 'contactado', 'seleccionado'],
                'no_seleccionado' => ['en_revision', 'no_seleccionado'],
            ];
            $fechaPaso = $fecha;
            $empresaUser = $empresaUserId[$ofertaInfo[$ofertaId]['empresa_id'] - 1] ?? 1;
            foreach ($pasos[$estado] as $i => $nuevo) {
                $fechaPaso = $fechaPaso->modify('+' . mt_rand(1, 8) . ' days');
                $anterior = $i === 0 ? 'pendiente' : $pasos[$estado][$i - 1];
                $historial[] = [
                    'postulacion_id' => $postId, 'estado_anterior' => $anterior, 'estado_nuevo' => $nuevo,
                    'usuario_id' => $empresaUser, 'created_at' => $fechaPaso->format('Y-m-d H:i:s'),
                ];
            }
            if ($estado === 'seleccionado') {
                $contratos[] = ['postId' => $postId, 'fechaSeleccion' => $fechaPaso];
            }
        };

        foreach ($publicablesIds as $idx => $ofertaId) {
            $infoOferta = $ofertaInfo[$ofertaId];
            $cuenta = $plan[$idx] ?? 1;
            $ya = 0;
            $intentos = 0;
            while ($ya < $cuenta && $intentos < 400) {
                ++$intentos;
                $postulanteIdx = mt_rand(0, 87);   // solo completos (88) pueden postular
                $clave = $postulanteIds[$postulanteIdx] . '-' . $ofertaId;
                if (isset($usados[$clave])) { continue; }

                $estado = $estados[mt_rand(0, 5)];
                // Coherencia con ofertas cerradas: pocas pendientes nuevas sobre cerradas.
                if ($infoOferta['estado'] === 'cerrada' && $estado === 'pendiente' && mt_rand(0, 3) > 0) {
                    $estado = $estados[mt_rand(1, 5)];
                }

                $min = $infoOferta['fecha_publicacion'] ? new \DateTimeImmutable($infoOferta['fecha_publicacion']) : $hace12m;
                $max = $infoOferta['fecha_cierre'] ? new \DateTimeImmutable($infoOferta['fecha_cierre']) : $hoy;
                $max = min($max, $hoy);
                $fecha = $entre(max($min, $hace12m), $max);
                $fecha = $fecha->setTime(mt_rand(8, 20), mt_rand(0, 59), 0);

                $postId = 0;
                $insertarPostulacion($postulanteIdx, $ofertaId, $estado, true, $fecha, $postId);
                ++$ya;
            }
        }

        // Algunas postulaciones inactivas (retiradas) duplicadas: permitidas por diseño (postulacion_unica NULL).
        $inactivas = 15;
        $intentosI = 0;
        while ($inactivas > 0 && $intentosI < 300) {
            ++$intentosI;
            $postulanteIdx = mt_rand(0, 87);
            $ofertaId = $publicablesIds[mt_rand(0, count($publicablesIds) - 1)];
            $min = $hace12m;
            $max = min($hoy, $ofertaInfo[$ofertaId]['fecha_cierre'] ? new \DateTimeImmutable($ofertaInfo[$ofertaId]['fecha_cierre']) : $hoy);
            $fecha = $entre($min, $max)->setTime(9, mt_rand(0, 59), 0);
            $postId = 0;
            $insertarPostulacion($postulanteIdx, $ofertaId, 'pendiente', false, $fecha, $postId);
            --$inactivas;
        }

        foreach (array_chunk($historial, 500) as $lote) {
            $this->db->table('postulacion_historial')->insertBatch($lote);
        }

        // ------------------------------------------------------- ~45 contrataciones
        shuffle($contratos);
        $contratos = array_slice($contratos, 0, 45);
        $modalidades = ['Planilla', 'Recibo por honorarios', 'Terceros', 'Prácticas preprofesionales'];
        $cargoPorOferta = [];
        foreach ($contratos as $c) {
            $fila = $this->db->table('postulaciones')->select('postulante_id, oferta_id, empresa_id, fecha_postulacion')->where('id', $c['postId'])->get()->getRowArray();
            if (! $fila) { continue; }
            $ofert = $ofertaInfo[$fila['oferta_id']];
            $fecha = $c['fechaSeleccion']->modify('+' . mt_rand(1, 12) . ' days');
            if ($fecha > $hoy) { $fecha = $hoy->modify('-' . mt_rand(0, 9) . ' days'); }

            $this->db->table('contrataciones')->insert([
                'postulacion_id'    => $c['postId'],
                'empresa_id'        => $fila['empresa_id'],
                'oferta_id'         => $fila['oferta_id'],
                'postulante_id'     => $fila['postulante_id'],
                'fecha_contratacion'=> $fecha->format('Y-m-d'),
                'cargo'             => $ofert['puesto'],
                'modalidad'         => $modalidades[array_rand($modalidades)],
                'remuneracion'      => $ofert['remuneracion'],
                'observaciones'     => 'Contrato ficticio generado por el dataset masivo de pruebas.',
                'created_at'        => $fecha->format('Y-m-d 12:00:00'),
            ]);
        }

        // ------------------------------------------------------- manifiesto CV
        $manifest = [];
        $contador = 0;
        foreach ($completos as $c) {
            $doble = $contador < 10;
            $manifest[] = [
                'dni' => $c['dni'],
                'password' => self::PASSWORD_POSTULANTE,
                'nombre' => $c['nombres'],
                'profesion' => $c['profesion'],
                'segunda_version' => $doble,
            ];
            ++$contador;
        }
        $archivo = WRITEPATH . 'masivos_manifest.json';
        file_put_contents($archivo, json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        echo "DatosMasivosSeeder completado: 20 admins, 20 empresas, 100 postulantes (88 completos, 12 incompletos), 60 ofertas, " . count($postulacionIds) . " postulaciones, " . count($historial) . " eventos de historial y " . count($contratos) . " contrataciones.\n";
        echo "Manifiesto CV: {$archivo}\n";
    }
}
