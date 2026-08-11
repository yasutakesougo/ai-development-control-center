export type HumanActionStatus =
  | "ACTION_REQUIRED"
  | "WAIT"
  | "NO_ACTION"
  | "UNKNOWN";

export interface HumanAction {
  status: HumanActionStatus;
  title: string;
  instruction: string;
  reason: string;
  sourceRefs: string[];
}
