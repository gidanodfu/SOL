<?php

use CodeIgniter\Router\RouteCollection;

/** @var RouteCollection $routes */

// Información básica en la raíz (no existe interfaz HTML del backend).
$routes->get('/', static function () {
    return service('response')
        ->setContentType('application/json', 'UTF-8')
        ->setBody(json_encode([
            'success' => true,
            'message' => 'API del Sistema de Empleo — Municipalidad Distrital de José Leonardo Ortiz.',
            'data'    => null,
        ], JSON_UNESCAPED_UNICODE));
});

/*
 * API REST (RT-07). Frontend y backend son proyectos independientes; la
 * comunicación se hace solo por estos endpoints. Todas las rutas bajo /api
 * responden a CORS para el frontend de desarrollo.
 */
$routes->group('api', ['namespace' => 'App\Controllers\Api', 'filter' => 'cors'], static function ($routes) {
    // Preflight CORS (OPTIONS) no requiere ruta específica.
    $routes->options('(:any)', static function () {
        return service('response')->setStatusCode(204);
    });

    // Público (sin autenticación). El login limita intentos internamente (5/5min);
    // el resto de la superficie de auth se limita por IP (10/5min).
    $routes->post('auth/login', 'AuthController::login');
    $routes->post('auth/google', 'AuthController::google', ['filter' => 'throttle:10,300']);
    $routes->post('auth/refresh', 'AuthController::renovar', ['filter' => 'throttle:10,300']);
    $routes->post('registro/postulante', 'AuthController::registroPostulante', ['filter' => 'throttle:10,300']);

    // Solicitud de registro de empresa (auto-registro) y activación de cuenta
    // mediante el enlace que recibe la empresa tras la aprobación.
    $routes->post('verificar-ruc', 'SolicitudesEmpresaController::verificarRuc');
    $routes->post('solicitudes-empresa', 'SolicitudesEmpresaController::solicitar');
    $routes->get('activar-cuenta/(:segment)', 'SolicitudesEmpresaController::verActivacion/$1');
    $routes->post('activar-cuenta/(:segment)', 'SolicitudesEmpresaController::activarCuenta/$1');

    // Bolsa de empleo y difusión públicas (sin autenticación). Ver el detalle de
    // una oferta requiere estar publicada; si hay sesión se informa "ya_postule".
    $routes->get('ofertas', 'OfertasPublicasController::index');
    $routes->get('ofertas/(:num)', 'OfertasPublicasController::show/$1');
    $routes->get('oportunidades', 'DivulgacionController::oportunidades');
    $routes->get('actividades', 'DivulgacionController::actividades');
    $routes->get('categorias', 'CategoriasController::index');

    // Cualquier rol autenticado (jwt: valida token + estado activo en BD).
    $routes->group('', ['filter' => 'jwt'], static function ($routes) {
        $routes->get('auth/me', 'AuthController::me');
        $routes->post('auth/logout', 'AuthController::logout');
        $routes->put('cuenta/contrasena', 'CuentaController::cambiarContrasena');
    });

    // Administración municipal (RF-07, RF-08..RF-17, RF-52..RF-60).
    $routes->group('admin', ['namespace' => 'App\Controllers\Api\Admin', 'filter' => ['jwt', 'rol:admin']], static function ($routes) {
        $routes->get('usuarios', 'UsuariosController::index');
        $routes->get('usuarios/(:num)', 'UsuariosController::show/$1');
        $routes->post('usuarios', 'UsuariosController::store');
        $routes->put('usuarios/(:num)', 'UsuariosController::update/$1');
        $routes->put('usuarios/(:num)/estado', 'UsuariosController::estado/$1');
        $routes->put('usuarios/(:num)/password', 'UsuariosController::resetPassword/$1');

        $routes->get('empresas', 'EmpresasController::index');
        $routes->get('empresas/(:num)', 'EmpresasController::show/$1');
        $routes->post('empresas', 'EmpresasController::store');
        $routes->put('empresas/(:num)', 'EmpresasController::update/$1');
        $routes->put('empresas/(:num)/estado', 'EmpresasController::estado/$1');
        $routes->put('empresas/(:num)/password', 'EmpresasController::resetPassword/$1');

        // Solicitudes de auto-registro de empresas.
        $routes->get('solicitudes-empresa', 'SolicitudesEmpresaController::index');
        $routes->get('solicitudes-empresa/(:num)', 'SolicitudesEmpresaController::show/$1');
        $routes->post('solicitudes-empresa/(:num)/aprobar', 'SolicitudesEmpresaController::aprobar/$1');
        $routes->post('solicitudes-empresa/(:num)/rechazar', 'SolicitudesEmpresaController::rechazar/$1');
        $routes->get('solicitudes-empresa/(:num)/enlace', 'SolicitudesEmpresaController::enlace/$1');

        $routes->get('dashboard', 'DashboardController::index');

        $routes->get('ofertas', 'OfertasController::index');
        $routes->get('ofertas/(:num)', 'OfertasController::show/$1');
        $routes->put('ofertas/(:num)/cerrar', 'OfertasController::cerrar/$1');

        $routes->get('actividades', 'ActividadesController::index');
        $routes->post('actividades', 'ActividadesController::store');
        $routes->put('actividades/(:num)', 'ActividadesController::update/$1');
        $routes->put('actividades/(:num)/estado', 'ActividadesController::estado/$1');

        $routes->get('oportunidades', 'OportunidadesController::index');
        $routes->post('oportunidades', 'OportunidadesController::store');
        $routes->put('oportunidades/(:num)', 'OportunidadesController::update/$1');
        $routes->put('oportunidades/(:num)/activacion', 'OportunidadesController::activacion/$1');

        $routes->get('reportes', 'ReportesController::index');
        $routes->get('reportes/csv', 'ReportesController::csv');
        $routes->get('reportes/excel', 'ReportesController::excel');
        $routes->get('contrataciones', 'ContratacionesController::index');
    });

    // Rol empresa: solo su propia información (RT-05).
    $routes->group('empresa', ['namespace' => 'App\Controllers\Api\Empresa', 'filter' => ['jwt', 'rol:empresa']], static function ($routes) {
        $routes->get('perfil', 'PerfilController::index');
        $routes->put('perfil', 'PerfilController::update');
        $routes->get('dashboard', 'PerfilController::dashboard');

        $routes->get('ofertas', 'OfertasController::index');
        $routes->get('ofertas/(:num)', 'OfertasController::show/$1');
        $routes->post('ofertas', 'OfertasController::store');
        $routes->put('ofertas/(:num)', 'OfertasController::update/$1');
        $routes->put('ofertas/(:num)/publicar', 'OfertasController::publicar/$1');
        $routes->put('ofertas/(:num)/cerrar', 'OfertasController::cerrar/$1');

        $routes->get('postulaciones', 'PostulacionesController::index');
        $routes->get('postulaciones/(:num)', 'PostulacionesController::show/$1');
        $routes->put('postulaciones/(:num)/estado', 'PostulacionesController::estado/$1');
        $routes->put('postulaciones/(:num)/activacion', 'PostulacionesController::activacion/$1');
        $routes->get('postulaciones/(:num)/cv', 'PostulacionesController::cv/$1');
        $routes->get('postulaciones/(:num)/cv/archivo/(:segment)', 'PostulacionesController::cvArchivo/$1/$2');

        $routes->get('contrataciones', 'ContratacionesController::index');
        $routes->get('contrataciones/opciones', 'ContratacionesController::opciones');
        $routes->post('contrataciones', 'ContratacionesController::store');
        $routes->put('contrataciones/(:num)', 'ContratacionesController::update/$1');
    });

    // Rol postulante: perfil, CV, búsqueda de empleo y postulaciones.
    $routes->group('postulante', ['namespace' => 'App\Controllers\Api\Postulante', 'filter' => ['jwt', 'rol:postulante']], static function ($routes) {
        $routes->get('perfil', 'PerfilController::index');
        $routes->put('perfil', 'PerfilController::update');
        $routes->get('dashboard', 'PerfilController::dashboard');

        $routes->get('cv', 'CvController::index');
        // Límite mensual (4) en el servicio + límite de ráfaga por IP (10/hora).
        $routes->post('cv', 'CvController::upload', ['filter' => 'throttle:10,3600']);
        $routes->get('cv/descargar', 'CvController::descargar');
        // Descarga con driver local; exige autorización del propietario (RT-CV-04).
        $routes->get('cv/archivo/(:segment)', 'CvController::archivo/$1');

        $routes->get('ofertas', 'EmpleoController::index');
        $routes->get('ofertas/(:num)', 'EmpleoController::show/$1');

        $routes->get('postulaciones', 'PostulacionesController::index');
        $routes->post('postulaciones', 'PostulacionesController::store');
        $routes->put('postulaciones/(:num)/retirar', 'PostulacionesController::retirar/$1');
    });
});
