import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "#components/ui/button";

function App() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <section className="grid max-w-xl gap-6 text-center">
        <div className="grid gap-2">
          <h1 className="text-4xl font-semibold tracking-tight">Miniclaw Website</h1>
          <p className="text-muted-foreground">
            React is configured and rendering the shadcn button component.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button>Get started</Button>
          <Button variant="outline">Learn more</Button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.querySelector<HTMLDivElement>("#app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
