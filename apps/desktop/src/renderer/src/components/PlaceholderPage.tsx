interface PlaceholderPageProps {
  title: 'Extensions' | 'Settings';
  glyph: string;
}

export function PlaceholderPage({ title, glyph }: PlaceholderPageProps) {
  return <div className="page-frame">
    <header className="page-header"><div><p className="eyebrow">PLANNED MODULE</p><h1>{title}</h1></div></header>
    <section className="empty-panel"><div className="empty-icon">{glyph}</div><h2>{title}</h2><p>This module is planned for a later ICRLogin phase. Navigation remains available so the desktop information architecture stays stable.</p></section>
  </div>;
}
