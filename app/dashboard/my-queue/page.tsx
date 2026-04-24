import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import { MyQueueView } from "@/components/dashboard/MyQueueView";

export default function MyQueuePage() {
  const labels = getOrgLabels();
  return (
    <div className="stack-20">
      <div>
        <h1 className="page-intro-title">{labels.myQueue}</h1>
        <p className="page-intro-desc">
          A focused view of items assigned to you — open, act, and keep handoffs clean.
        </p>
      </div>
      <MyQueueView />
    </div>
  );
}

