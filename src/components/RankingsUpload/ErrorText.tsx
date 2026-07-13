'use client';

interface ErrorTextProps {
  messages: string[];
  testId?: string;
  style?: React.CSSProperties;
}

const BASE_STYLE: React.CSSProperties = {
  color: '#e05050',
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.8rem',
};

export default function ErrorText({ messages, testId, style }: ErrorTextProps) {
  if (messages.length === 0) return null;
  const merged = { ...BASE_STYLE, ...style };

  if (messages.length === 1) {
    return (
      <span data-testid={testId} style={merged}>
        {messages[0]}
      </span>
    );
  }

  return (
    <ul data-testid={testId} style={merged}>
      {messages.map((message, i) => (
        <li key={message + i}>{message}</li>
      ))}
    </ul>
  );
}
