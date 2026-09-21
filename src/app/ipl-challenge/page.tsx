import XISelectionGame from "@/components/ipl/XISelectionGame";

export default function IPLChallengePage() {
  return (
    <main className="h-[calc(100dvh-72px)] min-h-0 overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <XISelectionGame />
      </div>
    </main>
  );
}