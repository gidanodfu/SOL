import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { detalleOferta, listarOfertas, perfilPostulante, postular } from '../../services/postulante';
import { listarCategorias } from '../../services/categorias';
import { useAuth } from '../../context/AuthContext';
import { Mensaje } from '../../components/UI';
import { ETIQUETA_TIPO_EMPLEO, OPCIONES_EXPERIENCIA_REQUERIDA, OPCIONES_FORMACION_REQUERIDA, ROLES } from '../../constants';
import { errorApi } from '../../utils';
import { useClickFuera } from '../../hooks/useClickFuera';
import { useAccion } from '../../hooks/useAccion';

const OPCIONES_UBICACION = ['Chiclayo', 'José Leonardo Ortiz', 'La Victoria', 'Pimentel', 'Lambayeque'];
const OPCIONES_FORMACION = OPCIONES_FORMACION_REQUERIDA;
const OPCIONES_EXPERIENCIA = OPCIONES_EXPERIENCIA_REQUERIDA;
const OPCIONES_ORDEN = [
  { valor: 'recientes', etiqueta: 'Más recientes' },
  { valor: 'salario', etiqueta: 'Mejor salario' },
  { valor: 'vacantes', etiqueta: 'Más vacantes' },
];

const comoOpciones = (lista) => lista.map((v) => ({ valor: v, etiqueta: v }));

function moneda(valor) {
  if (valor == null) return null;
  return `S/ ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(Number(valor))}`;
}

function iconoPorCategoria(nombre) {
  const n = (nombre || '').toLowerCase();
  if (n.includes('construc') || n.includes('obra')) return 'ti ti-hammer';
  if (n.includes('administ') || n.includes('oficin')) return 'ti ti-briefcase';
  if (n.includes('comer') || n.includes('venta')) return 'ti ti-shopping-cart';
  if (n.includes('servic') || n.includes('atenc') || n.includes('limpieza')) return 'ti ti-tools';
  if (n.includes('salud') || n.includes('medic')) return 'ti ti-stethoscope';
  if (n.includes('educa') || n.includes('docente')) return 'ti ti-school';
  if (n.includes('transp') || n.includes('chofer') || n.includes('logist')) return 'ti ti-truck';
  return 'ti ti-briefcase';
}

export default function BuscarEmpleo() {
  const [sel, setSel] = useState({}); // pillId -> { valor, etiqueta }
  const [abierto, setAbierto] = useState(null); // pillId abierto
  const [seleccionadaId, setSeleccionadaId] = useState(null);
  const [sinAuto, setSinAuto] = useState(false);
  const { usuario } = useAuth();
  const { data: categorias } = useQuery({ queryKey: ['categorias'], queryFn: listarCategorias });
  const { data: perfil } = useQuery({
    queryKey: ['perfil-postulante'],
    queryFn: perfilPostulante,
    enabled: usuario?.rol === ROLES.POSTULANTE,
  });
  const completitud = perfil?.completitud;
  const perfilIncompleto = Boolean(completitud && !completitud.completo);
  const [esMovil, setEsMovil] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches,
  );
  const splitRef = useRef(null);
  const [altoSplit, setAltoSplit] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const manejar = (e) => setEsMovil(e.matches);
    mq.addEventListener('change', manejar);
    return () => mq.removeEventListener('change', manejar);
  }, []);

  // Ajusta la altura de la vista dividida para que cada columna haga scroll interno.
  const medirSplit = useCallback(() => {
    const el = splitRef.current;
    if (!el) return;
    const alto = Math.max(420, Math.round(window.innerHeight - el.getBoundingClientRect().top - 56));
    setAltoSplit(alto);
  }, []);

  useEffect(() => {
    medirSplit();
    window.addEventListener('resize', medirSplit);
    return () => window.removeEventListener('resize', medirSplit);
  }, [medirSplit]);

  useEffect(() => {
    if (!esMovil) medirSplit();
  }, [esMovil, medirSplit]);

  const queryFiltros = useMemo(() => {
    const f = {};
    if (sel.categoria?.valor) f.categoria_id = sel.categoria.valor;
    if (sel.ubicacion?.valor) f.ubicacion = sel.ubicacion.valor;
    if (sel.formacion?.valor) f.formacion = sel.formacion.valor;
    if (sel.experiencia?.valor) f.experiencia = sel.experiencia.valor;
    return f;
  }, [sel]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['buscar-ofertas', queryFiltros],
    queryFn: () => listarOfertas(queryFiltros),
  });

  const lista = useMemo(() => {
    const arr = [...(data || [])];
    if (sel.ordenar?.valor === 'salario') {
      arr.sort((a, b) => (Number(b.remuneracion) || 0) - (Number(a.remuneracion) || 0));
    } else if (sel.ordenar?.valor === 'vacantes') {
      arr.sort((a, b) => (b.vacantes || 0) - (a.vacantes || 0));
    }
    return arr;
  }, [data, sel]);

  const ofertaActual = lista.find((o) => o.id === seleccionadaId) || null;

  useEffect(() => {
    if (lista.length > 0) medirSplit();
  }, [lista, medirSplit]);

  // En escritorio, preselecciona la primera oferta al cargar/refrescar resultados.
  useEffect(() => {
    if (!esMovil && !sinAuto && lista.length > 0 && !lista.some((o) => o.id === seleccionadaId)) {
      setSeleccionadaId(lista[0].id);
    }
  }, [lista, esMovil, sinAuto, seleccionadaId]);

  // Bloquea el scroll del fondo cuando el modal está abierto en móvil.
  useEffect(() => {
    if (!(esMovil && seleccionadaId)) return undefined;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [esMovil, seleccionadaId]);

  const seleccionar = (id) => {
    setSeleccionadaId(id);
    setSinAuto(false);
  };

  const cerrar = () => {
    setSeleccionadaId(null);
    setSinAuto(true);
  };

  const opcionesCategoria = useMemo(() => {
    const base = [{ valor: '', etiqueta: 'Todas las categorías' }];
    const cats = (categorias || []).map((c) => ({ valor: String(c.id), etiqueta: c.nombre }));
    return base.concat(cats);
  }, [categorias]);

  const elegir = (id) => (valor, etiqueta) => {
    setSel((prev) => {
      const siguiente = { ...prev };
      if (!valor) delete siguiente[id];
      else siguiente[id] = { valor, etiqueta };
      return siguiente;
    });
    setAbierto(null);
  };

  const toggler = (id) => () => setAbierto((prev) => (prev === id ? null : id));

  return (
    <div>
      {perfilIncompleto && completitud && (
        <div className="perfil-incompleto">
          <i className="ti ti-id-badge" />
          <div>
            <strong>Completa tus datos personales y carga tu CV para postularte.</strong>
            <span>
              {completitud.faltantes?.length ? `Falta: ${completitud.faltantes.join(', ')}. ` : ''}
              Formación, experiencia, habilidades y cursos puedes añadirlos después.
            </span>
          </div>
          <Link to="/postulante/perfil">Completar mi perfil</Link>
        </div>
      )}

      <div className="filter-bar">
        <FiltroPill
          icono="ti ti-arrows-sort"
          titulo="Ordenar"
          opciones={OPCIONES_ORDEN}
          valor={sel.ordenar?.valor}
          abierto={abierto === 'ordenar'}
          onToggle={toggler('ordenar')}
          onCerrar={() => setAbierto(null)}
          onElegir={elegir('ordenar')}
          
        />
       
        <FiltroPill
          icono="ti ti-category"
          titulo="Categoría"
          opciones={opcionesCategoria}
          valor={sel.categoria?.valor || ''}
          abierto={abierto === 'categoria'}
          onToggle={toggler('categoria')}
          onCerrar={() => setAbierto(null)}
          onElegir={elegir('categoria')}
        />
        <FiltroPill
          icono="ti ti-map-pin"
          titulo="Ubicación"
          opciones={comoOpciones(OPCIONES_UBICACION)}
          valor={sel.ubicacion?.valor}
          abierto={abierto === 'ubicacion'}
          onToggle={toggler('ubicacion')}
          onCerrar={() => setAbierto(null)}
          onElegir={elegir('ubicacion')}
        />
        <FiltroPill
          icono="ti ti-school"
          titulo="Formación"
          opciones={comoOpciones(OPCIONES_FORMACION)}
          valor={sel.formacion?.valor}
          abierto={abierto === 'formacion'}
          onToggle={toggler('formacion')}
          onCerrar={() => setAbierto(null)}
          onElegir={elegir('formacion')}
        />
        <FiltroPill
          icono="ti ti-clock-hour-4"
          titulo="Experiencia"
          opciones={comoOpciones(OPCIONES_EXPERIENCIA)}
          valor={sel.experiencia?.valor}
          abierto={abierto === 'experiencia'}
          onToggle={toggler('experiencia')}
          onCerrar={() => setAbierto(null)}
          onElegir={elegir('experiencia')}
        />
      </div>

      <Mensaje>{error ? errorApi(error) : null}</Mensaje>
      {isLoading && !data && <p className="vacio">Buscando ofertas…</p>}

      {lista.length === 0 && !isLoading && (
        <div className="list-card">
          <p className="empty-note">No hay ofertas publicadas que coincidan con tu búsqueda. Ajusta los filtros para ver más resultados.</p>
        </div>
      )}

      {lista.length > 0 && (
        <section ref={splitRef} className="busqueda" style={!esMovil && altoSplit ? { height: altoSplit } : undefined}>
          <div className="lista-ofertas">
            <div className="results-head">
              <div className="count"><span>{lista.length}</span> Ofertas Disponibles</div>
              {sel.ordenar?.etiqueta && <div className="sort">Ordenado: {sel.ordenar.etiqueta}</div>}
            </div>

            {lista.map((o) => (
              <JobCard
                key={o.id}
                oferta={o}
                seleccionada={o.id === seleccionadaId}
                onSeleccionar={() => seleccionar(o.id)}
              />
            ))}
          </div>

          <PanelDetalle oferta={ofertaActual} onCerrar={cerrar} perfilIncompleto={perfilIncompleto} />
        </section>
      )}
    </div>
  );
}

function FiltroPill({ icono, titulo, opciones, valor, abierto, onToggle, onCerrar, onElegir }) {
  const ref = useRef(null);
  useClickFuera(ref, abierto, onCerrar);
  const opcionActiva = opciones.find((o) => String(o.valor) === String(valor));
  const etiquetaMostrada = valor && opcionActiva ? opcionActiva.etiqueta : titulo;

  return (
    <div ref={ref} className={`pill${abierto ? ' open' : ''}${valor ? ' active' : ''}`}>
      <button type="button" className="pill-btn" onClick={onToggle}>
        <i className={icono} />
        <span className="pill-label">
          <span className="label-text">{etiquetaMostrada}</span>
          {valor ? (
            <span
              className="clear-btn"
              title="Limpiar filtro"
              onClick={(e) => {
                e.stopPropagation();
                onElegir('', titulo);
              }}
            >
              ✕
            </span>
          ) : null}
        </span>
       
        <i
          className={`ti ti-chevron-down filtro-chevron${
            abierto ? ' rotate' : ''
          }`}
        />
      </button>
      {abierto && (
        <div className="pill-panel">
          {opciones.map((o) => (
            <button
              key={String(o.valor) || 'todo'}
              type="button"
              className={`option-item${String(o.valor) === String(valor) ? ' selected' : ''}`}
              onClick={() => onElegir(o.valor, o.etiqueta)}
            >
              <span>{o.etiqueta}</span>
              {String(o.valor) === String(valor) ? <i className="ti ti-check" style={{ color: 'var(--blue-dark)' }} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ oferta, seleccionada, onSeleccionar }) {
  return (
    <div className={`job-card${seleccionada ? ' seleccionada' : ''}`} onClick={onSeleccionar} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSeleccionar(); } }}>
      <div className="job-fila">
        <div className="job-icon"><i className={iconoPorCategoria(oferta.categoria_nombre)} /></div>
        <div className="job-body">
          <h3>{oferta.puesto}</h3>
          <p className="company">{oferta.razon_social || 'Empresa no indicada'}</p>
          <div className="tags">
            {oferta.categoria_nombre && <span className="tag accent"><i className="ti ti-category" />{oferta.categoria_nombre}</span>}
            {ETIQUETA_TIPO_EMPLEO[oferta.tipo_empleo] && <span className="tag"><i className="ti ti-clock" />{ETIQUETA_TIPO_EMPLEO[oferta.tipo_empleo]}</span>}
            {oferta.ubicacion && <span className="tag"><i className="ti ti-map-pin" />{oferta.ubicacion}</span>}
            <span className="tag"><i className="ti ti-users" />{oferta.vacantes} vacante(s)</span>
          </div>
          <div className="job-foot">
            <div className="salary">
              {moneda(oferta.remuneracion) || 'Remuneración a convenir'}
              {oferta.remuneracion ? <span>/ mes</span> : null}
            </div>
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-3)', fontSize: 18 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelDetalle({ oferta, onCerrar, perfilIncompleto }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.scrollTo(0, 0);
  }, [oferta?.id]);

  return (
    <aside ref={ref} className={`panel-detalle${oferta ? ' abierto' : ''}`}>
      {oferta ? <DetalleOferta key={oferta.id} oferta={oferta} onCerrar={onCerrar} perfilIncompleto={perfilIncompleto} /> : (
        <div className="panel-caja">
          <div className="panel-head">
            <h3>Detalle de la oferta</h3>
          </div>
          <p className="panel-placeholder">Selecciona una oferta de la lista para ver sus detalles.</p>
        </div>
      )}
    </aside>
  );
}

function DetalleOferta({ oferta, onCerrar, perfilIncompleto }) {
  const [nota, setNota] = useState(null);
  const [headerOculto, setHeaderOculto] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { ejecutar, enviando, error, setError } = useAccion(() => postular(oferta.id));
  const { data: detalle } = useQuery({
    queryKey: ['oferta-detalle', oferta.id],
    queryFn: () => detalleOferta(oferta.id),
  });

  // UX: al desplazar el detalle se compacta el encabezado (razón social, tags y
  // salario) y reaparece al volver al tope. El título y las acciones persisten.
  const manejarScrollContenido = (e) => {
    const scrollTop = e.currentTarget.scrollTop;
    setHeaderOculto(scrollTop > 10);
  };

  const postularse = async () => {
    // Sin sesión no se puede postular: se invita a iniciar sesión o registrarse.
    if (!usuario) {
      navigate('/login', { state: { from: '/postulante/buscar' } });
      return;
    }
    if (usuario.rol !== ROLES.POSTULANTE) {
      setError('Para postularte necesitas una cuenta de postulante. Regístrate o inicia sesión con una cuenta de postulante.');
      return;
    }
    if (perfilIncompleto) {
      navigate('/postulante/perfil');
      return;
    }
    try {
      await ejecutar();
      setNota('Postulación registrada. La empresa la revisará próximamente.');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['buscar-ofertas'] });
      queryClient.invalidateQueries({ queryKey: ['oferta-detalle', oferta.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-postulante'] });
    } catch { /* error visible */ }
  };

  const yaPostulo = detalle?.ya_postule === true;
  const puedePostular = Boolean(detalle) && !enviando && !yaPostulo && !perfilIncompleto;

  return (
    <div className="panel-caja">
      <div className="panel-cabeza">
        <div className="panel-head">
          <div style={{ minWidth: 0 }}>
            <h3>{detalle?.puesto || oferta.puesto}</h3>
            <p className={`panel-sub${headerOculto ? ' oculto' : ''}`}>{oferta.razon_social || 'Empresa no indicada'}</p>
          </div>
          <button type="button" className="panel-close" onClick={onCerrar} aria-label="Cerrar detalle">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className={`panel-colapsable${headerOculto ? ' oculto' : ''}`}>
          <div className="panel-colapsable-inner">
            <div className="tags" style={{ marginTop: 12 }}>
              {oferta.categoria_nombre && <span className="tag accent"><i className="ti ti-category" />{oferta.categoria_nombre}</span>}
              {ETIQUETA_TIPO_EMPLEO[oferta.tipo_empleo] && <span className="tag"><i className="ti ti-clock" />{ETIQUETA_TIPO_EMPLEO[oferta.tipo_empleo]}</span>}
              {oferta.ubicacion && <span className="tag"><i className="ti ti-map-pin" />{oferta.ubicacion}</span>}
              <span className="tag"><i className="ti ti-users" />{oferta.vacantes} vacante(s)</span>
            </div>

            <div className="salary" style={{ marginTop: 10 }}>
              {moneda(oferta.remuneracion) || 'Remuneración a convenir'}
              {oferta.remuneracion ? <span>/ mes</span> : null}
            </div>
          </div>
        </div>

        {nota && <Mensaje tipo="exito">{nota}</Mensaje>}
        <Mensaje>{error}</Mensaje>

        <button
          type="button"
          className="btn-detail btn-postular"
          disabled={!puedePostular}
          style={{ opacity: !puedePostular ? 0.6 : 1, cursor: yaPostulo ? 'default' : 'pointer' }}
          onClick={postularse}
        >
          {enviando ? 'Procesando…' : !detalle ? 'Cargando…' : yaPostulo ? 'Ya te postulaste a esta oferta' : perfilIncompleto ? 'Completa tus datos y CV para postular' : 'Postular ahora'}
          {puedePostular ? <i className="ti ti-send" /> : null}
        </button>
        {!usuario && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: '10px 0 0' }}>
            Para postularte debes <b>iniciar sesión</b>. Si aún no tienes cuenta, <b>regístrate como postulante</b>.
          </p>
        )}
      </div>

      <div className="panel-contenido" onScroll={manejarScrollContenido}>
        {!detalle && <p className="vacio" style={{ margin: 0 }}>Cargando detalle…</p>}

        {detalle && (
          <div className="job-detalle">
            <div className="descripcion">
              <div><b>Cierre de postulaciones</b>{detalle.fecha_cierre ? new Date(detalle.fecha_cierre).toLocaleDateString('es-PE') : 'Sin fecha'}</div>
              <div><b>Formación requerida</b>{detalle.formacion_requerida || '—'}</div>
              <div><b>Experiencia requerida</b>{detalle.experiencia_requerida || '—'}</div>
              <div><b>Habilidades</b>{(detalle.habilidades || []).join(', ') || '—'}</div>
            </div>
            {detalle.descripcion && <p className="texto-con-formato"><b>Descripción:</b>{'\n'} {detalle.descripcion}</p>}
            {detalle.funciones && <p className="texto-con-formato"><b>Funciones:</b>{'\n'} {detalle.funciones}</p>}
            {detalle.requisitos && <p className="texto-con-formato"><b>Requisitos:</b>{'\n'} {detalle.requisitos}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
