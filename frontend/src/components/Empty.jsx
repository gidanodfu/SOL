// SPDX-License-Identifier: MIT

/**
 * Estado vacío compuesto. Adaptación del patrón `Empty` de shadcn/ui al stack
 * real de SOL (JavaScript + CSS propio; el proyecto NO usa Tailwind, shadcn,
 * class-variance-authority ni el alias `@/`). Conserva la composición del
 * original: Empty > EmptyHeader (EmptyMedia + EmptyTitle + EmptyDescription)
 * + EmptyContent.
 *
 * Referencias:
 * - https://ui.shadcn.com/docs/components/base/empty
 * - https://21st.dev/community/components/explore/shadcn-empty-state
 *
 * Los estilos viven en `styles.css` (clases `.empty`, `.empty-*`) y usan los
 * tokens del tema, por lo que respetan el modo claro/oscuro y son reutilizables
 * en otros módulos. `EmptyMedia variant="icon"` omite a propósito las capas
 * decorativas rotadas del original: no encajan con la identidad de SOL.
 *
 * Uso:
 *   <Empty>
 *     <EmptyHeader>
 *       <EmptyMedia variant="icon" aria-hidden="true"><Briefcase /></EmptyMedia>
 *       <EmptyTitle>…</EmptyTitle>
 *       <EmptyDescription>…</EmptyDescription>
 *     </EmptyHeader>
 *     <EmptyContent>…</EmptyContent>
 *   </Empty>
 */

export function Empty({ className = '', children, ...props }) {
  return <div className={`empty ${className}`.trim()} data-slot="empty" {...props}>{children}</div>;
}

export function EmptyHeader({ className = '', children, ...props }) {
  return <div className={`empty-header ${className}`.trim()} data-slot="empty-header" {...props}>{children}</div>;
}

export function EmptyMedia({ variant = 'default', className = '', children, ...props }) {
  return (
    <div
      className={`empty-media empty-media-${variant} ${className}`.trim()}
      data-slot="empty-media"
      data-variant={variant}
      {...props}
    >
      {children}
    </div>
  );
}

export function EmptyTitle({ className = '', children, ...props }) {
  return <p className={`empty-title ${className}`.trim()} data-slot="empty-title" {...props}>{children}</p>;
}

export function EmptyDescription({ className = '', children, ...props }) {
  return <p className={`empty-description ${className}`.trim()} data-slot="empty-description" {...props}>{children}</p>;
}

export function EmptyContent({ className = '', children, ...props }) {
  return <div className={`empty-content ${className}`.trim()} data-slot="empty-content" {...props}>{children}</div>;
}

export default Empty;
