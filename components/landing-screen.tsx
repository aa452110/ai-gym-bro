import { ArrowRight, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { APP_VERSION } from '@/lib/app-version';

export function LandingScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="launch-screen">
      <header className="launch-header">
        <div className="launch-wordmark" aria-label="AI Gym Bro">
          <span>AI</span> GYM BRO
        </div>
        <div className="launch-status">
          <span aria-hidden="true" />
          Agent ready
        </div>
      </header>

      <section className="launch-main" aria-labelledby="launch-title">
        <div className="launch-agent-mark" aria-hidden="true">
          <Sparkles />
        </div>
        <h1 id="launch-title">Ready.</h1>
        <Button className="launch-button" size="lg" onClick={onStart}>
          Get started
          <ArrowRight />
        </Button>
      </section>

      <footer className="launch-footer">
        AI Gym Bro <span>v{APP_VERSION}</span>
      </footer>
    </main>
  );
}
