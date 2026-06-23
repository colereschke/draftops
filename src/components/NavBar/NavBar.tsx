import NavLinks from './NavLinks';

export default function NavBar() {
  return (
    <div
      style={{
        background: 'var(--bg-surface, #141824)',
        borderBottom: '1px solid #1e2434',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-barlow), sans-serif',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 2,
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
