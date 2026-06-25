import NavLinks from './NavLinks';

export default function NavBar() {
  return (
    <div
      style={{
        background: 'var(--bg-surface, #141824)',
        padding: '6px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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
