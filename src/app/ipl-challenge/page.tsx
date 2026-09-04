import XISelectionGame from "@/components/ipl/XISelectionGame";

export default function IPLChallengePage() {
  return (
    <main className="flex h-[calc(100dvh-var(--header-height))] min-h-0 overflow-hidden">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 px-4 py-4">
        <XISelectionGame />
      </div>
    </main>
  );
}