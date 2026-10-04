import WorldDominationGame from "@/components/world/WorldDominationGame";

export default function WorldPage() {
  return (
    <main className="h-[calc(100dvh-72px)] min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <WorldDominationGame />
      </div>
    </main>
  );
}