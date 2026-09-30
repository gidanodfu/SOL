// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Bold, Eraser, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react';
import { TEXTO_AVISO, TEXTO_MAX, esEnlaceSeguro } from '../utils';

const TIENE_HTML = /<(p|br|strong|b|em|i|u|ul|ol|li|a)(\s|>|\/)/i;

function escapar(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convierte texto plano heredado en párrafos HTML; si ya es HTML lo deja igual.
 * Así los registros antiguos pueden editarse sin perder sus saltos de línea.
 */
function normalizarEntrada(valor) {
  const v = String(valor ?? '');
  if (v === '' || TIENE_HTML.test(v)) return v;

  return v
    .split(/\n{2,}/)
    .map((bloque) => `<p>${escapar(bloque).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Editor de texto enriquecido (RTE) del sistema. Toolbar mínima acordada:
 * negrita, cursiva, subrayado, viñetas, numerada, enlace y limpiar formato.
 * El contador mide el TEXTO VISIBLE (misma definición que el backend), no el
 * HTML. Se carga de forma diferida desde los formularios que lo usan.
 */
export default function EditorTextoEnriquecido({
  etiqueta,
  valor,
  onChange,
  placeholder = 'Escribe aquí…',
  max = TEXTO_MAX,
  aviso = TEXTO_AVISO,
}) {
  // Referencias estables: el callback y el último HTML emitido no deben cambiar
  // de identidad entre renders (evita reconfigurar TipTap sin necesidad).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const ultimoEmitido = useRef(null);

  // Contenido inicial capturado UNA vez (se aplica en la creación de la instancia).
  const [contenidoInicial] = useState(() => normalizarEntrada(valor));

  // Extensiones memoizadas: mismo array mientras no cambien placeholder/max. Así
  // `compareOptions` de TipTap no dispara `setOptions`/`view.updateState` en cada
  // render (causa del churn de reconfiguración).
  const extensiones = useMemo(() => [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https'],
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    Placeholder.configure({ placeholder }),
    // `limit` bloquea el crecimiento por tecleo/pegado; `autoTrim:false` evita el
    // recorte del contenido existente. El texto cuenta en code points (mb_strlen).
    CharacterCount.configure({
      limit: max,
      autoTrim: false,
      mode: 'textSize',
      textCounter: (texto) => [...texto].length,
    }),
  ], [placeholder, max]);

  // onUpdate estable (misma función entre renders).
  const manejarUpdate = useMemo(() => ({ editor: e }) => {
    const html = e.getHTML();
    ultimoEmitido.current = html;
    onChangeRef.current(html);
  }, []);

  const editor = useEditor({
    extensions: extensiones,
    content: contenidoInicial,
    immediatelyRender: true,
    // El contador/toolbar se refrescan con useEditorState; no forzamos re-render
    // interno por cada transacción.
    shouldRerenderOnTransaction: false,
    onUpdate: manejarUpdate,
  });

  const estado = useEditorState({
    editor,
    // Se lee del editor vivo (no del snapshot): useEditorState puede conservar un
    // snapshot con una instancia recreada/destruida y devolver null indefinidamente.
    selector: () => {
      if (!editor || editor.isDestroyed) return null;
      // Misma definición que el backend: texto visible sin etiquetas y sin
      // separadores artificiales entre bloques (doc.textContent).
      const texto = editor.state.doc.textContent || '';
      const limpio = texto.trim();
      return {
        negrita: editor.isActive('bold'),
        cursiva: editor.isActive('italic'),
        subrayado: editor.isActive('underline'),
        vinietas: editor.isActive('bulletList'),
        numerada: editor.isActive('orderedList'),
        enlace: editor.isActive('link'),
        caracteres: [...texto].length,
        palabras: limpio ? limpio.split(/\s+/).length : 0,
      };
    },
  });

  // Safety net: si el valor externo cambia (p. ej. carga asíncrona de otro
  // registro), sincroniza sin pisar lo que el usuario acaba de escribir y sin
  // generar loops (se ignora el HTML que emitió el propio editor).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const siguiente = normalizarEntrada(valor);
    if (siguiente === ultimoEmitido.current) return;
    if (editor.getHTML() === siguiente) return;
    editor.commands.setContent(siguiente, { emitUpdate: false });
  }, [editor, valor]);

  // UI propia del editor para insertar/editar enlaces (sin prompt nativo).
  const [enlaceAbierto, setEnlaceAbierto] = useState(false);
  const [urlEnlace, setUrlEnlace] = useState('');

  if (!editor || editor.isDestroyed) return <p className="vacio">Cargando editor…</p>;

  // Estado de UI con respaldo neutro mientras useEditorState no emite aún.
  const vista = estado || {
    negrita: false, cursiva: false, subrayado: false, vinietas: false,
    numerada: false, enlace: false, caracteres: 0, palabras: 0,
  };

  const abrirEnlace = () => {
    if (!editor || editor.isDestroyed) return;
    setUrlEnlace(editor.getAttributes('link').href || '');
    setEnlaceAbierto(true);
  };

  const quitarEnlace = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEnlaceAbierto(false);
  };

  const aplicarEnlace = () => {
    const escrita = urlEnlace.trim();
    if (escrita === '') {
      quitarEnlace();
      return;
    }
    const destino = esEnlaceSeguro(escrita) ? escrita : `https://${escrita}`;
    if (!esEnlaceSeguro(destino)) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: destino }).run();
    setEnlaceAbierto(false);
  };

  // Ningún comando debe ejecutarse si la instancia dejó de estar viva.
  const comando = (fn) => () => {
    if (!editor || editor.isDestroyed) return;
    fn(editor);
  };

  const acciones = [
    { id: 'negrita', icono: Bold, etiqueta: 'Negrita', activo: vista.negrita, ejecutar: comando((e) => e.chain().focus().toggleBold().run()) },
    { id: 'cursiva', icono: Italic, etiqueta: 'Cursiva', activo: vista.cursiva, ejecutar: comando((e) => e.chain().focus().toggleItalic().run()) },
    { id: 'subrayado', icono: Underline, etiqueta: 'Subrayado', activo: vista.subrayado, ejecutar: comando((e) => e.chain().focus().toggleUnderline().run()) },
    { id: 'vinietas', icono: List, etiqueta: 'Lista con viñetas', activo: vista.vinietas, ejecutar: comando((e) => e.chain().focus().toggleBulletList().run()) },
    { id: 'numerada', icono: ListOrdered, etiqueta: 'Lista numerada', activo: vista.numerada, ejecutar: comando((e) => e.chain().focus().toggleOrderedList().run()) },
    { id: 'enlace', icono: Link2, etiqueta: 'Insertar enlace', activo: vista.enlace, ejecutar: abrirEnlace },
    {
      id: 'limpiar',
      icono: Eraser,
      etiqueta: 'Limpiar formato',
      activo: false,
      ejecutar: comando((e) => e.chain().focus().unsetAllMarks().clearNodes().run()),
    },
  ];

  const superaLimite = vista.caracteres > max;
  const cercaDelLimite = !superaLimite && vista.caracteres >= aviso;

  return (
    <div className="rte">
      {etiqueta && <span className="rte-etiqueta">{etiqueta}</span>}

      <div className="rte-caja">
        <div className="rte-toolbar" role="toolbar" aria-label={`Formato de ${etiqueta || 'texto'}`}>
          {acciones.map(({ id, icono: Icono, etiqueta: titulo, activo, ejecutar }) => (
            <button
              key={id}
              type="button"
              className={`rte-boton${activo ? ' activo' : ''}`}
              onClick={ejecutar}
              title={titulo}
              aria-label={titulo}
              aria-pressed={activo}
            >
              <Icono size={15} aria-hidden="true" />
            </button>
          ))}
          <span className={`rte-contador${superaLimite ? ' excedido' : cercaDelLimite ? ' aviso' : ''}`}>
            {vista.palabras} palabra(s) · {vista.caracteres}/{max} caracteres
          </span>
        </div>

        {enlaceAbierto && (
          <div className="rte-enlace">
            <input
              className="rte-enlace-input"
              type="url"
              value={urlEnlace}
              onChange={(e) => setUrlEnlace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); aplicarEnlace(); }
                if (e.key === 'Escape') setEnlaceAbierto(false);
              }}
              placeholder="https://…"
              aria-label="URL del enlace"
              autoFocus
            />
            <button type="button" className="rte-boton-texto" onClick={aplicarEnlace}>Aplicar</button>
            {vista.enlace && <button type="button" className="rte-boton-texto" onClick={quitarEnlace}>Quitar</button>}
            <button type="button" className="rte-boton-texto" onClick={() => setEnlaceAbierto(false)}>Cancelar</button>
          </div>
        )}

        <EditorContent editor={editor} />
      </div>

      {cercaDelLimite && (
        <span className="rte-mensaje aviso">Te acercas al límite de {max} caracteres de texto.</span>
      )}
      {superaLimite && (
        <span className="rte-mensaje excedido">Superaste el límite de {max} caracteres de texto; reduce el contenido para guardar.</span>
      )}
    </div>
  );
}
