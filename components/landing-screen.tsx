import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/app-version';

export function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="launch-screen">
      <Button className="launch-button" size="lg" onClick={onStart}>
        Get started
      </Button>

      <footer className="launch-footer">
        AI Gym Bro <span>v{APP_VERSION}</span>
      </footer>
    </main>
  );
}
