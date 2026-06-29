import NavLinks from './NavLinks';

export default function NavBar() {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg-surface, #141824)',
        padding: '6px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '4px 20px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-barlow), sans-serif',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: 1.5,
          color: '#e8eaf0',
          textTransform: 'uppercase',
        }}
      >
        DraftOps
      </span>
      <NavLinks />
    </div>
  );
}
