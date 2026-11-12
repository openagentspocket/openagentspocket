import { crashStorage } from '@/diagnostics/crashStorage';
import { ReportProblemScreen } from '@/diagnostics/ReportProblemScreen';

/** `/settings/report-problem`: what a new GitHub issue will carry, before it opens. */
export default function ReportProblemRoute() {
  return <ReportProblemScreen storage={crashStorage} />;
}
