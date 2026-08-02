import type { CSSProperties } from 'react';

export const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const inputStyle: CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid #2a2f3e',
  borderRadius: '4px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem',
  padding: '0.35rem 0.6rem',
  width: '100%',
  boxSizing: 'border-box',
};

export const colHeaderStyle: CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

export const sectionHeaderStyle: CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.75rem',
};

export const subSectionStyle: CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: '0.4rem',
};

export const cancelLinkStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.875rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textDecoration: 'none',
  textTransform: 'uppercase',
};
