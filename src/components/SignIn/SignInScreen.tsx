import { signIn } from '@/auth';
import LogoLockup from '@/components/Brand/LogoLockup';
import ValueTicker from './ValueTicker';

interface SignInScreenProps {
  callbackUrl: string;
}

export default function SignInScreen({ callbackUrl }: SignInScreenProps) {
  return (
    <div className="bg-background flex min-h-screen flex-col md:flex-row">
      <div className="bg-card border-border flex flex-col items-center justify-center gap-6 border-b px-8 py-16 text-center md:w-[40%] md:items-start md:border-r md:border-b-0 md:px-14 md:py-0 md:text-left">
        <LogoLockup size={26} textClassName="text-[19px] md:text-[21px]" />
        <div className="flex flex-col items-center md:items-start">
          <span
            className="text-[10px] font-bold tracking-[0.15em] uppercase md:text-[10.5px]"
            style={{ color: 'var(--primary)' }}
          >
            Dynasty Auction Draft Tool
          </span>
          <h1 className="text-foreground mt-2 text-[21px] leading-snug font-extrabold md:text-[27px]">
            Every dollar.
            <br />
            Every rival.
            <br />
            One room.
          </h1>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('discord', { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-[#5865F2] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4752c4]"
          >
            Sign in with Discord
          </button>
        </form>
      </div>
      <ValueTicker className="h-[150px] md:h-auto md:flex-1" />
    </div>
  );
}
