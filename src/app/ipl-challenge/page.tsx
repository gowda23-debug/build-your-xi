import XISelectionGame from "@/components/ipl/XISelectionGame";

export default function IPLChallengePage() {
  return (
    <main className="flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 px-3 py-3 sm:px-4 sm:py-4">
        <XISelectionGame />
      </div>
    </main>
  );
}