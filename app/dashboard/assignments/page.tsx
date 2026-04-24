import { getOrgLabels } from "@/app/_lib/org/getOrgLabels";
import { AssignmentsView } from "@/components/dashboard/AssignmentsView";

export default function AssignmentsPage() {
  const labels = getOrgLabels();
  return (
    <div className="stack-20">
      <div>
        <h1 className="page-intro-title">{labels.assignments}</h1>
        <p className="page-intro-desc">
          Oversight of unclaimed items and active leads — assign quickly and keep work moving.
        </p>
      </div>
      <AssignmentsView />
    </div>
  );
}

