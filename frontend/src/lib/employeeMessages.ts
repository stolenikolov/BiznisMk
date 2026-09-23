import { api } from './api.ts';
import { employeesPath } from './useEmployees.ts';

/** The API's own limits, so the form stops where the server would refuse. */
export const MESSAGE_SUBJECT_MAX = 150;
export const MESSAGE_BODY_MAX = 5000;

export interface EmployeeMessageInput {
  employeeIds: string[];
  subject: string;
  body: string;
}

export interface EmployeeMessageResult {
  /** `outbox`: the server has no mail account set up, so nothing left it. */
  mode: 'smtp' | 'outbox';
  sent: number;
  failed: { employeeId: string; name: string }[];
}

/** Emails a written message to the chosen employees, one email each; answers with whom it reached. */
export async function sendEmployeeMessage(
  companyId: string,
  input: EmployeeMessageInput,
): Promise<EmployeeMessageResult> {
  const { data } = await api.post<EmployeeMessageResult>(`${employeesPath(companyId)}/messages`, input);
  return data;
}
