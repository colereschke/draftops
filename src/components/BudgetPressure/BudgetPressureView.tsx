import type { TeamStats } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';
import BudgetRefresher from './BudgetRefresher';

function buyingPowerColor(bp: number): string {
  if (bp > 150) return '#4caf6e';
  if (bp >= 50) return '#e8a030';
  return '#e05050';
}

interface BudgetPressureViewProps {
  teams: TeamStats[];
  ownerHandle: string | null;
}

export default function BudgetPressureView({ teams, ownerHandle }: BudgetPressureViewProps) {
  const maxBp = Math.max(...teams.map((t) => t.buyingPower), 1);

  return (
    <div
      style={{
        fontFamily: 'var(--font-inter), "Inter", sans-serif',
        background: 'var(--bg-base, #0a0d14)',
        minHeight: '100vh',
        color: '#e8eaf0',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--bg-surface, #141824)',
          borderBottom: '1px solid #2a3048',
          padding: '18px 20px 14px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: '#4a5168',
            textTransform: 'uppercase',
            marginBottom: 3,
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          12-Team · Superflex · $1,000 Budget · 30-Man Rosters
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: -0.5,
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Budget Pressure
          </h1>
          <BudgetRefresher intervalMs={20000} />
        </div>
        <div style={{ fontSize: 11, color: '#4a5168', marginTop: 2 }}>
          Buying power = remaining − remaining roster spots · sorted by most dangerous bidder
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 20px 40px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a3048' }}>
              {['#', 'Team', 'Spent', 'Remaining', 'Roster', 'Buying Power'].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '9px 10px',
                    textAlign: col === 'Team' || col === 'Buying Power' ? 'left' : 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                    color: '#4a5168',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-barlow), sans-serif',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, i) => {
              const isOwner = ownerHandle !== null && team.handle === ownerHandle;
              const bpColor = buyingPowerColor(team.buyingPower);
              const barWidth = maxBp > 0 ? Math.max(0, (team.buyingPower / maxBp) * 100) : 0;

              return (
                <tr
                  key={team.id}
                  data-testid={`row-${team.handle}`}
                  style={{
                    borderBottom: '1px solid #141824',
                    background: isOwner ? '#141e2e' : i % 2 === 0 ? 'transparent' : '#0a0c10',
                    borderLeft: `3px solid ${isOwner ? '#4f83e8' : '#2a3048'}`,
                  }}
                >
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 11,
                      color: '#4a5168',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'left' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isOwner ? 700 : 500,
                        color: isOwner ? '#e8eaf0' : '#8892a4',
                      }}
                    >
                      {team.displayName ?? team.handle}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#8892a4',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    ${team.spent}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#e8eaf0',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    ${team.remaining}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#8892a4',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {team.rosterCount} / {ROSTER_SIZE}
                  </td>
                  <td style={{ padding: '10px 10px', minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        data-testid={`bp-${i + 1}`}
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: bpColor,
                          fontFamily: 'var(--font-mono), monospace',
                          minWidth: 60,
                        }}
                      >
                        ${team.buyingPower}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: '#1a1f2e',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: bpColor,
                            borderRadius: 3,
                            opacity: 0.75,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
